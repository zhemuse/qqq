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
