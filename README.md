# bun-agent

极简 ReAct 风格 AI 编程 Agent 框架，基于 Bun 运行时。支持 Claude、DeepSeek、OpenAI 及任何 OpenAI 兼容模型。

## 安装

```bash
bun add bun-agent
```

## 快速开始

### CLI 模式

```bash
# Claude（默认）
ANTHROPIC_API_KEY=sk-ant-xxx bun run cli

# DeepSeek
AGENT_BASE_URL=https://api.deepseek.com \
ANTHROPIC_API_KEY=sk-deepseek-xxx \
AGENT_MODEL=deepseek-reasoner \
bun run cli
```

启动后直接输入任务：

```
bun-agent 🤖  (model: claude-sonnet-4-6)
Type your task and press Enter. Ctrl+C to exit.

> 读取 src/index.ts 并解释主要逻辑
[thinking...]
...
```

### 编程 API

```typescript
import { Agent, tools } from "bun-agent"

const agent = new Agent({
  tools: [tools.readFile, tools.writeFile, tools.bash, tools.listDir, tools.search],
})

const result = await agent.run("找出 src/ 里所有未使用的 export 并删除")
console.log(result)
```

## 配置

### AgentOptions

```typescript
const agent = new Agent({
  model: "claude-sonnet-4-6",   // 模型名，默认 "claude-sonnet-4-6"
  apiKey: "sk-ant-xxx",          // API Key，默认读 ANTHROPIC_API_KEY 环境变量
  baseURL: "https://api.deepseek.com", // 不填则走 Anthropic 兼容端点
  prompt: "你是专业的代码重构助手",      // system prompt
  messages: [...],               // 注入初始上下文（静态，每次 run 都会带上）
  tools: [tools.readFile],       // 要使用的工具列表
  maxSteps: 30,                  // 最大迭代次数，默认 20
})
```

### 环境变量（CLI 模式）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | API Key（所有提供商通用） | — |
| `AGENT_MODEL` | 模型名 | `claude-sonnet-4-6` |
| `AGENT_BASE_URL` | API 端点 | `https://api.anthropic.com/v1` |
| `AGENT_SYSTEM_PROMPT` | system prompt | — |

## 内置工具

| 工具 | 说明 | 需要确认 |
|------|------|---------|
| `tools.readFile` | 读取文件内容 | 否 |
| `tools.listDir` | 列出目录结构 | 否 |
| `tools.search` | 递归搜索文件内容（grep） | 否 |
| `tools.writeFile` | 写入/覆盖文件 | ⚠ 是 |
| `tools.bash` | 执行 shell 命令 | ⚠ 是 |

标记 ⚠ 的工具执行前会在终端提示 `[y/n]` 确认。

## 自定义工具

使用 `tool()` 工厂函数，参数类型由 Zod 推导：

```typescript
import { tool, Agent } from "bun-agent"
import { z } from "zod"

const fetchUrl = tool({
  name: "fetch_url",
  description: "获取指定 URL 的内容",
  parameters: z.object({
    url: z.string().describe("目标 URL"),
  }),
  execute: async ({ url }) => {
    const res = await fetch(url)
    return await res.text()
  },
})

// dangerous: true 会在执行前弹出确认提示
const deleteFile = tool({
  name: "delete_file",
  description: "删除文件",
  dangerous: true,
  parameters: z.object({
    path: z.string().describe("文件路径"),
  }),
  execute: async ({ path }) => {
    await Bun.file(path).delete?.()
    return `Deleted ${path}`
  },
})

const agent = new Agent({
  tools: [fetchUrl, deleteFile],
})
```

## 切换模型提供商

所有提供商统一走 OpenAI 兼容协议：

```typescript
// DeepSeek
const agent = new Agent({
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: "https://api.deepseek.com",
  tools: [tools.readFile, tools.bash],
})

// 本地 Ollama
const agent = new Agent({
  model: "qwen2.5-coder:7b",
  apiKey: "ollama",
  baseURL: "http://localhost:11434/v1",
  tools: [tools.readFile],
})

// OpenAI
const agent = new Agent({
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: "https://api.openai.com/v1",
  tools: [tools.readFile, tools.bash],
})
```

## 传入已有消息上下文

`messages` 选项在每次 `run()` 时都会作为初始上下文注入，适合预设背景信息：

```typescript
const agent = new Agent({
  messages: [
    { role: "user", content: "我们的项目使用 TypeScript + Bun，目标是重构认证模块" },
    { role: "assistant", content: "明白，我会关注认证相关代码。" },
  ],
  tools: [tools.readFile, tools.search],
})

const result = await agent.run("找出所有 JWT 相关的代码")
```

## 开发

```bash
bun test        # 运行测试
bun run build   # 构建到 dist/
bun run cli     # 启动 CLI
```
