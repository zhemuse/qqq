type TextBlock = {
  type: "text"
  text: string
}

type ToolUseBlock = {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

type ToolResultBlock = {
  type: "tool_result"
  tool_use_id: string
  content: string
}

type Message =
  | { role: "user"; content: string | ToolResultBlock[] }
  | { role: "assistant"; content: Array<TextBlock | ToolUseBlock> }

type AssistantMessage = {
  content: Array<TextBlock | ToolUseBlock>
  stop_reason: string
}

const bashTool = {
  name: "bash",
  description:
    "在当前工作目录执行一条 shell 命令，返回 stdout 和 stderr。需要观察文件或运行程序时使用。",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "需要执行的完整 shell 命令",
      },
    },
    required: ["command"],
  },
}

async function callModel(messages: Message[]): Promise<AssistantMessage> {
  const baseURL = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"
  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL

  if (!apiKey || !model) {
    throw new Error("Missing ANTHROPIC_API_KEY or ANTHROPIC_MODEL")
  }

  const response = await fetch(`${baseURL.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4_096,
      system: "你是一个终端 Agent。需要了解环境时使用 bash 工具。",
      messages,
      tools: [bashTool],
    }),
  })

  if (!response.ok) {
    throw new Error(`Model request failed: ${response.status} ${await response.text()}`)
  }

  return (await response.json()) as AssistantMessage
}

async function runBash(command: string): Promise<string> {
  const child = Bun.spawn(["zsh", "-lc", command], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  const output = `${stdout}${stderr}`.trim()
  return (output || `(exit ${exitCode}, no output)`).slice(0, 8_000)
}

async function executeTool(toolUse: ToolUseBlock): Promise<string> {
  if (toolUse.name !== "bash") {
    return `Error: unknown tool ${toolUse.name}`
  }

  const command = toolUse.input.command
  if (typeof command !== "string" || command.length === 0) {
    return "Error: command must be a non-empty string"
  }

  console.log(`$ ${command}`)

  try {
    return await runBash(command)
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`
  }
}

export async function runAgent(task: string, maxSteps = 20): Promise<string> {
  const messages: Message[] = [{ role: "user", content: task }]

  for (let step = 1; step <= maxSteps; step += 1) {
    const assistant = await callModel(messages)
    messages.push({ role: "assistant", content: assistant.content })

    const toolUses = assistant.content.filter(
      (block): block is ToolUseBlock => block.type === "tool_use",
    )

    if (toolUses.length === 0) {
      return assistant.content
        .filter((block): block is TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
    }

    const toolResults: ToolResultBlock[] = []
    for (const toolUse of toolUses) {
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: await executeTool(toolUse),
      })
    }

    messages.push({ role: "user", content: toolResults })
  }

  throw new Error(`Agent exceeded ${maxSteps} steps`)
}

if (import.meta.main) {
  const task = process.argv.slice(2).join(" ")
  if (!task) {
    console.error('Usage: bun agent.ts "your task"')
    process.exit(1)
  }

  console.log(await runAgent(task))
}
