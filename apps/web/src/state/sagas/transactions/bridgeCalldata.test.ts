import { AbiCoder } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { parseUnits } from '@ethersproject/units'
import {
  computeDestinationSimulationCompensation,
  estimateDestinationMessageGas,
  extractExpandedMessageFromTrace,
  fetchNativeTokenPriceUSD,
  fetchTokenPriceUSD,
  findExpandedMessageInTrace,
  getAcrossDepositInfo,
  isAcrossDepositV3,
  modifyAcrossDepositV3ForSmartPool,
  OpType,
  queryAcrossRelayerGasFee,
} from '~/state/sagas/transactions/bridgeCalldata'

// Mock logger to avoid console noise in tests
vi.mock('utilities/src/logger/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// --- Test fixtures ---

const ACROSS_DEPOSIT_V3_SELECTOR = '0x7b939232'

/**
 * Builds a valid Across depositV3 calldata for testing.
 * Uses realistic addresses and amounts from a real Arb → BSC USDT bridge.
 */
function buildTestDepositV3Calldata(overrides?: {
  depositor?: string
  recipient?: string
  inputToken?: string
  outputToken?: string
  inputAmount?: BigNumber
  outputAmount?: BigNumber
  destinationChainId?: number
  message?: string
}): string {
  const abiCoder = new AbiCoder()
  const defaults = {
    depositor: '0xDDCB7503B158EA9255F226B2725AEAA1D1BF3B30',
    recipient: '0xAC537C12FE8F544D712D71ED4376A502EEA944D7', // Across Multicall Handler (NOT the pool)
    inputToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT on Arbitrum (6 dec)
    outputToken: '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC (18 dec)
    inputAmount: BigNumber.from('10000000'), // 10 USDT (6 dec)
    outputAmount: BigNumber.from('9992066561272572390'), // ~9.99 USDT (18 dec)
    destinationChainId: 56,
    exclusiveRelayer: '0x0000000000000000000000000000000000000000',
    quoteTimestamp: 1776371015,
    fillDeadline: 1776392860,
    exclusivityDeadline: 0,
    message: '0x',
  }
  const params = { ...defaults, ...overrides }

  const encoded = abiCoder.encode(
    ['address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'address', 'uint32', 'uint32', 'uint32', 'bytes'],
    [
      params.depositor,
      params.recipient,
      params.inputToken,
      params.outputToken,
      params.inputAmount,
      params.outputAmount,
      params.destinationChainId,
      params.exclusiveRelayer,
      params.quoteTimestamp,
      params.fillDeadline,
      params.exclusivityDeadline,
      params.message,
    ],
  )

  return ACROSS_DEPOSIT_V3_SELECTOR + encoded.slice(2)
}

// A realistic expanded message from the FundsDeposited event log (Arb → BSC USDT bridge).
// This is what the RigoBlock pool generates on-chain from the compact SourceMessageParams.
// The handler on BSC (0xAC537C12FE8F544D712D71ED4376A502EEA944D7) executes this multicall,
// which targets the BSC pool (0xD14D4321A33F7ED001BA5B60CE54B0F7BA621247) and USDT token.
const REAL_EXPANDED_MESSAGE =
  '0x' +
  '0000000000000000000000000000000000000000000000000000000000000020' +
  '0000000000000000000000000000000000000000000000000000000000000040' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000004' +
  '0000000000000000000000000000000000000000000000000000000000000080' +
  '00000000000000000000000000000000000000000000000000000000000001A0' +
  '0000000000000000000000000000000000000000000000000000000000000280' +
  '0000000000000000000000000000000000000000000000000000000000000360' +
  '000000000000000000000000D14D4321A33F7ED001BA5B60CE54B0F7BA621247' +
  '0000000000000000000000000000000000000000000000000000000000000060' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000084' +
  '6DA7DF96' +
  '00000000000000000000000055D398326F99059FF775485246999027B3197955' +
  '0000000000000000000000000000000000000000000000000000000000000001' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '00000000000000000000000055D398326F99059FF775485246999027B3197955' +
  '0000000000000000000000000000000000000000000000000000000000000060' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000044' +
  'A9059CBB' +
  '00000000000000000000000064B2B51F538E928BB8BACBFE15018ABEEE1F7322' +
  '0000000000000000000000000000000000000000000000008AAAF398E4B5E9E6' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000AC537C12FE8F544D712D71ED4376A502EEA944D7' +
  '0000000000000000000000000000000000000000000000000000000000000060' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000044' +
  'EF8738D3' +
  '00000000000000000000000055D398326F99059FF775485246999027B3197955' +
  '00000000000000000000000064B2B51F538E928BB8BACBFE15018ABEEE1F7322' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000D14D4321A33F7ED001BA5B60CE54B0F7BA621247' +
  '0000000000000000000000000000000000000000000000000000000000000060' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000084' +
  '6DA7DF96' +
  '00000000000000000000000055D398326F99059FF775485246999027B3197955' +
  '0000000000000000000000000000000000000000000000008AAAF398E4B5E9E6' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000'

// --- Tests ---

describe('isAcrossDepositV3', () => {
  it('returns true for valid Across depositV3 selector', () => {
    const calldata = buildTestDepositV3Calldata()
    expect(isAcrossDepositV3(calldata)).toBe(true)
  })

  it('returns true regardless of selector case', () => {
    const calldata = buildTestDepositV3Calldata()
    expect(isAcrossDepositV3(calldata.toUpperCase())).toBe(true)
  })

  it('returns false for RigoBlock depositV3 selector', () => {
    // RigoBlock uses 0x770d096f (tuple-based), not 0x7b939232
    const calldata = '0x770d096f' + buildTestDepositV3Calldata().slice(10)
    expect(isAcrossDepositV3(calldata)).toBe(false)
  })

  it('returns false for empty or short calldata', () => {
    expect(isAcrossDepositV3('')).toBe(false)
    expect(isAcrossDepositV3('0x')).toBe(false)
    expect(isAcrossDepositV3('0x7b93')).toBe(false)
  })
})

describe('getAcrossDepositInfo', () => {
  it('extracts destination chain ID and recipient (handler) from calldata', () => {
    const calldata = buildTestDepositV3Calldata()
    const info = getAcrossDepositInfo(calldata)

    expect(info.destinationChainId).toBe(56)
    // Recipient is the Across Multicall Handler, NOT the RigoBlock pool
    expect(info.recipient.toLowerCase()).toBe('0xac537c12fe8f544d712d71ed4376a502eea944d7')
    // Output token on destination chain
    expect(info.outputToken.toLowerCase()).toBe('0x55d398326f99059ff775485246999027b3197955')
  })

  it('returns correct chain ID for different destination chains', () => {
    const calldata = buildTestDepositV3Calldata({ destinationChainId: 42161 })
    const info = getAcrossDepositInfo(calldata)
    expect(info.destinationChainId).toBe(42161)
  })
})

describe('findExpandedMessageInTrace', () => {
  it('finds expanded message in a flat trace with depositV3 at top level', () => {
    const expandedMessage = '0xdeadbeef1234'
    const calldata = buildTestDepositV3Calldata({ message: expandedMessage })

    const trace = { input: calldata }
    const result = findExpandedMessageInTrace(trace)
    expect(result).toBe(expandedMessage)
  })

  it('finds expanded message in a nested trace tree', () => {
    const expandedMessage = '0xdeadbeef1234'
    const depositCalldata = buildTestDepositV3Calldata({ message: expandedMessage })

    // Simulate: Pool.depositV3 → ... → SpokePool.depositV3 (nested 2 levels)
    const trace = {
      type: 'CALL',
      input: '0x770d096f1111', // Pool's tuple-based depositV3 (not what we're looking for)
      calls: [
        {
          type: 'CALL',
          input: '0xaaaabbbb', // Some intermediate call
          calls: [
            {
              type: 'CALL',
              input: depositCalldata, // SpokePool.depositV3 with expanded message
            },
          ],
        },
      ],
    }

    const result = findExpandedMessageInTrace(trace)
    expect(result).toBe(expandedMessage)
  })

  it('returns undefined when no depositV3 call exists in trace', () => {
    const trace = {
      type: 'CALL',
      input: '0xabcdef00',
      calls: [
        { type: 'CALL', input: '0x12345678' },
      ],
    }
    expect(findExpandedMessageInTrace(trace)).toBeUndefined()
  })

  it('skips depositV3 calls with empty message (0x)', () => {
    const calldata = buildTestDepositV3Calldata({ message: '0x' })
    const trace = { input: calldata }
    expect(findExpandedMessageInTrace(trace)).toBeUndefined()
  })

  it('handles malformed input gracefully without throwing', () => {
    const trace = {
      input: ACROSS_DEPOSIT_V3_SELECTOR + 'not_valid_hex',
      calls: [],
    }
    // Should not throw, just return undefined
    expect(findExpandedMessageInTrace(trace)).toBeUndefined()
  })
})

describe('extractExpandedMessageFromTrace', () => {
  it('calls debug_traceCall with correct parameters', async () => {
    const expandedMessage = '0xdeadbeef1234'
    const depositCalldata = buildTestDepositV3Calldata({ message: expandedMessage })

    const mockProvider = {
      send: vi.fn().mockResolvedValue({
        type: 'CALL',
        input: '0x770d096f1111',
        calls: [{ input: depositCalldata }],
      }),
    }

    const result = await extractExpandedMessageFromTrace({
      provider: mockProvider,
      from: '0xUserAddress',
      to: '0xPoolAddress',
      data: '0xSomeCalldata',
    })

    expect(mockProvider.send).toHaveBeenCalledWith('debug_traceCall', [
      { from: '0xUserAddress', to: '0xPoolAddress', data: '0xSomeCalldata', value: '0x0' },
      'latest',
      { tracer: 'callTracer', tracerConfig: { onlyTopCall: false } },
    ])
    expect(result).toBe(expandedMessage)
  })

  it('returns undefined when debug_traceCall is not supported', async () => {
    const mockProvider = {
      send: vi.fn().mockRejectedValue(new Error('method not found')),
    }

    const result = await extractExpandedMessageFromTrace({
      provider: mockProvider,
      from: '0x1',
      to: '0x2',
      data: '0x3',
    })

    expect(result).toBeUndefined()
  })

  it('returns undefined when trace has no depositV3 call', async () => {
    const mockProvider = {
      send: vi.fn().mockResolvedValue({
        type: 'CALL',
        input: '0xaabbccdd',
        calls: [],
      }),
    }

    const result = await extractExpandedMessageFromTrace({
      provider: mockProvider,
      from: '0x1',
      to: '0x2',
      data: '0x3',
    })

    expect(result).toBeUndefined()
  })
})

describe('queryAcrossRelayerGasFee', () => {
  const calldata = buildTestDepositV3Calldata()

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('constructs URL with correct base parameters (no message)', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        relayerGasFee: { total: '1000' },
        totalRelayFee: { total: '2000' },
        isAmountTooLow: false,
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    await queryAcrossRelayerGasFee({ originChainId: 42161, calldata })

    const fetchUrl = new URL((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(fetchUrl.searchParams.get('inputToken')).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9')
    expect(fetchUrl.searchParams.get('outputToken')).toBe('0x55d398326f99059fF775485246999027B3197955')
    expect(fetchUrl.searchParams.get('originChainId')).toBe('42161')
    expect(fetchUrl.searchParams.get('destinationChainId')).toBe('56')
    expect(fetchUrl.searchParams.get('amount')).toBe('10000000')
    expect(fetchUrl.searchParams.get('allowUnmatchedDecimals')).toBe('true')
    expect(fetchUrl.searchParams.get('message')).toBeNull()
    expect(fetchUrl.searchParams.get('recipient')).toBeNull()
  })

  it('includes message and recipient when provided', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        relayerGasFee: { total: '5000' },
        totalRelayFee: { total: '8000' },
        isAmountTooLow: false,
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    await queryAcrossRelayerGasFee({
      originChainId: 42161,
      calldata,
      message: '0xexpandedmessage',
      recipient: '0xAC537C12FE8F544D712D71ED4376A502EEA944D7',
    })

    const fetchUrl = new URL((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(fetchUrl.searchParams.get('message')).toBe('0xexpandedmessage')
    expect(fetchUrl.searchParams.get('recipient')).toBe('0xAC537C12FE8F544D712D71ED4376A502EEA944D7')
  })

  it('returns parsed fee result on success', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        relayerGasFee: { total: '1234' },
        totalRelayFee: { total: '5678' },
        isAmountTooLow: false,
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const result = await queryAcrossRelayerGasFee({ originChainId: 42161, calldata })

    expect(result).toEqual({
      relayerGasFeeTotal: '1234',
      totalRelayFeeTotal: '5678',
      isAmountTooLow: false,
    })
  })

  it('returns isAmountTooLow: true when API indicates', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        relayerGasFee: { total: '0' },
        totalRelayFee: { total: '0' },
        isAmountTooLow: true,
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const result = await queryAcrossRelayerGasFee({ originChainId: 42161, calldata })
    expect(result?.isAmountTooLow).toBe(true)
  })

  it('throws on 4xx response (route not viable)', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: vi.fn().mockResolvedValue('Amount too low for route'),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    await expect(
      queryAcrossRelayerGasFee({ originChainId: 42161, calldata }),
    ).rejects.toThrow('Across API rejected bridge route (400)')
  })

  it('returns undefined on 5xx server error (fallback)', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: vi.fn().mockResolvedValue(''),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const result = await queryAcrossRelayerGasFee({ originChainId: 42161, calldata })
    expect(result).toBeUndefined()
  })

  it('returns undefined on network error (fallback)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network timeout'))

    const result = await queryAcrossRelayerGasFee({ originChainId: 42161, calldata })
    expect(result).toBeUndefined()
  })
})

describe('modifyAcrossDepositV3ForSmartPool', () => {
  const smartPoolAddress = '0xDDCB7503B158EA9255F226B2725AEAA1D1BF3B30'
  const RIGOBLOCK_DEPOSIT_V3_SELECTOR = '0x770d096f'

  it('produces RigoBlock depositV3 calldata (tuple selector)', () => {
    const calldata = buildTestDepositV3Calldata()
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18,
    })

    expect(result.toLowerCase().startsWith(RIGOBLOCK_DEPOSIT_V3_SELECTOR.toLowerCase())).toBe(true)
  })

  it('sets depositor to smart pool address', () => {
    const calldata = buildTestDepositV3Calldata()
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18,
    })

    // Decode the result to verify depositor
    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const depositor = decoded[0][0]
    expect(depositor.toLowerCase()).toBe(smartPoolAddress.toLowerCase())
  })

  it('sets recipient to pool address (used in destination multicall)', () => {
    // The AIntents contract uses params.recipient in the destination multicall:
    // IERC20.transfer(params.recipient, ...) and drainLeftoverTokens(..., params.recipient)
    // So it MUST be the pool itself. The contract resolves the Across handler internally.
    const userWallet = '0x64B2b51f538E928bB8BaCbFe15018aBeee1f7322'
    const calldata = buildTestDepositV3Calldata({ recipient: userWallet, destinationChainId: 56 })
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const recipient = decoded[0][1]
    expect(recipient.toLowerCase()).toBe(smartPoolAddress.toLowerCase())
  })

  it('sets recipient to pool address regardless of destination chain', () => {
    const calldata = buildTestDepositV3Calldata({ destinationChainId: 42161 }) // Arbitrum
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const recipient = decoded[0][1]
    expect(recipient.toLowerCase()).toBe(smartPoolAddress.toLowerCase())
  })

  it('reduces outputAmount by solver compensation (USD fallback)', () => {
    const outputAmount = parseUnits('10', 18) // 10 USDT (18 dec on BSC)
    const calldata = buildTestDepositV3Calldata({ outputAmount })
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      outputTokenPriceUSD: 1.0,  // $1 per USDT
      outputTokenDecimals: 18,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const adjustedOutput = BigNumber.from(decoded[0][5])
    // Should be less than original by the USD-based compensation amount
    expect(adjustedOutput.lt(outputAmount)).toBe(true)
    // Should be greater than 0 (compensation shouldn't eat all the output)
    expect(adjustedOutput.gt(0)).toBe(true)
  })

  it('uses pre-computed messageOverheadCompensation when provided (within cap)', () => {
    const outputAmount = parseUnits('10', 18)
    const compensation = parseUnits('0.5', 18) // 0.5 USDT = 5% of 10 (within 8% cap)
    const calldata = buildTestDepositV3Calldata({ outputAmount })
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      messageOverheadCompensation: compensation,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const adjustedOutput = BigNumber.from(decoded[0][5])
    expect(adjustedOutput.eq(outputAmount.sub(compensation))).toBe(true)
  })

  it('caps compensation at MAX_COMPENSATION_BPS (8%) of outputAmount', () => {
    const outputAmount = parseUnits('10', 18) // 10 USDT
    // Use Ethereum mainnet destination (chainId=1) for $5.00 fallback → 50% on 10 USDT → capped to 8%
    // NOTE: no inputTokenDecimals → only BPS cap applies
    const calldata = buildTestDepositV3Calldata({ outputAmount, destinationChainId: 1 })
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const adjustedOutput = BigNumber.from(decoded[0][5])
    // Max compensation = 10 * 8% = 0.8 USDT
    const maxCap = outputAmount.mul(800).div(10000)
    expect(adjustedOutput.eq(outputAmount.sub(maxCap))).toBe(true)
    // Verify it's exactly 9.2 USDT
    expect(adjustedOutput.eq(parseUnits('9.2', 18))).toBe(true)
  })

  it('caps pre-computed compensation that exceeds MAX_COMPENSATION_BPS', () => {
    const outputAmount = parseUnits('10', 18)
    const compensation = parseUnits('1.0', 18) // 1.0 USDT = 10% of 10, exceeds 8% cap
    const calldata = buildTestDepositV3Calldata({ outputAmount })
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      messageOverheadCompensation: compensation,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const adjustedOutput = BigNumber.from(decoded[0][5])
    // Capped at 8% of 10 = 0.8, not the full 1.0
    const maxCap = outputAmount.mul(800).div(10000)
    expect(adjustedOutput.eq(outputAmount.sub(maxCap))).toBe(true)
  })

  it('uses fixed navTolerance of 800 bps', () => {
    const outputAmount = parseUnits('10', 18)
    const compensation = parseUnits('0.1', 18) // 1% of output
    const calldata = buildTestDepositV3Calldata({ outputAmount })
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      messageOverheadCompensation: compensation,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const message = decoded[0][11]
    const msgDecoded = abiCoder.decode(['uint8', 'uint256', 'uint256', 'bool'], message)
    const navTolerance = BigNumber.from(msgDecoded[1]).toNumber()

    // Fixed navTolerance = 800 bps, regardless of compensation
    expect(navTolerance).toBe(800)
  })

  it('handles cross-decimal bridge (6-dec input → 18-dec output) correctly', () => {
    // Arb USDT (6 dec) → BSC USDT (18 dec) - realistic cross-decimal scenario
    const inputAmount = BigNumber.from('10000000') // 10 USDT in 6 dec
    const outputAmount = BigNumber.from('9992066561272572390') // ~9.99 USDT in 18 dec (from Across API)
    const calldata = buildTestDepositV3Calldata({ inputAmount, outputAmount })

    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18, // BSC USDT = 18 decimals
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const adjustedOutput = BigNumber.from(decoded[0][5])

    // $0.50 fallback / $1.0 = 0.5 USDT (18 dec) = ~5% of ~9.99 USDT
    // 5% < 8% cap, so compensation is NOT capped — full $0.50 deducted
    const expectedCompensation = parseUnits('0.5', 18)
    expect(adjustedOutput.eq(outputAmount.sub(expectedCompensation))).toBe(true)
    // Output should be ~9.49 USDT
    expect(adjustedOutput.gt(parseUnits('9.4', 18))).toBe(true)
    expect(adjustedOutput.lt(parseUnits('9.6', 18))).toBe(true)
  })

  it('does not reduce outputAmount below compensation (cap protects)', () => {
    const outputAmount = BigNumber.from(100) // tiny amount
    const compensation = BigNumber.from(1000) // larger compensation — gets capped to 8% = 8
    const calldata = buildTestDepositV3Calldata({ outputAmount })
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      messageOverheadCompensation: compensation,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const adjustedOutput = BigNumber.from(decoded[0][5])
    // Compensation (1000) is capped to 8% of 100 = 8, so output = 100 - 8 = 92
    expect(adjustedOutput.eq(BigNumber.from(92))).toBe(true)
  })

  it('throws when no price and no pre-computed compensation', () => {
    const calldata = buildTestDepositV3Calldata()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      modifyAcrossDepositV3ForSmartPool({
        calldata,
        smartPoolAddress,
        value: '0',
        // No outputTokenPriceUSD, no messageOverheadCompensation
      })
    }).toThrow('Cannot estimate solver gas compensation')
    consoleSpy.mockRestore()
  })

  it('sets exclusiveRelayer to address(0)', () => {
    const calldata = buildTestDepositV3Calldata()
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const exclusiveRelayer = decoded[0][7]
    expect(exclusiveRelayer).toBe('0x0000000000000000000000000000000000000000')
  })

  it('encodes SourceMessageParams with correct opType', () => {
    const calldata = buildTestDepositV3Calldata()
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      opType: OpType.Sync,
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18,
    })

    // Decode the full tuple to get the message field
    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const message = decoded[0][11]

    // Decode the SourceMessageParams
    const msgDecoded = abiCoder.decode(
      ['uint8', 'uint256', 'uint256', 'bool'],
      message,
    )
    expect(msgDecoded[0]).toBe(OpType.Sync)
  })

  it('sets shouldUnwrapOnDestination=true when value > 0 (native bridge)', () => {
    const calldata = buildTestDepositV3Calldata()
    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '1000000000000000000', // 1 ETH
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const message = decoded[0][11]
    const msgDecoded = abiCoder.decode(['uint8', 'uint256', 'uint256', 'bool'], message)

    // sourceNativeAmount should be 1 ETH
    expect(BigNumber.from(msgDecoded[2]).eq(parseUnits('1', 18))).toBe(true)
    // shouldUnwrapOnDestination should be true
    expect(msgDecoded[3]).toBe(true)
  })

  it('compensation capped at 8% on cross-decimal bridge', () => {
    // With 8% max on-chain tolerance, compensation is within limits.
    const inputAmount = BigNumber.from('10000000') // 10 USDT (6 dec, Arbitrum)
    const outputAmount = BigNumber.from('9992066561272572390') // ~9.99 USDT (18 dec, BSC)
    const calldata = buildTestDepositV3Calldata({ inputAmount, outputAmount })

    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const adjustedOutput = BigNumber.from(decoded[0][5])

    // $0.50 fallback / $1.0 = 0.5 USDT = ~5% of ~9.99 USDT, within 8% cap
    const expectedCompensation = parseUnits('0.5', 18)
    expect(adjustedOutput.eq(outputAmount.sub(expectedCompensation))).toBe(true)
  })

  it('caps compensation at 8% on mainnet destination', () => {
    const outputAmount = parseUnits('10', 18)
    const calldata = buildTestDepositV3Calldata({
      outputAmount,
      destinationChainId: 1, // Ethereum mainnet → $5 fallback
    })

    const result = modifyAcrossDepositV3ForSmartPool({
      calldata,
      smartPoolAddress,
      value: '0',
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 18,
    })

    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(
      ['tuple(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)'],
      '0x' + result.slice(10),
    )
    const adjustedOutput = BigNumber.from(decoded[0][5])

    // $5 fallback → 50% of 10 USDT → capped to 8% = $0.80. Output = 9.2.
    const maxCap = outputAmount.mul(800).div(10000)
    expect(adjustedOutput.eq(outputAmount.sub(maxCap))).toBe(true)
    expect(adjustedOutput.eq(parseUnits('9.2', 18))).toBe(true)
  })
})

describe('queryAcrossRelayerGasFee (limits & fillability)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const calldata = buildTestDepositV3Calldata()

  it('extracts estimatedFillTimeSec and limits from API response', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        relayerGasFee: { total: '1000' },
        totalRelayFee: { total: '5000' },
        isAmountTooLow: false,
        estimatedFillTimeSec: 15,
        limits: {
          minDeposit: '1000000',
          maxDeposit: '100000000000',
          maxDepositInstant: '50000000000',
          maxDepositShortDelay: '75000000000',
        },
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const result = await queryAcrossRelayerGasFee({ originChainId: 42161, calldata })
    expect(result).toBeDefined()
    expect(result!.estimatedFillTimeSec).toBe(15)
    expect(result!.limits).toBeDefined()
    expect(result!.limits!.maxDeposit).toBe('100000000000')
    expect(result!.limits!.maxDepositInstant).toBe('50000000000')
    expect(result!.limits!.minDeposit).toBe('1000000')
  })

  it('handles API response without limits gracefully', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        relayerGasFee: { total: '1000' },
        totalRelayFee: { total: '5000' },
        isAmountTooLow: false,
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const result = await queryAcrossRelayerGasFee({ originChainId: 42161, calldata })
    expect(result).toBeDefined()
    expect(result!.estimatedFillTimeSec).toBeUndefined()
    expect(result!.limits).toBeUndefined()
  })
})

describe('message overhead calculation (trace + Across API integration)', () => {
  it('computes overhead as difference between fees with and without message', () => {
    // This tests the calculation logic used in swapSaga.ts
    const baseGasFee = BigNumber.from('1000')     // simple fill fee (in input token units)
    const fullGasFee = BigNumber.from('5000')      // fill + message execution fee
    const inputTokenDecimals = 6                   // USDT on Arb
    const outputTokenDecimals = 18                 // USDT on BSC

    const messageOverheadInputUnits = fullGasFee.sub(baseGasFee) // 4000 in input decimals
    const compensationOutputUnits = messageOverheadInputUnits
      .mul(BigNumber.from(10).pow(outputTokenDecimals))
      .div(BigNumber.from(10).pow(inputTokenDecimals))

    // 4000 * 10^18 / 10^6 = 4000 * 10^12 = 4e15
    expect(compensationOutputUnits.eq(BigNumber.from('4000000000000000'))).toBe(true)
  })

  it('returns zero overhead when full fee <= base fee', () => {
    const baseGasFee = BigNumber.from('5000')
    const fullGasFee = BigNumber.from('5000') // Same — no additional cost for message
    // In the saga, we check fullGasFee.gt(baseGasFee) before computing
    expect(fullGasFee.gt(baseGasFee)).toBe(false)
  })
})

describe('fetchNativeTokenPriceUSD', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns price for a known chain ID', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        ethereum: { usd: 2400.50 },
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const price = await fetchNativeTokenPriceUSD(1)
    expect(price).toBe(2400.50)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('ids=ethereum'),
    )
  })

  it('returns price for BSC (BNB)', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        binancecoin: { usd: 580.0 },
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const price = await fetchNativeTokenPriceUSD(56)
    expect(price).toBe(580.0)
  })

  it('returns undefined for unknown chain ID', async () => {
    const price = await fetchNativeTokenPriceUSD(999999)
    expect(price).toBeUndefined()
  })

  it('returns undefined on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))
    const price = await fetchNativeTokenPriceUSD(1)
    expect(price).toBeUndefined()
  })

  it('returns undefined when API returns non-ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    const price = await fetchNativeTokenPriceUSD(1)
    expect(price).toBeUndefined()
  })

  it('returns undefined when price is 0 or missing', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)
    const price = await fetchNativeTokenPriceUSD(1)
    expect(price).toBeUndefined()
  })
})

describe('fetchTokenPriceUSD', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns price for a known token on a supported chain', async () => {
    const bscUSDT = '0x55d398326f99059fF775485246999027B3197955'
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        [bscUSDT.toLowerCase()]: { usd: 1.0 },
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const price = await fetchTokenPriceUSD(56, bscUSDT)
    expect(price).toBe(1.0)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('binance-smart-chain'),
    )
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(bscUSDT.toLowerCase()),
    )
  })

  it('returns price for WETH on Arbitrum', async () => {
    const arbWETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        [arbWETH.toLowerCase()]: { usd: 2400.0 },
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const price = await fetchTokenPriceUSD(42161, arbWETH)
    expect(price).toBe(2400.0)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('arbitrum-one'),
    )
  })

  it('returns undefined for unsupported chain', async () => {
    const price = await fetchTokenPriceUSD(999999, '0xSomeToken')
    expect(price).toBeUndefined()
  })

  it('returns undefined on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('rate limit'))
    const price = await fetchTokenPriceUSD(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    expect(price).toBeUndefined()
  })

  it('returns undefined when API returns non-ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    const price = await fetchTokenPriceUSD(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    expect(price).toBeUndefined()
  })

  it('returns undefined when token not found in response', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)
    const price = await fetchTokenPriceUSD(1, '0xUnknownToken')
    expect(price).toBeUndefined()
  })
})

describe('estimateDestinationMessageGas', () => {
  it('returns buffered gas estimate on success', async () => {
    const mockProvider = {
      estimateGas: vi.fn().mockResolvedValue(BigNumber.from(100000)),
    }

    const result = await estimateDestinationMessageGas({
      provider: mockProvider,
      poolAddress: '0xPoolAddress',
    })

    expect(mockProvider.estimateGas).toHaveBeenCalledWith({
      to: '0xPoolAddress',
      data: '0xe7d8724e', // updateUnitaryValue() selector
    })
    // 100000 * 1.5 = 150000
    expect(result?.eq(BigNumber.from(150000))).toBe(true)
  })

  it('returns undefined when estimateGas fails', async () => {
    const mockProvider = {
      estimateGas: vi.fn().mockRejectedValue(new Error('execution reverted')),
    }

    const result = await estimateDestinationMessageGas({
      provider: mockProvider,
      poolAddress: '0xPoolAddress',
    })

    expect(result).toBeUndefined()
  })
})

describe('computeDestinationSimulationCompensation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('computes correct compensation from gas + native price + token price', async () => {
    const mockProvider = {
      estimateGas: vi.fn().mockResolvedValue(BigNumber.from(100000)),
      getGasPrice: vi.fn().mockResolvedValue(BigNumber.from('50000000')), // 0.05 gwei (BSC)
    }
    // Mock CoinGecko for BNB price
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        binancecoin: { usd: 600.0 },
      }),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response)

    const result = await computeDestinationSimulationCompensation({
      provider: mockProvider,
      poolAddress: '0xPoolAddress',
      destinationChainId: 56,
      outputTokenPriceUSD: 1.0, // USDT = $1
      outputTokenDecimals: 18,  // USDT on BSC = 18 dec
    })

    expect(result).toBeDefined()
    // gasUnits = 100000 * 1.5 = 150000 (buffer)
    // gasCostWei = 150000 * 50000000 = 7.5e12 wei = 0.0000075 BNB
    // gasCostUSD = 0.0000075 * 600 = $0.0045
    // compensation = 0.0045 / 1.0 = 0.0045 USDT (18 dec) = 4500000000000000 wei
    // Math with integer scaling:
    // gasCostWei = 150000 * 50000000 = 7500000000000
    // nativePriceScaled = 600 * 1e8 = 60000000000
    // gasCostUSDScaled = 7500000000000 * 60000000000 / 1e18 = 450000
    // outputPriceScaled = 1.0 * 1e8 = 100000000
    // compensation = 450000 * 1e18 / 100000000 = 4500000000000000 ($0.0045)
    expect(result!.eq(BigNumber.from('4500000000000000'))).toBe(true)
  })

  it('returns undefined when gas estimation fails', async () => {
    const mockProvider = {
      estimateGas: vi.fn().mockRejectedValue(new Error('revert')),
      getGasPrice: vi.fn().mockResolvedValue(BigNumber.from('1000000000')),
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ethereum: { usd: 2400 } }),
    } as unknown as Response)

    const result = await computeDestinationSimulationCompensation({
      provider: mockProvider,
      poolAddress: '0xPool',
      destinationChainId: 1,
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 6,
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined when getGasPrice fails', async () => {
    const mockProvider = {
      estimateGas: vi.fn().mockResolvedValue(BigNumber.from(100000)),
      getGasPrice: vi.fn().mockRejectedValue(new Error('rpc error')),
    }

    const result = await computeDestinationSimulationCompensation({
      provider: mockProvider,
      poolAddress: '0xPool',
      destinationChainId: 1,
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 6,
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined when native token price unavailable', async () => {
    const mockProvider = {
      estimateGas: vi.fn().mockResolvedValue(BigNumber.from(100000)),
      getGasPrice: vi.fn().mockResolvedValue(BigNumber.from('1000000000')),
    }
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))

    const result = await computeDestinationSimulationCompensation({
      provider: mockProvider,
      poolAddress: '0xPool',
      destinationChainId: 1,
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 6,
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined for unsupported chain (no CoinGecko mapping)', async () => {
    const mockProvider = {
      estimateGas: vi.fn().mockResolvedValue(BigNumber.from(100000)),
      getGasPrice: vi.fn().mockResolvedValue(BigNumber.from('1000000000')),
    }

    const result = await computeDestinationSimulationCompensation({
      provider: mockProvider,
      poolAddress: '0xPool',
      destinationChainId: 999999,
      outputTokenPriceUSD: 1.0,
      outputTokenDecimals: 6,
    })
    expect(result).toBeUndefined()
  })
})
