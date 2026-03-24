import { type PromiseClient } from '@connectrpc/connect'
import { EmbeddedWalletService as OldEmbeddedWalletService } from '@uniswap/client-embeddedwallet/dist/uniswap/embeddedwallet/v1/service_connect'
import {
  type ExportSeedPhraseResponse,
  type Action as OldAction,
  type AuthenticationTypes as OldAuthenticationTypes,
  type SecuredChallengeResponse,
} from '@uniswap/client-embeddedwallet/dist/uniswap/embeddedwallet/v1/service_pb'
import {
  type AddAuthenticatorResponse,
  type ChallengeResponse,
  type CreateWalletResponse,
  type DeleteAuthenticatorResponse,
  type DisconnectResponse,
  type ListAuthenticatorsResponse,
  type Action as NewAction,
  type AuthenticationTypes as NewAuthenticationTypes,
  type RegistrationOptions,
  type SignMessageResponse,
  type SignTransactionResponse,
  type SignTypedDataResponse,
  type StartAuthenticatedSessionResponse,
  type WalletSignInResponse,
} from '@uniswap/client-privy-embedded-wallet/dist/uniswap/privy-embedded-wallet/v1/service_pb'

export type {
  ExportSeedPhraseResponse,
  SecuredChallengeResponse,
} from '@uniswap/client-embeddedwallet/dist/uniswap/embeddedwallet/v1/service_pb'
export type {
  Action,
  AddAuthenticatorResponse,
  AuthenticationTypes,
  Authenticator,
  ChallengeResponse,
  CreateWalletResponse,
  DeleteAuthenticatorResponse,
  DisconnectResponse,
  ListAuthenticatorsResponse,
  RegistrationOptions,
  SignMessageResponse,
  SignTransactionResponse,
  SignTypedDataResponse,
  StartAuthenticatedSessionResponse,
  WalletSignInResponse,
} from '@uniswap/client-privy-embedded-wallet/dist/uniswap/privy-embedded-wallet/v1/service_pb'

export interface EmbeddedWalletClientContext {
  rpcClient: {
    challenge: (req: Record<string, unknown>) => Promise<ChallengeResponse>
    createWallet: (req: Record<string, unknown>) => Promise<CreateWalletResponse>
    walletSignIn: (req: Record<string, unknown>) => Promise<WalletSignInResponse>
    signMessage: (req: Record<string, unknown>) => Promise<SignMessageResponse>
    signTransaction: (req: Record<string, unknown>) => Promise<SignTransactionResponse>
    signTypedData: (req: Record<string, unknown>) => Promise<SignTypedDataResponse>
    disconnect: (req: Record<string, unknown>) => Promise<DisconnectResponse>
    listAuthenticators: (req: Record<string, unknown>) => Promise<ListAuthenticatorsResponse>
    startAuthenticatedSession: (req: Record<string, unknown>) => Promise<StartAuthenticatedSessionResponse>
    addAuthenticator: (req: Record<string, unknown>) => Promise<AddAuthenticatorResponse>
    deleteAuthenticator: (req: Record<string, unknown>) => Promise<DeleteAuthenticatorResponse>
  }
  legacyRpcClient?: PromiseClient<typeof OldEmbeddedWalletService>
}

export interface EmbeddedWalletApiClient {
  fetchChallengeRequest: (params: {
    type: NewAuthenticationTypes
    action: NewAction
    options?: RegistrationOptions
    walletId?: string
    message?: string
    transaction?: string
    typedData?: string
    authenticatorId?: string
  }) => Promise<ChallengeResponse>

  fetchCreateWalletRequest: (params: { credential: string }) => Promise<CreateWalletResponse>

  fetchWalletSigninRequest: (params: { credential: string }) => Promise<WalletSignInResponse>

  fetchSignMessagesRequest: (params: {
    messages: string[]
    credential: string | undefined
  }) => Promise<{ signatures: string[] }>

  fetchSignTransactionsRequest: (params: {
    transactions: string[]
    credential: string | undefined
  }) => Promise<{ signatures: string[] }>

  fetchSignTypedDataRequest: (params: {
    typedDataBatch: string[]
    credential: string | undefined
  }) => Promise<{ signatures: string[] }>

  fetchDisconnectRequest: () => Promise<DisconnectResponse>

  fetchListAuthenticatorsRequest: (params: {
    credential?: string
    walletId?: string
  }) => Promise<ListAuthenticatorsResponse>

  fetchSecuredChallengeRequest: (params: {
    type: OldAuthenticationTypes
    action: OldAction
    b64EncryptionPublicKey: string
  }) => Promise<SecuredChallengeResponse>

  fetchExportSeedPhraseRequest: (params: {
    encryptionKey: string
    credential: string
  }) => Promise<ExportSeedPhraseResponse>

  fetchStartAuthenticatedSessionRequest: (params: {
    existingCredential: string
  }) => Promise<StartAuthenticatedSessionResponse>

  fetchAddAuthenticatorRequest: (params: { newCredential: string }) => Promise<AddAuthenticatorResponse>

  fetchDeleteAuthenticatorRequest: (params: {
    credential: string
    authenticatorId: string
  }) => Promise<DeleteAuthenticatorResponse>
}

export function createEmbeddedWalletApiClient({
  rpcClient,
  legacyRpcClient,
}: EmbeddedWalletClientContext): EmbeddedWalletApiClient {
  const inflightRequests = new Map<string, Promise<unknown>>()

  async function fetchChallengeRequest({
    type,
    action,
    options,
    walletId,
    message,
    transaction,
    typedData,
    authenticatorId,
  }: {
    type: NewAuthenticationTypes
    action: NewAction
    options?: RegistrationOptions
    walletId?: string
    message?: string
    transaction?: string
    typedData?: string
    authenticatorId?: string
  }): Promise<ChallengeResponse> {
    const cacheKey = `challenge:${type}:${action}:${walletId ?? 'no-wallet'}:${message ?? ''}:${transaction ?? ''}:${typedData ?? ''}:${authenticatorId ?? ''}`

    const existingRequest = inflightRequests.get(cacheKey) as Promise<ChallengeResponse> | undefined
    if (existingRequest) {
      return existingRequest
    }

    const request = rpcClient
      .challenge({
        type,
        action,
        options,
        walletId,
        message,
        transaction,
        typedData,
        authenticatorId,
      })
      .finally(() => {
        inflightRequests.delete(cacheKey)
      })

    inflightRequests.set(cacheKey, request)

    return request
  }

  async function fetchCreateWalletRequest({ credential }: { credential: string }): Promise<CreateWalletResponse> {
    return await rpcClient.createWallet({ credential })
  }

  async function fetchWalletSigninRequest({ credential }: { credential: string }): Promise<WalletSignInResponse> {
    return await rpcClient.walletSignIn({ credential })
  }

  async function fetchSignMessagesRequest({
    messages,
    credential,
  }: {
    messages: string[]
    credential: string | undefined
  }): Promise<{ signatures: string[] }> {
    if (messages.length === 0) {
      throw new Error('At least one message required')
    }
    if (messages.length > 1) {
      throw new Error('Batch message signing not yet supported - use single message')
    }
    const result = await rpcClient.signMessage({
      message: messages[0],
      credential: credential ?? '',
    })
    return { signatures: [result.signature] }
  }

  async function fetchSignTransactionsRequest({
    transactions,
    credential,
  }: {
    transactions: string[]
    credential: string | undefined
  }): Promise<{ signatures: string[] }> {
    if (transactions.length === 0) {
      throw new Error('At least one transaction required')
    }
    if (transactions.length > 1) {
      throw new Error('Batch transaction signing not yet supported - use single transaction')
    }
    const result = await rpcClient.signTransaction({
      transaction: transactions[0],
      credential: credential ?? '',
    })
    return { signatures: [result.signature] }
  }

  async function fetchSignTypedDataRequest({
    typedDataBatch,
    credential,
  }: {
    typedDataBatch: string[]
    credential: string | undefined
  }): Promise<{ signatures: string[] }> {
    if (typedDataBatch.length === 0) {
      throw new Error('At least one typed data required')
    }
    if (typedDataBatch.length > 1) {
      throw new Error('Batch typed data signing not yet supported - use single typed data')
    }
    const result = await rpcClient.signTypedData({
      typedData: typedDataBatch[0],
      credential: credential ?? '',
    })
    return { signatures: [result.signature] }
  }

  async function fetchDisconnectRequest(): Promise<DisconnectResponse> {
    return await rpcClient.disconnect({})
  }

  async function fetchListAuthenticatorsRequest({
    credential,
    walletId,
  }: {
    credential?: string
    walletId?: string
  }): Promise<ListAuthenticatorsResponse> {
    const cacheKey = `listAuthenticators:${credential ?? walletId ?? 'no-key'}`

    const existingRequest = inflightRequests.get(cacheKey) as Promise<ListAuthenticatorsResponse> | undefined
    if (existingRequest) {
      return existingRequest
    }

    const request = rpcClient.listAuthenticators({ credential, walletId }).finally(() => {
      inflightRequests.delete(cacheKey)
    })

    inflightRequests.set(cacheKey, request)

    return request
  }

  async function fetchSecuredChallengeRequest({
    type,
    action,
    b64EncryptionPublicKey,
  }: {
    type: OldAuthenticationTypes
    action: OldAction
    b64EncryptionPublicKey: string
    walletId?: string
  }): Promise<SecuredChallengeResponse> {
    if (!legacyRpcClient) {
      throw new Error('SecuredChallenge not supported in new API - legacy client required')
    }
    return await legacyRpcClient.securedChallenge({
      type,
      action,
      b64EncryptionPublicKey,
    })
  }

  async function fetchExportSeedPhraseRequest({
    encryptionKey,
    credential,
  }: {
    encryptionKey: string
    credential: string
  }): Promise<ExportSeedPhraseResponse> {
    if (!legacyRpcClient) {
      throw new Error('ExportSeedPhrase not supported in new API - legacy client required')
    }
    return await legacyRpcClient.exportSeedPhrase({ credential, b64EncryptionPublicKey: encryptionKey })
  }

  async function fetchStartAuthenticatedSessionRequest({
    existingCredential,
  }: {
    existingCredential: string
  }): Promise<StartAuthenticatedSessionResponse> {
    return await rpcClient.startAuthenticatedSession({ existingCredential })
  }

  async function fetchAddAuthenticatorRequest({
    newCredential,
  }: {
    newCredential: string
  }): Promise<AddAuthenticatorResponse> {
    return await rpcClient.addAuthenticator({ newCredential })
  }

  async function fetchDeleteAuthenticatorRequest({
    credential,
    authenticatorId,
  }: {
    credential: string
    authenticatorId: string
  }): Promise<DeleteAuthenticatorResponse> {
    return await rpcClient.deleteAuthenticator({ credential, authenticatorId })
  }

  return {
    fetchChallengeRequest,
    fetchSecuredChallengeRequest,
    fetchCreateWalletRequest,
    fetchWalletSigninRequest,
    fetchSignMessagesRequest,
    fetchSignTransactionsRequest,
    fetchSignTypedDataRequest,
    fetchExportSeedPhraseRequest,
    fetchDisconnectRequest,
    fetchListAuthenticatorsRequest,
    fetchStartAuthenticatedSessionRequest,
    fetchAddAuthenticatorRequest,
    fetchDeleteAuthenticatorRequest,
  }
}
