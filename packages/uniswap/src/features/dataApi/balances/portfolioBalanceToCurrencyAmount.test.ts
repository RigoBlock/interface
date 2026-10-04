import { Token } from '@uniswap/sdk-core'
import { UniverseChainId } from '@universe/chains'
import { portfolioBalanceToCurrencyAmount } from 'uniswap/src/features/dataApi/balances/portfolioBalanceToCurrencyAmount'

const TOKEN_18 = new Token(UniverseChainId.Mainnet, '0x0000000000000000000000000000000000000001', 18)
const TOKEN_6 = new Token(UniverseChainId.Mainnet, '0x0000000000000000000000000000000000000002', 6)

describe(portfolioBalanceToCurrencyAmount, () => {
  it('prefers quantityRaw over the float quantity', () => {
    // Regression: float64 cannot represent 0.999999999999999999 ETH — quantity rounds to 1,
    // and parsing it would give 1e18 > true balance, so a MAX swap reverts TRANSFER_FROM_FAILED.
    const balance = { quantity: 1, quantityRaw: '999999999999999999' }
    const amount = portfolioBalanceToCurrencyAmount(balance, TOKEN_18)
    expect(amount?.quotient.toString()).toBe('999999999999999999')
  })

  it('falls back to parsing quantity when quantityRaw is absent', () => {
    const balance = { quantity: 1.5 }
    const amount = portfolioBalanceToCurrencyAmount(balance, TOKEN_18)
    expect(amount?.quotient.toString()).toBe('1500000000000000000')
  })

  it('parses quantity exactly for 6-decimal tokens', () => {
    const balance = { quantity: 1234.567891 }
    const amount = portfolioBalanceToCurrencyAmount(balance, TOKEN_6)
    expect(amount?.quotient.toString()).toBe('1234567891')
  })

  it('returns undefined when the float is unusable and no raw value exists', () => {
    // Small floats stringify to scientific notation, which parseUnits rejects.
    const balance = { quantity: 1e-7 }
    expect(portfolioBalanceToCurrencyAmount(balance, TOKEN_18)).toBeUndefined()
  })

  it('returns undefined when quantityRaw is not a valid integer string', () => {
    const balance = { quantity: 0, quantityRaw: 'not-a-number' }
    expect(portfolioBalanceToCurrencyAmount(balance, TOKEN_18)).toBeUndefined()
  })
})
