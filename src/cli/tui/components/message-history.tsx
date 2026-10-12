import { Box, Static, Text } from "ink"

import type {
  AssistantMessage,
  Message,
  ToolCallContent,
  ToolMessage,
  UserMessage,
} from "../../../foundation/messages"

function getUserText(message: UserMessage): string {
  if (typeof message.content === "string") {
    return message.content
  }

  return message.content.map((block) => block.text).join("\n")
}

function formatInput(call: ToolCallContent): string {
  if (call.name === "todo_write") {
    return "Update task plan"
  }

  const input = call.input ?? {}
  const value = input.path ?? input.command
  if (typeof value === "string") {
    return value
  }

  return JSON.stringify(input) ?? ""
}

function collectToolCalls(messages: Message[]): Map<string, ToolCallContent> {
  const calls = new Map<string, ToolCallContent>()

  for (const message of messages) {
    if (message.role !== "assistant") {
      continue
    }

    for (const block of message.content) {
      if (block.type === "tool_call") {
        calls.set(block.id, block)
      }
    }
  }

  return calls
}

function UserMessageView({ message }: { message: UserMessage }) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        You
      </Text>
      <Text>{getUserText(message)}</Text>
    </Box>
  )
}

function AssistantMessageView({ message }: { message: AssistantMessage }) {
  return (
    <Box flexDirection="column">
      {message.content.map((block, index) => {
        if (block.type === "text") {
          return block.text ? <Text key={index}>{block.text}</Text> : null
        }

        return (
          <Text key={block.id} color="yellow">
            ◇ {block.name} {formatInput(block)}
          </Text>
        )
      })}
    </Box>
  )
}

function ToolMessageView({
  message,
  calls,
}: {
  message: ToolMessage
  calls: Map<string, ToolCallContent>
}) {
  return (
    <Box flexDirection="column">
      {message.content.map((block) => {
        const call = calls.get(block.tool_call_id)
        const isError = block.content.startsWith("Error:")
        const content = call && !isError
          ? `${call.name} completed`
          : block.content

        return (
          <Text key={block.tool_call_id} color="gray">
            ◆ {content}
          </Text>
        )
      })}
    </Box>
  )
}

export function MessageHistory({ messages }: { messages: Message[] }) {
  const calls = collectToolCalls(messages)
  const items = messages.flatMap((message, index) =>
    message.role === "system" ? [] : [{ id: index, message }],
  )

  return (
    <Static items={items}>
      {({ id, message }) => {
        if (message.role === "user") {
          return <UserMessageView key={id} message={message} />
        }

        if (message.role === "assistant") {
          return <AssistantMessageView key={id} message={message} />
        }

        if (message.role === "tool") {
          return <ToolMessageView key={id} message={message} calls={calls} />
        }

        return null
      }}
    </Static>
  )
}
