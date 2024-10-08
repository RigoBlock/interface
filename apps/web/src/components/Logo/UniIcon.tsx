import { GrgIcon } from 'nft/components/icons'
import styled from 'lib/styled-components'

const Container = styled.div<{ clickable?: boolean }>`
  position: relative;
  cursor: ${({ clickable }) => (clickable ? 'pointer' : 'auto')};
`

// ESLint reports `fill` is missing, whereas it exists on an SVGProps type
export type SVGProps = React.SVGProps<SVGSVGElement> & {
  fill?: string
  clickable?: boolean
}

export const UniIcon = ({ clickable /*, ...props*/ }: SVGProps) => (
  <Container clickable={clickable}>
    <GrgIcon />
  </Container>
)
