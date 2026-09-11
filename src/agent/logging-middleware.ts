import type { AgentMiddleware } from "./agent-middleware"

export type Log = (message: string) => void

export function createLoggingMiddleware(
  log: Log = (message) => console.log(message),
): AgentMiddleware {
  let startedAt = 0
  let modelCalls = 0
  let toolCalls = 0
  const toolStartedAt = new Map<string, number>()

  return {
    beforeAgentRun() {
      startedAt = performance.now()
      modelCalls = 0
      toolCalls = 0
      toolStartedAt.clear()
      log("Agent started")
    },

    beforeAgentStep(_context, step) {
      log(`Step ${step}`)
    },

    beforeModel(context) {
      modelCalls += 1
      log(`Model ← ${context.messages.length} messages`)
    },

    beforeTool(_context, call) {
      toolCalls += 1
      toolStartedAt.set(call.id, performance.now())
      log(`Tool → ${call.name} ${JSON.stringify(call.input)}`)
    },

    afterTool(_context, call) {
      const toolStart = toolStartedAt.get(call.id) ?? performance.now()
      const elapsed = performance.now() - toolStart
      toolStartedAt.delete(call.id)
      log(`Tool ← ${call.name} ${elapsed.toFixed(0)}ms`)
    },

    afterAgentRun(context) {
      const elapsed = performance.now() - startedAt
      log(
        `Agent finished: ${context.step} steps, ` +
          `${modelCalls} model calls, ${toolCalls} tool calls, ` +
          `${elapsed.toFixed(0)}ms`,
      )
    },
  }
}
