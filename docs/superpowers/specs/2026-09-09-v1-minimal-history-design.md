# V1 最小分支与历史重建设计

## 目标

将当前完整 Agent 实现与课程 V1 分离：完整实现安全保留，`feat/01-model-and-messages` 改为一条独立、干净的 Git 历史，只包含能够演示 Anthropic Messages、`tool_use`、一个 `bash` 工具和最小 ReAct Loop 的必要文件。

## 当前状态

- `main` 指向现有完整 Agent 实现；
- 当前 `feat/01-model-and-messages` 基于 `main` 创建，因此它的历史和文件树都包含完整 Agent；
- 当前分支在完整 Agent 之上增加了 V1 文档提交；
- 远程仍存在旧名称 `origin/course/01-model-and-messages`；
- 工作区存在与本任务无关的未提交文件删除，迁移不得暂存、恢复或丢弃这些变更。

## 目标分支结构

```text
main
└── 现有完整 Agent，保持不变

feat/original-agent
└── 保存当前 feat/01 的完整历史、现有代码和 V1 文档提交

feat/01-model-and-messages
└── 独立根提交，只包含最小 V1 文件
```

`feat/01-model-and-messages` 不以 `main` 或 `feat/original-agent` 为祖先。后续 V2–V5 从新的 V1 线性演进。

## 安全迁移方案

1. 将当前本地 `feat/01-model-and-messages` 重命名为 `feat/original-agent`，完整保留现有提交；
2. 不切换、暂存或清理当前工作区中的未提交删除；
3. 在独立临时 worktree 中创建新的 orphan 分支 `feat/01-model-and-messages`；
4. 只向 orphan 分支写入允许的 V1 文件；
5. 完成构建、结构和文档一致性验证后提交；
6. 不修改 `main`，不推送、不删除任何远程分支；
7. 原工作目录继续停留在 `feat/original-agent`，以保护其中未提交的用户变更；
8. 新 V1 分支通过临时 worktree 验证，完成后保留分支引用，是否切换原工作目录由用户处理未提交变更后决定。

## V1 文件树

```text
.
├── .env.example
├── .gitignore
├── README.md
├── agent.ts
├── docs/
│   └── 01-model-and-messages.md
└── package.json
```

不创建 `src/`、`tests/`、SDK Adapter、工具目录或内部规划文档。

## 文件职责

### `agent.ts`

单文件、约 120 行，包含：

- Anthropic Content Block 的最小 TypeScript 类型；
- 一个 `bash` 工具的 `input_schema`；
- 使用裸 `fetch` 调用 `/v1/messages`；
- 使用 `Bun.spawn` 执行 Shell 命令；
- Assistant `tool_use` 与 User `tool_result` 的关联；
- 最多 20 步的 ReAct Loop；
- 无工具调用时输出最终文本并结束；
- 工具错误作为 Observation 回填模型；
- 工具输出长度限制。

不包含：

- OpenAI 或 Anthropic SDK；
- Zod；
- Provider、Model、Agent 类；
- 工具注册表；
- 并发工具执行；
- 权限确认、沙箱、超时和取消；
- CLI REPL；
- Middleware、Skills、Todos；
- 会话持久化。

### `docs/01-model-and-messages.md`

保留已经确认的读者型行文风格：自然开场、五个问题、从“你是谁”场景出发，依次解释无状态 API、Anthropic Messages、Function Calling/`tool_use`、ReAct Loop 和 Agent/Chat 区别。

文档中的代码片段必须与 `agent.ts` 保持一致。

### `README.md`

只包含项目定位、环境变量、运行命令、安全提示和文档入口，不介绍 V2–V5 的未实现功能。

### `.env.example`

只声明：

```text
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
```

### `.gitignore`

忽略 `.env`、`node_modules`、构建输出和系统临时文件。

### `package.json`

不声明运行时依赖，只提供：

- `bun run start -- "任务"`；
- `bun run check`，使用 Bun 构建器验证 `agent.ts` 可解析和打包。

## V1 数据流

```text
用户目标
  ↓
Message[]
  ↓
裸 fetch 调用 Anthropic Messages
  ↓
Assistant Content Blocks
  ├── 只有 text → 输出并结束
  └── 包含 tool_use
          ↓
        本地执行 bash
          ↓
        追加 tool_result
          ↓
        回到模型调用
```

## 错误处理

- 缺少 `ANTHROPIC_API_KEY` 或 `ANTHROPIC_MODEL` 时，在发起请求前明确失败；
- HTTP 非 2xx 时包含状态码和响应文本；
- 未知工具和非法 `command` 参数转换为 `tool_result`；
- Shell 异常转换为 `tool_result`，允许模型根据观察调整下一步；
- 达到 20 步时以非零状态失败；
- 空输出转换为包含退出码的可见结果；
- stdout 与 stderr 合并并截断，避免无限扩大上下文。

## 安全边界

V1 的 `bash` 工具没有生产级保护。README 和文档必须明确：

- 只在专用演示目录运行；
- 不接受不可信用户输入；
- 不将真实 API Key 写入代码或提交；
- 工具权限属于宿主程序，模型产生的命令不是可信输入；
- 权限确认、沙箱、超时和取消留给后续版本。

## 验证标准

### Git 历史

- `feat/original-agent` 保留当前完整历史；
- `main` 指针不变；
- 新 `feat/01-model-and-messages` 没有 `main` 作为祖先；
- 不执行远程推送、删除或强制更新。

### 文件结构

- 新 V1 根目录只包含允许文件；
- 不存在 `src/`、`tests/`、`node_modules` 或完整 Agent 代码；
- `.env` 不被跟踪。

### 可运行性

- `bun run check` 成功；
- 无参数运行时显示明确用法并以非零状态退出；
- 缺少环境变量时显示明确错误；
- 对 `agent.ts` 中的模型调用使用本地假响应检查消息回填与最大步数，不依赖真实 API Key；
- 文档中的环境变量、运行命令、消息格式和实际代码一致。

## 非目标

- 本次不创建 V2–V5；
- 不把原完整实现直接命名为新的 V5；
- 不改写 `main`；
- 不处理当前工作区中与任务无关的删除；
- 不创建或修改 GitHub 仓库；
- 不删除远程 `course/01-model-and-messages`。
