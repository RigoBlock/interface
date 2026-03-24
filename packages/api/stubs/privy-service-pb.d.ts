// Type stubs for @uniswap/client-privy-embedded-wallet when the private package is not installed.

export declare enum AuthenticationTypes {
  AUTHENTICATION_TYPE_UNSPECIFIED = 0,
  PASSKEY_REGISTRATION = 1,
  PASSKEY_AUTHENTICATION = 2,
}

export declare enum Action {
  ACTION_UNSPECIFIED = 0,
  CREATE_WALLET = 1,
  SIGN_MESSAGE = 2,
  SIGN_TRANSACTION = 3,
  SIGN_TYPED_DATA = 4,
  WALLET_SIGNIN = 5,
  EXPORT_SEED_PHRASE = 6,
  DELETE_RECORD = 7,
  REGISTER_NEW_AUTHENTICATION_TYPES = 8,
  LIST_AUTHENTICATORS = 9,
  DELETE_AUTHENTICATOR = 10,
}

export declare enum AuthenticatorNameType {
  AUTHENTICATOR_NAME_TYPE_UNSPECIFIED = 0,
  GOOGLE_PASSWORD_MANAGER = 1,
  CHROME_MAC = 2,
  WINDOWS_HELLO = 3,
  ICLOUD_KEYCHAIN_MANAGED = 4,
  ICLOUD_KEYCHAIN = 15,
  PLATFORM_AUTHENTICATOR = 30,
  SECURITY_KEY = 31,
}

export declare enum RegistrationOptions_AuthenticatorAttachment {
  AUTHENTICATOR_ATTACHMENT_UNSPECIFIED = 0,
  PLATFORM = 1,
  CROSS_PLATFORM = 2,
}

export declare class ChallengeResponse {
  challengeOptions?: string
  sessionActive: boolean
}

export declare class CreateWalletResponse {
  walletAddress: string
  walletId: string
}

export declare class DisconnectResponse {}

export declare class RegistrationOptions {
  authenticatorAttachment?: RegistrationOptions_AuthenticatorAttachment
  username?: string
}

export declare class WalletSignInResponse {
  walletAddress: string
  walletId: string
  exported?: boolean
}

export declare class SignMessageResponse {
  signature: string
}

export declare class SignTransactionResponse {
  signature: string
}

export declare class SignTypedDataResponse {
  signature: string
}

export declare class Authenticator {
  credentialId: string
  providerName: AuthenticatorNameType
  createdAt: bigint
  aaguid?: string
}

export declare class ListAuthenticatorsRequest {
  credential?: string
  walletId?: string
}

export declare class ListAuthenticatorsResponse {
  authenticators: Authenticator[]
}

export declare class DeleteAuthenticatorRequest {
  credential: string
  authenticatorId: string
}

export declare class DeleteAuthenticatorResponse {
  success: boolean
}
