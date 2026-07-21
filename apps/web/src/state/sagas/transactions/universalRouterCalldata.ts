import { AbiCoder } from '@ethersproject/abi'
import { normalizeTokenAddressForCache } from 'uniswap/src/data/cache'
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
  TAKE: 0x0e, // 14 in decimal
  TAKE_PORTION: 0x10, // 16 in decimal
}

// ActionConstants from V4 periphery
const ACTION_CONSTANTS = {
  MSG_SENDER: '0x0000000000000000000000000000000000000001',
  ADDRESS_THIS: '0x0000000000000000000000000000000000000002',
}

interface CommandHandlerContext {
  abiCoder: AbiCoder
  smartPoolAddress: string
  commandsBytes: Uint8Array
  i: number
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
}

function shouldReplaceRecipient(recipient: string, smartPoolAddress: string): boolean {
  const normalizedRecipient = normalizeTokenAddressForCache(recipient)
  const normalizedSmartPool = normalizeTokenAddressForCache(smartPoolAddress)
  // Don't replace if already the smart pool
  if (normalizedRecipient === normalizedSmartPool) {
    return false
  }
  // Don't replace ActionConstants (MSG_SENDER, ADDRESS_THIS)
  if (
    normalizedRecipient === ACTION_CONSTANTS.MSG_SENDER ||
    normalizedRecipient === ACTION_CONSTANTS.ADDRESS_THIS
  ) {
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
      modifiedInput: abiCoder.encode(
        ['address', 'address', 'uint256'],
        [token, smartPoolAddress, amountMinimum],
      ),
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
  const { abiCoder, smartPoolAddress, commandsBytes, i } = ctx
  try {
    // PAY_PORTION_FULL_PRECISION (0x07): abi.encode(token, recipient, portion) with 1e18 precision.
    // Downgrade to PAY_PORTION (0x06) using bips so old UR routes the fee. Loss is at most 1 bip.
    const [token, recipient, portion] = abiCoder.decode(['address', 'address', 'uint256'], input)
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
      const [currency, recipient, amount] = abiCoder.decode(
        ['address', 'address', 'uint256'],
        paramCalldata,
      )
      if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
        return undefined
      }
      return abiCoder.encode(
        ['address', 'address', 'uint256'],
        [currency, smartPoolAddress, amount],
      )
    }
    if (actionType === V4_ACTIONS.TAKE_PORTION) {
      const [currency, recipient, bips] = abiCoder.decode(
        ['address', 'address', 'uint256'],
        paramCalldata,
      )
      if (!shouldReplaceRecipient(recipient, smartPoolAddress)) {
        return undefined
      }
      return abiCoder.encode(
        ['address', 'address', 'uint256'],
        [currency, smartPoolAddress, bips],
      )
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

function processV4SwapInput(input: string, ctx: V4SwapInputContext): string | undefined {
  const { abiCoder, smartPoolAddress, commandIndex } = ctx
  try {
    const [actions, params] = abiCoder.decode(['bytes', 'bytes[]'], input)
    const actionsBytes = actions.startsWith('0x')
      ? new Uint8Array(Buffer.from(actions.slice(2), 'hex'))
      : new Uint8Array(Buffer.from(actions, 'hex'))
    const modifiedParams = [...params]
    let v4InputWasModified = false
    for (let j = 0; j < actionsBytes.length; j++) {
      const actionType = actionsBytes[j]
      if (actionType !== V4_ACTIONS.TAKE && actionType !== V4_ACTIONS.TAKE_PORTION) {
        continue
      }
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
    }
    if (!v4InputWasModified) {
      return undefined
    }
    return abiCoder.encode(['bytes', 'bytes[]'], [actions, modifiedParams])
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

export function modifyV4ExecuteCalldata(calldata: string, smartPoolAddress: string): string {
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
        const result = handler(input, { abiCoder, smartPoolAddress, commandsBytes, i })
        if (result?.modifiedInput) {
          modifiedInputs[i] = result.modifiedInput
          inputsWereModified = true
        }
        if (result?.commandsWasModified) {
          commandsWasModified = true
        }
      } else if (command === UNIVERSAL_ROUTER_COMMANDS.V4_SWAP) {
        const modifiedInput = processV4SwapInput(input, { abiCoder, smartPoolAddress, commandIndex: i })
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
 * Universal Router deployments may not support this command.
 * This function removes any BALANCE_CHECK_ERC20 commands from the calldata.
 *
 * @param calldata - The Universal Router execute calldata (with or without function selector)
 * @returns The modified calldata without BALANCE_CHECK_ERC20 commands
 */
export function stripBalanceCheckERC20(calldata: string): string {
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
    logger.warn('universalRouterCalldata', 'stripBalanceCheckERC20', 'Failed to strip BALANCE_CHECK_ERC20 from calldata:', {
      error,
    })
    return calldata
  }
}
