# 第一讲：120 行写出一个最小 ReAct Agent

Hello, boys and girls.

相信大家或多或少都接触过大模型。不管是 ChatGPT、Claude 这样的聊天产品，还是能够读取文件、执行命令、修改代码的 Agent 如Codex、Claude Cowork，我们已经越来越习惯直接向模型描述目标，然后等待它给出结果。

但如果把产品界面、插件系统和各种框架全部拿掉，一个 Agent 到底还剩下什么？模型为什么能记住前面的对话？它又为什么能从“只会说话”变成“可以做事”？

这一讲，我们不使用任何 Agent 框架，也不安装模型 SDK。只用 Bun、TypeScript、一次裸 `fetch` 和一个 `bash` 工具，在单文件中写出一个最小 ReAct Agent。

我们主要回答五个问题：

1. 为什么 LLM API 本身没有会话状态？
2. Anthropic Messages API 如何表示一段对话？
3. 模型如何通过 Function Calling 或 `tool_use` 请求调用工具？
4. Reason、Act、Observe 如何组成一个最小 Agent Loop？
5. Agent 和普通 Chat 程序的本质区别是什么？

## 从一个场景开始

先看最终效果。我们希望在终端中执行：

```bash
bun agent.ts "你是谁？"
```

程序并没有在 System Prompt 里写明自己的文件名，也没有提前准备固定答案。模型为了回答问题，可能会先观察当前目录，再读取源代码：

```text
$ ls
agent.ts

$ cat agent.ts
...

我是 agent.ts，一个运行在 Bun 上的最小 ReAct Agent。
我把用户消息发给模型；如果模型请求执行命令，我就执行命令，
再把结果交还给模型，直到模型不再请求工具为止。
```

这段过程里发生了几件值得注意的事：

- 模型自己决定先执行 `ls`；
- 第二条命令 `cat agent.ts` 来自第一条命令的结果；
- 真正执行命令的是本地 TypeScript 程序，而不是模型；
- 模型通过观察工具结果决定下一步；
- 当模型认为信息足够时，它停止调用工具并给出最终回答。

这已经是一个完整的 Agent loop 行为。它没有其他，只有上下文消息、模型、工具和一个循环。

接下来从最底层开始，把这段过程拆开。

## 一次 LLM API 调用是什么

先暂时忘掉 Agent，把模型调用看成一个普通函数：

```text
response = model(messages, tools, options)
```

它接收本次请求中的消息和工具定义，生成一条新的 Assistant Message。

从应用程序的角度看，一次裸 API 调用是无状态的：

```text
第一次请求结束
    ↓
服务端返回结果
    ↓
第二次请求不会自动获得第一次请求的内容
```

假设第一次请求是：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "我正在开发一个叫 qqq 的项目。"
    }
  ]
}
```

模型回答后，如果第二次只发送：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "我的项目叫什么？"
    }
  ]
}
```

它无法可靠知道答案。两个请求之间没有天然共享的程序状态。

要让模型表现出连续对话能力，应用必须保存历史，并在第二次请求中重新发送：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "我正在开发一个叫 qqq 的项目。"
    },
    {
      "role": "assistant",
      "content": "了解，你正在开发 qqq。"
    },
    {
      "role": "user",
      "content": "我的项目叫什么？"
    }
  ]
}
```

所以，“模型记住了”是用户体验层面的描述。工程上更准确的说法是：

> 应用保存了消息历史，并把需要的历史重新放进模型的 Context Window。

模型负责生成下一条消息，应用负责维护当前对话状态。

## Anthropic Messages 格式

不同模型厂商使用的 API 格式不完全相同。这一讲选择 Anthropic Messages 格式，因为它把文本、工具调用和工具结果统一表示为 [Content Block](https://platform.claude.com/docs/zh-CN/api/cli/messages#content_block)，后面的 Agent Loop 会非常直观。

### System Prompt

在 Anthropic Messages API 中，System Prompt 通常是请求体的顶层字段：

```json
{
  "system": "你是一个终端 Agent。需要了解环境时使用 bash 工具。"
}
```

它描述模型在当前应用中的身份和行为边界。

### User Message

用户消息可以使用字符串：

```json
{
  "role": "user",
  "content": "列出当前目录中的 TypeScript 文件。"
}
```

也可以使用 Content Block 数组：

```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "列出当前目录中的 TypeScript 文件。"
    }
  ]
}
```

Content Block 的优势是同一条消息可以容纳文本、图片、工具调用或工具结果等不同内容。具体可以查看 https://platform.claude.com/docs/zh-CN/api/cli/messages#content_block

### Assistant Text Message

模型只需要回答文字时，返回内容通常类似：

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "当前目录中有一个 agent.ts 文件。"
    }
  ],
  "stop_reason": "end_turn"
}
```

### Assistant Tool Use

当模型认为需要调用工具时，它不会真的执行函数，而是返回一个 `tool_use` Content Block：

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_01ABC",
      "name": "bash",
      "input": {
        "command": "ls"
      }
    }
  ],
  "stop_reason": "tool_use"
}
```

这段 JSON 的意思不是“模型执行了 `ls`”，而是：

> 模型请求宿主程序调用名为 `bash` 的工具，输入参数是 `{ "command": "ls" }`。

是否允许执行、怎样执行、执行多久、结果返回多少内容，全部由我们的代码决定。

### Tool Result

宿主程序执行工具后，需要把观察结果作为 `tool_result` 放回消息历史：

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01ABC",
      "content": "agent.ts\nREADME.md\n"
    }
  ]
}
```

`tool_use_id` 必须与模型请求中的 `id` 对应。模型一轮可能请求多个工具，调用 ID 用来确定每个结果回答的是哪一次请求。

至此，一次工具调用的消息链已经完整：

```text
User Message
    ↓
Assistant Message: tool_use
    ↓
Tool Result Message: tool_result
    ↓
Assistant Message: text 或下一次 tool_use
```

## Function Calling 和 tool_use

Function Calling、Tool Calling 和 `tool_use` 经常被当成不同概念。它们的核心机制其实相同：

1. 应用向模型描述可用工具；
2. 模型生成结构化调用意图；
3. 应用解析参数并执行本地函数；
4. 应用把结果放回消息历史；
5. 模型读取结果后继续生成。

不同 Provider 主要是在消息格式上有差异。

| | OpenAI Chat Completions | Anthropic Messages |
|---|---|---|
| 模型请求工具 | `assistant.tool_calls[]` | Content Block：`type: "tool_use"` |
| 工具名称 | `function.name` | `name` |
| 工具参数 | `function.arguments` JSON 字符串 | `input` 对象 |
| 返回工具结果 | `role: "tool"` | User Content Block：`type: "tool_result"` |
| 关联字段 | `tool_call_id` | `tool_use_id` |

因此，Function Calling 并不是模型获得了一个可以直接调用的 JavaScript 函数。模型只获得了工具的名字、描述和参数 Schema，然后生成符合协议的结构化数据。

补充说明
https://developers.openai.com/api/docs/guides/function-calling
https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview

真正的调用始终发生在宿主程序中。

## 用 TypeScript 表达消息

根据前面的协议，我们只定义当前示例真正需要的类型：

```ts
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
  stop_reason: "end_turn" | "tool_use" | string
}
```

这些类型不是要完整复刻 Anthropic SDK，只是把循环中真正使用的数据表示清楚。以后支持更多 Provider 或图片、Thinking 等内容时，再扩展内部类型。

## 定义第一个工具

我们只给 Agent 一个工具：`bash`。

模型看到的不是 TypeScript 函数，而是一份 JSON Schema：

```ts
const tools = [
  {
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
  },
]
```

工具描述不是写给开发者看的普通注释。它会进入模型上下文，是模型决定何时使用工具、如何构造参数的重要依据。

比如只写：

```text
执行命令
```

模型不知道命令在哪执行，也不知道能得到什么结果。

更明确的描述告诉模型：

- 工具在当前工作目录执行；
- 输入是一条完整 shell 命令；
- 输出包含标准输出和错误输出；
- 它适合用来观察文件和运行程序。

`required: ["command"]` 也不能省略。工具参数来自模型生成，宿主程序必须把它当作不可信输入验证，而不能假设字段永远存在。

### 宿主程序中的 bash

模型看到的是 Schema，真正执行命令的是本地函数：

```ts
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
```

这里有三个设计细节：

- `cwd` 明确命令在哪个目录运行；
- `stdout` 和 `stderr` 都要返回，否则模型看不到失败原因；
- 输出需要截断，避免一次命令把整个 Context Window 填满。

这段代码暂时没有实现权限确认、命令沙箱、超时和子进程取消。因为 `bash` 几乎可以做当前用户能做的任何事情，本例只能在专用演示目录中运行，不能直接接收不可信用户的任务。

工具的能力边界，就是 Agent 的能力边界。一个看似简单的 `bash` 工具，实际上打开了非常宽的权限面。

## 用裸 fetch 调用模型

这一讲不安装 Anthropic SDK，直接使用 `fetch`。这样可以看到消息和工具定义究竟怎样进入请求。

先读取环境变量：

```ts
const baseURL = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"
const apiKey = process.env.ANTHROPIC_API_KEY
const model = process.env.ANTHROPIC_MODEL

if (!apiKey || !model) {
  throw new Error("Missing ANTHROPIC_API_KEY or ANTHROPIC_MODEL")
}
```

模型调用函数只负责协议通信：

```ts
async function callModel(messages: Message[]): Promise<AssistantMessage> {
  const response = await fetch(`${baseURL}/v1/messages`, {
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
      tools,
    }),
  })

  if (!response.ok) {
    throw new Error(`Model request failed: ${response.status} ${await response.text()}`)
  }

  return (await response.json()) as AssistantMessage
}
```

此时 `callModel()` 不保存状态、不执行工具，也不决定是否继续。它只做一件事：

```text
Message[] → HTTP request → AssistantMessage
```

把协议调用和 Agent Loop 分开，循环就会变得非常容易阅读。

## 消息是唯一的状态

模型没有记住前一次工具调用。真正保存状态的是应用中的 `messages` 数组：

```ts
const messages: Message[] = [
  {
    role: "user",
    content: task,
  },
]
```

每一次模型输出都必须进入数组：

```ts
const assistant = await callModel(messages)
messages.push({
  role: "assistant",
  content: assistant.content,
})
```

每一次工具结果也必须进入数组：

```ts
messages.push({
  role: "user",
  content: [
    {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: result,
    },
  ],
})
```

假设模型先请求 `ls`，再请求 `cat agent.ts`，第三次模型调用收到的并不是最后一条命令结果，而是从用户任务开始的完整轨迹：

```text
user: 你是谁？
assistant: tool_use bash("ls")
user: tool_result "agent.ts"
assistant: tool_use bash("cat agent.ts")
user: tool_result "...source code..."
```

模型之所以能根据第一次观察结果决定第二个动作，是因为第一次行动和观察仍然存在于消息历史中。

这份消息数组既是对话记录，也是最小 Agent 的工作记忆。

## ReAct：Reason、Act、Observe

现在已经有了模型、工具和消息状态，只差把它们连接起来。

ReAct 可以拆成三个动作：

### Reason

把当前消息历史和工具定义发给模型，让模型生成下一条 Assistant Message。

模型的“思考”不一定会以文字形式暴露。我们真正关心的是它产生的下一步决策：输出答案，还是请求工具。

### Act

如果 Assistant Message 中包含 `tool_use`，宿主程序找到对应工具、验证参数并执行。

### Observe

把执行结果包装成 `tool_result`，追加到消息历史，然后再次调用模型。

三者连接起来就是：

```text
                  ┌────────────────────────────┐
                  │                            │
                  ▼                            │
messages → Reason / model                      │
             │                                 │
             ├─ text only → 输出答案，结束     │
             │                                 │
             └─ tool_use                       │
                    ↓                          │
                  Act / 本地执行               │
                    ↓                          │
                  Observe / tool_result ───────┘
```

这个循环没有预先写死模型应该先 `ls` 还是先 `cat`。控制流由模型输出的数据决定。

## 写出最小 Agent Loop

先从命令行读取任务：

```ts
const task = process.argv.slice(2).join(" ")

if (!task) {
  throw new Error('Usage: bun agent.ts "your task"')
}
```

然后创建消息历史并进入循环：

```ts
const messages: Message[] = [{ role: "user", content: task }]

for (let step = 1; step <= 20; step++) {
  const assistant = await callModel(messages)

  messages.push({
    role: "assistant",
    content: assistant.content,
  })

  const toolUses = assistant.content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  )

  if (toolUses.length === 0) {
    const text = assistant.content
      .filter((block): block is TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")

    console.log(text)
    process.exit(0)
  }

  const toolResults: ToolResultBlock[] = []

  for (const toolUse of toolUses) {
    const result = await executeTool(toolUse)

    toolResults.push({
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: result,
    })
  }

  messages.push({ role: "user", content: toolResults })
}

throw new Error("Agent exceeded 20 steps")
```

这就是 Agent 的核心。

循环中只有一个判断：

```text
模型还要调用工具吗？
```

- 如果不要，输出文本并结束；
- 如果要，执行工具、记录结果，然后继续。

`20` 步上限非常重要。模型可能反复执行相同命令，也可能一直认为任务没有完成。Agent 的停止条件不能只依赖模型自觉结束，宿主程序必须设置硬边界。

### 执行工具

虽然现在只有一个工具，仍然需要验证模型返回的名称和参数：

```ts
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
```

这里没有把工具错误直接抛出并终止程序，而是将错误文本作为观察结果返回模型。

例如命令失败：

```text
$ pnpm test
zsh: command not found: pnpm
```

模型在下一轮读到这个结果后，可能改用：

```text
$ bun test
```

普通程序通常由开发者提前编写错误分支；在 Agent Loop 中，一部分恢复路径可以由模型根据错误观察动态决定。

宿主程序仍然负责不可退让的边界，例如权限、最大步数、超时和危险命令。模型负责的是在边界之内选择下一步，而不是决定边界本身。

## Agent 和 Chat 的区别

现在可以准确比较两者。

### Chat 程序

```text
用户输入
    ↓
模型回答
    ↓
等待下一次用户输入
```

每一轮继续的原因是用户再次发送消息。

### Agent 程序

```text
用户给出目标
    ↓
模型选择动作
    ↓
程序执行动作
    ↓
模型观察结果并选择下一步
    ↓
直到模型输出最终答案或程序触发停止条件
```

Agent 可以在没有新用户输入的情况下继续多个步骤。

两者的差异不在于模型名字，也不在于回答是否聪明，而在于控制流：

| | Chat | Agent |
|---|---|---|
| 每轮由谁触发 | 用户 | 用户启动，模型和工具结果继续驱动 |
| 能否影响外部世界 | 通常不能 | 通过宿主程序提供的工具 |
| 状态包含什么 | 对话消息 | 对话、工具请求、工具结果 |
| 何时结束 | 完成一次回答 | 没有工具调用或达到程序边界 |
| 主要风险 | 错误回答、上下文泄露 | 还包括工具权限和真实副作用 |

可以把最小 Agent 写成一个公式：

```text
Agent = Model + Messages + Tools + Loop + Stop Conditions
```

少了 Tools，它只能说话；少了 Loop，它只能完成一次预先编排的工具往返；少了 Stop Conditions，它可能永远运行。

## 再看“你是谁”

回到开头的任务：

```bash
bun agent.ts "你是谁？"
```

第一轮，消息历史只有：

```text
user: 你是谁？
```

模型没有足够信息，于是生成：

```text
assistant: tool_use bash("ls")
```

宿主程序执行命令并追加观察：

```text
user: tool_result "agent.ts"
```

第二轮，模型知道目录中有 `agent.ts`，于是继续：

```text
assistant: tool_use bash("cat agent.ts")
```

宿主程序再次执行并追加结果。第三轮，模型读取了源代码，不再请求工具，而是返回文本答案。

这段行为没有预先写成：

```ts
if (question === "你是谁？") {
  await runBash("ls")
  await runBash("cat agent.ts")
}
```

程序只定义了可用动作和循环规则。具体行动序列是模型根据当前观察动态生成的。

这就是固定 Workflow 与 Agent 的关键分界：

> Workflow 的控制流主要写在代码里；Agent 的一部分控制流来自模型在运行时产生的结构化决策。

## 这一版刻意没有解决什么

单文件 Agent 已经可以运行，但它离一个可复用框架还有很远。

所有内容都挤在 `agent.ts` 中：

- Anthropic 协议与 Agent Loop 耦合；
- Message 类型只服务于当前 Provider；
- 工具名称通过 `if` 判断分发；
- `bash` 没有权限确认和超时；
- 多个 `tool_use` 只能顺序执行；
- 没有取消机制；
- 没有测试替身，验证依赖真实模型；
- 消息不断增长，没有上下文管理。

这些不是第一讲应该提前消灭的问题。相反，它们会成为后面四讲引入抽象的真实理由。

如果一开始就展示 `ModelProvider`、`AgentContext`、Middleware 和 Skills，大家只能记住很多接口；先看到这个循环真实运行，再拆分它，每一个抽象才有参照物。

## 小结

这一讲从一个裸模型请求开始，得到一个能够观察环境并连续行动的最小 ReAct Agent。

需要记住五件事：

1. **LLM API 本身没有会话状态。** 连续性来自应用保存并重放消息。
2. **Anthropic Messages 使用 Content Block 表达文本、`tool_use` 和 `tool_result`。**
3. **模型不执行工具。** 它只生成结构化调用意图，真正执行的是宿主程序。
4. **ReAct 是一个反馈循环。** 模型决策、程序行动、结果观察不断进入同一份消息历史。
5. **Agent 与 Chat 的核心区别是控制流。** Agent 可以在没有新用户输入时，根据工具结果继续选择下一步。

剥掉所有框架包装，最小 Agent 就是：

```text
把消息发给模型
  ├─ 模型只返回文本 → 输出并结束
  └─ 模型请求工具   → 本地执行
                         ↓
                    把结果放回消息
                         ↓
                       继续
```

下一讲，我们会保留这个循环，但不再让所有东西挤在一个文件里。我们将从单文件中的具体问题出发，逐步建立 Message、Model、ModelProvider 和 Tool 的边界，让这个“能跑的 Agent”变成“可以扩展的 Agent”。
