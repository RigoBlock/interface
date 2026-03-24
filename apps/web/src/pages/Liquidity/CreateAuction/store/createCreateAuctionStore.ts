import type { StoreApi, UseBoundStore } from 'zustand'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  CreateAuctionStep,
  type CreateAuctionStoreState,
  DEFAULT_CREATE_AUCTION_STATE,
  type TokenFormState,
  TokenMode,
} from '~/pages/Liquidity/CreateAuction/types'

export type CreateAuctionStore = UseBoundStore<StoreApi<CreateAuctionStoreState>>

export const createCreateAuctionStore = (): CreateAuctionStore =>
  create<CreateAuctionStoreState>()(
    devtools(
      (set) => ({
        step: DEFAULT_CREATE_AUCTION_STATE.step,
        tokenForm: DEFAULT_CREATE_AUCTION_STATE.tokenForm,
        configureAuction: DEFAULT_CREATE_AUCTION_STATE.configureAuction,
        xVerification: DEFAULT_CREATE_AUCTION_STATE.xVerification,

        actions: {
          setStep: (step) => {
            set({ step })
          },
          goToNextStep: () => {
            set((state) => ({
              step: Math.min(state.step + 1, CreateAuctionStep.REVIEW_LAUNCH) as CreateAuctionStep,
            }))
          },
          goToPreviousStep: () => {
            set((state) => ({
              step: Math.max(state.step - 1, CreateAuctionStep.ADD_TOKEN_INFO) as CreateAuctionStep,
            }))
          },
          setTokenMode: (mode) => {
            set((state) => ({ tokenForm: { ...state.tokenForm, mode } }))
          },
          updateCreateNewTokenField: (key, value) => {
            set((state) => ({
              tokenForm: { ...state.tokenForm, createNew: { ...state.tokenForm.createNew, [key]: value } },
            }))
          },
          updateExistingTokenField: (key, value) => {
            set((state) => ({
              tokenForm: { ...state.tokenForm, existing: { ...state.tokenForm.existing, [key]: value } },
            }))
          },
          setTokenForm: (tokenForm: TokenFormState) => {
            set({ tokenForm })
          },
          setXVerification: (value) => {
            set({ xVerification: value })
          },
          setAuctionType: (auctionType) => {
            set((state) => ({ configureAuction: { ...state.configureAuction, auctionType } }))
          },
          setMaxDurationDays: (maxDurationDays) => {
            set((state) => ({ configureAuction: { ...state.configureAuction, maxDurationDays } }))
          },
          setAuctionSupplyPercent: (auctionSupplyPercent) => {
            set((state) => ({ configureAuction: { ...state.configureAuction, auctionSupplyPercent } }))
          },
          setRaiseCurrency: (raiseCurrency) => {
            set((state) => ({ configureAuction: { ...state.configureAuction, raiseCurrency } }))
          },
          setSupplyCurve: (supplyCurve) => {
            set((state) => ({ configureAuction: { ...state.configureAuction, supplyCurve } }))
          },
          setFloorPrice: (floorPrice) => {
            set((state) => ({ configureAuction: { ...state.configureAuction, floorPrice } }))
          },
          setPostAuctionLiquidityPercent: (postAuctionLiquidityPercent) => {
            set((state) => ({ configureAuction: { ...state.configureAuction, postAuctionLiquidityPercent } }))
          },
          updateConfigureAuctionField: (key, value) => {
            set((state) => ({
              configureAuction: { ...state.configureAuction, [key]: value },
            }))
          },
          commitTokenFormAndAdvance: () => {
            set((state) => {
              const defaults = DEFAULT_CREATE_AUCTION_STATE.tokenForm
              const cleaned =
                state.tokenForm.mode === TokenMode.CREATE_NEW
                  ? { ...state.tokenForm, existing: defaults.existing }
                  : { ...state.tokenForm, createNew: defaults.createNew }
              return {
                tokenForm: cleaned,
                step: Math.min(state.step + 1, CreateAuctionStep.REVIEW_LAUNCH) as CreateAuctionStep,
              }
            })
          },
          reset: () => {
            set({
              step: DEFAULT_CREATE_AUCTION_STATE.step,
              tokenForm: DEFAULT_CREATE_AUCTION_STATE.tokenForm,
              configureAuction: DEFAULT_CREATE_AUCTION_STATE.configureAuction,
              xVerification: DEFAULT_CREATE_AUCTION_STATE.xVerification,
            })
          },
        },
      }),
      {
        name: 'createAuctionStore',
        enabled: process.env.NODE_ENV === 'development',
      },
    ),
  )
