import styled, { useTheme } from 'lib/styled-components'

import { ThemedText } from 'theme/components/text'
import { AutoColumn } from 'components/deprecated/Column'

const Wrapper = styled(AutoColumn)`
  margin-right: 8px;
  height: 100%;
`

const Grouping = styled(AutoColumn)`
  width: fit-content;
  padding: 4px;
  /* background-color: ${({ theme }) => theme.surface1}; */
  border-radius: 16px;
`

const Circle = styled.div<{ confirmed?: boolean; disabled?: boolean }>`
  width: 48px;
  height: 48px;
  background-color: ${({ theme, confirmed, disabled }) =>
    disabled ? theme.surface1 : confirmed ? theme.success : theme.accent1};
  border-radius: 50%;
  color: ${({ theme, disabled }) => (disabled ? theme.neutral3 : theme.neutral1)};
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 8px;
  font-size: 16px;
  padding: 1rem;
`

const CircleRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`

interface ProgressCirclesProps {
  steps: boolean[]
  disabled?: boolean
}

/**
 * Based on array of steps, create a step counter of circles.
 * A circle can be enabled, disabled, or confirmed. States are derived
 * from previous step.
 *
 * An extra circle is added to represent the ability to swap, add, or remove.
 * This step will never be marked as complete (because no 'txn done' state in body ui).
 *
 * @param steps  array of booleans where true means step is complete
 */
export default function ProgressCircles({ steps, disabled = false, ...rest }: ProgressCirclesProps) {
  const theme = useTheme()

  return (
    <Wrapper justify="center" {...rest}>
      <Grouping>
        {steps.map((step, i) => {
          return (
            <CircleRow key={i}>
              <Circle confirmed={step} disabled={disabled || (!steps[i - 1] && i !== 0)}>
                {step ? '✓' : i + 1 + '.'}
              </Circle>
              <ThemedText.DeprecatedMain color={theme.neutral3}>|</ThemedText.DeprecatedMain>
            </CircleRow>
          )
        })}
        <Circle disabled={disabled || !steps[steps.length - 1]}>{steps.length + 1 + '.'}</Circle>
      </Grouping>
    </Wrapper>
  )
}
