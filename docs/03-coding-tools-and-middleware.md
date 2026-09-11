# 第三讲：让 Agent 开始写代码

Hello, boys and girls.

前两讲，我们从一个 120 行的 ReAct Loop 出发，把 Message、Model 和 Tool 提取成 Foundation 契约，又用 `Agent` 类封装了循环。现在，这个 Agent 已经有了一副可以继续生长的骨架，但它真正能做的事情仍然很少。

目前它只有一个 `bash` 工具。读取文件要执行 `cat`，修改文件要拼接 Shell 命令，写入一大段代码还要处理引号和转义。模型理论上什么都能做，实际却很容易因为一条复杂命令失败。

这一讲，我们会把通用 Agent 组合成一个真正的 Coding Agent：为它增加读取、写入和精确修改文件的能力，再加入日志中间件，让原本藏在 `Agent.run()` 里的执行过程变得可观察。

我们主要回答五个问题：

1. 通用 Agent 和 Coding Agent 的区别是什么？
2. 为什么已经有 `bash`，还要提供专门的文件工具？
3. `read_file`、`write_file` 和 `str_replace` 应该分别负责什么？
4. 中间件如何介入 Agent 的执行过程？
5. 如何用日志还原一次完整的 ReAct Loop？

## 从一次代码修改开始

假设项目中有这样一个函数：

```ts
export function add(a: number, b: number) {
  return a - b
}
```

我们希望直接告诉 Agent：

```text
修复 add 函数，并运行测试确认结果。
```

一个 Coding Agent 通常需要完成下面几步：

```text
读取源码
   ↓
理解问题
   ↓
修改文件
   ↓
运行测试
   ↓
根据测试结果决定是否继续
```

在当前版本中，模型只能把每一步都翻译成 Shell 命令：

```bash
cat src/math.ts
python -c "..."
bun test
```

这当然可以工作，但它把“读取文件”和“修改代码”变成了“生成一段正确的 Shell”。模型除了理解任务，还必须处理命令语法、字符串转义和不同运行环境之间的差异。

更重要的是，宿主程序只看到模型调用了 `bash`，很难判断它真正想做什么：

```text
bash: cat src/math.ts       真实意图：读取文件
bash: python -c "..."       真实意图：修改文件
bash: bun test              真实意图：运行命令
```

工具不只是能力的入口，也是在表达模型当前准备采取的动作。与其把所有动作都藏进 `bash`，不如给常见的编码动作明确的名字。

## Coding Agent 的四个工具

这一版提供四个工具：

| 工具 | 职责 |
|---|---|
| `bash` | 执行命令、运行测试和构建 |
| `read_file` | 读取文件内容 |
| `write_file` | 创建文件或完整写入内容 |
| `str_replace` | 精确替换已有文件中的一段内容 |

它们都实现 Foundation 中的同一个 `Tool` 契约：

```ts
export interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  invoke(input: Record<string, unknown>): Promise<unknown>
}
```

Foundation 只规定工具长什么样，不关心它读取的是文件、执行的是命令，还是调用了远程服务。四个具体工具属于 Coding 层，因为它们提供的是编码任务需要的能力。

```text
Foundation                         Coding

Tool 契约                          bash
                                  read_file
                                  write_file
                                  str_replace
```

Agent 层仍然只认识 `Tool[]`。即使以后把这些工具换成数据库查询、浏览器操作或内部 API，ReAct Loop 也不需要改变。

### read_file：把观察变成明确动作

`read_file` 接收文件路径，返回文件内容：

```ts
export const readFileTool: Tool = {
  name: "read_file",
  description: "读取指定文件的文本内容。",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "需要读取的文件路径",
      },
    },
    required: ["path"],
  },
  async invoke(input) {
    const path = input.path
    if (typeof path !== "string" || path.length === 0) {
      throw new Error("path must be a non-empty string")
    }

    const file = Bun.file(path)
    if (!(await file.exists())) {
      throw new Error(`File not found: ${path}`)
    }

    return file.text()
  },
}
```

模型调用它时，意图非常清楚：

```json
{
  "type": "tool_call",
  "id": "tool_01",
  "name": "read_file",
  "input": {
    "path": "src/math.ts"
  }
}
```

如果以后需要记录文件访问、限制可读目录或者为读取结果增加行号，我们可以围绕 `read_file` 处理，而不必解析一段任意 Shell 命令。

### write_file：写入完整内容

`write_file` 适合创建新文件，或者在已经准备好完整内容时覆盖文件：

```ts
import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"

export const writeFileTool: Tool = {
  name: "write_file",
  description: "将完整内容写入指定文件。",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  async invoke(input) {
    const path = input.path
    const content = input.content

    if (
      typeof path !== "string" ||
      path.length === 0 ||
      typeof content !== "string"
    ) {
      throw new Error("path must be non-empty and content must be a string")
    }

    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, content)
    return `Wrote ${path}`
  },
}
```

它的输入很直接，但代价也很明显：为了修改一行代码，模型需要重新生成整个文件。文件越长，消耗的 Token 越多，也越容易无意中改动无关内容。

所以还需要一个更适合局部修改的工具。

### str_replace：只修改目标片段

`str_replace` 接收原始文本和替换文本。省略与前两个工具重复的字符串参数校验后，核心执行逻辑如下：

```ts
export const strReplaceTool: Tool = {
  name: "str_replace",
  description: "替换文件中唯一匹配的一段文本。",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      old: { type: "string" },
      new: { type: "string" },
    },
    required: ["path", "old", "new"],
  },
  async invoke(input) {
    const path = input.path as string
    const oldText = input.old as string
    const newText = input.new as string
    const file = Bun.file(path)

    if (!(await file.exists())) {
      throw new Error(`File not found: ${path}`)
    }

    const content = await file.text()
    const occurrences = content.split(oldText).length - 1
    if (occurrences !== 1) {
      throw new Error(
        `old text must appear exactly once, found ${occurrences}`,
      )
    }

    await Bun.write(path, content.replace(oldText, newText))
    return `Updated ${path}`
  },
}
```

修复开头的 `add` 函数时，模型不必重写整个文件，只需要请求：

```json
{
  "name": "str_replace",
  "input": {
    "path": "src/math.ts",
    "old": "return a - b",
    "new": "return a + b"
  }
}
```

这里的“唯一匹配”很重要。如果 `old` 在文件中出现多次，工具不应该猜测模型想改哪一处，而应该返回错误，让模型读取更多上下文后重新尝试。

工具失败不代表 Agent 立即失败。错误会被转换成 `tool_result` 放回消息历史，模型可以根据这个观察结果决定下一步：

```text
str_replace: old text appears 2 times
        ↓
模型观察错误
        ↓
重新读取更完整的代码
        ↓
使用更精确的 old 再次调用
```

这仍然是 ReAct：行动产生观察，观察影响下一次推理。

### bash：保留开放能力

有了三个文件工具，并不意味着可以删除 `bash`。

文件工具适合表达常见且结构明确的动作，`bash` 则保留了开放能力：运行测试、执行构建、查看 Git 状态，或者调用项目已有的脚本。

`bash` 的结果始终保留退出码。即使命令已经输出了错误信息，模型也能区分测试通过与测试失败：

```text
exit 1
3 tests passed, 1 test failed
```

```text
结构化工具                         开放工具

read_file                         bash
write_file          +             bun test
str_replace                       bun run check
                                  git diff
```

Coding Agent 不是在二者之间二选一，而是让明确动作使用明确工具，让暂时没有专用接口的操作仍然可以通过 `bash` 完成。

把四个工具组合起来：

```ts
export function createCodingAgent(model: Model): Agent {
  return new Agent(
    model,
    CODING_PROMPT,
    [bashTool, readFileTool, writeFileTool, strReplaceTool],
  )
}
```

现在，通用的 `Agent` 没有变，但它已经拥有了一组面向编码任务的动作。

## 能执行，还不等于能看见

再次运行刚才的任务：

```text
修复 add 函数，并运行测试确认结果。
```

Agent 在内部可能已经完成了完整循环：

```text
Model → read_file → Model → str_replace → Model → bash → Model
```

但如果终端最后只打印一句“已经修复”，我们很难回答下面的问题：

- 模型一共调用了几次？
- 它为什么选择了 `str_replace`？
- 哪个工具执行得最慢？
- Agent 是否做了重复操作？
- 最终结果之前经历了多少步？

最直接的做法是在 `Agent.run()` 中不断增加 `console.log()`：

```ts
console.log("calling model")
const assistant = await this.model.invoke(...)

console.log("calling tool", toolCall.name)
const result = await tool.invoke(toolCall.input)
```

这可以临时解决问题，但日志代码会和循环逻辑混在一起。以后想把日志发送到文件、OpenTelemetry 或远程服务，还要继续修改 Agent。

日志关心的是 Agent 执行过程中发生了什么，不应该成为 ReAct Loop 本身的一部分。

## Middleware：介入生命周期

Middleware 是一组位于执行流程中的扩展点。Agent 在到达特定位置时调用它们，中间件因此可以观察一次运行，而不必接管整个循环。

这一版定义四组生命周期，共八个 Hook：

```text
beforeAgentRun
    ↓
beforeAgentStep
    ↓
beforeModel → Model → afterModel
                         ↓
             beforeTool → Tool → afterTool
                         ↓
afterAgentStep
    ↓
下一步，或者 afterAgentRun
```

它们分别回答不同层次的问题：

| 生命周期 | 发生时机 | 日志可以记录什么 |
|---|---|---|
| `beforeAgentRun` | 一次任务开始 | 用户任务、开始时间 |
| `beforeAgentStep` | 每轮推理开始 | 当前步骤、消息数量 |
| `beforeModel` | 调用模型前 | 模型名称、工具数量 |
| `afterModel` | 模型返回后 | 文本或工具请求 |
| `beforeTool` | 工具执行前 | 工具名称、输入参数 |
| `afterTool` | 工具执行后 | 执行结果、耗时 |
| `afterAgentStep` | 当前轮结束 | 本轮是否调用工具 |
| `afterAgentRun` | 模型给出最终回答 | 总步骤数、总耗时 |

Agent Run、Agent Step、Model 和 Tool 各自都有开始与结束。中间件还需要知道当前消息历史和执行到了第几步，因此先定义一个贯穿本次运行的 Context：

```ts
export type AgentContext = {
  messages: Message[]
  step: number
}
```

再用一个接口把生命周期扩展点交给外部：

```ts
export interface AgentMiddleware {
  beforeAgentRun?(context: AgentContext): Promise<void> | void
  afterAgentRun?(context: AgentContext): Promise<void> | void

  beforeAgentStep?(context: AgentContext, step: number): Promise<void> | void
  afterAgentStep?(context: AgentContext, step: number): Promise<void> | void

  beforeModel?(context: AgentContext): Promise<void> | void
  afterModel?(
    context: AgentContext,
    message: AssistantMessage,
  ): Promise<void> | void

  beforeTool?(
    context: AgentContext,
    call: ToolCallContent,
  ): Promise<void> | void
  afterTool?(
    context: AgentContext,
    call: ToolCallContent,
    result: ToolResultContent,
  ): Promise<void> | void
}
```

所有方法都是可选的。一个中间件只实现自己关心的生命周期即可。

这里把 `afterAgentRun` 定义为“Agent 已经得到最终回答”，所以模型请求失败或超过最大步骤时不会调用它。异常继续向上抛给 CLI；生命周期中间件暂时只描述正常执行路径。

中间件和工具解决的是不同问题：

```text
Tool                              Middleware

被模型主动选择                    由 Agent 在固定时机调用
完成一个具体动作                  观察或影响执行过程
结果进入消息历史                  通常不直接成为对话消息
例如 read_file                    例如日志、统计、Tracing
```

模型可以决定是否调用 `read_file`，却不会决定是否记录日志。日志是宿主程序对整个执行过程施加的能力。

## 在 Agent Loop 中运行中间件

`Agent` 接收一个中间件数组：

```ts
export class Agent {
  constructor(
    readonly model: Model,
    readonly prompt: string,
    readonly tools: Tool[],
    readonly maxSteps = 20,
    readonly middlewares: AgentMiddleware[] = [],
  ) {}
}
```

然后在循环中的对应位置依次调用 Hook：

```ts
for (const middleware of this.middlewares) {
  await middleware.beforeModel?.(context)
}

const assistant = await this.model.invoke({
  prompt: this.prompt,
  messages: this.messages,
  tools: this.tools,
})

for (const middleware of this.middlewares) {
  await middleware.afterModel?.(context, assistant)
}
```

工具执行过程同样如此：

```ts
for (const middleware of this.middlewares) {
  await middleware.beforeTool?.(context, toolCall)
}

const result = await tool.invoke(toolCall.input)

for (const middleware of this.middlewares) {
  await middleware.afterTool?.(context, toolCall, toolResult)
}
```

中间件按照注册顺序执行。当前版本先让它们串行运行，因为执行顺序清晰，也更容易调试：

```text
[loggerA, loggerB]

loggerA.beforeModel
loggerB.beforeModel
Model
loggerA.afterModel
loggerB.afterModel
```

这一讲中的日志中间件只观察流程，不修改 Message，也不改变工具执行结果。后面的课程需要动态扩展 Agent 行为时，可以继续使用同一组生命周期，而不必重新拆开 `Agent.run()`。

## 实现日志中间件

日志中间件需要维护少量只属于本次运行的统计信息：开始时间、当前步骤、模型调用次数和工具调用次数。

```ts
export function createLoggingMiddleware(): AgentMiddleware {
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
      console.log("Agent started")
    },

    beforeAgentStep(_context, step) {
      console.log(`Step ${step}`)
    },

    beforeModel(context) {
      modelCalls += 1
      console.log(`Model ← ${context.messages.length} messages`)
    },

    beforeTool(_context, call) {
      toolCalls += 1
      toolStartedAt.set(call.id, performance.now())
      console.log(`Tool → ${call.name} ${JSON.stringify(call.input)}`)
    },

    afterTool(_context, call) {
      const toolStart = toolStartedAt.get(call.id) ?? performance.now()
      const elapsed = performance.now() - toolStart
      toolStartedAt.delete(call.id)
      console.log(`Tool ← ${call.name} ${elapsed.toFixed(0)}ms`)
    },

    afterAgentRun(context) {
      const elapsed = performance.now() - startedAt
      console.log(
        `Agent finished: ${context.step} steps, ` +
          `${modelCalls} model calls, ${toolCalls} tool calls, ` +
          `${elapsed.toFixed(0)}ms`,
      )
    },
  }
}
```

现在，把它交给 Coding Agent：

```ts
export function createCodingAgent(model: Model): Agent {
  return new Agent(
    model,
    CODING_PROMPT,
    [bashTool, readFileTool, writeFileTool, strReplaceTool],
    20,
    [createLoggingMiddleware()],
  )
}
```

再次执行任务时，终端不再只有最终答案：

```text
Agent started
Step 1
Model ← 1 messages
Tool → read_file { path: "src/math.ts" }
Tool ← read_file 2ms

Step 2
Model ← 3 messages
Tool → str_replace { path: "src/math.ts", ... }
Tool ← str_replace 1ms

Step 3
Model ← 5 messages
Tool → bash { command: "bun test" }
Tool ← bash 183ms

Step 4
Model ← 7 messages
Agent finished: 4 steps, 4 model calls, 3 tool calls, 624ms
```

这段日志几乎就是 ReAct Loop 的运行轨迹：模型先观察文件，再采取修改动作，接着运行测试获得新的观察，最后给出答案。

我们在第一讲中通过阅读代码理解循环；现在可以直接通过生命周期日志看到循环。

## 中间件还能做什么

日志只是最容易理解的例子。同一组生命周期还可以支持很多真实需求：

### 记录模型请求

线上 Agent 偶尔会做出意外选择。如果保存调用模型前的消息数量、模型名称和当前步骤，就能定位问题发生在哪一轮；在允许保存完整请求的环境中，还可以复现当时的上下文。

### 检查工具调用

在 `beforeTool` 中可以检查文件路径或命令。例如拒绝写入工作目录之外的文件，或者要求用户确认高风险命令。

这些能力涉及权限边界，不能只靠一条简单的 `if` 就认为已经安全，因此这一讲只观察工具调用，不实现完整的安全策略。

### 发现慢工具

一次 Agent 任务可能慢在模型，也可能慢在测试、网络或文件系统。记录每次工具调用的耗时后，可以快速找到真正的瓶颈，并为执行时间过长的工具增加超时。

### 统计 Agent 步骤

如果一个简单任务使用了十几步，可能是工具描述不清、模型反复读取同一文件，或者某个工具持续返回无法修复的错误。`afterAgentRun` 汇总的步骤数和调用次数，可以帮助我们从“最终成功了”继续追问“它是怎样成功的”。

这些场景的共同点是：它们横跨模型、工具或整个 Agent Run，却不属于任何一个具体工具。Middleware 为这些横切需求提供了统一位置。

## 从通用 Agent 到 Coding Agent

回顾这一讲，我们没有改变模型协议，也没有改变 ReAct Loop 的基本形状。

我们做了两件事。

第一，为 Agent 组合了四个 Coding 工具：

```text
bash          执行命令
read_file     读取文件
write_file    写入完整内容
str_replace   精确修改片段
```

模型仍然只负责提出 `tool_call`，宿主程序仍然负责执行工具并返回 `tool_result`。区别在于，模型现在可以用更清晰、更稳定的动作完成编码任务。

第二，在 Agent Loop 中加入了 Middleware 生命周期：

```text
Agent Run
  └── Agent Step
        ├── Model
        └── Tool
```

日志中间件借助这些扩展点记录模型调用、工具执行和步骤统计，却没有侵入任何具体工具，也没有把日志逻辑写死在 Agent 中。

到这里，我们已经拥有了一个可以读取文件、修改代码、运行测试，并且能够展示执行轨迹的 Coding Agent。

但它仍然只能依赖固定的 System Prompt 完成任务，也不会维护一份明确的工作计划。下一讲，我们会继续使用 Middleware：根据任务动态注入 Skill，并让 Agent 用 Todo 管理更长的执行过程。
