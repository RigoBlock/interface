import { waitFor } from '@testing-library/react'
import type { PropsWithChildren, ReactNode } from 'react'
import { getPrivyEnums, listAuthenticators } from 'uniswap/src/features/passkey/embeddedWallet'
import PasskeyMenu from '~/components/AccountDrawer/PasskeyMenu/PasskeyMenu'
import { usePasskeyAuthWithHelpModal } from '~/hooks/usePasskeyAuthWithHelpModal'
import { useEmbeddedWalletState } from '~/state/embeddedWallet/store'
import { render, screen } from '~/test-utils/render'

vi.mock('uniswap/src/features/passkey/embeddedWallet', () => ({
  listAuthenticators: vi.fn(),
  authenticateWithPasskey: vi.fn(),
  getPrivyEnums: vi.fn(),
}))

vi.mock('~/state/embeddedWallet/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/state/embeddedWallet/store')>()),
  useEmbeddedWalletState: vi.fn(),
}))

vi.mock('~/hooks/usePasskeyAuthWithHelpModal', () => ({
  usePasskeyAuthWithHelpModal: vi.fn(),
}))

// Allow isMobileWeb to be toggled per-test
let mockIsMobileWeb = false
vi.mock('utilities/src/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('utilities/src/platform')>()
  return {
    ...actual,
    get isMobileWeb() {
      return mockIsMobileWeb
    },
  }
})

vi.mock('~/components/AccountDrawer/SlideOutMenu', () => ({
  SlideOutMenu: ({ children, title }: PropsWithChildren<{ title: ReactNode }>) => (
    <div>
      <span>{title}</span>
      {children}
    </div>
  ),
}))

vi.mock('~/components/AccountDrawer/PasskeyMenu/AddPasskeyMenu', () => ({
  AddPasskeyMenu: () => null,
}))
vi.mock('~/components/AccountDrawer/PasskeyMenu/DeletePasskeyMenu', () => ({
  DeletePasskeyMenu: () => null,
}))
vi.mock('~/components/AccountDrawer/PasskeyMenu/DeletePasskeySpeedbumpMenu', () => ({
  DeletePasskeySpeedbumpMenu: () => null,
}))
vi.mock('~/components/AccountDrawer/PasskeyMenu/VerifyPasskeyMenu', () => ({
  VerifyPasskeyMenu: () => null,
}))

const mockAuthenticatorsDisplay = [
  {
    credentialId: 'cred-icloud-1',
    providerName: 15,
    createdAt: BigInt(1704110400000),
    aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
    provider: 'iCloud',
    label: 'iCloud',
  },
  {
    credentialId: 'cred-chrome-2',
    providerName: 2,
    createdAt: BigInt(1706788800000),
    aaguid: 'adce0002-35bc-c60a-648b-0b25f1f05503',
    provider: 'Chrome',
    label: 'Chrome',
  },
]

const MOCK_AUTHENTICATOR_NAME_TYPE = {
  ICLOUD_KEYCHAIN: 15,
  ICLOUD_KEYCHAIN_MANAGED: 4,
  CHROME_MAC: 2,
  GOOGLE_PASSWORD_MANAGER: 1,
  WINDOWS_HELLO: 3,
}

// Sets up mocks so listAuthenticators resolves with data and verifyPasskey is a noop
function setupLoadedMock(): void {
  vi.mocked(getPrivyEnums).mockResolvedValue({
    AuthenticatorNameType: MOCK_AUTHENTICATOR_NAME_TYPE,
  } as unknown as Awaited<ReturnType<typeof getPrivyEnums>>)
  vi.mocked(listAuthenticators).mockResolvedValue(
    mockAuthenticatorsDisplay.map(({ credentialId, providerName, createdAt, aaguid }) => ({
      credentialId,
      providerName,
      createdAt,
      aaguid,
    })) as never,
  )
  vi.mocked(usePasskeyAuthWithHelpModal).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof usePasskeyAuthWithHelpModal>)
}

describe('PasskeyMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsMobileWeb = false
  })

  it('shows 3 skeleton rows while loading', () => {
    vi.mocked(useEmbeddedWalletState).mockReturnValue({
      walletId: 'test-wallet-id',
    } as ReturnType<typeof useEmbeddedWalletState>)
    // Never resolves so the component stays in loading state
    vi.mocked(listAuthenticators).mockReturnValue(new Promise(() => {}) as never)
    vi.mocked(usePasskeyAuthWithHelpModal).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof usePasskeyAuthWithHelpModal>)

    render(<PasskeyMenu onClose={vi.fn()} />)

    expect(document.body).toMatchSnapshot()
  })

  it('shows authenticators and Add passkey button after loading', async () => {
    vi.mocked(useEmbeddedWalletState).mockReturnValue({
      walletId: 'test-wallet-id',
    } as ReturnType<typeof useEmbeddedWalletState>)
    setupLoadedMock()

    render(<PasskeyMenu onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('iCloud')).toBeInTheDocument()
      expect(screen.getByText('Chrome')).toBeInTheDocument()
    })

    expect(document.body).toMatchSnapshot()
  })

  it('shows delete icon on mobile web (isMobileWeb=true bypasses hover requirement)', async () => {
    // Tamagui's onHoverIn events don't fire in JSDOM. The delete icon has two
    // triggers: hover (showDeleteIcon state) and isMobileWeb. We test the latter
    // to verify the conditional rendering logic for the delete icon.
    mockIsMobileWeb = true
    vi.mocked(useEmbeddedWalletState).mockReturnValue({
      walletId: 'test-wallet-id',
    } as ReturnType<typeof useEmbeddedWalletState>)
    setupLoadedMock()

    render(<PasskeyMenu onClose={vi.fn()} />)

    await screen.findByText('iCloud')

    // On mobile web, trash icons are always visible (one per authenticator row)
    await waitFor(() => {
      // Each AuthenticatorRow renders a Trash SVG when isMobileWeb is true
      // We should have more SVGs than just the provider icons (iCloud + Chrome)
      expect(document.querySelectorAll('svg').length).toBeGreaterThan(2)
    })
  })
})
