const { ethers } = require('ethers')
const abi = new ethers.utils.AbiCoder()

// 1) Fully decode SWAP_EXACT_OUT param as (currencyIn, PathKey[] path, amountOut, amountInMaximum)
const p0 = '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000024b3148c87a0000000000000000000000000000000000000000000000000006e383c3100447b120000000000000000000000000000000000000000000000000000000000000001000000000000000000000000232ce3bd40fcd6f80f3d55a522d03f25df784ee20000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000003c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
const decoded = abi.decode(['tuple(address currencyIn, tuple(address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint256 amountOut, uint256 amountInMaximum)'], p0)
console.log('SWAP_EXACT_OUT:', JSON.stringify(decoded, (k, v) => (v && v._isBigNumber ? '0x' + v.toHexString().slice(2) : v), 2))

// 2) SETTLE + TAKE
const p1 = '0x000000000000000000000000232ce3bd40fcd6f80f3d55a522d03f25df784ee200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001'
console.log('\nSETTLE:', abi.decode(['address', 'uint256', 'bool'], p1))
const p2 = '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000efa4bdf566ae50537a507863612638680420645c0000000000000000000000000000000000000000000000000024b3148c87a000'
console.log('TAKE:', abi.decode(['address', 'address', 'uint256'], p2))

// 3) Identify 0x5212cba1
const { keccak256, toUtf8Bytes } = ethers.utils
const candidates = [
  'CurrencyNotSettled()',
  'SlippageThresholdExceeded()',
  'SwapAmountCannotBeZero()',
  'InsufficientNativeBalance()',
  'InvalidCommandType()',
  'MustRefundETH()',
  'InvalidAction()',
  'UnexpectedCurrencyDelta()',
  'InvalidCurrencyDelta()',
  'DeltaNotPositive()',
  'DeltaNotNegative()',
  'NotAuthorized()',
  'AllowanceExpired()',
  'InsufficientAllowance()',
  'V4SwapFailed()',
  'InvalidPath()',
  'ZeroAmounts()',
  'ZeroAddress()',
  'WrongContractCaller()',
  'OnlySelfInitiated()',
  'ExecutionFailed(uint256,uint256)',
]
for (const sig of candidates) {
  const sel = keccak256(toUtf8Bytes(sig)).slice(0, 10)
  if (sel === '0x5212cba1') console.log('\n>>> 0x5212cba1 =', sig)
}
// Also try adapter-specific names from AUniswapRouter
const adapterCandidates = ['InvalidCommandType()', 'InvalidTarget()', 'InvalidSelector()', 'CallFailed()', 'TransferFailed()', 'InvalidPath()', 'InvalidPool()', 'Unauthorized()', 'NotOperator()', 'InvalidTokenIn()', 'InvalidTokenOut()', 'InvalidAmount()', 'InvalidRecipient()', 'DeadlineExpired()', 'InvalidSig()', 'UniswapV3SwapFailed()']
for (const sig of adapterCandidates) {
  const sel = keccak256(toUtf8Bytes(sig)).slice(0, 10)
  if (sel === '0x5212cba1') console.log('\n>>> 0x5212cba1 = ADAPTER:', sig)
}
console.log('done scanning')
