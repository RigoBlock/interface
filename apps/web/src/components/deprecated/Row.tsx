import { deprecatedStyled } from '~/lib/deprecated-styled'

/** @deprecated Please use `Flex` from `@universe/mycelium` going forward */
const Row = deprecatedStyled.div<{
  align?: string
  padding?: string
  border?: string
  borderRadius?: string
}>`
  width: 100%;
  display: flex;
  padding: ${({ padding }) => padding};
  border: ${({ border }) => border};
  border-radius: ${({ borderRadius }) => borderRadius};
  align-items: ${({ align }) => (align ? align : 'center')};
  justify-content: flex-start;
`

/** @deprecated Please use `Flex` from `@universe/mycelium` going forward */
export const RowBetween = deprecatedStyled(Row)`
  justify-content: space-between;
`

/** @deprecated Please use `Flex` from `@universe/mycelium` going forward */
export const RowFlat = deprecatedStyled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
`

/** @deprecated Please use `Flex` from `@universe/mycelium` going forward */
export const AutoRow = deprecatedStyled(Row)<{ gap?: string; justify?: string }>`
  flex-wrap: wrap;
  margin: ${({ gap }) => gap && `-${gap}`};
  justify-content: ${({ justify }) => justify};

  & > * {
    margin: ${({ gap }) => gap} !important;
  }
`

/** @deprecated Please use `Flex` from `@universe/mycelium` going forward */
export const RowFixed = deprecatedStyled(Row)<{ gap?: string; justify?: string }>`
  width: fit-content;
  margin: ${({ gap }) => gap && `-${gap}`};
`

export default Row
