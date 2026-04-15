#!/usr/bin/env bun
import * as readline from "readline"
import { Agent } from "./agent"
import * as tools from "./tools/index"

const model = process.env.AGENT_MODEL ?? "claude-sonnet-4-6"
const baseURL = process.env.AGENT_BASE_URL
const prompt = process.env.AGENT_SYSTEM_PROMPT

const agent = new Agent({
  model,
  baseURL,
  prompt,
  tools: [
    tools.readFile,
    tools.writeFile,
    tools.listDir,
    tools.bash,
    tools.search,
  ],
  maxSteps: 20,
})

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "\n> ",
})

console.log(`bun-agent 🤖  (model: ${model})`)
console.log("Type your task and press Enter. Ctrl+C to exit.\n")

rl.prompt()

rl.on("line", async (line) => {
  const userMessage = line.trim()
  if (!userMessage) {
    rl.prompt()
    return
  }

  try {
    process.stdout.write("[thinking...]\n")
    const result = await agent.run(userMessage)
    console.log("\n" + result + "\n")
  } catch (err) {
    console.error(`\nError: ${(err as Error).message}\n`)
  }

  rl.prompt()
})

rl.on("close", () => {
  console.log("\nBye!")
  process.exit(0)
})
