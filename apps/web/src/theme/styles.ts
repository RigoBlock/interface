import { css } from '~/lib/deprecated-styled'

export const transitions = {
  duration: {
    slow: `500ms`,
    medium: `250ms`,
    fast: `125ms`,
  },
  timing: {
    ease: 'ease',
    in: 'ease-in',
    out: 'ease-out',
    inOut: 'ease-in-out',
  },
}

export const flexColumnNoWrap = css`
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
`

export const flexRowNoWrap = css`
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
`
