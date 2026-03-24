import { UniverseChainId } from 'uniswap/src/features/chains/types'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'

export const NEW_TOKEN_TOTAL_SUPPLY = 1_000_000_000

export enum CreateAuctionStep {
  ADD_TOKEN_INFO = 0,
  CONFIGURE_AUCTION = 1,
  CUSTOMIZE_POOL = 2,
  REVIEW_LAUNCH = 3,
}

export enum TokenMode {
  CREATE_NEW = 'create_new',
  EXISTING = 'existing',
}

export type CreateNewTokenFields = {
  name: string
  symbol: string
  description: string
  imageUrl: string
  network: UniverseChainId
  xProfile: string
}

export type ExistingTokenFields = {
  existingTokenCurrencyInfo: CurrencyInfo | undefined
  description: string
  xProfile: string
}

export type TokenFormState = {
  mode: TokenMode
  createNew: CreateNewTokenFields
  existing: ExistingTokenFields
}

export enum AuctionType {
  BOOTSTRAP_LIQUIDITY = 'bootstrap_liquidity',
  FUNDRAISE = 'fundraise',
}

export enum RaiseCurrency {
  ETH = 'ETH',
  USDC = 'USDC',
}

export enum SupplyCurve {
  LINEAR = 'linear',
  LINEAR_SPIKE = 'linear_spike',
}

export type ConfigureAuctionFormState = {
  auctionType: AuctionType
  startTime: Date | undefined
  maxDurationDays: number
  auctionSupplyPercent: number
  supplyCurve: SupplyCurve
  raiseCurrency: RaiseCurrency
  floorPrice: string
  postAuctionLiquidityPercent: number
}

type XVerification = {
  xHandle: string
  xVerificationToken: string
}

interface CreateAuctionState {
  step: CreateAuctionStep
  tokenForm: TokenFormState
  configureAuction: ConfigureAuctionFormState
  xVerification: XVerification | undefined
}

export const DEFAULT_CREATE_AUCTION_STATE: CreateAuctionState = {
  step: CreateAuctionStep.ADD_TOKEN_INFO,
  xVerification: undefined,
  tokenForm: {
    mode: TokenMode.CREATE_NEW,
    createNew: {
      name: '',
      symbol: '',
      description: '',
      imageUrl: '',
      network: UniverseChainId.Unichain,
      xProfile: '',
    },
    existing: {
      existingTokenCurrencyInfo: undefined,
      description: '',
      xProfile: '',
    },
  },
  configureAuction: {
    auctionType: AuctionType.BOOTSTRAP_LIQUIDITY,
    startTime: undefined,
    maxDurationDays: 5,
    auctionSupplyPercent: 25,
    supplyCurve: SupplyCurve.LINEAR,
    raiseCurrency: RaiseCurrency.ETH,
    floorPrice: '',
    postAuctionLiquidityPercent: 75,
  },
}

interface CreateAuctionStoreActions {
  setStep: (step: CreateAuctionStep) => void
  goToNextStep: () => void
  goToPreviousStep: () => void
  setTokenMode: (mode: TokenMode) => void
  updateCreateNewTokenField: <K extends keyof CreateNewTokenFields>(key: K, value: CreateNewTokenFields[K]) => void
  updateExistingTokenField: <K extends keyof ExistingTokenFields>(key: K, value: ExistingTokenFields[K]) => void
  setTokenForm: (form: TokenFormState) => void
  commitTokenFormAndAdvance: () => void
  setXVerification: (value: XVerification | undefined) => void
  setAuctionType: (type: AuctionType) => void
  setMaxDurationDays: (days: number) => void
  setAuctionSupplyPercent: (percent: number) => void
  setRaiseCurrency: (currency: RaiseCurrency) => void
  setSupplyCurve: (curve: SupplyCurve) => void
  setFloorPrice: (price: string) => void
  setPostAuctionLiquidityPercent: (percent: number) => void
  updateConfigureAuctionField: <K extends keyof ConfigureAuctionFormState>(
    key: K,
    value: ConfigureAuctionFormState[K],
  ) => void
  reset: () => void
}

export interface CreateAuctionStoreState extends CreateAuctionState {
  actions: CreateAuctionStoreActions
}
