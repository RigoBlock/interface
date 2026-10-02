import type { ComponentPropsWithoutRef } from 'react'
import { StyledRotatingSVG } from '~/components/Icons/shared'

type LoaderProps = Omit<
  ComponentPropsWithoutRef<typeof StyledRotatingSVG>,
  'viewBox' | 'xmlns' | 'children' | 'size'
> & {
  /** Rendered width/height (e.g. `"16px"`, `"24px"`). */
  size?: string
}

/** Small rotating ring spinner used by RigoBlock list/loading placeholders. */
export default function Loader({ size = '16px', ...rest }: LoaderProps): JSX.Element {
  return (
    <StyledRotatingSVG size={size} viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor" {...rest}>
      <path
        opacity="0.2"
        d="M8 15C11.866 15 15 11.866 15 8C15 4.13401 11.866 1 8 1C4.13401 1 1 4.13401 1 8C1 11.866 4.13401 15 8 15ZM8 13C5.23858 13 3 10.7614 3 8C3 5.23858 5.23858 3 8 3C10.7614 3 13 5.23858 13 8C13 10.7614 10.7614 13 8 13Z"
      />
      <path d="M15 8C15 4.13401 11.866 1 8 1V3C10.7614 3 13 5.23858 13 8H15Z" />
    </StyledRotatingSVG>
  )
}
