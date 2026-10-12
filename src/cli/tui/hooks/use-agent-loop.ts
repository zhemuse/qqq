import { useCallback, useState } from "react"

import type { Agent } from "../../../agent/agent"
import type { Message } from "../../../foundation/messages"

export function useAgentLoop(agent: Agent) {
  const [messages, setMessages] = useState<Message[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string>()

  const submit = useCallback(
    async (text: string) => {
      const input = text.trim()
      if (!input || running) {
        return
      }

      if (input === "/exit" || input === "exit" || input === "quit") {
        process.exit(0)
      }

      setRunning(true)
      setError(undefined)

      try {
        for await (const message of agent.stream(input)) {
          setMessages((current) => [...current, message])
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setRunning(false)
      }
    },
    [agent, running],
  )

  return { messages, running, error, submit }
}
