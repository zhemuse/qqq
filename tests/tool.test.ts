import { describe, it, expect } from "bun:test"
import { z, toJSONSchema } from "zod"
import { defineTool } from "../src/tool"

describe("defineTool()", () => {
  it("应返回包含 name、description、parameters、execute 的对象", () => {
    const t = defineTool({
      name: "greet",
      description: "向用户问好",
      parameters: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello, ${name}!`,
    })

    expect(t.name).toBe("greet")
    expect(t.description).toBe("向用户问好")
    expect(typeof t.parameters).toBe("object")
    expect(typeof t.execute).toBe("function")
  })

  it("execute 应返回结果", async () => {
    const t = defineTool({
      name: "greet",
      description: "问好",
      parameters: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello, ${name}!`,
    })

    const result = await t.execute({ name: "World" })
    expect(result).toBe("Hello, World!")
  })

  it("parameters 保留 Zod schema，JSON Schema 转换在 openai.ts 里发生", () => {
    const t = defineTool({
      name: "test",
      description: "test",
      parameters: z.object({ value: z.number().describe("数值") }),
      execute: async () => "ok",
    })

    // parameters 是 Zod schema 对象，不是 JSON Schema
    expect(typeof t.parameters.parse).toBe("function")

    // 转换后应有正确的 JSON Schema 结构
    const schema = toJSONSchema(t.parameters, { target: "openapi-3.0" }) as any
    expect(schema.type).toBe("object")
    expect(schema.properties.value.type).toBe("number")
  })

  it("execute 支持可选的 AbortSignal 参数", async () => {
    const t = defineTool({
      name: "test",
      description: "test",
      parameters: z.object({}),
      execute: async (_args, signal) => (signal ? "abortable" : "no signal"),
    })

    expect(await t.execute({})).toBe("no signal")
    expect(await t.execute({}, new AbortController().signal)).toBe("abortable")
  })
})
