# 第一次分享：从 LLM API 到可持续对话

> 核心问题：一个无状态的模型调用，为什么能够表现得像一段连续对话？

## 1. 这次分享要得到什么

这次分享从最普通的一次 HTTP 请求开始，最终得到一个可以连续对话的命令行程序。

它还不是 Agent。

它没有工具，不会访问文件，不会执行命令，也不会自行决定下一步。它只做一件事：保存已经发生的对话，并在下一次调用模型时把这些信息重新提交。

这一版刻意保持简单，因为后面所有 Agent 能力都依赖同一个基础：**一份顺序正确、内容完整、可以持续追加的消息记录。**

完成这次分享后，参与者应该能够解释：

- 为什么 LLM API 本身没有会话状态；
- System、User、Assistant 三种消息分别表达什么；
- Prompt、Message、Transcript 有什么区别；
- 多轮对话为什么必须重新提交历史消息；
- Context Window 如何限制“记忆”；
- 为什么 Message 是 Agent 框架最先需要稳定下来的契约；
- 为什么 V1 是对话程序，而不是 Agent。

## 2. 两小时安排

| 时间 | 内容 |
|---:|---|
| 0–15 分钟 | 从一次模型调用开始：输入、输出和无状态性 |
| 15–35 分钟 | Message、Role、Prompt 与 Transcript |
| 35–55 分钟 | V0：只能回答一次的模型客户端 |
| 55–80 分钟 | 从 V0 演进到 V1：保存并重放消息历史 |
| 80–100 分钟 | 查看请求数据、修改 System Message、对照最终架构 |
| 100–112 分钟 | 四个失败实验 |
| 112–120 分钟 | 常见误解、总结和 V2 预告 |

这是一场技术分享，不要求参与者现场从零完成代码。讲者应提前准备可运行版本，通过关键片段、请求日志和失败实验解释设计。

## 3. 开场：模型真的“记得”你吗

先展示一段普通对话：

```text
你：我叫 Lin，正在做一个叫 qqq 的 TypeScript 项目。
模型：你好 Lin，我了解了。

你：我叫什么？项目叫什么？
模型：你叫 Lin，项目叫 qqq。
```

从用户视角看，模型似乎记住了第一句话。

但如果第二次只发送新的问题：

```json
{
  "messages": [
    { "role": "user", "content": "我叫什么？项目叫什么？" }
  ]
}
```

模型没有可靠依据回答。第一次 HTTP 请求已经结束，服务端不会因为调用方仍在同一个终端窗口中，就自动把上一轮内容补进这次请求。

能够连续对话的真正原因，是应用在第二次请求中重新发送了历史：

```json
{
  "messages": [
    { "role": "user", "content": "我叫 Lin，正在做一个叫 qqq 的 TypeScript 项目。" },
    { "role": "assistant", "content": "你好 Lin，我了解了。" },
    { "role": "user", "content": "我叫什么？项目叫什么？" }
  ]
}
```

因此，“模型记得”只是用户体验层面的说法。工程上更准确的表达是：

> 应用保存了 Transcript，并在后续调用中重放了仍然需要的上下文。

## 4. 基础概念一：LLM API 是无状态函数

先把模型调用简化为一个函数：

```text
nextMessage = model(messages, options)
```

输入包括消息、模型名和推理参数，输出是一条新的 Assistant Message。

对于应用程序来说，这次调用具备三个重要特征：

1. 模型只能依据当前请求中可见的信息生成结果；
2. 调用完成后，应用必须自行保存需要延续的状态；
3. 下一次调用是否与上一次有关，取决于应用传入了什么，而不是两个请求是否来自同一进程。

真实的 Provider 可能提供服务端会话、缓存或 Responses 等更高层能力，但 Agent Runtime 不能把核心状态管理建立在某一家服务的隐式行为上。为了理解底层机制，V1 使用最朴素的请求模型：**每次显式传入完整的消息数组。**

这带来一个非常重要的架构判断：

```text
模型负责生成下一条消息
应用负责决定模型能看到哪些历史
```

模型并不拥有会话；应用拥有会话。

## 5. 基础概念二：Message 与 Role

V1 只需要三种角色。

### 5.1 System Message

System Message 描述本次交互的总体身份、目标和边界。

```json
{
  "role": "system",
  "content": "你是一个简洁的 TypeScript 技术助手。"
}
```

它不是“更长的用户问题”，而是应用对本次模型行为的基础配置。V1 把它放在消息数组开头，每次调用都携带。

### 5.2 User Message

User Message 表示用户在当前时刻提出的信息或请求：

```json
{
  "role": "user",
  "content": "解释 TypeScript 中 unknown 和 any 的区别。"
}
```

用户的每次输入都会形成一条新消息，并追加到 Transcript 尾部。

### 5.3 Assistant Message

Assistant Message 是模型返回的结果：

```json
{
  "role": "assistant",
  "content": "unknown 要求使用前先缩小类型范围，而 any 会跳过类型检查。"
}
```

这条结果不仅需要显示给用户，也必须被保存。否则下一轮只保留用户消息，模型就看不到自己上一轮说过什么。

### 5.4 顺序本身就是信息

Transcript 不是按角色分类的对象，也不是三张独立列表，而是一条有时间顺序的记录：

```text
system → user → assistant → user → assistant → ...
```

以下两组消息包含相同句子，却表达不同语义：

```text
A: user「值是多少？」 → assistant「42」
B: assistant「42」 → user「值是多少？」
```

因此，消息数组必须采用只追加的时间线模型。任意排序、去重或分组都会改变模型所看到的对话。

## 6. 基础概念三：Prompt、Message 与 Transcript

这三个词经常被混在一起。

### Prompt

Prompt 是交给模型的指令或上下文。它是语义概念，不一定对应一个字符串，也不一定只存在于一条消息里。

### Message

Message 是 Transcript 中的一条结构化记录，至少包含 `role` 和 `content`。

### Transcript

Transcript 是按照发生顺序排列的全部消息。它是 V1 的会话状态，也是后续 Agent Loop 的工作记忆。

它们之间的关系可以写成：

```text
Prompt 是“模型需要知道什么”
Message 是“这些信息如何被记录”
Transcript 是“当前累计了哪些记录”
```

V1 的最小内部类型可以表达为：

```ts
type Role = "system" | "user" | "assistant"

interface Message {
  role: Role
  content: string
}
```

这里不直接使用某个 SDK 暴露的完整联合类型，原因不是 SDK 类型不好，而是 V1 只需要最小认知模型。等 V2 出现 Tool Message 和 Provider 差异时，再让内部 Message 契约变宽。

## 7. 基础概念四：Context Window 不是长期记忆

只要每次重放所有消息，模型就会一直记得吗？不会。

模型单次调用能接收的信息总量受到 Context Window 限制。它通常包括：

- System Message；
- 历史 User Message；
- 历史 Assistant Message；
- 当前用户输入；
- 后续版本中的工具定义和工具结果；
- 模型需要生成的输出空间。

随着 Transcript 增长，请求会出现三类问题：

1. **成本增长**：旧内容会被重复传输和处理；
2. **注意力稀释**：真正重要的信息被大量历史包围；
3. **容量上限**：请求最终超过模型可以接收的范围。

因此，Transcript 是当前工作上下文，不是无限存储，也不是长期记忆系统。

后续可以使用窗口截断、摘要、检索或外部 Memory，但 V1 不实现这些机制。V1 只建立一个事实：

> 应用必须显式拥有消息状态，才有资格决定以后如何裁剪、总结或检索它。

## 8. 基础概念五：Provider 是边界，但 V1 暂不抽象

不同 Provider 的请求地址、鉴权方式、消息结构和响应格式可能不同。

成熟框架通常需要一个 Provider 抽象：

```text
应用内部 Message
    ↓
Provider Adapter
    ↓
外部 API 协议
```

但 V1 故意不创建 `Model`、`ModelProvider` 或 Adapter 目录，而是直接在 `callModel()` 中使用裸 `fetch`。

这么做有三个原因：

1. 当前只接一个 OpenAI-compatible Endpoint，没有第二种协议需要统一；
2. 直接查看请求体，更容易理解消息真正如何被发送；
3. 没有具体差异时提前设计接口，只会得到凭空产生的抽象。

本次分享只要求参与者识别“这里未来会成为边界”，而不是立刻把边界封装起来。

## 9. V0：一次性模型调用

在 V1 之前，先展示一个只能调用一次的 V0。

它的结构只有三步：

```text
读取问题 → 调用模型 → 打印回答
```

关键代码可以简化为：

```ts
const content = process.argv.slice(2).join(" ")
const messages = [{ role: "user", content }]
const reply = await callModel(messages)
console.log(reply.content)
```

V0 已经能够回答问题，但它有一个明显限制：程序没有保存上一轮 Assistant Message，也没有入口继续追加用户输入。

如果每次执行程序都创建一个新的消息数组，那么每次都是一段全新的对话。

这就是 V1 要解决的唯一问题。

## 10. V1：可持续对话程序

### 10.1 文件边界

V1 只有一个核心文件：

```text
src/index.ts
```

其中只包含：

```text
Message 类型
messages 数组
callModel(messages)
读取用户输入
追加 User Message
追加 Assistant Message
显示模型输出
```

不包含：

- Tool 或 Function Calling；
- Agent、Runner 或 Runtime；
- 自动循环；
- Provider 抽象；
- Middleware；
- Skills；
- Memory 数据库；
- 流式输出；
- TUI。

### 10.2 数据流

```text
┌────────────┐
│ 用户输入   │
└─────┬──────┘
      │ append user message
      ▼
┌──────────────────────────┐
│ Message[] / Transcript   │
└─────────────┬────────────┘
              │ complete array
              ▼
┌──────────────────────────┐
│ callModel(messages)      │
└─────────────┬────────────┘
              │ HTTP request
              ▼
┌──────────────────────────┐
│ Provider API             │
└─────────────┬────────────┘
              │ assistant message
              ▼
┌──────────────────────────┐
│ append + print response  │
└──────────────────────────┘
```

注意，这里没有 Agent 内部循环。每次新输入都由人触发一次模型调用。

### 10.3 状态所有权

`messages` 数组属于应用：

```ts
const messages: Message[] = [
  {
    role: "system",
    content: "你是一个简洁的 TypeScript 技术助手。",
  },
]
```

每次收到输入：

```ts
messages.push({ role: "user", content: input })
const assistant = await callModel(messages)
messages.push(assistant)
```

最重要的不是这几行代码，而是两条不变量：

1. 调用模型之前，当前 User Message 已经进入 Transcript；
2. 显示结果之前或同时，Assistant Message 必须进入 Transcript。

只显示但不保存 Assistant Message，会让下一轮上下文残缺。

### 10.4 外部配置

V1 使用三个中性的环境变量：

| 变量 | 含义 |
|---|---|
| `AGENT_BASE_URL` | OpenAI-compatible API 根地址 |
| `AGENT_API_KEY` | API 鉴权密钥 |
| `AGENT_MODEL` | 模型名称 |

课程版本不把任何真实密钥写入代码、文档、提交或示例输出。

`callModel()` 的职责保持狭窄：

```text
接收 Message[]
→ 构造 HTTP 请求
→ 检查响应状态
→ 取出第一条 Assistant Message
→ 返回 Message
```

它暂时不是通用 Provider 接口，只是本版唯一的外部调用函数。

## 11. 一次完整调用发生了什么

假设当前 Transcript 为：

```text
system: 你是一个简洁的 TypeScript 技术助手。
user: 我正在设计一个消息队列，吞吐优先。
assistant: 可以先明确消息大小、峰值吞吐和交付语义。
user: 那我应该先确认哪个指标？
```

程序执行以下步骤：

1. 从终端读取新的 User Message；
2. 把它追加到 `messages`；
3. 把完整 `messages` 交给 `callModel()`；
4. `callModel()` 将消息编码为 Provider 请求；
5. Provider 返回一条 Assistant Message；
6. 程序把 Assistant Message 追加到 `messages`；
7. 程序显示 Assistant Message 的文本；
8. 程序等待下一次用户输入。

这段流程中没有任何神秘状态。所谓“对话连续性”，完全来自第 2、3、6 步。

## 12. 关键代码导读

分享时只需要展示四处代码。

### 12.1 Message 类型

重点不是字段数量，而是内部状态不应只由零散字符串构成。

```ts
type Message = {
  role: "system" | "user" | "assistant"
  content: string
}
```

### 12.2 Transcript 初始化

```ts
const messages: Message[] = [systemMessage]
```

重点讨论谁拥有数组、谁能修改数组，以及一次新会话何时创建。

### 12.3 `callModel()` 边界

```ts
async function callModel(messages: Message[]): Promise<Message>
```

重点讨论输入和输出，而不是 HTTP 样板代码。函数只返回新消息，不在内部偷偷修改 Transcript。

### 12.4 追加顺序

```ts
messages.push(userMessage)
const assistantMessage = await callModel(messages)
messages.push(assistantMessage)
```

这是 V1 最值得逐行看的部分。它定义了对话状态如何演进。

## 13. 完整演示脚本

### 演示准备

讲者提前确认：

- Bun 已安装；
- 三个环境变量已通过本地 `.env` 配置；
- `.env` 被 `.gitignore` 排除；
- Endpoint 和模型可正常访问；
- 准备一份可打印出站请求体的调试开关；
- 准备好无网络时使用的固定响应录像或日志。

真实 API 的输出存在随机性。核心结论必须通过请求日志证明，而不能只依赖模型碰巧给出正确答案。

### 演示一：一次性调用

输入：

```text
我的代号是 Blue Rabbit。
```

显示模型回答后结束 V0 进程。

重新启动，只输入：

```text
我的代号是什么？
```

观察模型无法可靠回答。

讲解重点：两个终端命令由同一个人执行，并不意味着两次 HTTP 请求共享状态。

### 演示二：保存完整 Transcript

启动 V1，在同一个进程内连续输入：

```text
我的代号是 Blue Rabbit，项目名是 qqq。
```

然后输入：

```text
只回答我的代号和项目名。
```

观察第二次请求中包含完整历史，并得到连贯回答。

讲解重点：不要只看模型输出，同时打印实际发送的 `messages`。

### 演示三：删除历史

在第二轮调用前临时将传入内容改为只包含当前消息。

```ts
await callModel([messages.at(-1)!])
```

再次运行相同对话。输出可能猜对，也可能猜错，但请求日志能确定模型没有拿到第一轮信息。

讲解重点：**模型偶然答对不是状态存在的证据；请求中是否包含信息才是证据。**

### 演示四：修改 System Message

先使用：

```text
你是一个简洁的 TypeScript 技术助手。
```

再换成：

```text
你是严格的代码审查者。先指出风险，再给出建议；总共不超过三点。
```

给出相同的 User Message，对比回答结构。

讲解重点：System Message 也是每次请求的一部分，不是模型账户上的永久设置。

### 演示五：对照最终 Helixent 架构

最后展示成熟实现中的三个位置：

- Message 类型；
- Model；
- ModelProvider。

只回答两个问题：

1. 哪部分概念在 V1 中已经存在？
2. 哪些抽象是后续因为 Provider 和 Tool 复杂度才出现的？

不要在第一次分享中展开工具协议或 Agent Loop 实现。

## 14. 失败实验

### 14.1 失败一：遗漏历史

**改动**：第二轮只提交当前 User Message。

**现象**：模型无法可靠引用第一轮信息。

**原因**：第一次请求的内容不在当前上下文中。

**恢复**：提交从 System Message 到当前 User Message 的完整 Transcript。

### 14.2 失败二：没有保存 Assistant Message

**改动**：显示第一轮回答，但不执行 `messages.push(assistantMessage)`。

**现象**：第二轮模型知道用户说过什么，却不知道自己回答过什么；涉及修改、确认或追问时容易出现矛盾。

**原因**：Transcript 只保存了一半对话。

**恢复**：每次成功调用后把完整 Assistant Message 追加到状态中。

### 14.3 失败三：重复追加当前用户消息

**改动**：输入处理函数和 `callModel()` 都向数组追加相同 User Message。

**现象**：请求日志中连续出现两条相同问题，模型可能过度强调、重复回答或误判用户在催促。

**原因**：状态修改职责不唯一。

**恢复**：规定 Transcript 只由会话控制层修改，`callModel()` 保持纯边界函数。

### 14.4 失败四：角色或顺序错误

**改动**：把历史 Assistant Message 标成 User，或者在发送前按角色重新分组。

**现象**：模型无法区分用户要求和自己的历史回答，甚至把自己的回答当成新指令。

**原因**：Role 和时间顺序共同定义了对话语义。

**恢复**：保留原始角色，并采用只追加的顺序记录。

### 14.5 失败五：Transcript 无限增长

**改动**：连续加入大量文本，并始终重放全部内容。

**现象**：延迟、输入 Token 和成本持续增加，最终可能超过 Context Window。

**原因**：把工作上下文误当成无限存储。

**恢复**：V1 只记录并展示问题，不在本版加入摘要或 Memory；把它登记为后续 Runtime 的设计问题。

## 15. 常见误解

### “模型已经有聊天能力，为什么还要保存消息？”

聊天产品保存了消息，不代表裸 API 会替你的应用保存。需要区分产品能力和模型调用协议。

### “只保存 User Message 就够了吧？”

不够。模型需要知道自己已经给出过哪些结论、承诺和问题，才能保持一致。

### “System Prompt 不就是一个全局字符串吗？”

它最终仍是模型当前调用可以看到的输入。应用需要明确它何时创建、如何更新、是否进入审计记录。

### “只要有 while 循环就是 Agent 吗？”

不是。V1 的输入循环由人驱动：用户输入一次，模型回答一次。Agent Loop 需要模型根据观察结果自主决定是否采取下一步行动，这要等到工具协议出现之后。

### “模型答对了，所以服务端记住了上一轮。”

模型可能根据常识或概率猜对。判断状态是否存在，应查看第二次请求实际包含了什么。

### “Context Window 就是 Memory。”

Context Window 是单次调用可见信息的容量；Memory 是应用选择、保存和重新注入长期信息的机制。两者不是同一个概念。

### “V1 应该先设计一个通用 Provider 接口。”

当前只有一个协议实现，尚无足够差异证明接口应该长什么样。V2 引入工具转换后，Provider 的真实职责会自然显现。

## 16. V1 与最终框架的关系

V1 虽然简单，已经包含最终框架不会消失的三个事实：

| V1 概念 | 最终框架中的位置 |
|---|---|
| `Message` | Foundation Message 契约 |
| `messages` | AgentContext 中的 Transcript |
| `callModel()` | Model 与 ModelProvider 的协作边界 |

后续版本会改变代码组织，但不会推翻这三个事实。

成熟架构之所以分层，不是因为目录越多越专业，而是因为后续出现了具体变化：

- Provider 协议需要替换；
- Assistant Message 会包含 Tool Call；
- Tool Result 需要回填；
- 模型调用会进入自主循环；
- 生命周期需要取消、错误处理和扩展点。

第一次分享结束时，参与者应该能看见这些问题，但不需要提前解决它们。

## 17. 本次结论

这次分享只建立四条结论：

1. **模型调用是无状态的。** 当前请求没有的信息，模型就没有可靠依据使用。
2. **应用拥有会话状态。** 对话连续性来自应用保存并重放 Transcript。
3. **Message 是第一份稳定契约。** Role、Content 和顺序共同描述已经发生的事情。
4. **V1 还不是 Agent。** 它能对话，但不能选择动作，也不能根据动作结果自主继续。

一句话概括：

> V1 让模型拥有连续的上下文，但还没有给它接触外部世界的手。

## 18. 下一次：Tool Calling

V1 的限制非常明确：

- 它只能生成文字；
- `callModel()` 与某一种外部协议直接耦合；
- Message 还不能表达 Tool Use 和 Tool Result；
- 程序无法验证和执行模型产生的结构化意图。

第二次分享将从一个问题开始：

> 当模型说“我想读取这个文件”时，这句话怎样变成一次真实、可验证、可控制的函数调用？

V2 将引入：

- `Model` 与 `ModelProvider`；
- Provider 协议转换；
- `FunctionTool` 与参数 Schema；
- Tool Use、Tool Result 和调用 ID；
- 一次有限的“模型 → 工具 → 模型”往返。

它仍然不会拥有任意多步自主循环。真正的 ReAct Agent Loop 留到第三次分享。

## 19. 版本信息

```text
代码分支：feat/01-model-and-messages
冻结标签：course-v1
下一版本：feat/02-tool-calling
版本差异：feat/01-model-and-messages..feat/02-tool-calling
```

V1 分支建立后，应保证：

- 可以在没有 V2–V5 代码的情况下独立运行；
- 只有单文件模型调用和多轮消息状态；
- 不提前包含工具、Agent Loop 或 Middleware；
- 使用 Fake Provider 或固定响应测试消息追加顺序；
- 真实 Provider 只用于现场演示，不作为确定性验证手段。

## 20. 分享者检查清单

分享前：

- [ ] V1 分支可以从干净环境安装和运行；
- [ ] `.env` 未被 Git 跟踪；
- [ ] 演示账户和模型 Endpoint 可用；
- [ ] 准备无网络时的请求与响应记录；
- [ ] V0、V1 和失败实验都有可快速切换的提交或补丁；
- [ ] 出站请求日志会隐藏 API Key；
- [ ] 示例 Transcript 不包含真实个人信息；
- [ ] 现场演示总时长控制在 30 分钟以内；
- [ ] 最终架构对照只讲 Message、Model、ModelProvider；
- [ ] 结尾明确说明 V1 不是 Agent。

分享后，参与者至少应该能回答：

- 第二次模型调用从哪里获得第一次对话的信息？
- 为什么必须保存 Assistant Message？
- 为什么不能任意重排消息？
- Context Window 与长期 Memory 有什么区别？
- V1 距离 Agent 还缺少哪两个关键能力？

最后一个问题的预期答案是：**外部行动能力，以及由模型驱动的多步循环。**
