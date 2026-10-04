const { ethers } = require('ethers')
const { keccak256, toUtf8Bytes } = ethers.utils

const p0 = '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001a00000000000000000000000000000000000000000000000000024b3148c87a0000000000000000000000000000000000000000000000000006e383c3100447b120000000000000000000000000000000000000000000000000000000000000001000000000000000000000000232ce3bd40fcd6f80f3d55a522d03f25df784ee20000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000003c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
const hex = p0.slice(2)
for (let i = 0; i < hex.length / 64; i++) {
  console.log(`w${i}: 0x${hex.slice(i * 64, i * 64 + 64)}`)
}

console.log('\n--- error selector scan ---')
const candidates = [
  'CurrencyNotSettled()', 'SlippageThresholdExceeded()', 'SwapAmountCannotBeZero()',
  'InsufficientNativeBalance()', 'InvalidCommandType()', 'MustRefundETH()', 'InvalidAction()',
  'UnexpectedCurrencyDelta()', 'InvalidCurrencyDelta()', 'DeltaNotPositive()', 'DeltaNotNegative()',
  'NotAuthorized()', 'AllowanceExpired()', 'InsufficientAllowance()', 'V4SwapFailed()', 'InvalidPath()',
  'ZeroAmounts()', 'ZeroAddress()', 'WrongContractCaller()', 'OnlySelfInitiated()',
  'InvalidTarget()', 'InvalidSelector()', 'CallFailed()', 'TransferFailed()', 'InvalidPool()',
  'Unauthorized()', 'NotOperator()', 'InvalidTokenIn()', 'InvalidTokenOut()', 'InvalidAmount()',
  'InvalidRecipient()', 'DeadlineExpired()', 'UniswapV3SwapFailed()', 'EthTransferFailed()',
  'InvalidCurrency()', 'AlreadySettled()', 'NotSettled()', 'InsufficientBalance()',
  'LockAlreadyAcquired()', 'NotPoolManager()', 'OnlyPoolManager()', 'NoSwap()',
]
let found = false
for (const sig of candidates) {
  const sel = keccak256(toUtf8Bytes(sig)).slice(0, 10)
  if (sel === '0x5212cba1') { console.log('>>> 0x5212cba1 =', sig); found = true }
}
if (!found) console.log('no candidate matched 0x5212cba1')
