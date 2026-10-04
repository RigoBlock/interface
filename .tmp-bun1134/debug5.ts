import { AbiCoder } from '@ethersproject/abi'
import { modifyV4ExecuteCalldata } from '../apps/web/src/state/sagas/transactions/universalRouterCalldata'

const abiCoder = new AbiCoder()
const SMART_POOL = '0xEfa4bDf566aE50537A507863612638680420645C'
const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000'
const INPUT_TOKEN = '0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2'
const AMOUNT_OUT = '4167000000000000'
const MAX_AMOUNT_IN = '1268830193286593298'
const DEADLINE = 9999999999

const pathKey = [INPUT_TOKEN, 3000, 60, NATIVE_TOKEN, '0x'] as const
const swapParams = abiCoder.encode(
  ['tuple(address, tuple(address,uint24,int24,address,bytes)[], uint64[], uint256, uint256)'],
  [[NATIVE_TOKEN, [pathKey], [], AMOUNT_OUT, MAX_AMOUNT_IN]],
)
const settleParams = abiCoder.encode(['address', 'uint256', 'bool'], [INPUT_TOKEN, 0, true])
const takeParams = abiCoder.encode(['address', 'address', 'uint256'], [NATIVE_TOKEN, SMART_POOL, AMOUNT_OUT])

const innerActionsBytes = Buffer.from([0x09, 0x0b, 0x0e])
const v4Input = abiCoder.encode(['bytes', 'bytes[]'], ['0x' + innerActionsBytes.toString('hex'), [swapParams, settleParams, takeParams]])
const calldata = abiCoder.encode(['bytes', 'bytes[]', 'uint256'], ['0x' + Buffer.from([0x10]).toString('hex'), [v4Input], DEADLINE])

// word dump of swapParams
const hex = swapParams.slice(2)
for (let i = 0; i < hex.length / 64; i++) {
  console.log(`w${i}: 0x${hex.slice(i * 64, i * 64 + 64)}`)
}

const result = modifyV4ExecuteCalldata({ calldata, smartPoolAddress: SMART_POOL })
console.log('unchanged?', result === calldata)
const [commands, inputs] = abiCoder.decode(['bytes', 'bytes[]', 'uint256'], result)
const [actions, params] = abiCoder.decode(['bytes', 'bytes[]'], inputs[0])
console.log('actions:', [...(actions as string).replace('0x', '')].map((_, i, a) => i % 2 ? '' : '0x' + a[i] + a[i + 1]).filter(Boolean).join(','))
console.log('param[1]:', params[1])
