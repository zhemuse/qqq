# qqq · Agent from 0 to 1

这是五次 Agent 底层原理分享的 V1：不使用 Agent 框架或模型 SDK，只用 Bun、TypeScript、Anthropic Messages API、一个 `bash` 工具和一个 ReAct Loop。

完整讲解见 [第一讲：120 行写出一个最小 ReAct Agent](docs/01-model-and-messages.md)。

## 运行

```bash
cp .env.example .env
```

填写：

```text
ANTHROPIC_API_KEY=your-api-key
ANTHROPIC_MODEL=your-model
```

### 使用 DeepSeek

DeepSeek 提供了兼容 Anthropic Messages 的 API，因此不需要改写消息格式、工具定义或 Agent Loop，只需要更换模型地址、API Key 和模型名称：

```text
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_API_KEY=your-deepseek-api-key
ANTHROPIC_MODEL=deepseek-v4-flash
```

此时程序仍然请求 `/v1/messages`，继续使用 `tool_use` 和 `tool_result` 完成工具调用。需要更强模型能力时，可以把模型改为 `deepseek-v4-pro`。

接口兼容范围及最新模型信息以 [DeepSeek Anthropic API 官方文档](https://api-docs.deepseek.com/zh-cn/guides/anthropic_api/) 为准。

然后运行：

```bash
bun run start -- "你是谁？"
```

验证代码：

```bash
bun run check
```

## 安全提示

这个版本会直接执行模型生成的 Shell 命令，没有权限确认、沙箱、超时或取消机制。只在专用演示目录中运行，不要向不可信用户开放，也不要让它访问重要文件。
