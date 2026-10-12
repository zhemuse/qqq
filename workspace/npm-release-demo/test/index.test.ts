import { expect, test } from "bun:test"

import { greet } from "qqq-agent-course-release-demo"

test("greets a person by name", () => {
  expect(greet("Agent")).toBe("Hello, Agent!")
})
