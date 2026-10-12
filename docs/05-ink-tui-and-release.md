# 第五讲：把 Agent 变成一个可以使用的产品

Hello, boys and girls.

不知不觉，我们已经走到了最后一节。

第一节，我们用一百多行代码跑通了最小 ReAct 循环；第二节把它拆成 Foundation、Agent、Coding 和 CLI 四层；第三节加入 Coding Tools 与 Middleware；第四节又用 Skill 和 Todo，让 Agent 学会按照一套方法完成较长的任务。

现在，桌面上已经摆满了零件。Agent 会思考、会调用工具，也能维护自己的工作计划，但使用它的方式仍然很像在运行一段示例代码：

```bash
bun run start -- "检查这个项目并修复测试"
```

任务执行结束后，终端一次性打印出答案，程序随即退出。如果还想继续追问，只能重新启动。

最后一节，我们不再发明新的 Agent 概念。让我们稍微放松一点，给它装上一个终端界面，把代码和 Skill 一起打进可执行文件，最后把命令缩短成：

```bash
npx qqq-agent
```

这一次，我们要把前四节完成的工程收起来，变成一个真的可以交给别人使用的产品。

## 先看看最后的样子

启动程序后，我们希望看到一个持续存在的交互界面：

```text
┌ qqq · Coding Agent ──────────────────────────────────────┐
│                                                          │
│ You                                                      │
│ 帮我检查 workspace/npm-release-demo 的发布准备情况        │
│                                                          │
│ Agent                                                    │
│ 我先读取 npm-release Skill，再检查项目状态。               │
│                                                          │
│ ◇ read_file  skills/npm-release/SKILL.md                 │
│ ◆ bash       bun test                                    │
│                                                          │
│ Todo                                                     │
│ ✓ 检查版本与工作区                                        │
│ ● 运行发布前检查                                          │
│ ○ 检查 npm 包内容                                         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ › 接着检查一下 CHANGELOG                                 │
└──────────────────────────────────────────────────────────┘
```

它不需要像 Web 应用一样复杂，但至少应该做到三件事：

- 对话、工具调用和 Todo 有各自清楚的位置；
- Agent 工作时，界面会随着每一步继续更新；
- 一次任务结束后，可以直接输入下一条消息。

前四节已经完成了这些信息的生产。第五节真正要做的，是让它们从 Agent 流向 UI。

## Ink：用 React 编写终端界面

[Ink](https://github.com/vadimdemedes/ink) 可以理解为终端里的 React。我们仍然编写组件、维护 State、使用 Hook，只是最终渲染的不是 DOM，而是终端中的文字和布局。

先安装这一节需要的依赖：

```bash
bun add ink react ink-text-input ink-spinner
bun add -d @types/react
```

然后让 TypeScript 接受 TSX：

```json
{
  "compilerOptions": {
    "jsx": "react-jsx"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts"]
}
```

一个最小的 Ink 程序并不神秘：

```tsx
import { render, Text } from "ink"

function App() {
  return <Text color="cyan">qqq · Coding Agent</Text>
}

render(<App />)
```

运行后，Ink 会把组件渲染到终端中。State 发生变化时，它只更新需要变化的部分。

我们的界面也可以先从一棵很小的组件树开始：

```text
App
├── Header
├── MessageHistory
├── TodoPanel
├── RunningIndicator
├── InputBox
└── Footer
```

每个组件只做一件事：`MessageHistory` 显示消息，`TodoPanel` 显示当前计划，`InputBox` 接收下一条输入。`App` 不负责理解模型协议，它只负责把这些部分组合起来。

## UI 缺少的不是组件，而是过程

当前的 `Agent.run()` 只返回最终文本：

```ts
const answer = await agent.run(text)
console.log(answer)
```

在 `run()` 内部，Agent 可能已经经历了很多步：

```text
user message
    ↓
assistant + tool_call
    ↓
tool_result
    ↓
assistant + tool_call
    ↓
tool_result
    ↓
final assistant
```

这些消息都进入了 Transcript，只是调用者要等到最后才能得到一个字符串。CLI 因此看不到中间的工具调用，TUI 也不知道什么时候应该更新。

我们不需要再发明一套 UI 专用协议。第二节定义的 `Message` 已经是 Agent 内部的统一消息类型，第五节只需要让每条新消息在产生时流出来。

为 `Agent` 增加一个 `stream()`：

```ts
async *stream(text: string): AsyncGenerator<Message> {
  const user: UserMessage = {
    role: "user",
    content: [{ type: "text", text }],
  }

  this.messages.push(user)
  yield user

  const context: AgentContext = {
    messages: this.messages,
    step: 0,
  }

  await this.beforeAgentRun(context)

  for (let step = 1; step <= this.maxSteps; step += 1) {
    context.step = step

    const assistant = await this.invokeModel(context)
    this.messages.push(assistant)
    yield assistant

    const toolCalls = getToolCalls(assistant)
    if (toolCalls.length === 0) {
      await this.afterAgentRun(context)
      return
    }

    const toolMessage = await this.act(context, toolCalls)
    this.messages.push(toolMessage)
    yield toolMessage
  }

  throw new Error(`Agent exceeded ${this.maxSteps} steps`)
}
```

这里的 `invokeModel()` 只是把上一节 `run()` 中已有的模型调用和 Middleware 生命周期收进一个方法。Agent 的推理过程没有改变，改变的是调用者终于可以观察它。

这是一条**消息级事件流**：一条完整的 `UserMessage`、`AssistantMessage` 或 `ToolMessage` 产生后，UI 收到一次更新。它还不是模型逐 Token 返回的流式输出，也不需要立刻引入 `text_delta`、`tool_call_delta` 等更复杂的事件。

对于这一节的 TUI，消息级流已经足够：等待模型时显示 Spinner，消息产生后立即渲染。未来真正需要逐字输出时，我们再让 Provider 提供更细的流式事件协议。

原来的 `run()` 也可以继续保留：

```ts
async run(text: string): Promise<string> {
  let answer = ""

  for await (const message of this.stream(text)) {
    if (message.role !== "assistant") {
      continue
    }

    const text = getText(message)
    if (text) {
      answer = text
    }
  }

  return answer
}
```

这样，原来的单次调用方式仍然可用，新的 TUI 则消费同一个 Agent 的消息流。

## 用一个 Hook 连接 Agent 和界面

在 React 中，我们把运行 Agent 的过程收进 `useAgentLoop`：

```tsx
function useAgentLoop(agent: Agent) {
  const [messages, setMessages] = useState<Message[]>([])
  const [running, setRunning] = useState(false)

  const submit = useCallback(
    async (text: string) => {
      if (!text.trim() || running) {
        return
      }

      setRunning(true)

      try {
        for await (const message of agent.stream(text)) {
          setMessages((current) => [...current, message])
        }
      } finally {
        setRunning(false)
      }
    },
    [agent, running],
  )

  return { messages, running, submit }
}
```

这个 Hook 是 CLI 层和 Agent 层的边界：

```text
InputBox
    ↓ submit(text)
useAgentLoop
    ↓ agent.stream(text)
Agent
    ↓ Message
useAgentLoop
    ↓ setMessages
MessageHistory
```

Agent 不知道 Ink 的存在，Ink 也不需要知道 ReAct 循环怎样实现。它们只通过 `stream()` 返回的 `Message` 连接。

等待下一条输入时，`InputBox` 保持可见；Agent 工作时，可以暂时禁用提交并显示状态：

```tsx
function RunningIndicator({ running }: { running: boolean }) {
  if (!running) {
    return null
  }

  return (
    <Text color="cyan">
      <Spinner type="dots" /> Agent is working…
    </Text>
  )
}
```

这里不允许同时发起第二个任务。因为当前 `Agent` 维护着一份有顺序的 Transcript，两次并行 `run()` 会把不同任务的消息交叉写入同一个历史。等当前任务结束，再接受下一条输入，行为反而更容易理解。

## Transcript 就是界面的数据源

第二节坚持让 `Message` 成为对话历史的唯一来源，现在这件事开始体现价值。

`MessageHistory` 不需要另外维护一份“用户消息”“模型回复”和“工具日志”。它只要根据消息的 `role` 与 Content Block 渲染：

```tsx
function MessageView({ message }: { message: Message }) {
  if (message.role === "user") {
    return <UserMessageView message={message} />
  }

  if (message.role === "assistant") {
    return <AssistantMessageView message={message} />
  }

  if (message.role === "tool") {
    return <ToolMessageView message={message} />
  }

  return null
}
```

一条 `AssistantMessage` 可以同时包含文本和工具调用：

```tsx
function AssistantMessageView({ message }: Props) {
  return (
    <Box flexDirection="column">
      {message.content.map((block, index) => {
        if (block.type === "text") {
          return <Text key={index}>{block.text}</Text>
        }

        return (
          <Text key={block.id} color="yellow">
            ◇ {block.name} {formatInput(block.input)}
          </Text>
        )
      })}
    </Box>
  )
}
```

工具执行结果来自下一条 `ToolMessage`。UI 可以通过 `tool_call_id` 找到对应调用，也可以在入门版本里按消息顺序显示结果摘要。

第三节的 `LoggingMiddleware` 仍然适合普通 CLI，但在 TUI 中继续向标准输出打印日志会打乱 Ink 的界面，而且同一条工具调用会显示两次。因此，创建 TUI Agent 时不再启用日志中间件，Message Stream 接替它成为界面的观察入口。

这不是删除 Middleware。日志依然可以写入文件，或者在非交互模式中启用；只是“给谁看”发生了变化。

## Todo 不需要再复制一份状态

第四节的 Todo 由 `todo_write` 工具维护。现在我们想把它固定显示在右侧或消息下方。

最直接的做法，是从 Transcript 中找到最近一次 `todo_write` 调用：

```ts
function findLatestTodos(messages: Message[]): TodoItem[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== "assistant") {
      continue
    }

    const call = message.content.find(
      (block) =>
        block.type === "tool_call" && block.name === "todo_write",
    )

    if (call && Array.isArray(call.input.todos)) {
      return call.input.todos as TodoItem[]
    }
  }

  return []
}
```

正式代码还会验证每个 Todo 的字段，但思路很简单：Todo 本来就已经作为工具调用存在于消息历史中，UI 只需要做一次 Projection，把它投影成适合展示的列表。

```text
Transcript
├── 对话文本 ──────────> MessageHistory
├── tool_call/result ──> ToolView
└── todo_write ────────> TodoPanel
```

如果再让 UI 单独维护 `todos`，就会出现两个真相：Agent 已经更新了计划，但 UI 忘记同步；或者 UI 清空了列表，Agent 下一轮仍然看到旧计划。让 Transcript 继续做 Single Source of Truth，会简单得多。

## 让对话留在终端里

现在 `App` 可以把这些部分组合起来：

```tsx
function App({ agent }: { agent: Agent }) {
  const { messages, running, submit } = useAgentLoop(agent)
  const todos = findLatestTodos(messages)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header />
      <MessageHistory messages={messages} />
      <TodoPanel todos={todos} />
      <RunningIndicator running={running} />
      <InputBox disabled={running} onSubmit={submit} />
      <Footer />
    </Box>
  )
}
```

入口文件只负责准备 Model、Agent 和 Ink：

```tsx
const model = createModelFromEnvironment()
const agent = createCodingAgent(model, {
  logging: false,
})

render(<App agent={agent} />)
```

用户每次提交输入，都调用同一个 `Agent` 实例。它内部的 Transcript 不会随着一次 `submit()` 结束而消失，因此下一轮自然拥有前文：

```text
You: 检查这个项目
Agent: 测试已经通过，但 CHANGELOG 还没有更新。

You: 那就帮我补上
Agent: 好，我会基于刚才检查到的版本继续处理。
```

我们终于从“一条命令对应一次任务”，走到了持续对话。

## 从 TypeScript 源码到一个可执行文件

开发时，下面的命令已经可以启动 TUI：

```bash
bun run dev
```

但用户不应该先克隆仓库、安装依赖，再寻找入口文件。我们希望 npm 包里只有一个可以直接启动的命令。

Bun 的 [`--compile`](https://bun.sh/docs/bundler/executables) 可以把入口、依赖和 Bun Runtime 一起编译成独立可执行文件：

```bash
bun build src/cli/index.tsx \
  --compile \
  --outfile dist/bin/qqq-agent
```

不过，这个工程还有一类内容不会因为 TypeScript import 自动进入 Bundle：

```text
skills/npm-release/SKILL.md
```

Skill 是运行时通过文件系统发现的资源，不是普通的 TypeScript 模块。如果只编译源码，本地开发时一切正常，发布后的 Agent 却会发现 Skill 文件消失了。

对于需要随产品发布的内置 Skill，我们显式把它作为文件导入：

```ts
import npmReleaseSkillPath from "../../skills/npm-release/SKILL.md" with {
  type: "file",
}

const BUNDLED_SKILLS = [npmReleaseSkillPath]
```

开发时，`npmReleaseSkillPath` 指向项目中的原始文件；使用 `--compile` 后，Bun 会把文件内容嵌入可执行文件，并返回一个可以继续通过 `node:fs` 读取的内部路径。

Skill Reader 因此增加一种从明确文件列表读取 Metadata 的方式：

```ts
export async function discoverSkillFiles(
  skillFiles: string[],
): Promise<SkillMetadata[]> {
  return Promise.all(
    skillFiles.map(async (path) =>
      parseSkill(await readFile(path, "utf8"), path),
    ),
  )
}
```

动态安装的 Skill 仍然可以扫描目录，内置 Skill 则在构建时明确列出。一个真正可交付的程序，不只包含源码依赖，也要带上运行时需要的 Prompt、Skill、模板和其他资源。

## 告诉 npm 这个包提供什么命令

`package.json` 的 [`bin`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin) 字段负责把命令名映射到可执行文件：

```json
{
  "name": "qqq-agent",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "qqq-agent": "dist/bin/qqq-agent"
  },
  "files": [
    "dist/bin/qqq-agent"
  ],
  "scripts": {
    "dev": "bun src/cli/index.tsx",
    "check": "bun test && bun run check:types",
    "build:bin": "bun build src/cli/index.tsx --compile --outfile dist/bin/qqq-agent",
    "prepublishOnly": "bun run check && bun run build:bin"
  }
}
```

这里发生了三件事：

- `bin` 声明安装这个包后得到的命令；
- `files` 限制真正进入 npm 包的内容；
- `prepublishOnly` 在发布前重新检查并构建，避免把旧产物发出去。

准备发布时，需要移除原来的 `private: true`，并把 `name` 换成自己实际拥有的 npm 包名。如果使用 Scope，还可以增加：

```json
{
  "name": "@your-scope/qqq-agent",
  "publishConfig": {
    "access": "public"
  }
}
```

无论包名是什么，`bin` 中的键仍然可以叫 `qqq-agent`，它才是用户最终输入的命令。

## 发布之前，先像用户一样安装一次

不要用 `npm publish` 作为第一次完整测试。npm 提供了一个更安全的中间步骤：[`npm pack`](https://docs.npmjs.com/cli/v11/commands/npm-pack/)。

```bash
npm pack --dry-run
```

它会列出即将进入包中的文件。我们应该看到可执行文件，而不应该看到源码、测试、`.env` 或工作空间内容。

确认清单后，生成本地 Tarball：

```bash
npm pack
```

然后让 [`npx`](https://docs.npmjs.com/cli/v11/commands/npx/) 从这个本地包启动命令：

```bash
npx --yes --package ./qqq-agent-1.0.0.tgz qqq-agent
```

这一步非常接近真实用户的路径：npm 解包、读取 `bin`、创建命令入口，再启动打包后的可执行文件。进入 TUI 后，可以用第四节的示例继续验证：

```text
请检查 workspace/npm-release-demo 的发布准备情况，
但不要真正发布。
```

我们至少要看到：

```text
TUI 正常启动
        ↓
模型可以响应
        ↓
工具调用持续出现在界面中
        ↓
npm-release Skill 可以被发现和读取
        ↓
Todo 随任务推进而更新
        ↓
任务结束后仍可继续输入
```

这条链路通过后，发布动作反而只剩最后一步：

```bash
npm publish
```

发布完成，用户便可以运行：

```bash
npx qqq-agent
```

`npm publish` 会改变远程状态，所以它不应该被构建脚本自动执行。检查、构建和 `npm pack` 可以自动化，真正发布仍然留给人确认。

## 关于“一个二进制跑遍所有平台”

`bun build --compile` 默认生成当前操作系统与 CPU 架构对应的可执行文件。在 macOS ARM 上构建出的文件，不能直接作为 Linux x64 或 Windows 版本使用。

这一节先完成当前平台上的完整闭环：

```text
源码 → 可执行文件 → npm Tarball → npx 启动
```

当它真的要提供给更多人时，可以再使用 Bun 的 `--target`，通过 CI 分别构建 macOS、Linux 和 Windows 版本，并按平台选择对应二进制。那是发布工程的下一步，而不是今天必须塞进 Agent 核心的复杂度。

## 回头看看这五节

现在再回到第一节的单文件 Agent，会发现真正保留下来的核心其实一直没有变化：

```text
把用户消息交给模型
        ↓
模型决定回答或调用工具
        ↓
宿主程序执行工具并返回结果
        ↓
继续循环，直到得到最终回答
```

后面的每一层，都只是在回答工程逐渐长大后出现的问题：

```text
第一节  Model、Message、Tool 如何组成最小 ReAct
第二节  如何建立稳定边界，并替换 Provider
第三节  Coding Tools 如何进入 Agent，Middleware 如何观察生命周期
第四节  Skill 如何提供工作方法，Todo 如何保存任务进度
第五节  消息如何流向 Ink，整个工程如何通过 npx 交付
```

我们没有从一个庞大的框架开始，也没有预先设计所有可能的抽象。每次只向前走一步，让一个真实问题推动下一层结构出现。

最后得到的也不只是一个终端界面。它已经拥有一条完整的产品链路：用户输入进入 TUI，Message 穿过 Agent Loop，Provider 连接模型，Tool 接触真实环境，Skill 提供方法，Todo 保存进度，最后所有内容又回到同一份 Transcript 中呈现出来。

```text
User
  ↓
Ink TUI
  ↓
Agent Loop
  ├── Model Provider
  ├── Middleware
  ├── Skills
  ├── Todo
  └── Coding Tools
  ↓
Transcript
  ↓
Ink TUI
```

到这里，我们的 Agent 入门系列就结束了。

关掉文档，打开终端，运行它吧。
