/* eslint-disable max-lines -- RigoBlock fork additions (UR 2.1.x command preservation) pushed this file past the line cap; same exemption as swapSaga.ts */
import { AbiCoder } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import {
  Actions as V4PlannerActions,
  URVersion,
  V4_BASE_ACTIONS_ABI_DEFINITION,
  V4_SWAP_ACTIONS_V2_1_1,
  isAtLeastV2_1_1,
} from '@uniswap/v4-sdk'
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

// V4 planner action structs come in two flavors: UR 2.0 (no minHopPriceX36) and UR 2.1.1+
// (minHopPriceX36 inserted into each swap struct). Decoding/encoding below uses the ABI
// definitions from @uniswap/v4-sdk (the same library family that produces the planner
// calldata) — ethers' offset/bounds validation makes a flavor mismatch throw instead of
// silently reading the wrong word.
interface V4AbiParamDef {
  readonly name: string
  readonly type: string
}

// Field order of the swap action structs per flavor (matches the SDK's planner ABI defs).
// Partial: only the four swap actions (6/7/8/9) have flavor-dependent structs.
const V4_SWAP_FIELD_ORDER: Partial<Record<number, { v20: string[]; v211: string[] }>> = {
  [V4PlannerActions.SWAP_EXACT_IN_SINGLE]: {
    v20: ['poolKey', 'zeroForOne', 'amountIn', 'amountOutMinimum', 'hookData'],
    v211: ['poolKey', 'zeroForOne', 'amountIn', 'amountOutMinimum', 'minHopPriceX36', 'hookData'],
  },
  [V4PlannerActions.SWAP_EXACT_IN]: {
    v20: ['currencyIn', 'path', 'amountIn', 'amountOutMinimum'],
    v211: ['currencyIn', 'path', 'minHopPriceX36', 'amountIn', 'amountOutMinimum'],
  },
  [V4PlannerActions.SWAP_EXACT_OUT_SINGLE]: {
    v20: ['poolKey', 'zeroForOne', 'amountOut', 'amountInMaximum', 'hookData'],
    v211: ['poolKey', 'zeroForOne', 'amountOut', 'amountInMaximum', 'minHopPriceX36', 'hookData'],
  },
  [V4PlannerActions.SWAP_EXACT_OUT]: {
    v20: ['currencyOut', 'path', 'amountOut', 'amountInMaximum'],
    v211: ['currencyOut', 'path', 'minHopPriceX36', 'amountOut', 'amountInMaximum'],
  },
}

function v4ActionAbiDef(actionType: number, urVersion: URVersion): readonly V4AbiParamDef[] | undefined {
  const v211SwapDefs = V4_SWAP_ACTIONS_V2_1_1 as unknown as Record<number, readonly V4AbiParamDef[]>
  if (isAtLeastV2_1_1(urVersion) && actionType in v211SwapDefs) {
    return v211SwapDefs[actionType]
  }
  return (V4_BASE_ACTIONS_ABI_DEFINITION as unknown as Record<number, readonly V4AbiParamDef[]>)[actionType]
}

interface DecodedV4Action {
  actionType: number
  values: unknown[]
}

interface DecodedV4Actions {
  urVersion: URVersion
  actions: DecodedV4Action[]
}

// Decodes a single V4 action param with the given flavor's ABI def. Swap action defs are a single
// tuple-typed param (`abi.encode(struct)`), so the decoded tuple is unwrapped to plain field
// values; multi-param actions (SETTLE, TAKE, …) decode to the fields directly.
// oxlint-disable-next-line max-params -- (actionType, param, urVersion, abiCoder) are all required; bundling hurts readability
function decodeV4Action(
  actionType: number,
  param: string,
  urVersion: URVersion,
  abiCoder: AbiCoder,
): { values: unknown[] } {
  const def = v4ActionAbiDef(actionType, urVersion)
  if (!def) {
    throw new Error(`Unsupported V4 action ${actionType}`)
  }
  const types = def.map((d) => d.type)
  const decoded = abiCoder.decode(types, param) as unknown as unknown[]
  // The planner emits canonical abi.encode output, so the decoded values must re-encode to the
  // exact same bytes. A flavor mismatch on a swap struct does NOT make ethers throw — it
  // silently misreads scalars (e.g. amountIn becomes the minHopPriceX36 offset word) — but only
  // the emitted flavor survives this round-trip check.
  if (abiCoder.encode(types, decoded).toLowerCase() !== param.toLowerCase()) {
    throw new Error(`Non-canonical round-trip for V4 action ${actionType} (UR ${urVersion})`)
  }
  const values = def.length === 1 ? [...(decoded[0] as unknown[])] : [...decoded]
  return { values }
}

// Re-encodes action field values with the given flavor's ABI def (mirrors decodeV4Action's
// unwrapping: single-tuple defs take the tuple as the one top-level arg).
// oxlint-disable-next-line max-params -- (actionType, values, urVersion, abiCoder) are all required; bundling hurts readability
function encodeV4Action(actionType: number, values: unknown[], urVersion: URVersion, abiCoder: AbiCoder): string {
  const def = v4ActionAbiDef(actionType, urVersion)
  if (!def) {
    throw new Error(`Unsupported V4 action ${actionType}`)
  }
  return abiCoder.encode(
    def.map((d) => d.type),
    def.length === 1 ? [values] : values,
  )
}

// Decodes every action of a V4_SWAP input with the SDK's planner ABI definitions, detecting the
// EMITTED flavor. The trading API ships UR 2.1.1-flavored structs even on UR 2.0 requests, so
// both flavors are tried; the canonical-encoding round-trip inside decodeV4Action rejects the
// mismatched one (which otherwise silently misreads scalars without throwing).
// oxlint-disable-next-line max-params -- (actionsBytes, params, abiCoder) are all required; bundling hurts readability
function decodeV4Actions(actionsBytes: Uint8Array, params: string[], abiCoder: AbiCoder): DecodedV4Actions | undefined {
  for (const urVersion of [URVersion.V2_1_1, URVersion.V2_0]) {
    try {
      const actions: DecodedV4Action[] = []
      for (let j = 0; j < actionsBytes.length; j++) {
        const actionType = actionsBytes[j] as number
        const { values } = decodeV4Action(actionType, params[j] as string, urVersion, abiCoder)
        actions.push({ actionType, values })
      }
      return { urVersion, actions }
    } catch {
      // Flavor mismatch (or malformed calldata): try the other flavor.
    }
  }
  return undefined
}

// oxlint-disable-next-line max-params -- (actionType, values, urVersion) are all required; bundling hurts readability
function swapFieldsByName(actionType: number, values: unknown[], urVersion: URVersion): Record<string, unknown> {
  const order = V4_SWAP_FIELD_ORDER[actionType]?.[urVersion === URVersion.V2_0 ? 'v20' : 'v211']
  if (!order) {
    return {}
  }
  return Object.fromEntries(order.map((name, i) => [name, values[i]]))
}

// minHopPriceX36 has no UR 2.0 equivalent; when upconverting to UR 2.1.1 the neutral
// "no min-hop constraint" value is used (empty array for multi-hop, 0 for single-hop).
function defaultMinHopValue(actionType: number, field: string): unknown {
  if (field !== 'minHopPriceX36') {
    return undefined
  }
  return actionType === V4PlannerActions.SWAP_EXACT_IN || actionType === V4PlannerActions.SWAP_EXACT_OUT ? [] : 0
}

// oxlint-disable-next-line max-params -- (actionType, fields, urVersion) are all required; bundling hurts readability
function swapValuesFromFields(actionType: number, fields: Record<string, unknown>, urVersion: URVersion): unknown[] {
  const order = V4_SWAP_FIELD_ORDER[actionType]?.[urVersion === URVersion.V2_0 ? 'v20' : 'v211']
  if (!order) {
    return []
  }
  return order.map((name) => (name in fields ? fields[name] : defaultMinHopValue(actionType, name)))
}

const NATIVE_CURRENCY_ADDRESS = '0x0000000000000000000000000000000000000000'

function isNativeCurrency(address: unknown): boolean {
  return typeof address === 'string' && normalizeTokenAddressForCache(address) === NATIVE_CURRENCY_ADDRESS
}

function sameCurrency(a: unknown, b: string): boolean {
  return typeof a === 'string' && normalizeTokenAddressForCache(a) === normalizeTokenAddressForCache(b)
}

// Input currency of a *SINGLE swap action: poolKey.currency0 when zeroForOne, else currency1.
function singleSwapInputCurrency(fields: Record<string, unknown>): unknown {
  const poolKey = fields.poolKey as unknown as { 0: unknown; 1: unknown }
  return fields.zeroForOne ? poolKey[0] : poolKey[1]
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

/**
 * RigoBlock: the exact input amount of the trade being executed, used to pin OPEN-delta
 * input amounts in V4 planner actions to explicit values. `currency` is the input token
 * address, or the zero address for native currency.
 */
export interface V4ExactInput {
  currency: string
  amountRaw: string
}

/**
 * RigoBlock: the trade's exact-output swap data extracted from the V4 planner itself, used to
 * convert an OPEN-delta SETTLE into a capped SETTLE_ALL. `currency` is the input token address.
 */
interface V4ExactOutput {
  currency: string
  maxAmountRaw: string
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

interface V4SwapInputContext {
  abiCoder: AbiCoder
  smartPoolAddress: string
  commandIndex: number
  // RigoBlock: when set, OPEN-delta input amounts on the trade's input currency are pinned to
  // this exact amount (see V4ExactInput). Undefined in tests/paths without trade context.
  exactInput?: V4ExactInput
  // The UR flavor the pool's governance-mapped adapter + router decode: UR 2.1.x when true,
  // UR 2.0 when false. V4_SWAP actions are normalized to this flavor — the API has shipped
  // UR 2.1.1-flavored structs on UR 2.0 requests, which UR-2.0 deployments mis-decode.
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

// RigoBlock: pin OPEN-delta (0) input amounts to the exact trade input. Without this, a
// full-balance (MAX) V4 swap emitted as SETTLE(currency, 0, …) + SWAP_EXACT_IN(…, 0, …)
// resolves the swap amount from 0 router credit and reverts with SwapAmountCannotBeZero.
interface V4ActionRewrite {
  values: unknown[]
  newActionType?: number
}

// SETTLE(currency, 0, payerIsUser) → SETTLE(currency, exactInput, payerIsUser) on the trade's
// input currency; SETTLE_ALL(currency, maxAmount) → explicit-amount SETTLE(currency, exactInput, true)
// (the router holds no input tokens in the fork's flow, so SETTLE_ALL would resolve to 0 paid);
// SWAP_EXACT_IN[_SINGLE] amountIn 0 on the input currency → exactInput.
// oxlint-disable-next-line max-params -- (action, decodedUrVersion, exactInput) are all required; bundling hurts readability
function rewriteExactInAction(
  action: DecodedV4Action,
  decodedUrVersion: URVersion,
  exactInput: V4ExactInput,
): V4ActionRewrite | undefined {
  const { actionType, values } = action
  if (actionType === V4PlannerActions.SETTLE) {
    const [currency, amount, payerIsUser] = values as [string, BigNumber, boolean]
    if (!sameCurrency(currency, exactInput.currency) || !amount.isZero()) {
      return undefined
    }
    return { values: [currency, exactInput.amountRaw, payerIsUser] }
  }
  if (actionType === V4PlannerActions.SETTLE_ALL) {
    const [currency] = values as [string, BigNumber]
    if (!sameCurrency(currency, exactInput.currency)) {
      return undefined
    }
    return { values: [currency, exactInput.amountRaw, true], newActionType: V4PlannerActions.SETTLE }
  }
  if (actionType === V4PlannerActions.SWAP_EXACT_IN_SINGLE || actionType === V4PlannerActions.SWAP_EXACT_IN) {
    const fields = swapFieldsByName(actionType, values, decodedUrVersion)
    const inputCurrency =
      actionType === V4PlannerActions.SWAP_EXACT_IN ? fields.currencyIn : singleSwapInputCurrency(fields)
    const amountIn = fields.amountIn as BigNumber | undefined
    if (!amountIn?.isZero() || !sameCurrency(inputCurrency, exactInput.currency)) {
      return undefined
    }
    return {
      values: swapValuesFromFields(actionType, { ...fields, amountIn: exactInput.amountRaw }, decodedUrVersion),
    }
  }
  return undefined
}

// EXACT_OUTPUT trades carry no exactInput: derive the settle cap from the SWAP_EXACT_OUT action
// itself (input currency = path[0].intermediateCurrency / single-pool currency, capped at the
// quoted amountInMaximum). Native input is not safely fixable — the consumed amount is only known
// at execution time, so no msg.value can be derived for the adapter.
function extractV4ExactOutput(decoded: DecodedV4Actions): V4ExactOutput | undefined {
  for (const action of decoded.actions) {
    if (
      action.actionType === V4PlannerActions.SWAP_EXACT_OUT ||
      action.actionType === V4PlannerActions.SWAP_EXACT_OUT_SINGLE
    ) {
      const fields = swapFieldsByName(action.actionType, action.values, decoded.urVersion)
      const path = fields.path
      const firstHop = Array.isArray(path) ? (path[0] as unknown[] | undefined) : undefined
      const inputCurrency =
        action.actionType === V4PlannerActions.SWAP_EXACT_OUT ? firstHop?.[0] : singleSwapInputCurrency(fields)
      const amountInMaximum = fields.amountInMaximum as BigNumber | undefined
      if (typeof inputCurrency !== 'string' || isNativeCurrency(inputCurrency) || !amountInMaximum) {
        return undefined
      }
      return { currency: inputCurrency, maxAmountRaw: amountInMaximum.toString() }
    }
  }
  return undefined
}

// SETTLE(currency, 0=OPEN, payerIsUser) on an exact-output trade's input currency →
// SETTLE_ALL(currency, amountInMaximum). The API emits the open settle assuming a prior
// PERMIT2_TRANSFER_FROM filled the router (a command the adapter rejects); in the vault flow the
// open settle resolves to 0 paid and the PoolManager reverts CurrencyNotSettled at unlock end.
// SETTLE_ALL settles the EXACT consumed amount from the vault via Permit2, capped at the quoted
// amountInMaximum (V4TooMuchRequested) — the correct primitive here.
function rewriteExactOutSettleAction(action: DecodedV4Action, exactOutput: V4ExactOutput): V4ActionRewrite | undefined {
  const [currency, amount] = action.values as [string, BigNumber, boolean]
  if (isNativeCurrency(currency) || !sameCurrency(currency, exactOutput.currency) || !amount.isZero()) {
    return undefined
  }
  return { values: [currency, exactOutput.maxAmountRaw], newActionType: V4PlannerActions.SETTLE_ALL }
}

function processV4SwapInput(input: string, ctx: V4SwapInputContext): string | undefined {
  const { abiCoder, smartPoolAddress, commandIndex, exactInput, poolSupportsUr211 } = ctx
  try {
    const [actions, params] = abiCoder.decode(['bytes', 'bytes[]'], input)
    const actionsBytes = actions.startsWith('0x')
      ? new Uint8Array(Buffer.from(actions.slice(2), 'hex'))
      : new Uint8Array(Buffer.from(actions, 'hex'))
    const paramList = params as string[]
    const decoded = decodeV4Actions(actionsBytes, paramList, abiCoder)
    if (!decoded) {
      logger.warn(
        'universalRouterCalldata',
        'modifyV4ExecuteCalldata',
        `Failed to decode V4_SWAP actions in command ${commandIndex} with either UR flavor`,
      )
      return undefined
    }
    // The pool's adapter + router decode exactly ONE flavor; normalize the whole action list to
    // it. The API has shipped UR 2.1.1-flavored structs on UR 2.0 requests (Oct 2026), which the
    // UR-2.0 deployments mis-decode (amountIn read from the minHopPriceX36 slot under-funds the
    // router → V4TooLittleReceived), so this normalization is required, not cosmetic.
    const poolUrVersion = poolSupportsUr211 ? URVersion.V2_1_1 : URVersion.V2_0
    const flavorMismatch = decoded.urVersion !== poolUrVersion
    if (flavorMismatch && decoded.urVersion === URVersion.V2_1_1 && poolUrVersion === URVersion.V2_0) {
      for (const action of decoded.actions) {
        const minHop = swapFieldsByName(action.actionType, action.values, decoded.urVersion).minHopPriceX36
        const isNonEmpty = Array.isArray(minHop) ? minHop.length > 0 : BigNumber.isBigNumber(minHop) && !minHop.isZero()
        if (isNonEmpty) {
          logger.warn(
            'universalRouterCalldata',
            'modifyV4ExecuteCalldata',
            'Dropping non-empty minHopPriceX36 while normalizing V4 calldata from UR 2.1.1 to UR 2.0 flavor',
          )
        }
      }
    }
    const modifiedActions = new Uint8Array(actionsBytes)
    const modifiedParams = [...paramList]
    let v4InputWasModified = false
    // RigoBlock: EXACT_OUTPUT trades carry no exactInput; derive the settle cap from the
    // SWAP_EXACT_OUT action so an OPEN-delta SETTLE can become a capped SETTLE_ALL.
    const exactOutput = exactInput ? undefined : extractV4ExactOutput(decoded)
    for (let j = 0; j < decoded.actions.length; j++) {
      const action = decoded.actions[j] as DecodedV4Action
      let rewrite: V4ActionRewrite | undefined
      if (action.actionType === V4PlannerActions.TAKE || action.actionType === V4PlannerActions.TAKE_PORTION) {
        const recipient = action.values[1] as string
        if (shouldReplaceRecipient(recipient, smartPoolAddress)) {
          action.values[1] = smartPoolAddress
          rewrite = { values: action.values }
        }
      } else if (exactInput) {
        rewrite = rewriteExactInAction(action, decoded.urVersion, exactInput)
      } else if (exactOutput && action.actionType === V4PlannerActions.SETTLE) {
        rewrite = rewriteExactOutSettleAction(action, exactOutput)
      }
      const isSwapAction = action.actionType in V4_SWAP_FIELD_ORDER
      const newActionType = rewrite?.newActionType ?? action.actionType
      const needsFlavorNormalization = flavorMismatch && isSwapAction
      if (!rewrite && !needsFlavorNormalization) {
        continue
      }
      let outValues = rewrite?.values ?? action.values
      if (isSwapAction) {
        const fields = swapFieldsByName(action.actionType, outValues, decoded.urVersion)
        outValues = swapValuesFromFields(newActionType, fields, poolUrVersion)
      }
      const def = v4ActionAbiDef(newActionType, poolUrVersion)
      if (!def) {
        logger.warn(
          'universalRouterCalldata',
          'modifyV4ExecuteCalldata',
          `No ABI definition for V4 action ${newActionType} (UR ${poolUrVersion}) in command ${commandIndex}`,
        )
        continue
      }
      modifiedParams[j] = encodeV4Action(newActionType, outValues, poolUrVersion, abiCoder)
      modifiedActions[j] = newActionType
      v4InputWasModified = true
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

// RigoBlock: `poolSupportsUr211` is true when the active smart pool's governance-mapped
// AUniswapRouter adapter decodes UR 2.1.x commands. It (a) skips the PAY_PORTION_FULL_PRECISION
// downgrade and BALANCE_CHECK_ERC20 stripping, and (b) selects the UR flavor V4_SWAP actions are
// normalized to (UR 2.1.x when true, UR 2.0 when false — see processV4SwapInput).
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
