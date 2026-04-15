import { describe, it, expect } from "bun:test"
import { z } from "zod"
import { tool } from "../src/tool"

describe("tool()", () => {
  it("应返回包含 name、description、parameters、execute 的对象", () => {
    const t = tool({
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

  it("execute 应返回字符串结果", async () => {
    const t = tool({
      name: "greet",
      description: "问好",
      parameters: z.object({ name: z.string() }),
      execute: async ({ name }) => `Hello, ${name}!`,
    })

    const result = await t.execute({ name: "World" })
    expect(result).toBe("Hello, World!")
  })

  it("parameters 应包含 JSON Schema 格式的 type 字段", () => {
    const t = tool({
      name: "test",
      description: "test",
      parameters: z.object({ value: z.number().describe("数值") }),
      execute: async () => "ok",
    })

    expect((t.parameters as any).type).toBe("object")
    expect((t.parameters as any).properties.value.type).toBe("number")
  })

  it("dangerous 默认为 false", () => {
    const t = tool({
      name: "safe",
      description: "安全操作",
      parameters: z.object({}),
      execute: async () => "ok",
    })
    expect(t.dangerous).toBe(false)
  })

  it("dangerous 可设为 true", () => {
    const t = tool({
      name: "danger",
      description: "危险操作",
      parameters: z.object({}),
      dangerous: true,
      execute: async () => "ok",
    })
    expect(t.dangerous).toBe(true)
  })

  it("parameters 不应包含 $schema 字段（LLM API 兼容性）", () => {
    const t = tool({
      name: "test",
      description: "test",
      parameters: z.object({ value: z.string() }),
      execute: async () => "ok",
    })
    expect((t.parameters as any)["$schema"]).toBeUndefined()
  })

  it("parameters 应正确区分必填和可选属性", () => {
    const t = tool({
      name: "test",
      description: "test",
      parameters: z.object({
        required_field: z.string(),
        optional_field: z.string().optional(),
      }),
      execute: async () => "ok",
    })
    const params = t.parameters as any
    expect(params.required).toContain("required_field")
    expect(params.required ?? []).not.toContain("optional_field")
  })
})
