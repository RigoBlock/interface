import {
  Action,
  AuthenticationTypes,
} from '@uniswap/client-privy-embedded-wallet/dist/uniswap/privy-embedded-wallet/v1/service_pb'
import type { Sign7702AuthorizationResult, SignAuth } from '@universe/api'
import { EmbeddedWalletApiClient } from 'uniswap/src/data/rest/embeddedWallet/requests'
import { getDeviceSession, signWithDeviceKey } from 'uniswap/src/features/passkey/deviceSession'
import { authenticateWithPasskey } from 'uniswap/src/features/passkey/embeddedWallet'
import { logger } from 'utilities/src/logger/logger'

async function signWithDeviceSessionOrPasskey<T>({
  action,
  walletId,
  challengeParams,
  signRequest,
}: {
  action: Action
  walletId?: string
  challengeParams: Record<string, string>
  signRequest: (auth: SignAuth) => Promise<T>
}): Promise<T> {
  const session = getDeviceSession()
  if (session) {
    const challenge = await EmbeddedWalletApiClient.fetchChallengeRequest({
      type: AuthenticationTypes.PASSKEY_AUTHENTICATION,
      action,
      walletId: walletId ?? session.walletId,
      ...challengeParams,
    })
    if (challenge.signingPayload) {
      const resolvedWalletId = walletId ?? session.walletId
      if (!resolvedWalletId) {
        throw new Error('No walletId available for device auth')
      }
      const deviceSignature = await signWithDeviceKey(session.privateKey, challenge.signingPayload)
      return signRequest({
        case: 'deviceAuth',
        value: { deviceSignature, walletId: resolvedWalletId },
      })
    }
  }
  const credential = await authenticateWithPasskey(action, { walletId, ...challengeParams })
  if (!credential) {
    throw new Error('Passkey authentication returned no credential')
  }
  return signRequest({ case: 'credential', value: credential })
}

export async function signMessageWithPasskey(message: string, walletId?: string): Promise<string | undefined> {
  try {
    const result = await signWithDeviceSessionOrPasskey({
      action: Action.SIGN_MESSAGE,
      walletId,
      challengeParams: { message },
      signRequest: (auth) => EmbeddedWalletApiClient.fetchSignMessagesRequest({ messages: [message], auth }),
    })
    return result.signatures[0]
  } catch (error) {
    logger.error(error, {
      tags: { file: 'signing.ts', function: 'signMessageWithPasskey' },
    })
    throw error
  }
}

export async function signTransactionWithPasskey(transaction: string, walletId?: string): Promise<string | undefined> {
  try {
    const result = await signWithDeviceSessionOrPasskey({
      action: Action.SIGN_TRANSACTION,
      walletId,
      challengeParams: { transaction },
      signRequest: (auth) =>
        EmbeddedWalletApiClient.fetchSignTransactionsRequest({ transactions: [transaction], auth }),
    })
    return result.signatures[0]
  } catch (error) {
    logger.error(error, {
      tags: { file: 'signing.ts', function: 'signTransactionWithPasskey' },
    })
    throw error
  }
}

export async function signTypedDataWithPasskey(typedData: string, walletId?: string): Promise<string | undefined> {
  try {
    const result = await signWithDeviceSessionOrPasskey({
      action: Action.SIGN_TYPED_DATA,
      walletId,
      challengeParams: { typedData },
      signRequest: (auth) => EmbeddedWalletApiClient.fetchSignTypedDataRequest({ typedDataBatch: [typedData], auth }),
    })
    return result.signatures[0]
  } catch (error) {
    logger.error(error, {
      tags: { file: 'signing.ts', function: 'signTypedDataWithPasskey' },
    })
    throw error
  }
}

/**
 * Signs an EIP-7702 authorization via the privy-embedded-wallet backend.
 * Uses device session (silent) or passkey fallback, same as other signing operations.
 */
export async function sign7702AuthorizationWithPasskey(params: {
  contractAddress: string
  chainId: number
  nonce: number
  walletId?: string
}): Promise<Sign7702AuthorizationResult> {
  const { contractAddress, chainId, nonce, walletId } = params

  try {
    return await signWithDeviceSessionOrPasskey({
      action: Action.SIGN_7702_AUTHORIZATION,
      walletId,
      challengeParams: {
        authorizationContractAddress: contractAddress,
        authorizationChainId: String(chainId),
        authorizationNonce: String(nonce),
      },
      signRequest: (auth) =>
        EmbeddedWalletApiClient.fetchSign7702AuthorizationRequest({
          contractAddress,
          chainId,
          nonce,
          auth,
        }),
    })
  } catch (error) {
    logger.error(error, {
      tags: { file: 'signing.ts', function: 'sign7702AuthorizationWithPasskey' },
    })
    throw error
  }
}

/**
 * Signs a full EIP-7702 transaction via the privy-embedded-wallet backend.
 * The backend handles type-4 transaction signing and serialization.
 */
export async function sign7702TransactionWithPasskey(params: {
  to: string
  data: string
  value: string
  chainId: number
  gas: string
  maxFeePerGas: string
  maxPriorityFeePerGas: string
  nonce: number
  authorization: Sign7702AuthorizationResult
  walletId?: string
}): Promise<string> {
  const { to, data, value, chainId, gas, maxFeePerGas, maxPriorityFeePerGas, nonce, authorization, walletId } = params

  try {
    const txParams = { to, data, value, chainId, gas, maxFeePerGas, maxPriorityFeePerGas, nonce }
    const authorizationParams = {
      authorizationContractAddress: authorization.contractAddress,
      authorizationChainId: authorization.chainId,
      authorizationNonce: authorization.nonce,
      authorizationR: authorization.r,
      authorizationS: authorization.s,
      authorizationYParity: authorization.yParity,
    }
    const transactionForChallenge = JSON.stringify({ ...txParams, ...authorizationParams })

    const result = await signWithDeviceSessionOrPasskey({
      action: Action.SIGN_7702_TRANSACTION,
      walletId,
      challengeParams: { transaction: transactionForChallenge },
      signRequest: (auth) =>
        EmbeddedWalletApiClient.fetchSign7702TransactionRequest({
          ...txParams,
          ...authorizationParams,
          auth,
        }),
    })
    return result.signedTransaction
  } catch (error) {
    logger.error(error, {
      tags: { file: 'signing.ts', function: 'sign7702TransactionWithPasskey' },
    })
    throw error
  }
}

export async function exportEncryptedSeedPhrase(encryptionKey: string, walletId?: string): Promise<string | undefined> {
  try {
    const credential = await authenticateWithPasskey(Action.EXPORT_SEED_PHRASE, { walletId, encryptionKey })
    if (!credential) {
      return undefined
    }
    const seedPhraseResp = await EmbeddedWalletApiClient.fetchExportSeedPhraseRequest({
      encryptionKey,
      credential,
    })
    return seedPhraseResp.encryptedSeedPhrase
  } catch (error) {
    logger.error(error, {
      tags: { file: 'signing.ts', function: 'exportEncryptedSeedPhrase' },
    })
    throw error
  }
}
