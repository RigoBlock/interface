/* eslint-disable max-lines -- RigoBlock fork additions (UR 2.1.x command preservation) pushed this file past the line cap; same exemption as swapSaga.ts */
import { AbiCoder } from '@ethersproject/abi'
import { normalizeTokenAddressForCache } from '@universe/chains'
import { logger } from 'utilities/src/logger/logger'

// Universal Router Command Constants
const UNIVERSAL_ROUTER_COMMANDS = {
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  SWEEP: 0x04,
  TRANSFER: 0x05,
  PAY_PORTION: 0x06,
  // PAY_PORTION_FULL_PRECISION (0x07) was added as in universal-router upgrade. The RigoBlock AUniswapDecoder.sol does now support it until upgrade.
  // Temporary fix: detect and downgrade to PAY_PORTION (0x06) with bips conversion.
  // TODO: Remove once the AUniswapRouter adapter is upgraded to support the new UR.
  PAY_PORTION_FULL_PRECISION: 0x07,
  V2_SWAP_EXACT_IN: 0x08,
  V2_SWAP_EXACT_OUT: 0x09,
  // WRAP_ETH: sends ETH → WETH; recipient is normally ADDRESS_THIS so WETH stays in the router.
  // Older AUniswapRouter deployments call an external function on every decoded recipient and
  // therefore revert on the ADDRESS_THIS precompile (0x2). Replace it with the pool so the pool
  // receives the WETH directly.  The downstream V3/V2 swap must then use payerIsUser=true so
  // the UniversalRouter pulls WETH from the pool via Permit2 (AUniswapRouter sets up the
  // allowance in _safeApproveTokensIn before forwarding to the UR).
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  BALANCE_CHECK_ERC20: 0x0e, // 14 in decimal - not supported on some chains/routers
  V4_SWAP: 0x10,
}

// V4 Universal Router Action Constants
const V4_ACTIONS = {
  SWAP_EXACT_IN_SINGLE: 0x06, // 6 in decimal
  SWAP_EXACT_IN: 0x07, // 7 in decimal
  SETTLE: 0x0b, // 11 in decimal
  SETTLE_ALL: 0x0c, // 12 in decimal
  TAKE: 0x0e, // 14 in decimal
  TAKE_PORTION: 0x10, // 16 in decimal
}

// ActionConstants from V4 periphery
const ACTION_CONSTANTS = {
  MSG_SENDER: '0x0000000000000000000000000000000000000001',
  ADDRESS_THIS: '0x0000000000000000000000000000000000000002',
}

// ActionConstants.OPEN_DELTA: a 0 amount in a V4 SETTLE/swap action means "resolve at execution
// time from the router's delta/balance". That assumes an EOA-style flow where the tokens were
// moved into the router earlier in the SAME execute() (PERMIT2_TRANSFER_FROM etc.) — commands the
// RigoBlock adapter rejects. A smart pool's input tokens only reach the PoolManager through an
// explicit-amount SETTLE(payerIsUser=true) pull from the vault, so an OPEN input amount resolves
// to 0 credit and the swap reverts with PoolManager SwapAmountCannotBeZero (0xbe8b8507).
const V4_OPEN_DELTA = BigInt(0)

/**
 * RigoBlock: the exact input amount of the trade being executed, used to pin OPEN-delta
 * input amounts in V4 planner actions to explicit values. `currency` is the input token
 * address, or the zero address for native currency.
 */
export interface V4ExactInput {
  currency: string
  amountRaw: string
}

interface CommandHandlerContext {
  abiCoder: AbiCoder
  smartPoolAddress: string
  commandsBytes: Uint8Array
  i: number
  // RigoBlock: true when the smart pool's governance-mapped AUniswapRouter adapter decodes
  // UR 2.1.x commands. When false, UR 2.1.x-only commands are downgraded/removed for old adapters.
  poolSupportsUr211: boolean
}

interface CommandHandlerResult {
  modifiedInput?: string
  commandsWasModified?: boolean
}

type CommandHandler = (input: string, ctx: CommandHandlerContext) => CommandHandlerResult | undefined

interface CommandWarningContext {
  commandName: string
  commandIndex: number
  error: unknown
}

interface V4ActionContext {
  paramCalldata: string
  abiCoder: AbiCoder
  smartPoolAddress: string
  actionIndex: number
  commandIndex: number
}

interface V4SwapInputContext {
  abiCoder: AbiCoder
  smartPoolAddress: string
  commandIndex: number
  // RigoBlock: when set, OPEN-delta input amounts on the trade's input currency are pinned to
  // this exact amount (see V4ExactInput). Undefined in tests/paths without trade context.
  exactInput?: V4ExactInput
  // Which V4 swap-param layout the API encoded: UR 2.1.1+ inserted minHopPriceX36 into the
  // SWAP_EXACT_IN struct, shifting the amountIn word.
  poolSupportsUr211: boolean
}

function shouldReplaceRecipient(recipient: string, smartPoolAddress: string): boolean {
  const normalizedRecipient = normalizeTokenAddressForCache(recipient)
  const normalizedSmartPool = normalizeTokenAddressForCache(smartPoolAddress)
  // Don't replace if already the smart pool
  if (normalizedRecipient === normalizedSmartPool) {
    return false
  }
  // Don't replace ActionConstants (MSG_SENDER, ADDRESS_THIS)
  if (normalizedRecipient === ACTION_CONSTANTS.MSG_SENDER || normalizedRecipient === ACTION_CONSTANTS.ADDRESS_THIS) {
    return false
  }
  // Replace all other recipients (including Trading API fee recipients)
  return true
}

function logCommandDecodeWarning(context: CommandWarningContext): void {
  const { commandName, commandIndex, error } = context
  logger.warn(
    'universalRouterCalldata',
    'modifyV4ExecuteCalldata',
    `Failed to decode ${commandName} command ${commandIndex}`,
    { error },
  )
}

function handleSweepCommand(input: string, ctx: CommandHandlerContext): CommandHandlerResult | undefined {
  const { abiCoder, smartPoolAddress, i } = ctx
  try {
    const [token, recipient, amountMinimum] = abiCoder.decode(['address', 'address', 'uint256'], input)
    if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
      return undefined
    }
    return {
      modifiedInput: abiCoder.encode(['address', 'address', 'uint256'], [token, smartPoolAddress, amountMinimum]),
    }
  } catch (error) {
    logCommandDecodeWarning({ commandName: 'SWEEP', commandIndex: i, error })
    return undefined
  }
}

function handlePayPortionCommand(input: string, ctx: CommandHandlerContext): CommandHandlerResult | undefined {
  const { abiCoder, smartPoolAddress, i } = ctx
  try {
    const [token, recipient, bips] = abiCoder.decode(['address', 'address', 'uint256'], input)
    if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
      return undefined
    }
    return {
      modifiedInput: abiCoder.encode(['address', 'address', 'uint256'], [token, smartPoolAddress, bips]),
    }
  } catch (error) {
    logCommandDecodeWarning({ commandName: 'PAY_PORTION', commandIndex: i, error })
    return undefined
  }
}

function handlePayPortionFullPrecisionCommand(
  input: string,
  ctx: CommandHandlerContext,
): CommandHandlerResult | undefined {
  const { abiCoder, smartPoolAddress, commandsBytes, i, poolSupportsUr211 } = ctx
  try {
    const [token, recipient, portion] = abiCoder.decode(['address', 'address', 'uint256'], input)
    if (poolSupportsUr211) {
      // UR 2.1.x-capable adapters decode PAY_PORTION_FULL_PRECISION natively: keep the 0x07
      // command and the 1e18-precision portion, only rewrite the recipient to the pool.
      if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
        return undefined
      }
      return {
        modifiedInput: abiCoder.encode(['address', 'address', 'uint256'], [token, smartPoolAddress, portion]),
      }
    }
    // PAY_PORTION_FULL_PRECISION (0x07): abi.encode(token, recipient, portion) with 1e18 precision.
    // Downgrade to PAY_PORTION (0x06) using bips so old UR routes the fee. Loss is at most 1 bip.
    const portionBigInt = BigInt(portion.toString())
    const bips = (portionBigInt * BigInt(10000)) / BigInt('1000000000000000000')
    const finalRecipient = shouldReplaceRecipient(recipient, smartPoolAddress) ? smartPoolAddress : recipient
    const modifiedInput = abiCoder.encode(['address', 'address', 'uint256'], [token, finalRecipient, bips])
    commandsBytes[i] = UNIVERSAL_ROUTER_COMMANDS.PAY_PORTION
    return { modifiedInput, commandsWasModified: true }
  } catch (error) {
    logCommandDecodeWarning({ commandName: 'PAY_PORTION_FULL_PRECISION', commandIndex: i, error })
    return undefined
  }
}

function handleTransferCommand(input: string, ctx: CommandHandlerContext): CommandHandlerResult | undefined {
  const { abiCoder, smartPoolAddress, i } = ctx
  try {
    const [token, recipient, amount] = abiCoder.decode(['address', 'address', 'uint256'], input)
    if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
      return undefined
    }
    return {
      modifiedInput: abiCoder.encode(['address', 'address', 'uint256'], [token, smartPoolAddress, amount]),
    }
  } catch (error) {
    logCommandDecodeWarning({ commandName: 'TRANSFER', commandIndex: i, error })
    return undefined
  }
}

function handleWrapEthCommand(input: string, ctx: CommandHandlerContext): CommandHandlerResult | undefined {
  const { abiCoder, smartPoolAddress, i } = ctx
  try {
    const [recipient, amount] = abiCoder.decode(['address', 'uint256'], input)
    if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
      return undefined
    }
    return {
      modifiedInput: abiCoder.encode(['address', 'uint256'], [smartPoolAddress, amount]),
    }
  } catch (error) {
    logCommandDecodeWarning({ commandName: 'WRAP_ETH', commandIndex: i, error })
    return undefined
  }
}

function handleUnwrapWethCommand(input: string, ctx: CommandHandlerContext): CommandHandlerResult | undefined {
  const { abiCoder, smartPoolAddress, i } = ctx
  try {
    const [recipient, amountMin] = abiCoder.decode(['address', 'uint256'], input)
    if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
      return undefined
    }
    return {
      modifiedInput: abiCoder.encode(['address', 'uint256'], [smartPoolAddress, amountMin]),
    }
  } catch (error) {
    logCommandDecodeWarning({ commandName: 'UNWRAP_WETH', commandIndex: i, error })
    return undefined
  }
}

function handleV3SwapExactInCommand(input: string, ctx: CommandHandlerContext): CommandHandlerResult | undefined {
  const { abiCoder, smartPoolAddress, i } = ctx
  try {
    const [recipient, amountIn, amountOutMin, path, payerIsUser] = abiCoder.decode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      input,
    )
    if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
      return undefined
    }
    return {
      modifiedInput: abiCoder.encode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        [smartPoolAddress, amountIn, amountOutMin, path, payerIsUser],
      ),
    }
  } catch (error) {
    logCommandDecodeWarning({ commandName: 'V3_SWAP_EXACT_IN', commandIndex: i, error })
    return undefined
  }
}

function handleV3SwapExactOutCommand(input: string, ctx: CommandHandlerContext): CommandHandlerResult | undefined {
  const { abiCoder, smartPoolAddress, i } = ctx
  try {
    const [recipient, amountOut, amountInMax, path, payerIsUser] = abiCoder.decode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      input,
    )
    if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
      return undefined
    }
    return {
      modifiedInput: abiCoder.encode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        [smartPoolAddress, amountOut, amountInMax, path, payerIsUser],
      ),
    }
  } catch (error) {
    logCommandDecodeWarning({ commandName: 'V3_SWAP_EXACT_OUT', commandIndex: i, error })
    return undefined
  }
}

function handleV2SwapExactInCommand(input: string, ctx: CommandHandlerContext): CommandHandlerResult | undefined {
  const { abiCoder, smartPoolAddress, i } = ctx
  try {
    const [recipient, amountIn, amountOutMin, path, payerIsUser] = abiCoder.decode(
      ['address', 'uint256', 'uint256', 'address[]', 'bool'],
      input,
    )
    if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
      return undefined
    }
    return {
      modifiedInput: abiCoder.encode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        [smartPoolAddress, amountIn, amountOutMin, path, payerIsUser],
      ),
    }
  } catch (error) {
    logCommandDecodeWarning({ commandName: 'V2_SWAP_EXACT_IN', commandIndex: i, error })
    return undefined
  }
}

function handleV2SwapExactOutCommand(input: string, ctx: CommandHandlerContext): CommandHandlerResult | undefined {
  const { abiCoder, smartPoolAddress, i } = ctx
  try {
    const [recipient, amountOut, amountInMax, path, payerIsUser] = abiCoder.decode(
      ['address', 'uint256', 'uint256', 'address[]', 'bool'],
      input,
    )
    if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
      return undefined
    }
    return {
      modifiedInput: abiCoder.encode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        [smartPoolAddress, amountOut, amountInMax, path, payerIsUser],
      ),
    }
  } catch (error) {
    logCommandDecodeWarning({ commandName: 'V2_SWAP_EXACT_OUT', commandIndex: i, error })
    return undefined
  }
}

const COMMAND_HANDLERS: Record<number, CommandHandler> = {
  [UNIVERSAL_ROUTER_COMMANDS.SWEEP]: handleSweepCommand,
  [UNIVERSAL_ROUTER_COMMANDS.PAY_PORTION]: handlePayPortionCommand,
  [UNIVERSAL_ROUTER_COMMANDS.PAY_PORTION_FULL_PRECISION]: handlePayPortionFullPrecisionCommand,
  [UNIVERSAL_ROUTER_COMMANDS.TRANSFER]: handleTransferCommand,
  [UNIVERSAL_ROUTER_COMMANDS.WRAP_ETH]: handleWrapEthCommand,
  [UNIVERSAL_ROUTER_COMMANDS.UNWRAP_WETH]: handleUnwrapWethCommand,
  [UNIVERSAL_ROUTER_COMMANDS.V3_SWAP_EXACT_IN]: handleV3SwapExactInCommand,
  [UNIVERSAL_ROUTER_COMMANDS.V3_SWAP_EXACT_OUT]: handleV3SwapExactOutCommand,
  [UNIVERSAL_ROUTER_COMMANDS.V2_SWAP_EXACT_IN]: handleV2SwapExactInCommand,
  [UNIVERSAL_ROUTER_COMMANDS.V2_SWAP_EXACT_OUT]: handleV2SwapExactOutCommand,
}

function processV4Action(actionType: number, ctx: V4ActionContext): string | undefined {
  const { paramCalldata, abiCoder, smartPoolAddress, actionIndex, commandIndex } = ctx
  try {
    if (actionType === V4_ACTIONS.TAKE) {
      const [currency, recipient, amount] = abiCoder.decode(['address', 'address', 'uint256'], paramCalldata)
      if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
        return undefined
      }
      return abiCoder.encode(['address', 'address', 'uint256'], [currency, smartPoolAddress, amount])
    }
    if (actionType === V4_ACTIONS.TAKE_PORTION) {
      const [currency, recipient, bips] = abiCoder.decode(['address', 'address', 'uint256'], paramCalldata)
      if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
        return undefined
      }
      return abiCoder.encode(['address', 'address', 'uint256'], [currency, smartPoolAddress, bips])
    }
    return undefined
  } catch (error) {
    logger.warn(
      'universalRouterCalldata',
      'modifyV4ExecuteCalldata',
      `Failed to decode V4 action ${actionIndex} in command ${commandIndex}`,
      { error },
    )
    return undefined
  }
}

// Reads a 32-byte word from hex calldata. Out-of-range/empty words read as 0 (the test-suite
// uses '0x' placeholders for unused swap params; malformed calldata reverts on-chain anyway).
function readWord(calldata: string, wordIndex: number): bigint {
  const hex = calldata.startsWith('0x') ? calldata.slice(2) : calldata
  const offset = wordIndex * 64
  const word = hex.slice(offset, offset + 64)
  if (word.length === 0) {
    return V4_OPEN_DELTA
  }
  return BigInt('0x' + word.padStart(64, '0'))
}

// Shared context for the V4 input-amount pinning helpers below.
interface V4PinContext {
  exactInput: V4ExactInput
  poolSupportsUr211?: boolean
  abiCoder?: AbiCoder
}

// RigoBlock: pins an OPEN-delta (0) input amount on the trade's input currency to the exact
// quoted amount. Only the amount word is rewritten — the ABI layout around it is untouched.
// Returns undefined when no rewrite applies.
function pinOpenAmountWord(
  paramCalldata: string,
  pin: { amountWordIndex: number; exactInput: V4ExactInput },
): string | undefined {
  const { amountWordIndex, exactInput } = pin
  if (readWord(paramCalldata, amountWordIndex) !== V4_OPEN_DELTA) {
    return undefined
  }
  const hex = paramCalldata.startsWith('0x') ? paramCalldata.slice(2) : paramCalldata
  const offset = amountWordIndex * 64
  const word = BigInt(exactInput.amountRaw).toString(16).padStart(64, '0')
  return '0x' + hex.slice(0, offset) + word + hex.slice(offset + 64)
}

// SETTLE(currency, amount, payerIsUser): amount word at index 1.
function processV4SettleAction(paramCalldata: string, exactInput: V4ExactInput): string | undefined {
  if (
    normalizeTokenAddressForCache(readWord(paramCalldata, 0).toString(16).padStart(40, '0')) !==
    normalizeTokenAddressForCache(exactInput.currency)
  ) {
    return undefined
  }
  return pinOpenAmountWord(paramCalldata, { amountWordIndex: 1, exactInput })
}

// SWAP_EXACT_IN_SINGLE(poolKey, zeroForOne, amountIn, amountOutMinimum[, minHopPriceX36], hookData):
// poolKey.currency0/currency1 at words 0/1, zeroForOne at word 5, amountIn at word 6 in both
// UR 2.0 and 2.1.x layouts.
function processV4SwapExactInSingleAction(paramCalldata: string, exactInput: V4ExactInput): string | undefined {
  const zeroForOne = readWord(paramCalldata, 5) !== V4_OPEN_DELTA
  const inputCurrencyWord = zeroForOne ? 0 : 1
  const inputCurrency = readWord(paramCalldata, inputCurrencyWord).toString(16).padStart(40, '0')
  if (normalizeTokenAddressForCache(inputCurrency) !== normalizeTokenAddressForCache(exactInput.currency)) {
    return undefined
  }
  return pinOpenAmountWord(paramCalldata, { amountWordIndex: 6, exactInput })
}

// SWAP_EXACT_IN(currencyIn, path[], amountIn, amountOutMinimum): amountIn at word 2 (UR 2.0) or
// word 3 (UR 2.1.x, which inserted minHopPriceX36[] after path).
function processV4SwapExactInAction(paramCalldata: string, ctx: V4PinContext): string | undefined {
  const inputCurrency = readWord(paramCalldata, 0).toString(16).padStart(40, '0')
  if (normalizeTokenAddressForCache(inputCurrency) !== normalizeTokenAddressForCache(ctx.exactInput.currency)) {
    return undefined
  }
  return pinOpenAmountWord(paramCalldata, {
    amountWordIndex: ctx.poolSupportsUr211 ? 3 : 2,
    exactInput: ctx.exactInput,
  })
}

// SETTLE_ALL(currency, maxAmount) resolves the paid amount from the router's own debt/balance,
// which is always 0 in the fork's flow (input tokens are pulled from the vault, never held by
// the router). It cannot be fixed by pinning a word — re-encode as an explicit-amount SETTLE
// that pulls the exact input from the pool (payerIsUser=true), and flag the action byte change.
function processV4SettleAllAction(
  paramCalldata: string,
  ctx: V4PinContext,
): { paramCalldata: string; newActionType: number } | undefined {
  const currency = readWord(paramCalldata, 0).toString(16).padStart(40, '0')
  if (normalizeTokenAddressForCache(currency) !== normalizeTokenAddressForCache(ctx.exactInput.currency)) {
    return undefined
  }
  return {
    paramCalldata: ctx.abiCoder!.encode(
      ['address', 'uint256', 'bool'],
      ['0x' + currency, ctx.exactInput.amountRaw, true],
    ),
    newActionType: V4_ACTIONS.SETTLE,
  }
}

function processV4SwapInput(input: string, ctx: V4SwapInputContext): string | undefined {
  const { abiCoder, smartPoolAddress, commandIndex, exactInput } = ctx
  try {
    const [actions, params] = abiCoder.decode(['bytes', 'bytes[]'], input)
    const actionsBytes = actions.startsWith('0x')
      ? new Uint8Array(Buffer.from(actions.slice(2), 'hex'))
      : new Uint8Array(Buffer.from(actions, 'hex'))
    const modifiedActions = new Uint8Array(actionsBytes)
    const modifiedParams = [...params]
    let v4InputWasModified = false
    for (let j = 0; j < actionsBytes.length; j++) {
      const actionType = actionsBytes[j]
      if (actionType === V4_ACTIONS.TAKE || actionType === V4_ACTIONS.TAKE_PORTION) {
        const newParams = processV4Action(actionType, {
          paramCalldata: params[j],
          abiCoder,
          smartPoolAddress,
          actionIndex: j,
          commandIndex,
        })
        if (newParams) {
          modifiedParams[j] = newParams
          v4InputWasModified = true
        }
        continue
      }
      // RigoBlock: pin OPEN-delta input amounts to the exact trade input. Without this, a
      // full-balance (MAX) V4 swap emitted as SETTLE(currency, 0, …) + SWAP_EXACT_IN(…, 0, …)
      // resolves the swap amount from 0 router credit and reverts with SwapAmountCannotBeZero.
      if (!exactInput) {
        continue
      }
      if (actionType === V4_ACTIONS.SETTLE) {
        const newParams = processV4SettleAction(params[j], exactInput)
        if (newParams) {
          modifiedParams[j] = newParams
          v4InputWasModified = true
        }
      } else if (actionType === V4_ACTIONS.SETTLE_ALL) {
        const result = processV4SettleAllAction(params[j], { ...ctx, exactInput })
        if (result) {
          modifiedParams[j] = result.paramCalldata
          modifiedActions[j] = result.newActionType
          v4InputWasModified = true
        }
      } else if (actionType === V4_ACTIONS.SWAP_EXACT_IN_SINGLE) {
        const newParams = processV4SwapExactInSingleAction(params[j], exactInput)
        if (newParams) {
          modifiedParams[j] = newParams
          v4InputWasModified = true
        }
      } else if (actionType === V4_ACTIONS.SWAP_EXACT_IN) {
        const newParams = processV4SwapExactInAction(params[j], { ...ctx, exactInput })
        if (newParams) {
          modifiedParams[j] = newParams
          v4InputWasModified = true
        }
      }
    }
    if (!v4InputWasModified) {
      return undefined
    }
    const finalActions = '0x' + Buffer.from(modifiedActions).toString('hex')
    return abiCoder.encode(['bytes', 'bytes[]'], [finalActions, modifiedParams])
  } catch (error) {
    logger.warn(
      'universalRouterCalldata',
      'modifyV4ExecuteCalldata',
      `Failed to decode V4_SWAP command ${commandIndex}`,
      { error },
    )
    return undefined
  }
}

// RigoBlock: true when the active smart pool's governance-mapped AUniswapRouter adapter decodes
// UR 2.1.x commands; skips the PAY_PORTION_FULL_PRECISION downgrade and BALANCE_CHECK_ERC20 stripping.
export interface UniversalRouterCalldataOptions {
  poolSupportsUr211?: boolean
  // RigoBlock: exact input of the trade being executed. When provided, OPEN-delta (0) input
  // amounts on the trade's input currency in V4 planner actions are pinned to this exact amount
  // — the fork's adapter pulls input tokens from the pool via an explicit-amount SETTLE, so an
  // OPEN input amount would otherwise resolve to 0 credit and revert (SwapAmountCannotBeZero).
  exactInput?: V4ExactInput
}

interface ModifyV4ExecuteCalldataParams extends UniversalRouterCalldataOptions {
  calldata: string
  smartPoolAddress: string
}

export function modifyV4ExecuteCalldata(params: ModifyV4ExecuteCalldataParams): string {
  const { calldata, smartPoolAddress, poolSupportsUr211 = false, exactInput } = params
  try {
    const abiCoder = new AbiCoder()
    const decoded = abiCoder.decode(['bytes', 'bytes[]', 'uint256'], calldata)
    const [commands, inputs, deadline] = decoded
    const commandsBytes = commands.startsWith('0x')
      ? new Uint8Array(Buffer.from(commands.slice(2), 'hex'))
      : new Uint8Array(Buffer.from(commands, 'hex'))
    const modifiedInputs = [...inputs]
    let commandsWasModified = false
    let inputsWereModified = false
    for (let i = 0; i < commandsBytes.length && i < inputs.length; i++) {
      const command = commandsBytes[i]
      const input = inputs[i]
      if (command in COMMAND_HANDLERS) {
        const handler = COMMAND_HANDLERS[command]
        const result = handler(input, { abiCoder, smartPoolAddress, commandsBytes, i, poolSupportsUr211 })
        if (result?.modifiedInput) {
          modifiedInputs[i] = result.modifiedInput
          inputsWereModified = true
        }
        if (result?.commandsWasModified) {
          commandsWasModified = true
        }
      } else if (command === UNIVERSAL_ROUTER_COMMANDS.V4_SWAP) {
        const modifiedInput = processV4SwapInput(input, {
          abiCoder,
          smartPoolAddress,
          commandIndex: i,
          exactInput,
          poolSupportsUr211,
        })
        if (modifiedInput) {
          modifiedInputs[i] = modifiedInput
          inputsWereModified = true
        }
      }
    }
    if (!commandsWasModified && !inputsWereModified) {
      return calldata
    }
    const finalCommands = commandsWasModified ? '0x' + Buffer.from(commandsBytes).toString('hex') : commands
    return abiCoder.encode(['bytes', 'bytes[]', 'uint256'], [finalCommands, modifiedInputs, deadline])
  } catch (error) {
    logger.error(error, {
      tags: { file: 'universalRouterCalldata', function: 'modifyV4ExecuteCalldata' },
    })
    throw error
  }
}

/**
 * Strips BALANCE_CHECK_ERC20 commands from Universal Router calldata
 *
 * RigoBlock smart pools handle balance checks internally, and some chain-specific
 * Universal Router deployments may not support this command, so this removes any
 * BALANCE_CHECK_ERC20 commands — unless `options.poolSupportsUr211` is true (UR 2.1.x-capable
 * adapters decode the command natively and the guard must stay in place).
 *
 * @param calldata - The Universal Router execute calldata (with or without function selector)
 * @returns The modified calldata without BALANCE_CHECK_ERC20 commands
 */
export function stripBalanceCheckERC20(calldata: string, options?: UniversalRouterCalldataOptions): string {
  // UR 2.1.x-capable adapters keep the BALANCE_CHECK_ERC20 guard: the decoder handles the command.
  if (options?.poolSupportsUr211) {
    logger.info(
      'universalRouterCalldata',
      'stripBalanceCheckERC20',
      'Pool supports UR 2.1.x commands; keeping BALANCE_CHECK_ERC20 in calldata',
    )
    return calldata
  }
  try {
    const abiCoder = new AbiCoder()
    // Check if this has a function selector (starts with 0x and has selector)
    // execute(bytes,bytes[],uint256) selector is 0x3593564c
    const hasSelector = calldata.toLowerCase().startsWith('0x3593564c')
    const dataWithoutSelector = hasSelector ? '0x' + calldata.slice(10) : calldata
    const functionSelector = hasSelector ? calldata.slice(0, 10) : ''
    const decoded = abiCoder.decode(['bytes', 'bytes[]', 'uint256'], dataWithoutSelector)
    const [commands, inputs, deadline] = decoded
    const commandsBytes = commands.startsWith('0x')
      ? new Uint8Array(Buffer.from(commands.slice(2), 'hex'))
      : new Uint8Array(Buffer.from(commands, 'hex'))
    const filteredCommands: number[] = []
    const filteredInputs: string[] = []
    for (let i = 0; i < commandsBytes.length && i < inputs.length; i++) {
      const command = commandsBytes[i]
      if (command !== UNIVERSAL_ROUTER_COMMANDS.BALANCE_CHECK_ERC20) {
        filteredCommands.push(command)
        filteredInputs.push(inputs[i])
      } else {
        logger.info(
          'universalRouterCalldata',
          'stripBalanceCheckERC20',
          `Stripped BALANCE_CHECK_ERC20 command at index ${i} for RigoBlock smart pool`,
        )
      }
    }
    if (filteredCommands.length === commandsBytes.length) {
      return calldata
    }
    const newCommandsBytes = new Uint8Array(filteredCommands)
    const newCommandsHex = '0x' + Buffer.from(newCommandsBytes).toString('hex')
    const newCalldata = abiCoder.encode(['bytes', 'bytes[]', 'uint256'], [newCommandsHex, filteredInputs, deadline])
    return functionSelector ? functionSelector + newCalldata.slice(2) : newCalldata
  } catch (error) {
    logger.warn(
      'universalRouterCalldata',
      'stripBalanceCheckERC20',
      'Failed to strip BALANCE_CHECK_ERC20 from calldata:',
      {
        error,
      },
    )
    return calldata
  }
}
