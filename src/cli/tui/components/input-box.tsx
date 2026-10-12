import { Box, Text } from "ink"
import TextInput from "ink-text-input"
import { useState } from "react"

export function InputBox({
  disabled,
  onSubmit,
}: {
  disabled: boolean
  onSubmit: (text: string) => void
}) {
  const [value, setValue] = useState("")

  function submit(text: string) {
    if (disabled || !text.trim()) {
      return
    }

    onSubmit(text)
    setValue("")
  }

  return (
    <Box borderStyle="single" borderLeft={false} borderRight={false} paddingX={1}>
      <Text color="cyan">› </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={submit}
        focus={!disabled}
        placeholder="Ask qqq to work on this project"
      />
    </Box>
  )
}
