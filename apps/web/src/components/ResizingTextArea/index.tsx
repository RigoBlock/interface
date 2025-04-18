import styled from 'lib/styled-components'
import { ChangeEvent, memo, useCallback, useRef } from 'react'

const TextAreaInput = styled.textarea<{ error?: boolean; fontSize?: string }>`
  font-size: ${({ fontSize }) => fontSize || '1.25rem'};
  outline: none;
  border: none;
  flex: 1 1 auto;
  width: 0;
  resize: none;
  background-color: ${({ theme }) => theme.surface1};
  transition: color 300ms ${({ error }) => (error ? 'step-end' : 'step-start')};
  color: ${({ error, theme }) => (error ? theme.critical : theme.neutral1)};
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 535;
  width: 100%;
  line-height: 1.2;
  padding: 0px;
  -webkit-appearance: textfield;

  ::-webkit-search-decoration {
    -webkit-appearance: none;
  }

  ::-webkit-outer-spin-button,
  ::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }

  ::placeholder {
    color: ${({ theme }) => theme.neutral2};
  }
`

export const ResizingTextArea = memo(
  ({
    className,
    value,
    onUserInput,
    placeholder,
    fontSize,
  }: {
    className?: string
    value: string
    onUserInput: (value: string) => void
    placeholder: string
    fontSize: string
  }) => {
    const inputRef = useRef<HTMLTextAreaElement>(document.createElement('textarea'))

    const handleInput = useCallback(
      (event: ChangeEvent<HTMLTextAreaElement>) => {
        inputRef.current.style.height = 'auto'
        inputRef.current.style.height = inputRef.current.scrollHeight + 'px'
        onUserInput(event.target.value)
      },
      [onUserInput],
    )

    return (
      <TextAreaInput
        style={{ height: 'auto', minHeight: '535px' }}
        className={className}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        placeholder={placeholder || ''}
        onChange={handleInput}
        value={value}
        fontSize={fontSize}
        ref={inputRef}
      />
    )
  },
)

ResizingTextArea.displayName = 'ResizingTextArea'