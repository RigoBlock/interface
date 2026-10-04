import { AbiCoder } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { Actions as V4SdkActions, V4_BASE_ACTIONS_ABI_DEFINITION, V4_SWAP_ACTIONS_V2_1_1 } from '@uniswap/v4-sdk'
import { describe, expect, it, vi } from 'vitest'
import { modifyV4ExecuteCalldata, stripBalanceCheckERC20 } from './universalRouterCalldata'

const abiCoder = new AbiCoder()

const SMART_POOL = '0xEfa4bDf566aE50537A507863612638680420645C'
const FEE_RECIPIENT = '0x27213E28D7fDA5c57Fe9e5dD923818DBCcf71c47'

// UR command constants
const CMD_V4_SWAP = 0x10
const CMD_PAY_PORTION = 0x06
const CMD_PAY_PORTION_FULL_PRECISION = 0x07
const CMD_BALANCE_CHECK_ERC20 = 0x0e

// V4 action codes (new layout, post Nov-22-2024 / v4-periphery PR #384)
const V4_SWAP_EXACT_IN_SINGLE = 0x06
const V4_SWAP_EXACT_IN = 0x07
const V4_SETTLE = 0x0b
const V4_TAKE = 0x0e
const V4_TAKE_PORTION = 0x10

const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000'
const SOME_TOKEN = '0xBC0BEA8E634ec838a2a45F8A43E7E16Cd2a8BA99'
const DEADLINE = 9999999999

// Planner struct types as defined by @uniswap/v4-sdk (the same definitions the rewriter decodes
// with). Fixtures MUST be encoded with these — the rewriter no longer tolerates hand-rolled or
// placeholder encodings.
const SWAP_EXACT_IN_STRUCT_V20 = V4_BASE_ACTIONS_ABI_DEFINITION[V4SdkActions.SWAP_EXACT_IN][0]?.type as string
const SWAP_EXACT_IN_STRUCT_V211 = V4_SWAP_ACTIONS_V2_1_1[V4SdkActions.SWAP_EXACT_IN]?.[0]?.type as string
const SWAP_EXACT_IN_SINGLE_STRUCT_V20 = V4_BASE_ACTIONS_ABI_DEFINITION[V4SdkActions.SWAP_EXACT_IN_SINGLE][0]
  ?.type as string
const SWAP_EXACT_OUT_STRUCT_V20 = V4_BASE_ACTIONS_ABI_DEFINITION[V4SdkActions.SWAP_EXACT_OUT][0]?.type as string
const SWAP_EXACT_OUT_STRUCT_V211 = V4_SWAP_ACTIONS_V2_1_1[V4SdkActions.SWAP_EXACT_OUT]?.[0]?.type as string

const PATH_KEY = [SOME_TOKEN, 3000, 60, NATIVE_TOKEN, '0x'] as const

/** Minimal valid SWAP_EXACT_IN_SINGLE (UR 2.0 flavor) action params. */
function buildSwapExactInSingleMinimal(): string {
  const poolKey = [SOME_TOKEN, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 3000, 60, NATIVE_TOKEN]
  return abiCoder.encode([SWAP_EXACT_IN_SINGLE_STRUCT_V20], [[poolKey, true, 1000, 1000, '0x']])
}

/** Minimal valid SWAP_EXACT_IN (UR 2.0 flavor) action params. */
function buildSwapExactInMinimal(): string {
  return abiCoder.encode([SWAP_EXACT_IN_STRUCT_V20], [[SOME_TOKEN, [PATH_KEY], 1000, 1000]])
}

/** Build calldata for a V4_SWAP with given inner actions and params. */
function buildV4SwapCalldata(
  innerActionsHex: number[],
  innerParams: string[],
  extraCommands: number[] = [],
  extraInputs: string[] = [],
): string {
  const innerActionsBytes = Buffer.from(innerActionsHex)
  const v4Input = abiCoder.encode(['bytes', 'bytes[]'], ['0x' + innerActionsBytes.toString('hex'), innerParams])

  const commands = Buffer.from([CMD_V4_SWAP, ...extraCommands])
  const inputs = [v4Input, ...extraInputs]

  return abiCoder.encode(['bytes', 'bytes[]', 'uint256'], ['0x' + commands.toString('hex'), inputs, DEADLINE])
}

function decodeCurrencyAddressUint256(params: string): {
  currency: string
  recipient: string
  amount: bigint
} {
  const [currency, recipient, amount] = abiCoder.decode(['address', 'address', 'uint256'], params)
  return { currency, recipient, amount: BigInt(amount.toString()) }
}

function decodeV4SwapInput(encodedInput: string): {
  actionsHex: string
  params: string[]
} {
  const [actions, params] = abiCoder.decode(['bytes', 'bytes[]'], encodedInput)
  return { actionsHex: actions as string, params: params as string[] }
}

function decodeOutputCalldata(outputCalldata: string): {
  commands: string
  inputs: string[]
} {
  const [commands, inputs] = abiCoder.decode(['bytes', 'bytes[]', 'uint256'], outputCalldata)
  return { commands: commands as string, inputs: inputs as string[] }
}

// --------------------------------------------------------------------------
// PAY_PORTION_FULL_PRECISION downgrade tests
// --------------------------------------------------------------------------

describe('PAY_PORTION_FULL_PRECISION downgrade', () => {
  it('downgrades 0x07 → 0x06 and converts portion to bips', () => {
    // 5 bips = 5 * 1e18 / 10000 in full-precision
    const portion = BigInt(5) * BigInt('100000000000000') // 5e14 = 0.05% in 1e18 precision
    const input = abiCoder.encode(['address', 'address', 'uint256'], [SOME_TOKEN, FEE_RECIPIENT, portion.toString()])
    const commands = Buffer.from([CMD_PAY_PORTION_FULL_PRECISION])
    const calldata = abiCoder.encode(
      ['bytes', 'bytes[]', 'uint256'],
      ['0x' + commands.toString('hex'), [input], DEADLINE],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    expect(result).not.toBe(calldata)

    const { commands: outCommands, inputs: outInputs } = decodeOutputCalldata(result)
    // Command byte should be downgraded from 0x07 to 0x06
    expect(outCommands).toBe('0x06')
    const [outToken, outRecipient, outBips] = abiCoder.decode(['address', 'address', 'uint256'], outInputs[0]!)
    expect(outToken.toLowerCase()).toBe(SOME_TOKEN.toLowerCase())
    // Fee recipient is replaced with the smart pool (shouldReplaceRecipient replaces all non-special addresses)
    expect(outRecipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
    // bips = portion * 10000 / 1e18 = 5e14 * 10000 / 1e18 = 5
    expect(BigInt(outBips.toString())).toBe(BigInt(5))
  })

  it('replaces fee recipient in PAY_PORTION_FULL_PRECISION', () => {
    const portion = BigInt(25) * BigInt('100000000000000') // 25 bips in 1e18 precision
    const input = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, FEE_RECIPIENT, portion.toString()])
    const commands = Buffer.from([CMD_PAY_PORTION_FULL_PRECISION])
    const calldata = abiCoder.encode(
      ['bytes', 'bytes[]', 'uint256'],
      ['0x' + commands.toString('hex'), [input], DEADLINE],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    const { commands: outCommands, inputs: outInputs } = decodeOutputCalldata(result)
    expect(outCommands).toBe('0x06')
    const [, outRecipient] = abiCoder.decode(['address', 'address', 'uint256'], outInputs[0]!)
    expect(outRecipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
  })
})

// --------------------------------------------------------------------------
// BALANCE_CHECK_ERC20 stripping tests
// --------------------------------------------------------------------------

describe('stripBalanceCheckERC20', () => {
  it('strips BALANCE_CHECK_ERC20 (0x0e) from commands', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const balanceCheckInput = abiCoder.encode(['address', 'uint256'], [SOME_TOKEN, 100])
    const v4Input = abiCoder.encode(
      ['bytes', 'bytes[]'],
      [
        '0x' + Buffer.from([V4_TAKE]).toString('hex'),
        [abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, 100])],
      ],
    )
    const commands = Buffer.from([CMD_BALANCE_CHECK_ERC20, CMD_V4_SWAP])
    const calldata = abiCoder.encode(
      ['bytes', 'bytes[]', 'uint256'],
      ['0x' + commands.toString('hex'), [balanceCheckInput, v4Input], DEADLINE],
    )

    const stripped = stripBalanceCheckERC20(calldata)
    expect(stripped).not.toBe(calldata)
    const { commands: outCommands } = decodeOutputCalldata(stripped)
    expect(outCommands.toLowerCase()).not.toContain('0e')
    expect(outCommands.toLowerCase()).toContain('10') // V4_SWAP remains
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining('Stripped BALANCE_CHECK_ERC20'),
    )
    consoleInfoSpy.mockRestore()
  })
})

// --------------------------------------------------------------------------
// V4 swap action code preservation tests
// --------------------------------------------------------------------------

describe('V4 action codes are preserved during recipient replacement', () => {
  it('preserves action codes unchanged when replacing TAKE recipient', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [NATIVE_TOKEN, 100, false])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, FEE_RECIPIENT, 100])

    // Single-hop ExactIn: [SWAP_EXACT_IN_SINGLE(0x06), SETTLE(0x0b), TAKE(0x0e)]
    const calldata = buildV4SwapCalldata(
      [V4_SWAP_EXACT_IN_SINGLE, V4_SETTLE, V4_TAKE],
      [buildSwapExactInSingleMinimal(), settleParams, takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    expect(result).not.toBe(calldata)

    const { inputs } = decodeOutputCalldata(result)
    const { actionsHex, params: outParams } = decodeV4SwapInput(inputs[0]!)
    const actionsBytes = Buffer.from(actionsHex.slice(2), 'hex')

    // All action codes must be preserved exactly
    expect(actionsBytes[0]).toBe(V4_SWAP_EXACT_IN_SINGLE) // 0x06
    expect(actionsBytes[1]).toBe(V4_SETTLE) // 0x0b
    expect(actionsBytes[2]).toBe(V4_TAKE) // 0x0e

    // TAKE recipient replaced to smart pool
    const { recipient } = decodeCurrencyAddressUint256(outParams[2]!)
    expect(recipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
  })

  it('preserves multi-hop action codes when replacing TAKE recipient', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [SOME_TOKEN, 100, false])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, FEE_RECIPIENT, 100])

    // Multi-hop ExactIn: [SWAP_EXACT_IN(0x07), SETTLE(0x0b), TAKE(0x0e)]
    const calldata = buildV4SwapCalldata(
      [V4_SWAP_EXACT_IN, V4_SETTLE, V4_TAKE],
      [buildSwapExactInMinimal(), settleParams, takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    const { inputs } = decodeOutputCalldata(result)
    const { actionsHex } = decodeV4SwapInput(inputs[0]!)
    const actionsBytes = Buffer.from(actionsHex.slice(2), 'hex')

    expect(actionsBytes[0]).toBe(V4_SWAP_EXACT_IN) // 0x07 unchanged
    expect(actionsBytes[1]).toBe(V4_SETTLE) // 0x0b unchanged
    expect(actionsBytes[2]).toBe(V4_TAKE) // 0x0e unchanged
  })

  it('returns calldata unchanged when TAKE recipient is already smart pool', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [NATIVE_TOKEN, 100, false])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, 100])

    const calldata = buildV4SwapCalldata(
      [V4_SWAP_EXACT_IN_SINGLE, V4_SETTLE, V4_TAKE],
      [buildSwapExactInSingleMinimal(), settleParams, takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    expect(result).toBe(calldata)
  })

  it('replaces both TAKE and TAKE_PORTION recipients', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [SOME_TOKEN, 100, false])
    const takePortionParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, FEE_RECIPIENT, 50])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, FEE_RECIPIENT, 950])

    const calldata = buildV4SwapCalldata(
      [V4_SWAP_EXACT_IN_SINGLE, V4_SETTLE, V4_TAKE_PORTION, V4_TAKE],
      [buildSwapExactInSingleMinimal(), settleParams, takePortionParams, takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    const { inputs } = decodeOutputCalldata(result)
    const { actionsHex, params: outParams } = decodeV4SwapInput(inputs[0]!)
    const actionsBytes = Buffer.from(actionsHex.slice(2), 'hex')

    // Action codes unchanged
    expect(actionsBytes[0]).toBe(V4_SWAP_EXACT_IN_SINGLE)
    expect(actionsBytes[1]).toBe(V4_SETTLE)
    expect(actionsBytes[2]).toBe(V4_TAKE_PORTION)
    expect(actionsBytes[3]).toBe(V4_TAKE)

    const { recipient: tpRecipient } = decodeCurrencyAddressUint256(outParams[2]!)
    expect(tpRecipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
    const { recipient: takeRecipient } = decodeCurrencyAddressUint256(outParams[3]!)
    expect(takeRecipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
  })
})

// --------------------------------------------------------------------------
// WRAP_ETH + V3_SWAP_EXACT_IN (ETH → token, the failing Arbitrum case)
// --------------------------------------------------------------------------

const CMD_WRAP_ETH = 0x0b
const CMD_UNWRAP_WETH = 0x0c
const CMD_V3_SWAP_EXACT_IN = 0x00
const CMD_V3_SWAP_EXACT_OUT = 0x01
const CMD_V2_SWAP_EXACT_IN = 0x08
const CMD_V2_SWAP_EXACT_OUT = 0x09
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002'
const MSG_SENDER = '0x0000000000000000000000000000000000000001'
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
const USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
// V3 path: WETH -0.05%- USDC (43 bytes)
const V3_PATH = ('0x' + WETH.slice(2) + '000064' + USDC.slice(2)).toLowerCase()

function buildWrapEthV3Calldata(wrapRecipient: string, swapRecipient: string, payerIsUser: boolean): string {
  const wrapInput = abiCoder.encode(['address', 'uint256'], [wrapRecipient, '10000000000000000'])
  const swapInput = abiCoder.encode(
    ['address', 'uint256', 'uint256', 'bytes', 'bool'],
    [swapRecipient, '10000000000000000', '22826256', V3_PATH, payerIsUser],
  )
  const commands = Buffer.from([CMD_WRAP_ETH, CMD_V3_SWAP_EXACT_IN])
  return abiCoder.encode(
    ['bytes', 'bytes[]', 'uint256'],
    ['0x' + commands.toString('hex'), [wrapInput, swapInput], DEADLINE],
  )
}

describe('WRAP_ETH + V3_SWAP_EXACT_IN (ETH → token via smart pool)', () => {
  it('leaves ADDRESS_THIS in WRAP_ETH untouched and replaces user address in V3', () => {
    // Reproduces the failing Arbitrum tx: [WRAP_ETH(ADDRESS_THIS), V3_SWAP_EXACT_IN(user)]
    // ADDRESS_THIS and MSG_SENDER are whitelisted by AUniswapRouter._processRecipients —
    // only the user EOA recipient in V3 needs to be replaced.
    const calldata = buildWrapEthV3Calldata(ADDRESS_THIS, FEE_RECIPIENT, false)
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    expect(result).not.toBe(calldata)

    const { inputs } = decodeOutputCalldata(result)

    // WRAP_ETH: ADDRESS_THIS unchanged (it is whitelisted, WETH stays in the UR)
    const [wrapRecipient] = abiCoder.decode(['address', 'uint256'], inputs[0]!)
    expect(wrapRecipient.toLowerCase()).toBe(ADDRESS_THIS.toLowerCase())

    // V3_SWAP_EXACT_IN: user address replaced with smart pool, payerIsUser untouched
    const [swapRecipient, , , , payerIsUser] = abiCoder.decode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      inputs[1]!,
    )
    expect(swapRecipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
    expect(payerIsUser).toBe(false) // untouched — UR draws from its own WETH balance
  })

  it('leaves MSG_SENDER in WRAP_ETH untouched', () => {
    const calldata = buildWrapEthV3Calldata(MSG_SENDER, FEE_RECIPIENT, false)
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })

    const { inputs } = decodeOutputCalldata(result)
    const [wrapRecipient] = abiCoder.decode(['address', 'uint256'], inputs[0]!)
    expect(wrapRecipient.toLowerCase()).toBe(MSG_SENDER.toLowerCase())

    // V3 recipient still replaced
    const [swapRecipient] = abiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], inputs[1]!)
    expect(swapRecipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
  })

  it('replaces user address in WRAP_ETH when present', () => {
    // Unusual but possible: WRAP_ETH with a user address recipient
    const calldata = buildWrapEthV3Calldata(FEE_RECIPIENT, FEE_RECIPIENT, false)
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })

    const { inputs } = decodeOutputCalldata(result)
    const [wrapRecipient] = abiCoder.decode(['address', 'uint256'], inputs[0]!)
    expect(wrapRecipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
  })
})

// --------------------------------------------------------------------------
// V3_SWAP_EXACT_IN standalone (ERC20 → ERC20, user address recipient)
// --------------------------------------------------------------------------

describe('V3_SWAP_EXACT_IN recipient replacement', () => {
  it('replaces user address recipient with smart pool', () => {
    const input = abiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      [FEE_RECIPIENT, '1000', '900', V3_PATH, true],
    )
    const commands = Buffer.from([CMD_V3_SWAP_EXACT_IN])
    const calldata = abiCoder.encode(
      ['bytes', 'bytes[]', 'uint256'],
      ['0x' + commands.toString('hex'), [input], DEADLINE],
    )
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    const { inputs } = decodeOutputCalldata(result)
    const [recipient, , , , payerIsUser] = abiCoder.decode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      inputs[0]!,
    )
    expect(recipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
    expect(payerIsUser).toBe(true) // unchanged
  })

  it('does not replace ADDRESS_THIS or MSG_SENDER recipient', () => {
    for (const specialAddr of [ADDRESS_THIS, MSG_SENDER]) {
      const input = abiCoder.encode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        [specialAddr, '1000', '900', V3_PATH, false],
      )
      const commands = Buffer.from([CMD_V3_SWAP_EXACT_IN])
      const calldata = abiCoder.encode(
        ['bytes', 'bytes[]', 'uint256'],
        ['0x' + commands.toString('hex'), [input], DEADLINE],
      )
      const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
      // calldata should be unchanged since recipient is a special constant
      expect(result).toBe(calldata)
    }
  })
})

// --------------------------------------------------------------------------
// V3_SWAP_EXACT_OUT recipient replacement
// --------------------------------------------------------------------------

describe('V3_SWAP_EXACT_OUT recipient replacement', () => {
  it('replaces user address recipient with smart pool', () => {
    const input = abiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      [FEE_RECIPIENT, '1000', '1100', V3_PATH, true],
    )
    const commands = Buffer.from([CMD_V3_SWAP_EXACT_OUT])
    const calldata = abiCoder.encode(
      ['bytes', 'bytes[]', 'uint256'],
      ['0x' + commands.toString('hex'), [input], DEADLINE],
    )
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    const { inputs } = decodeOutputCalldata(result)
    const [recipient] = abiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], inputs[0]!)
    expect(recipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
  })
})

// --------------------------------------------------------------------------
// V2_SWAP_EXACT_IN / V2_SWAP_EXACT_OUT recipient replacement
// --------------------------------------------------------------------------

describe('V2 swap recipient replacement', () => {
  const V2_PATH = [WETH, USDC]

  it('replaces V2_SWAP_EXACT_IN recipient', () => {
    const input = abiCoder.encode(
      ['address', 'uint256', 'uint256', 'address[]', 'bool'],
      [FEE_RECIPIENT, '1000', '900', V2_PATH, true],
    )
    const commands = Buffer.from([CMD_V2_SWAP_EXACT_IN])
    const calldata = abiCoder.encode(
      ['bytes', 'bytes[]', 'uint256'],
      ['0x' + commands.toString('hex'), [input], DEADLINE],
    )
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    const { inputs } = decodeOutputCalldata(result)
    const [recipient] = abiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], inputs[0]!)
    expect(recipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
  })

  it('replaces V2_SWAP_EXACT_OUT recipient', () => {
    const input = abiCoder.encode(
      ['address', 'uint256', 'uint256', 'address[]', 'bool'],
      [FEE_RECIPIENT, '1000', '1100', V2_PATH, true],
    )
    const commands = Buffer.from([CMD_V2_SWAP_EXACT_OUT])
    const calldata = abiCoder.encode(
      ['bytes', 'bytes[]', 'uint256'],
      ['0x' + commands.toString('hex'), [input], DEADLINE],
    )
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    const { inputs } = decodeOutputCalldata(result)
    const [recipient] = abiCoder.decode(['address', 'uint256', 'uint256', 'address[]', 'bool'], inputs[0]!)
    expect(recipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
  })
})

// --------------------------------------------------------------------------
// UNWRAP_WETH recipient replacement
// --------------------------------------------------------------------------

describe('UNWRAP_WETH recipient replacement', () => {
  it('replaces user address recipient with smart pool', () => {
    const input = abiCoder.encode(['address', 'uint256'], [FEE_RECIPIENT, '5000'])
    const commands = Buffer.from([CMD_UNWRAP_WETH])
    const calldata = abiCoder.encode(
      ['bytes', 'bytes[]', 'uint256'],
      ['0x' + commands.toString('hex'), [input], DEADLINE],
    )
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    const { inputs } = decodeOutputCalldata(result)
    const [recipient, amount] = abiCoder.decode(['address', 'uint256'], inputs[0]!)
    expect(recipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
    expect(amount.toString()).toBe('5000')
  })

  it('does not modify when recipient is already smart pool', () => {
    const input = abiCoder.encode(['address', 'uint256'], [SMART_POOL, '5000'])
    const commands = Buffer.from([CMD_UNWRAP_WETH])
    const calldata = abiCoder.encode(
      ['bytes', 'bytes[]', 'uint256'],
      ['0x' + commands.toString('hex'), [input], DEADLINE],
    )
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    expect(result).toBe(calldata)
  })
})

// --------------------------------------------------------------------------
// poolSupportsUr211 (protocol >= 4.4.7) — UR 2.1.x command preservation
// --------------------------------------------------------------------------

describe('PAY_PORTION_FULL_PRECISION with poolSupportsUr211', () => {
  const PORTION_5_BIPS_1E18 = (BigInt(5) * BigInt('100000000000000')).toString()

  function buildFullPrecisionCalldata(): string {
    const input = abiCoder.encode(['address', 'address', 'uint256'], [SOME_TOKEN, FEE_RECIPIENT, PORTION_5_BIPS_1E18])
    const commands = Buffer.from([CMD_PAY_PORTION_FULL_PRECISION])
    return abiCoder.encode(['bytes', 'bytes[]', 'uint256'], ['0x' + commands.toString('hex'), [input], DEADLINE])
  }

  it('preserves the 0x07 command and 1e18 portion when poolSupportsUr211 is true', () => {
    const calldata = buildFullPrecisionCalldata()
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL, poolSupportsUr211: true })
    expect(result).not.toBe(calldata)

    const { commands: outCommands, inputs: outInputs } = decodeOutputCalldata(result)
    expect(outCommands).toBe('0x07')
    const [outToken, outRecipient, outPortion] = abiCoder.decode(['address', 'address', 'uint256'], outInputs[0]!)
    expect(outToken.toLowerCase()).toBe(SOME_TOKEN.toLowerCase())
    // Recipient is still rewritten to the smart pool
    expect(outRecipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
    // Portion stays in 1e18 precision (NOT converted to bips)
    expect(outPortion.toString()).toBe(PORTION_5_BIPS_1E18)
  })

  it('still downgrades 0x07 → 0x06 when poolSupportsUr211 is false', () => {
    const calldata = buildFullPrecisionCalldata()
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL, poolSupportsUr211: false })
    const { commands: outCommands } = decodeOutputCalldata(result)
    expect(outCommands).toBe('0x06')
  })

  it('still downgrades 0x07 → 0x06 when poolSupportsUr211 is omitted', () => {
    const calldata = buildFullPrecisionCalldata()
    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    const { commands: outCommands } = decodeOutputCalldata(result)
    expect(outCommands).toBe('0x06')
  })
})

describe('stripBalanceCheckERC20 with poolSupportsUr211', () => {
  function buildBalanceCheckCalldata(): string {
    const balanceCheckInput = abiCoder.encode(['address', 'uint256'], [SOME_TOKEN, 100])
    const commands = Buffer.from([CMD_BALANCE_CHECK_ERC20])
    return abiCoder.encode(
      ['bytes', 'bytes[]', 'uint256'],
      ['0x' + commands.toString('hex'), [balanceCheckInput], DEADLINE],
    )
  }

  it('preserves BALANCE_CHECK_ERC20 (0x0e) when poolSupportsUr211 is true', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const calldata = buildBalanceCheckCalldata()

    const stripped = stripBalanceCheckERC20(calldata, { poolSupportsUr211: true })
    expect(stripped).toBe(calldata)
    const { commands: outCommands } = decodeOutputCalldata(stripped)
    expect(outCommands.toLowerCase()).toBe('0x0e')
    consoleInfoSpy.mockRestore()
  })

  it('still strips BALANCE_CHECK_ERC20 when poolSupportsUr211 is false', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const calldata = buildBalanceCheckCalldata()

    const stripped = stripBalanceCheckERC20(calldata, { poolSupportsUr211: false })
    expect(stripped).not.toBe(calldata)
    const { commands: outCommands } = decodeOutputCalldata(stripped)
    expect(outCommands.toLowerCase()).not.toContain('0e')
    consoleInfoSpy.mockRestore()
  })

  it('still strips BALANCE_CHECK_ERC20 when poolSupportsUr211 is omitted', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const calldata = buildBalanceCheckCalldata()

    const stripped = stripBalanceCheckERC20(calldata)
    expect(stripped).not.toBe(calldata)
    consoleInfoSpy.mockRestore()
  })
})

// --------------------------------------------------------------------------
// OPEN-delta input pinning (RigoBlock: full-balance V4 swaps)
// --------------------------------------------------------------------------

const V4_SETTLE_ALL = 0x0c
const EXACT_INPUT = { currency: SOME_TOKEN, amountRaw: '501643000000000000000' }
const NATIVE_EXACT_INPUT = { currency: NATIVE_TOKEN, amountRaw: '1000000000000000000' }

function decodeSettleParams(params: string): { currency: string; amount: bigint; payerIsUser: boolean } {
  const [currency, amount, payerIsUser] = abiCoder.decode(['address', 'uint256', 'bool'], params)
  return { currency, amount: BigInt(amount.toString()), payerIsUser }
}

describe('V4 OPEN-delta input amount pinning', () => {
  it('pins SETTLE amount 0 to the exact trade input, preserving payerIsUser', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [SOME_TOKEN, 0, true])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, 0])
    const calldata = buildV4SwapCalldata(
      [V4_SWAP_EXACT_IN, V4_SETTLE, V4_TAKE],
      [buildSwapExactInMinimal(), settleParams, takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL, exactInput: EXACT_INPUT })
    const { inputs } = decodeOutputCalldata(result)
    const { params } = decodeV4SwapInput(inputs[0]!)
    const settle = decodeSettleParams(params[1]!)
    expect(settle.currency.toLowerCase()).toBe(SOME_TOKEN.toLowerCase())
    expect(settle.amount).toBe(BigInt(EXACT_INPUT.amountRaw))
    expect(settle.payerIsUser).toBe(true)
  })

  it('leaves SETTLE with an explicit amount untouched', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [SOME_TOKEN, 1000, true])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, 0])
    const calldata = buildV4SwapCalldata(
      [V4_SWAP_EXACT_IN, V4_SETTLE, V4_TAKE],
      [buildSwapExactInMinimal(), settleParams, takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL, exactInput: EXACT_INPUT })
    expect(result).toBe(calldata)
  })

  it('leaves SETTLE open amount on a different currency untouched', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [SOME_TOKEN, 0, true])
    const otherSettleParams = abiCoder.encode(['address', 'uint256', 'bool'], [NATIVE_TOKEN, 0, true])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, 0])
    const calldata = buildV4SwapCalldata(
      [V4_SWAP_EXACT_IN, V4_SETTLE, V4_SETTLE, V4_TAKE],
      [buildSwapExactInMinimal(), settleParams, otherSettleParams, takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL, exactInput: NATIVE_EXACT_INPUT })
    const { inputs } = decodeOutputCalldata(result)
    const { params } = decodeV4SwapInput(inputs[0]!)
    // input currency is native here: the SOME_TOKEN settle stays open, the native settle is pinned
    expect(decodeSettleParams(params[1]!).amount).toBe(BigInt(0))
    expect(decodeSettleParams(params[2]!).amount).toBe(BigInt(NATIVE_EXACT_INPUT.amountRaw))
  })

  it('rewrites SETTLE_ALL on the input currency to an explicit SETTLE', () => {
    const settleAllParams = abiCoder.encode(['address', 'uint256'], [SOME_TOKEN, 0])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, 0])
    const calldata = buildV4SwapCalldata(
      [V4_SETTLE_ALL, V4_SWAP_EXACT_IN, V4_TAKE],
      [settleAllParams, buildSwapExactInMinimal(), takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL, exactInput: EXACT_INPUT })
    const { inputs } = decodeOutputCalldata(result)
    const { actionsHex, params } = decodeV4SwapInput(inputs[0]!)
    const actionsBytes = Buffer.from(actionsHex.slice(2), 'hex')
    expect(actionsBytes[0]).toBe(V4_SETTLE) // 0x0c -> 0x0b
    const settle = decodeSettleParams(params[0]!)
    expect(settle.currency.toLowerCase()).toBe(SOME_TOKEN.toLowerCase())
    expect(settle.amount).toBe(BigInt(EXACT_INPUT.amountRaw))
    expect(settle.payerIsUser).toBe(true)
  })

  it('pins SWAP_EXACT_IN_SINGLE amountIn 0 to the exact trade input', () => {
    const poolKey = [SOME_TOKEN, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 3000, 60, NATIVE_TOKEN] as const
    const swapParams = abiCoder.encode([SWAP_EXACT_IN_SINGLE_STRUCT_V20], [[poolKey, true, 0, 1000, '0x']])
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [SOME_TOKEN, 0, true])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, 0])
    const calldata = buildV4SwapCalldata(
      [V4_SWAP_EXACT_IN_SINGLE, V4_SETTLE, V4_TAKE],
      [swapParams, settleParams, takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL, exactInput: EXACT_INPUT })
    const { inputs } = decodeOutputCalldata(result)
    const { params } = decodeV4SwapInput(inputs[0]!)
    const [decodedPoolKey, zeroForOne, amountIn, amountOutMin, hookData] = abiCoder.decode(
      [SWAP_EXACT_IN_SINGLE_STRUCT_V20],
      params[0]!,
    )[0] as [string[], boolean, BigNumber, BigNumber, string]
    expect(zeroForOne).toBe(true)
    expect(amountIn.toString()).toBe(EXACT_INPUT.amountRaw)
    expect(amountOutMin.toString()).toBe('1000')
    expect(hookData).toBe('0x')
    expect(decodedPoolKey[0]!.toLowerCase()).toBe(SOME_TOKEN.toLowerCase())
    // SETTLE pinned too
    expect(decodeSettleParams(params[1]!).amount).toBe(BigInt(EXACT_INPUT.amountRaw))
  })

  it('pins SWAP_EXACT_IN amountIn 0 to the exact trade input (UR 2.0 flavor)', () => {
    const pathKey = ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 3000, 60, NATIVE_TOKEN, '0x'] as const
    const swapParams = abiCoder.encode([SWAP_EXACT_IN_STRUCT_V20], [[SOME_TOKEN, [pathKey], 0, 1000]])
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [SOME_TOKEN, 0, true])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, 0])
    const calldata = buildV4SwapCalldata([V4_SWAP_EXACT_IN, V4_SETTLE, V4_TAKE], [swapParams, settleParams, takeParams])

    const result = modifyV4ExecuteCalldata({
      calldata,
      smartPoolAddress: SMART_POOL,
      poolSupportsUr211: false,
      exactInput: EXACT_INPUT,
    })
    const { inputs } = decodeOutputCalldata(result)
    const { params } = decodeV4SwapInput(inputs[0]!)
    const [currencyIn, path, amountIn, amountOutMin] = abiCoder.decode([SWAP_EXACT_IN_STRUCT_V20], params[0]!)[0] as [
      string,
      unknown[],
      BigNumber,
      BigNumber,
    ]
    expect(currencyIn.toLowerCase()).toBe(SOME_TOKEN.toLowerCase())
    expect(amountIn.toString()).toBe(EXACT_INPUT.amountRaw)
    expect(amountOutMin.toString()).toBe('1000')
    expect(path.length).toBe(1)
  })

  it('pins SWAP_EXACT_IN amountIn 0 to the exact trade input (UR 2.1.1 flavor)', () => {
    const pathKey = ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 3000, 60, NATIVE_TOKEN, '0x'] as const
    // UR 2.1.1 struct: (currencyIn, path[], minHopPriceX36[], amountIn, amountOutMinimum)
    const swapParams = abiCoder.encode([SWAP_EXACT_IN_STRUCT_V211], [[SOME_TOKEN, [pathKey], [], 0, 1000]])
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [SOME_TOKEN, 0, true])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, 0])
    const calldata = buildV4SwapCalldata([V4_SWAP_EXACT_IN, V4_SETTLE, V4_TAKE], [swapParams, settleParams, takeParams])

    const result = modifyV4ExecuteCalldata({
      calldata,
      smartPoolAddress: SMART_POOL,
      poolSupportsUr211: true,
      exactInput: EXACT_INPUT,
    })
    const { inputs } = decodeOutputCalldata(result)
    const { params } = decodeV4SwapInput(inputs[0]!)
    const [currencyIn, path, minHopPriceX36, amountIn, amountOutMin] = abiCoder.decode(
      [SWAP_EXACT_IN_STRUCT_V211],
      params[0]!,
    )[0] as [string, unknown[], unknown[], BigNumber, BigNumber]
    expect(amountIn.toString()).toBe(EXACT_INPUT.amountRaw)
    expect(amountOutMin.toString()).toBe('1000')
    expect(minHopPriceX36.length).toBe(0)
    expect(path.length).toBe(1)
  })

  it('normalizes a UR 2.1.1-flavored native-input SWAP_EXACT_IN down to UR 2.0 flavor (production tx2)', () => {
    // Production shape (Oct 2026): the trading API emits UR 2.1.1-flavored V4 structs even
    // though every deployed RigoBlock adapter decodes UR 2.0. A UR-2.0 adapter reads amountIn
    // from the 2.0 struct position = the minHopPriceX36 slot (~0x1a0) and under-funds the
    // router's msg.value → V4TooLittleReceived (0x8b063d73). The rewriter must re-encode the
    // swap struct in the pool's flavor and pin the open amounts.
    const lit = '0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2'
    const pathKey = [lit, 3000, 60, NATIVE_TOKEN, '0x'] as const
    const swapParams = abiCoder.encode([SWAP_EXACT_IN_STRUCT_V211], [
      [NATIVE_TOKEN, [pathKey], [], 0, BigInt('10000000000000000')],
    ])
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [NATIVE_TOKEN, 0, true])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [lit, SMART_POOL, 0])
    const calldata = buildV4SwapCalldata([V4_SWAP_EXACT_IN, V4_SETTLE, V4_TAKE], [swapParams, settleParams, takeParams])

    const result = modifyV4ExecuteCalldata({
      calldata,
      smartPoolAddress: SMART_POOL,
      poolSupportsUr211: false,
      exactInput: NATIVE_EXACT_INPUT,
    })
    const { inputs } = decodeOutputCalldata(result)
    const { actionsHex, params } = decodeV4SwapInput(inputs[0]!)
    const actionsBytes = Buffer.from(actionsHex.slice(2), 'hex')
    expect(actionsBytes[0]).toBe(V4_SWAP_EXACT_IN) // 0x07 unchanged
    expect(actionsBytes[1]).toBe(V4_SETTLE) // 0x0b unchanged
    expect(actionsBytes[2]).toBe(V4_TAKE) // 0x0e unchanged

    // Swap re-encoded in UR 2.0 flavor: 4 fields, amountIn pinned at the 2.0 position
    const [currencyIn, path, amountIn, amountOutMin] = abiCoder.decode([SWAP_EXACT_IN_STRUCT_V20], params[0]!)[0] as [
      string,
      unknown[],
      BigNumber,
      BigNumber,
    ]
    expect(currencyIn).toBe(NATIVE_TOKEN)
    expect(amountIn.toString()).toBe(NATIVE_EXACT_INPUT.amountRaw)
    expect(amountOutMin.toString()).toBe('10000000000000000')
    expect(path.length).toBe(1)

    // SETTLE pinned to the exact input as well
    const settle = decodeSettleParams(params[1]!)
    expect(settle.currency).toBe(NATIVE_TOKEN)
    expect(settle.amount).toBe(BigInt(NATIVE_EXACT_INPUT.amountRaw))
    expect(settle.payerIsUser).toBe(true)
  })

  it('does not modify V4 input when exactInput is not provided', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [SOME_TOKEN, 0, true])
    const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, 0])
    const calldata = buildV4SwapCalldata(
      [V4_SWAP_EXACT_IN, V4_SETTLE, V4_TAKE],
      [buildSwapExactInMinimal(), settleParams, takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    expect(result).toBe(calldata)
  })
})

const V4_SWAP_EXACT_OUT = 0x09

describe('V4 EXACT_OUTPUT open settle → SETTLE_ALL', () => {
  const INPUT_TOKEN = '0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2' // LIT (shape from production)
  const AMOUNT_OUT = BigInt('4167000000000000') // 0x24b3148c87a000 — ETH out
  const MAX_AMOUNT_IN = BigInt('1268830193286593298') // 0x6e383c3100447b12 — quoted max LIT in

  function pathKeyWith(intermediateCurrency: string): readonly [string, number, number, string, string] {
    return [intermediateCurrency, 3000, 60, NATIVE_TOKEN, '0x']
  }

  /** SWAP_EXACT_OUT params, UR 2.1.1 flavor (minHopPriceX36[] present), AbiCoder-canonical. */
  function buildSwapExactOutUr211(intermediateCurrency: string = INPUT_TOKEN): string {
    return abiCoder.encode([SWAP_EXACT_OUT_STRUCT_V211], [
      [NATIVE_TOKEN, [pathKeyWith(intermediateCurrency)], [], AMOUNT_OUT, MAX_AMOUNT_IN],
    ])
  }

  /** SWAP_EXACT_OUT params, UR 2.0 flavor (no minHopPriceX36 field). */
  function buildSwapExactOutUr20(): string {
    return abiCoder.encode([SWAP_EXACT_OUT_STRUCT_V20], [
      [NATIVE_TOKEN, [pathKeyWith(INPUT_TOKEN)], AMOUNT_OUT, MAX_AMOUNT_IN],
    ])
  }

  function buildExactOutCalldata(swapParams: string, settleParams: string, takeParams: string): string {
    return buildV4SwapCalldata([V4_SWAP_EXACT_OUT, V4_SETTLE, V4_TAKE], [swapParams, settleParams, takeParams])
  }

  function decodeResult(result: string): { actionsBytes: Buffer; params: string[] } {
    const { inputs } = decodeOutputCalldata(result)
    const { actionsHex, params } = decodeV4SwapInput(inputs[0]!)
    return { actionsBytes: Buffer.from(actionsHex.replace('0x', ''), 'hex'), params }
  }

  it('rewrites SETTLE(currency, 0, true) to SETTLE_ALL(currency, amountInMaximum), normalizing to UR 2.0 flavor', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [INPUT_TOKEN, 0, true])
    const takeParams = abiCoder.encode(
      ['address', 'address', 'uint256'],
      [NATIVE_TOKEN, SMART_POOL, AMOUNT_OUT.toString()],
    )
    const calldata = buildExactOutCalldata(buildSwapExactOutUr211(), settleParams, takeParams)

    const { actionsBytes, params } = decodeResult(modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL }))
    expect(actionsBytes[0]).toBe(V4_SWAP_EXACT_OUT) // 0x09 unchanged
    expect(actionsBytes[1]).toBe(V4_SETTLE_ALL) // 0x0b -> 0x0c
    expect(actionsBytes[2]).toBe(V4_TAKE) // 0x0e unchanged
    const [currency, maxAmount] = abiCoder.decode(['address', 'uint256'], params[1]!)
    expect(currency.toLowerCase()).toBe(INPUT_TOKEN)
    expect(BigInt(maxAmount.toString())).toBe(MAX_AMOUNT_IN)
    // Swap action re-encoded in the pool's UR 2.0 flavor (no minHopPriceX36 field)
    const [currencyOut, path, amountOut, amountInMaximum] = abiCoder.decode([SWAP_EXACT_OUT_STRUCT_V20], params[0]!)[0] as [
      string,
      [string, BigNumber, number, string, string][],
      BigNumber,
      BigNumber,
    ]
    expect(currencyOut).toBe(NATIVE_TOKEN)
    expect(amountOut.toString()).toBe(AMOUNT_OUT.toString())
    expect(amountInMaximum.toString()).toBe(MAX_AMOUNT_IN.toString())
    expect(path[0]![0].toLowerCase()).toBe(INPUT_TOKEN)
    // TAKE untouched
    const [takeCurrency, takeRecipient, takeAmount] = abiCoder.decode(['address', 'address', 'uint256'], params[2]!)
    expect(takeCurrency).toBe(NATIVE_TOKEN)
    expect(takeRecipient.toLowerCase()).toBe(SMART_POOL.toLowerCase())
    expect(BigInt(takeAmount.toString())).toBe(AMOUNT_OUT)
  })

  it('reads amountInMaximum from a UR 2.0-flavored SWAP_EXACT_OUT when the API emits UR 2.0', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [INPUT_TOKEN, 0, true])
    const takeParams = abiCoder.encode(
      ['address', 'address', 'uint256'],
      [NATIVE_TOKEN, SMART_POOL, AMOUNT_OUT.toString()],
    )
    const calldata = buildExactOutCalldata(buildSwapExactOutUr20(), settleParams, takeParams)

    const { actionsBytes, params } = decodeResult(modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL }))
    expect(actionsBytes[1]).toBe(V4_SETTLE_ALL)
    const [currency, maxAmount] = abiCoder.decode(['address', 'uint256'], params[1]!)
    expect(currency.toLowerCase()).toBe(INPUT_TOKEN)
    expect(BigInt(maxAmount.toString())).toBe(MAX_AMOUNT_IN)
  })

  it('leaves an explicit-amount SETTLE untouched', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [INPUT_TOKEN, 555, true])
    const takeParams = abiCoder.encode(
      ['address', 'address', 'uint256'],
      [NATIVE_TOKEN, SMART_POOL, AMOUNT_OUT.toString()],
    )
    // poolSupportsUr211: the API-emitted UR 2.1.1 flavor matches the pool's flavor, so no
    // normalization is needed and nothing else rewrites here.
    const calldata = buildExactOutCalldata(buildSwapExactOutUr211(), settleParams, takeParams)

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL, poolSupportsUr211: true })
    expect(result).toBe(calldata)
  })

  it('keeps the SETTLE open on native-input exact-output swaps, but still normalizes the swap flavor', () => {
    // Native input cannot be capped (the consumed amount is only known at execution time, so
    // no msg.value can be derived for the adapter) — the SETTLE stays open. The swap action is
    // still re-encoded in the pool's flavor.
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [NATIVE_TOKEN, 0, true])
    const takeParams = abiCoder.encode(
      ['address', 'address', 'uint256'],
      [SOME_TOKEN, SMART_POOL, AMOUNT_OUT.toString()],
    )
    const calldata = buildV4SwapCalldata(
      [V4_SWAP_EXACT_OUT, V4_SETTLE, V4_TAKE],
      [buildSwapExactOutUr211(NATIVE_TOKEN), settleParams, takeParams],
    )

    const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
    expect(result).not.toBe(calldata)
    const { actionsBytes, params } = decodeResult(result)
    expect(actionsBytes[0]).toBe(V4_SWAP_EXACT_OUT) // 0x09 unchanged
    expect(actionsBytes[1]).toBe(V4_SETTLE) // NOT rewritten (native input)
    expect(actionsBytes[2]).toBe(V4_TAKE)
    // SETTLE untouched
    const settle = decodeSettleParams(params[1]!)
    expect(settle.currency).toBe(NATIVE_TOKEN)
    expect(settle.amount).toBe(BigInt(0))
    expect(settle.payerIsUser).toBe(true)
    // Swap normalized to UR 2.0 flavor
    const [currencyOut, path, amountOut, amountInMaximum] = abiCoder.decode([SWAP_EXACT_OUT_STRUCT_V20], params[0]!)[0] as [
      string,
      [string, BigNumber, number, string, string][],
      BigNumber,
      BigNumber,
    ]
    expect(currencyOut).toBe(NATIVE_TOKEN)
    expect(path[0]![0]).toBe(NATIVE_TOKEN)
    expect(amountOut.toString()).toBe(AMOUNT_OUT.toString())
    expect(amountInMaximum.toString()).toBe(MAX_AMOUNT_IN.toString())
  })

  // Second production encoding (Oct 2026): the planner switched to AbiCoder-style
  // OFFSET-PREFIXED PathKey elements — word after the path length is 0x20 pointing one word
  // ahead at the element — instead of inline elements. Byte shape lifted verbatim from a
  // production exact-out calldata that reverted CurrencyNotSettled because the rewriter read
  // the 0x20 offset word as the currency and skipped the SETTLE→SETTLE_ALL rewrite.
  function word(v: bigint): string {
    return v.toString(16).padStart(64, '0')
  }
  function addrWord(a: string): string {
    return word(BigInt(a))
  }

  function buildSwapExactOutUr211OffsetPrefixed(intermediateCurrency: string = INPUT_TOKEN): string {
    const words = [
      word(0x20n), // struct offset wrapper
      addrWord(NATIVE_TOKEN), // currencyOut = ETH
      word(0xa0n), // path offset, struct-relative
      word(0x1a0n), // minHopPriceX36 offset
      word(AMOUNT_OUT),
      word(MAX_AMOUNT_IN),
      word(1n), // path length
      word(0x20n), // OFFSET-PREFIX: path[0] element data one word ahead
      addrWord(intermediateCurrency),
      word(3000n), // fee
      word(60n), // tickSpacing
      word(0n), // hooks
      word(0xa0n), // hookData offset, element-relative
      word(0n), // hookData length
      word(0n), // minHopPriceX36 length
    ]
    return '0x' + words.join('')
  }

  it('resolves the input currency through an offset-prefixed path element (AbiCoder flavor)', () => {
    const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [INPUT_TOKEN, 0, true])
    const takeParams = abiCoder.encode(
      ['address', 'address', 'uint256'],
      [NATIVE_TOKEN, SMART_POOL, AMOUNT_OUT.toString()],
    )
    const calldata = buildExactOutCalldata(
      buildSwapExactOutUr211OffsetPrefixed(),
      settleParams,
      takeParams,
    )

    const { actionsBytes, params } = decodeResult(modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL }))
    expect(actionsBytes[1]).toBe(V4_SETTLE_ALL) // 0x0b -> 0x0c
    const [currency, maxAmount] = abiCoder.decode(['address', 'uint256'], params[1]!)
    expect(currency.toLowerCase()).toBe(INPUT_TOKEN)
    expect(BigInt(maxAmount.toString())).toBe(MAX_AMOUNT_IN)
  })
})
