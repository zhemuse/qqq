import { createCodingAgent } from "../coding/create-coding-agent"
import { AnthropicModelProvider } from "../community/anthropic/anthropic-model-provider"
import { Model } from "../foundation/models"

async function main() {
  const task = process.argv.slice(2).join(" ")
  if (!task) {
    console.error('Usage: bun run start -- "your task"')
    process.exit(1)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  const modelName = process.env.ANTHROPIC_MODEL
  if (!apiKey || !modelName) {
    throw new Error("Missing ANTHROPIC_API_KEY or ANTHROPIC_MODEL")
  }

  const provider = new AnthropicModelProvider({
    baseURL: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    apiKey,
  })
  const model = new Model(modelName, provider, { max_tokens: 4_096 })
  const agent = createCodingAgent(model)

  console.log(await agent.run(task))
}

if (import.meta.main) {
  await main()
}
