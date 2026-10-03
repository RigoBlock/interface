import { providers as ethersProviders } from 'ethers/lib/ethers'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createEthersProviderFactory } from './createEthersProvider'

vi.mock('utilities/src/logger/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
import { FlashbotsRpcProvider } from './FlashbotsRpcProvider'
import { InstrumentedJsonRpcProvider } from './observability/InstrumentedJsonRpcProvider'
import type { RpcConfig } from './rpcUrlSelector'
import { RPCType, UniverseChainId } from './types'

const CHAIN_ID = UniverseChainId.Mainnet

afterEach(() => {
  vi.restoreAllMocks()
})

function buildFactory(config: RpcConfig | null) {
  return createEthersProviderFactory({
    resolveRpcConfig: () => config,
  })
}

describe('createEthersProviderFactory — branching contract', () => {
  test('returns null when resolver returns null', () => {
    const factory = buildFactory(null)
    expect(factory({ chainId: CHAIN_ID, rpcType: RPCType.Public })).toBeNull()
  })

  test('returns FlashbotsRpcProvider when shouldUseFlashbots', () => {
    const factory = buildFactory({
      rpcUrl: 'https://flashbots.example/rpc',
      shouldUseFlashbots: true,
      flashbotsConfig: { refundPercent: 50, calldataHintsEnabled: false },
    })

    const provider = factory({ chainId: CHAIN_ID, rpcType: RPCType.Private })

    expect(provider).toBeInstanceOf(FlashbotsRpcProvider)
  })

  test('returns Web3Provider when getRequestHeaders is set (header session strategy)', () => {
    const factory = buildFactory({
      rpcUrl: 'https://gateway/rpc/1',
      isUniRpc: true,
      headers: { 'x-request-source': 'web' },
      getRequestHeaders: async () => ({ 'x-session-id': 'sess' }),
    })

    const provider = factory({ chainId: CHAIN_ID, rpcType: RPCType.Public })

    // Web3Provider extends JsonRpcProvider; check both are matched
    expect(provider).toBeInstanceOf(ethersProviders.Web3Provider)
  })

  test('returns InstrumentedJsonRpcProvider with credentials wired (cookie session strategy)', () => {
    const factory = buildFactory({
      rpcUrl: 'https://gateway/rpc/1',
      isUniRpc: true,
      headers: { 'x-request-source': 'web' },
      credentials: 'include',
    })

    const provider = factory({ chainId: CHAIN_ID, rpcType: RPCType.Public })

    expect(provider).toBeInstanceOf(InstrumentedJsonRpcProvider)
    // Verify credentials made it into the ethers ConnectionInfo (the actual
    // bug from the cookie-gap fix). Without this, ethers' default
    // `same-origin` drops cookies cross-origin in the browser.
    const connection = (provider as unknown as { connection: { fetchOptions?: { credentials?: string } } }).connection
    expect(connection.fetchOptions?.credentials).toBe('include')
  })

  test('returns InstrumentedJsonRpcProvider plain when no headers/credentials (legacy)', () => {
    const factory = buildFactory({
      rpcUrl: 'https://legacy.example.com/rpc',
    })

    const provider = factory({ chainId: CHAIN_ID, rpcType: RPCType.Public })

    expect(provider).toBeInstanceOf(InstrumentedJsonRpcProvider)
  })

  test('returns null when factory throws (logger error path)', () => {
    const factory = createEthersProviderFactory({
      resolveRpcConfig: () => {
        throw new Error('resolver blew up')
      },
    })

    expect(factory({ chainId: CHAIN_ID, rpcType: RPCType.Public })).toBeNull()
  })

  test('FlashbotsRpcProvider takes precedence over UniRPC when shouldUseFlashbots is set', () => {
    // Defensive: if a config has both flashbots flag AND UniRPC headers
    // (shouldn't happen in practice, but the resolver is contract-only —
    // anyone could construct this), the flashbots branch wins because it
    // matches first in the factory.
    const factory = buildFactory({
      rpcUrl: 'https://flashbots.example/rpc',
      shouldUseFlashbots: true,
      flashbotsConfig: { refundPercent: 50, calldataHintsEnabled: false },
      isUniRpc: true,
      headers: { 'x-request-source': 'web' },
      getRequestHeaders: async () => ({}),
    })

    const provider = factory({ chainId: CHAIN_ID, rpcType: RPCType.Private })

    expect(provider).toBeInstanceOf(FlashbotsRpcProvider)
  })
})

describe('createEthersProviderFactory — 429 rate-limit gate (RigoBlock fork)', () => {
  const GATED_RPC_URL = 'https://ethers-rate-limit-gate-test.invalid/rpc/1'

  function buildGatedProvider() {
    const factory = createEthersProviderFactory({
      resolveRpcConfig: () => ({
        rpcUrl: GATED_RPC_URL,
        isUniRpc: true,
        headers: { 'x-request-source': 'web' },
        getRequestHeaders: async () => ({ 'x-session-id': 'sess' }),
      }),
    })
    const provider = factory({ chainId: CHAIN_ID, rpcType: RPCType.Public })
    if (!provider) {
      throw new Error('expected provider')
    }
    return provider
  }

  test('after a 429, subsequent sends fail fast without hitting the network', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('too many requests', { status: 429 })) as unknown as typeof fetch
    const provider = buildGatedProvider()

    await expect(provider.send('eth_blockNumber', [])).rejects.toThrow()

    const callsAfter429 = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    await expect(provider.send('eth_blockNumber', [])).rejects.toThrow(/rate limited/)
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfter429)
  })
})
