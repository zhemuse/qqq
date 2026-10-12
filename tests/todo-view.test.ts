import { expect, test } from "bun:test"

import { getLatestTodos } from "../src/cli/tui/todo-view"
import type { Message } from "../src/foundation/messages"

test("returns the latest Todo list from the transcript", () => {
  const messages: Message[] = [
    {
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "todo_1",
          name: "todo_write",
          input: {
            todos: [
              { id: "one", content: "Read package.json", status: "in_progress" },
            ],
          },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool_result",
          tool_call_id: "todo_1",
          content: "Todo list updated",
        },
      ],
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "todo_2",
          name: "todo_write",
          input: {
            todos: [
              { id: "one", content: "Read package.json", status: "completed" },
              { id: "two", content: "Run tests", status: "in_progress" },
            ],
          },
        },
      ],
    },
  ]

  expect(getLatestTodos(messages)).toEqual([
    { id: "one", content: "Read package.json", status: "completed" },
    { id: "two", content: "Run tests", status: "in_progress" },
  ])
})

test("ignores malformed Todo items", () => {
  const messages: Message[] = [
    {
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "todo_1",
          name: "todo_write",
          input: {
            todos: [
              { id: "one", content: "Valid", status: "pending" },
              { id: "two", status: "pending" },
              "invalid",
            ],
          },
        },
      ],
    },
  ]

  expect(getLatestTodos(messages)).toEqual([
    { id: "one", content: "Valid", status: "pending" },
  ])
})

test("keeps the latest Todo list visible across conversation turns", () => {
  const messages: Message[] = [
    {
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "todo_1",
          name: "todo_write",
          input: {
            todos: [{ id: "one", content: "Existing plan", status: "in_progress" }],
          },
        },
      ],
    },
    {
      role: "user",
      content: [{ type: "text", text: "Continue" }],
    },
  ]

  expect(getLatestTodos(messages)).toEqual([
    { id: "one", content: "Existing plan", status: "in_progress" },
  ])
})

