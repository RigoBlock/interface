import styled from '~/lib/deprecated-styled'

interface BodyWrapperProps {
  $margin?: string
  $maxWidth?: string
}

export const BodyWrapper = styled.main<BodyWrapperProps>`
  position: relative;
  margin-top: ${({ $margin }) => $margin ?? '0px'};
  max-width: ${({ $maxWidth }) => $maxWidth ?? '420px'};
  width: 100%;
  background: ${({ theme }) => theme.surface1};
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.surface3};
  margin-top: 1rem;
  margin-left: auto;
  margin-right: auto;
  z-index: 1;
`
