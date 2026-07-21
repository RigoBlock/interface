import { BigNumber } from '@ethersproject/bignumber'
import { calculateGasMargin } from '~/utils/calculateGasMargin'

describe('#calculateGasMargin', () => {
  it('adds 35%', () => {
    expect(calculateGasMargin(BigNumber.from(1000)).toString()).toEqual('1350')
    expect(calculateGasMargin(BigNumber.from(50)).toString()).toEqual('67')
  })
})
