# 第四讲：让 Agent 学会工作

Hello, boys and girls.

上一讲，我们为 Agent 增加了 `bash`、`read_file`、`write_file` 和 `str_replace` 四个工具。它已经可以读取代码、修改文件并运行测试，日志中间件还能把每一步执行过程呈现出来。

但“拥有工具”不等于“知道怎样工作”。

面对一个稍长的任务，Agent 可能直接开始修改代码，没有先阅读项目约定；也可能完成实现后忘记补测试，或者反复检查同一个文件。System Prompt 可以提醒它，但随着项目规则不断增加，把所有知识都塞进每一次模型请求并不是一个好办法。

这一讲，我们会为 Agent 增加两种能力：Skill 为它提供按需加载的工作方法，Todo 帮助它维护一个跨越多轮推理的任务计划。为了实现它们，Middleware 也会从“观察生命周期”进一步演进为“修改模型上下文”。

我们主要回答五个问题：

1. Skill、Tool 和 System Prompt 有什么区别？
2. 为什么 Skill 只注入目录，而不是一次加载全部内容？
3. Middleware 如何影响下一次模型调用？
4. Todo 为什么既需要 Tool，也需要 Middleware？
5. Skill 和 Todo 如何帮助 Agent 完成一个较长的任务？

## 从一个较长的任务开始

假设我们给 Coding Agent 一个新任务：

```text
为 str_replace 增加 count 参数，补充测试，更新 README，
最后运行完整检查。
```

这不再是一次简单的文件修改。Agent 至少需要完成下面几步：

```text
理解现有 Tool 契约
        ↓
阅读 str_replace 实现
        ↓
先补测试，再修改代码
        ↓
更新使用文档
        ↓
运行完整检查
```

第三讲的 Agent 拥有完成这些动作所需的工具，却没有保存这份计划，也不知道这个项目是否要求先写测试。

如果只依赖模型临时推理，执行过程可能变成：

```text
读取 str_replace
        ↓
直接修改代码
        ↓
运行一条测试
        ↓
看到测试通过，结束
```

代码也许可以工作，但“补充测试”和“更新 README”可能已经从 Context 中淡出。任务越长，中间产生的代码、命令输出和错误信息越多，最初要求距离模型的下一次生成就越远。

我们需要分别解决两个问题：

```text
这个项目应该怎样完成开发任务？       Skill
这次任务还有哪些步骤没有完成？       Todo
```

## Tool、Skill 和 Prompt

先区分三个容易混在一起的概念。

### Tool：Agent 能做什么

Tool 是宿主程序开放给模型的动作：

```text
read_file     读取文件
str_replace   修改代码
bash          运行测试
```

模型通过 `tool_call` 请求执行工具，宿主程序执行后返回 `tool_result`。Tool 连接的是模型和外部环境。

### System Prompt：Agent 是谁

System Prompt 描述 Agent 的长期身份和基本行为：

```text
你是一个 Coding Agent。
读取和修改文件时使用专用文件工具；
运行测试、构建或其他命令时使用 bash。
```

它几乎会进入每一次模型调用，适合放稳定、通用且始终需要遵守的规则。

### Skill：Agent 应该怎样工作

Skill 是面向某类任务的工作方法。例如，一个测试 Skill 可以规定：

```text
实现功能前先写失败测试；
确认测试因为目标行为缺失而失败；
只编写使测试通过的最小实现；
最后运行完整检查。
```

它不是新的工具。读取 Skill 后，Agent 使用的仍然是 `read_file`、`str_replace` 和 `bash`。变化的是它组织这些动作的方式。

```text
Tool                 提供行动能力
System Prompt        提供长期身份
Skill                提供特定任务的工作方法
```

如果把所有 Skill 全部写进 System Prompt，模型每次请求都要携带大量当前任务用不到的说明。前端设计、发布流程和数据库迁移规则可能同时出现在上下文中，不仅浪费 Token，也会让真正相关的约束更难被注意到。

因此，Skill 需要按需加载。

## 一个 Skill 长什么样

每个 Skill 是一个独立目录，入口是 `SKILL.md`：

```text
skills/
└── test-driven-development/
    └── SKILL.md
```

`SKILL.md` 分为两部分。开头的 Frontmatter 用于发现和选择 Skill：

```md
---
name: test-driven-development
description: 在实现功能或修复 Bug 时使用，先写失败测试，再完成最小实现。
---
```

正文才是完整工作流程：

```md
# Test-Driven Development

1. 写一个描述目标行为的测试。
2. 运行测试，确认它因为功能尚未实现而失败。
3. 编写使测试通过的最小代码。
4. 再次运行测试。
5. 在测试保持通过的前提下整理代码。
```

Frontmatter 很短，适合放进模型上下文；正文可能很长，只在真正需要时读取。

系统启动时先扫描 Skill 目录，建立一份元数据列表：

```ts
export type SkillMetadata = {
  name: string
  description: string
  path: string
}
```

对于上面的文件，扫描结果类似：

```json
{
  "name": "test-driven-development",
  "description": "在实现功能或修复 Bug 时使用，先写失败测试，再完成最小实现。",
  "path": "skills/test-driven-development/SKILL.md"
}
```

这份列表告诉模型“有哪些 Skill 可以使用”，但还没有把正文加载进来。

## Progressive Disclosure：渐进式加载

Skill 使用一种很常见的上下文管理方式：Progressive Disclosure，可以理解为“需要多少，再加载多少”。

```text
第一层：名称和描述
用于发现当前有哪些 Skill
        ↓
第二层：SKILL.md 正文
任务匹配时读取完整工作流
        ↓
第三层：references、scripts 等资源
正文明确需要时再继续读取
```

Agent 每次调用模型前只看到目录：

```xml
<skills>
  <skill>
    <name>test-driven-development</name>
    <description>在实现功能或修复 Bug 时使用……</description>
    <path>skills/test-driven-development/SKILL.md</path>
  </skill>
</skills>
```

模型发现当前任务需要实现新功能，于是调用已经存在的 `read_file`：

```json
{
  "name": "read_file",
  "input": {
    "path": "skills/test-driven-development/SKILL.md"
  }
}
```

完整 Skill 内容通过普通的 `tool_result` 回到消息历史。Agent 不需要一种新的消息协议，也不需要专门的 `read_skill` 工具。

```text
SkillsMiddleware 注入目录
        ↓
模型选择匹配的 Skill
        ↓
read_file 读取 SKILL.md
        ↓
Skill 内容进入 Transcript
        ↓
模型按照工作流继续调用现有工具
```

这就是渐进式加载的价值：发现成本很低，详细内容只为当前任务支付一次上下文成本。

## Middleware 从观察走向修改

第三讲的日志中间件只读取 `AgentContext`：

```ts
beforeModel?(context: AgentContext): Promise<void> | void
```

SkillsMiddleware 需要在调用模型前，把 Skill 目录追加到本轮 Prompt。它不能直接永久修改 `Agent.prompt`，否则每一轮都可能重复追加相同内容。

因此，在每次模型调用前先建立一个临时的 `ModelContext`：

```ts
const modelContext: ModelContext = {
  prompt: this.prompt,
  messages: this.messages,
  tools: this.tools,
}
```

再允许 `beforeModel` 返回对本轮 Context 的修改：

```ts
export interface AgentMiddleware {
  beforeModel?(
    agentContext: AgentContext,
    modelContext: ModelContext,
  ): Promise<Partial<ModelContext> | void> | Partial<ModelContext> | void
}
```

Agent 按注册顺序运行中间件，并把返回值合并到当前 `modelContext`：

```ts
for (const middleware of this.middlewares) {
  const changes = await middleware.beforeModel?.(context, modelContext)

  if (changes) {
    Object.assign(modelContext, changes)
  }
}

const assistant = await this.model.invoke(modelContext)
```

注意，被修改的是这一次模型调用使用的 `modelContext`，不是 Agent 保存的基础 Prompt：

```text
Agent.prompt
    │ 每一轮重新创建
    ▼
ModelContext.prompt
    │ Middleware 追加本轮内容
    ▼
Model.invoke()
```

下一轮会再次从干净的基础 Prompt 开始，然后重新经过中间件。这样不会因为循环运行十次，就把 Skill 目录重复十次。

日志中间件原来的实现不需要改变。JavaScript 函数可以忽略自己不需要的第二个参数：

```ts
beforeModel(context) {
  console.log(`Model ← ${context.messages.length} messages`)
}
```

Middleware 现在既可以返回 `void` 只观察流程，也可以返回 `Partial<ModelContext>` 影响本轮模型调用。

## 实现 SkillsMiddleware

SkillsMiddleware 负责两件事：Agent Run 开始时发现 Skill，每次调用模型前注入目录。

```ts
export function createSkillsMiddleware(
  skillsDirectory: string,
): AgentMiddleware {
  let skills: SkillMetadata[] = []

  return {
    async beforeAgentRun() {
      skills = await discoverSkills(skillsDirectory)
    },

    beforeModel(_agentContext, modelContext) {
      if (skills.length === 0) {
        return
      }

      return {
        prompt:
          (modelContext.prompt ? `${modelContext.prompt}\n\n` : "") +
          formatSkillsPrompt(skills),
      }
    },
  }
}
```

这里没有替模型选择 Skill。Middleware 只提供名称、描述和路径，是否匹配当前任务仍然由模型决定。

如果项目中有十个 Skill，本轮任务只匹配测试流程，模型只读取一个 `SKILL.md`。这和一次性拼接十份完整文档相比，更符合 Context Window 的使用方式。

Skill 文件会影响模型后续行为，因此应该把它看作代码的一部分：来自当前项目或其他可信目录，经过版本管理和人工审查，而不是随意加载不可信文本。

## Todo：把计划变成状态

Skill 解决了“怎样工作”，接下来解决“工作到哪里了”。

Todo 首先需要一种结构化表示：

```ts
export type TodoStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled"

export type TodoItem = {
  id: string
  content: string
  status: TodoStatus
}
```

对于开头的任务，Agent 可以建立下面的计划：

```json
[
  {
    "id": "tests",
    "content": "为 count 参数补充失败测试",
    "status": "in_progress"
  },
  {
    "id": "implementation",
    "content": "实现有限次数替换",
    "status": "pending"
  },
  {
    "id": "docs",
    "content": "更新 README",
    "status": "pending"
  },
  {
    "id": "check",
    "content": "运行完整检查",
    "status": "pending"
  }
]
```

这份列表不是展示给用户看的临时文案，而是 Agent Runtime 中的一份状态。后面的模型调用需要持续看到它，任务完成时也要更新它。

## Todo 为什么需要 Tool

模型需要主动创建和更新计划，所以我们提供一个 `todo_write` 工具：

```ts
const todoWriteTool: Tool = {
  name: "todo_write",
  description: "创建或更新当前任务的 Todo 列表。",
  inputSchema: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string" },
            status: {
              type: "string",
              enum: [
                "pending",
                "in_progress",
                "completed",
                "cancelled",
              ],
            },
          },
          required: ["id", "content", "status"],
        },
      },
    },
    required: ["todos"],
  },
  async invoke(input) {
    // 校验后更新 Todo Store
  },
}
```

为了让第一版保持清楚，每次调用都提交完整列表并替换旧状态。以后确实需要减少输入长度时，再增加按 `id` 合并等行为。

工具执行后返回一段简短观察：

```text
Todo list updated: 4 items, 1 in_progress, 3 pending.
```

这条结果告诉模型更新已经成功，但它只存在于调用工具的那一轮附近。经过很多次文件读取和命令输出后，Todo 状态仍然可能离当前上下文很远。

所以只有 Tool 还不够。

## Todo 为什么还需要 Middleware

TodoMiddleware 在调用模型前，把当前列表重新放进本轮 Prompt：

```ts
const todoMiddleware: AgentMiddleware = {
  beforeModel(_agentContext, modelContext) {
    if (todos.length === 0) {
      return
    }

    return {
      prompt:
        (modelContext.prompt ? `${modelContext.prompt}\n\n` : "") +
        formatTodoReminder(todos),
    }
  },
}
```

模型看到的内容类似：

```xml
<todo_reminder>
  [in_progress] 为 count 参数补充失败测试
  [pending] 实现有限次数替换
  [pending] 更新 README
  [pending] 运行完整检查
</todo_reminder>
```

现在，Todo 的两个部分各自承担明确职责：

```text
todo_write Tool                  TodoMiddleware

模型主动调用                     Agent 自动调用
创建和更新状态                   将当前状态带入下一轮
回答“计划发生了什么变化”         回答“现在还有什么没完成”
```

Todo 因此不是单独一个 Tool，而是一个小型系统：

```text
Todo Tool + Todo Store + Todo Middleware
```

Tool 和 Middleware 通过闭包共享同一个 Store：

```ts
export function createTodoSystem() {
  const todos: TodoItem[] = []

  return {
    tool: createTodoWriteTool(todos),
    middleware: createTodoMiddleware(todos),
  }
}
```

不需要全局变量，也不需要让 Foundation 知道 Todo 是什么。Todo 仍然属于 Agent 层的可选能力。

## 把 Skill 和 Todo 组合进 Coding Agent

最后，把两个系统交给 Coding Agent：

```ts
export function createCodingAgent(model: Model): Agent {
  const todo = createTodoSystem()

  return new Agent(
    model,
    CODING_PROMPT,
    [
      bashTool,
      readFileTool,
      writeFileTool,
      strReplaceTool,
      todo.tool,
    ],
    20,
    [
      createSkillsMiddleware("skills"),
      todo.middleware,
      createLoggingMiddleware(),
    ],
  )
}
```

中间件按照注册顺序修改同一个 `ModelContext`：

```text
基础 Prompt
    ↓ SkillsMiddleware
基础 Prompt + Skill 目录
    ↓ TodoMiddleware
基础 Prompt + Skill 目录 + Todo Reminder
    ↓ LoggingMiddleware
记录本轮请求
    ↓
Model
```

每个中间件只理解自己的领域。SkillsMiddleware 不知道 Todo，TodoMiddleware 也不知道日志，但它们可以共同影响一次模型调用。

## 再运行一次任务

现在重新提交开头的任务：

```text
为 str_replace 增加 count 参数，补充测试，更新 README，
最后运行完整检查。
```

执行过程可能变成：

```text
Step 1
发现 test-driven-development Skill 与当前任务匹配
read_file → skills/test-driven-development/SKILL.md

Step 2
todo_write → 建立四个任务

Step 3
read_file → 阅读现有测试
write_file → 增加失败测试

Step 4
bash → 运行测试，确认失败
todo_write → tests completed，implementation in_progress

Step 5
str_replace → 实现 count 参数
bash → 测试通过

Step 6
str_replace → 更新 README
todo_write → docs completed，check in_progress

Step 7
bash → 运行完整检查
todo_write → 全部 completed

Step 8
模型给出最终回答
```

Skill 没有替 Agent 执行测试，Todo 也没有自动完成任务。真正采取动作的仍然是模型和四个 Coding 工具。

它们改变的是 Agent 的工作结构：Skill 提供经过整理的方法，Todo 把长任务从一段容易淡出的自然语言变成持续可见的状态。

## 从会做事到会工作

回顾这一讲，Agent 增加了两种不同的上下文能力。

Skill 使用渐进式加载：

```text
注入元数据 → 模型选择 → 按需读取完整说明
```

Todo 使用 Tool 和 Middleware 的组合：

```text
Tool 更新状态 → Middleware 持续提醒
```

为了支持它们，Middleware 也从只能观察生命周期，演进为可以返回 `Partial<ModelContext>`：

```text
第三讲                        第四讲

记录 Model 调用       →       修改本轮 Prompt
记录 Tool 耗时        →       注入 Skill 目录
统计 Agent 步骤       →       注入 Todo 状态
```

到这里，我们的 Coding Agent 已经能够使用工具完成任务、按照领域工作流行动，并在多轮执行中维护清晰的计划。

但终端仍然要等待 `run()` 返回最终字符串，才能完整看到结果。下一讲，我们会把模型输出、工具调用和运行状态变成统一的流式事件，并让 CLI 从等待最终答案走向实时交互。
