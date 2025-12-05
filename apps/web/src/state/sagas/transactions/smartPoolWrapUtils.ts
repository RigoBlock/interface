import { AbiCoder } from '@ethersproject/abi'

/**
 * Encodes a smart pool wrapEth call with the given amount
 */
export function encodeSmartPoolWrapEth(amount: string): string {
  // Smart pool wrapEth function signature: wrapETH(uint256)
  const abiCoder = new AbiCoder()
  const functionSelector = '0x1c58db4f' // wrapETH(uint256) function selector
  const encodedAmount = abiCoder.encode(['uint256'], [amount])
  return functionSelector + encodedAmount.slice(2) // Remove '0x' from encoded amount
}

/**
 * Encodes a smart pool unwrapWETH9 call with the given amount
 */
export function encodeSmartPoolUnwrapWETH9(amount: string): string {
  // Smart pool unwrapWETH9 function signature: unwrapWETH9(uint256)
  const abiCoder = new AbiCoder()
  const functionSelector = '0x49616997' // unwrapWETH9(uint256) function selector
  const encodedAmount = abiCoder.encode(['uint256'], [amount])
  return functionSelector + encodedAmount.slice(2) // Remove '0x' from encoded amount
}

/**
 * Checks if calldata is for WETH deposit (wrapping ETH to WETH)
 */
export function isWETHDepositCalldata(calldata: string): boolean {
  // WETH deposit function selector: deposit()
  return calldata.startsWith('0xd0e30db0')
}

/**
 * Checks if calldata is for WETH withdrawal (unwrapping WETH to ETH)
 */
export function isWETHWithdrawCalldata(calldata: string): boolean {
  // WETH withdraw function selector: withdraw(uint256)
  return calldata.startsWith('0x2e1a7d4d')
}

/**
 * Extracts the amount from WETH withdraw calldata
 */
export function extractWETHWithdrawAmount(calldata: string): string {
  if (!isWETHWithdrawCalldata(calldata)) {
    throw new Error('Calldata is not WETH withdraw')
  }

  // Remove function selector (first 4 bytes) and decode amount
  const abiCoder = new AbiCoder()
  const parametersOnly = '0x' + calldata.slice(10)
  const [amount] = abiCoder.decode(['uint256'], parametersOnly)
  return amount.toString()
}
