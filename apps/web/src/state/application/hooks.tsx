import { Currency } from '@uniswap/sdk-core'
import { PopupType } from 'components/Popups/types'
import { useCallback } from 'react'
import { addSuppressedPopups, removeSuppressedPopups, setSmartPoolValue } from 'state/application/reducer'
import { useAppDispatch, useAppSelector } from 'state/hooks'
import { InterfaceState } from 'state/webReducer'

export function useSelectActiveSmartPool(): (smartPoolValue?: Currency) => void {
  const dispatch = useAppDispatch()
  return useCallback(
    (smartPoolValue?: Currency) => {
      dispatch(
        setSmartPoolValue({
          smartPool: {
            address: smartPoolValue?.isToken ? smartPoolValue.address : undefined,
            name: smartPoolValue?.isToken && smartPoolValue.name ? smartPoolValue.name : undefined,
          },
        }),
      )
    },
    [dispatch],
  )
}

// returns functions to suppress and unsuppress popups by type
export function useSuppressPopups(popupTypes: PopupType[]): {
  suppressPopups: () => void
  unsuppressPopups: () => void
} {
  const dispatch = useAppDispatch()
  const suppressPopups = useCallback(() => dispatch(addSuppressedPopups({ popupTypes })), [dispatch, popupTypes])
  const unsuppressPopups = useCallback(() => dispatch(removeSuppressedPopups({ popupTypes })), [dispatch, popupTypes])

  return {
    suppressPopups,
    unsuppressPopups,
  }
}

export function useActiveSmartPool(): InterfaceState['application']['smartPool'] {
  return useAppSelector((state: InterfaceState) => state.application.smartPool)
}
