import { render } from "ink"

import { createCodingAgent } from "../coding/create-coding-agent"
import { AnthropicModelProvider } from "../community/anthropic/anthropic-model-provider"
import { Model } from "../foundation/models"
import { App } from "./tui"

function createModelFromEnvironment(): Model {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const modelName = process.env.ANTHROPIC_MODEL

  if (!apiKey || !modelName) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY or ANTHROPIC_MODEL. Add them to your environment or .env file.",
    )
  }

  const provider = new AnthropicModelProvider({
    baseURL: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    apiKey,
  })

  return new Model(modelName, provider, { max_tokens: 4_096 })
}

function main() {
  const model = createModelFromEnvironment()
  const agent = createCodingAgent(model, { logging: false })

  render(<App agent={agent} />)
}

if (import.meta.main) {
  main()
}
