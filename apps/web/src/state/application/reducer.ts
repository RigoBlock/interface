import { createSlice, nanoid, PayloadAction } from '@reduxjs/toolkit'
import { PositionInfo } from 'components/Liquidity/types'
import { DEFAULT_TXN_DISMISS_MS } from 'constants/misc'
import { ModalName, ModalNameType } from 'uniswap/src/features/telemetry/constants'
import { UniverseChainId } from 'uniswap/src/types/chains'
import { SwapTab } from 'uniswap/src/types/screens/interface'

export enum PopupType {
  Transaction = 'transaction',
  Order = 'order',
  FailedSwitchNetwork = 'failedSwitchNetwork',
  SwitchNetwork = 'switchNetwork',
  Bridge = 'bridge',
}

export type PopupContent =
  | {
      type: PopupType.Transaction
      hash: string
    }
  | {
      type: PopupType.Order
      orderHash: string
    }
  | {
      type: PopupType.FailedSwitchNetwork
      failedSwitchNetwork: UniverseChainId
    }
  | {
      type: PopupType.SwitchNetwork
      chainId: UniverseChainId
      action: SwapTab
    }
  | {
      type: PopupType.Bridge
      inputChainId: UniverseChainId
      outputChainId: UniverseChainId
    }

// TODO(WEB-4888): remove this type
/** @deprecated add new Modals to the ModalName object in uniswap/src/features/telemetry/constants */
export enum ApplicationModal {
  ADDRESS_CLAIM,
  BLOCKED_ACCOUNT,
  CLAIM_POPUP,
  DELEGATE,
  CREATE,
  EXECUTE,
  FEATURE_FLAGS,
  FIAT_ONRAMP,
  RECEIVE_CRYPTO,
  RECEIVE_CRYPTO_QR,
  PRIVACY_POLICY,
  QUEUE,
  SELF_CLAIM,
  SETTINGS,
  VOTE,
  UK_DISCLAIMER,
  GET_THE_APP,
}

type AddLiquidityModalParams = {
  name: typeof ModalName.AddLiquidity
  initialState: PositionInfo
}

type RemoveLiquidityModalParams = {
  name: typeof ModalName.RemoveLiquidity
  initialState: PositionInfo
}

export type OpenModalParams =
  | { name: ModalNameType | ApplicationModal; initialState?: undefined }
  | AddLiquidityModalParams
  | RemoveLiquidityModalParams

export type CloseModalParams = ModalNameType | ApplicationModal

export type PopupList = Array<{ key: string; show: boolean; content: PopupContent; removeAfterMs: number | null }>

export interface ApplicationState {
  readonly chainId: number | null
  readonly openModal: OpenModalParams | null
  readonly smartPool: { address?: string | null; name: string | null }
  readonly popupList: PopupList
  readonly suppressedPopups: PopupType[]
}

const initialState: ApplicationState = {
  chainId: null,
  openModal: null,
  smartPool: { address: null, name: '' },
  popupList: [],
  suppressedPopups: [],
}

const applicationSlice = createSlice({
  name: 'application',
  initialState,
  reducers: {
    updateChainId(state, action) {
      const { chainId } = action.payload
      state.chainId = chainId
    },
    setSmartPoolValue(state, action) {
      const { smartPool } = action.payload
      state.smartPool.address = smartPool.address
      state.smartPool.name = smartPool.name
    },
    setOpenModal(state, action: PayloadAction<OpenModalParams>) {
      state.openModal = action.payload
    },
    setCloseModal(state, action: PayloadAction<CloseModalParams | undefined>) {
      const { payload } = action
      if (!payload || (state.openModal?.name as any) === payload) {
        state.openModal = null
      }
    },
    addPopup(
      state,
      {
        payload: { content, key, removeAfterMs = DEFAULT_TXN_DISMISS_MS },
      }: { payload: { content: PopupContent; key?: string; removeAfterMs?: number } },
    ) {
      key = key || nanoid()
      state.popupList = [
        ...state.popupList.filter((popup) => popup.key !== key),
        {
          key,
          show: !state.suppressedPopups.includes(content.type),
          content,
          removeAfterMs,
        },
      ]
    },
    removePopup(state, { payload: { key } }) {
      state.popupList = state.popupList.map((popup) => {
        if (popup.key === key) {
          popup.show = false
        }
        return popup
      })
    },
    addSuppressedPopups(state, { payload: { popupTypes } }) {
      state.suppressedPopups = Array.from(new Set([...state.suppressedPopups, ...popupTypes]))
    },
    removeSuppressedPopups(state, { payload: { popupTypes } }) {
      state.suppressedPopups = state.suppressedPopups.filter((type) => !popupTypes.includes(type))
    },
  },
})

export const {
  updateChainId,
  setOpenModal,
  setCloseModal,
  setSmartPoolValue,
  addPopup,
  removePopup,
  addSuppressedPopups,
  removeSuppressedPopups,
} = applicationSlice.actions
export default applicationSlice.reducer
