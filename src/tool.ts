import { z, toJSONSchema } from "zod"

export interface Tool<TArgs = Record<string, unknown>> {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema object
  dangerous: boolean
  execute(args: TArgs): Promise<string>
}

export function tool<TSchema extends z.ZodObject<z.ZodRawShape>>(config: {
  name: string
  description: string
  parameters: TSchema
  dangerous?: boolean
  execute(args: z.infer<TSchema>): Promise<string>
}): Tool<z.infer<TSchema>> {
  return {
    name: config.name,
    description: config.description,
    parameters: toJSONSchema(config.parameters, { target: "openapi-3.0" }) as Record<string, unknown>,
    dangerous: config.dangerous ?? false,
    execute: config.execute,
  }
}
