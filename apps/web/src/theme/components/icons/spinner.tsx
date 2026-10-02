import { css, deprecatedStyled, keyframes } from '~/lib/deprecated-styled'

const rotate = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`

const SpinnerCss = css`
  animation: 2s ${rotate} linear infinite;
`

const Spinner = deprecatedStyled.img`
  ${SpinnerCss}
  width: 16px;
  height: 16px;
`

export const SpinnerSVG = deprecatedStyled.svg`
  ${SpinnerCss}
`

export const CustomLightSpinner = deprecatedStyled(Spinner)<{ size: string }>`
  height: ${({ size }) => size};
  width: ${({ size }) => size};
`
