import type { z } from "zod"

export interface FunctionTool<
  P extends z.ZodSchema<Record<string, unknown>> = z.ZodSchema<Record<string, unknown>>,
  R = unknown,
> {
  name: string
  description: string
  parameters: P
  execute: (input: z.infer<P>, signal?: AbortSignal) => Promise<R>
}

export function defineTool<P extends z.ZodSchema<Record<string, unknown>>, R>({
  name,
  description,
  parameters,
  execute,
}: {
  name: string
  description: string
  parameters: P
  execute: (input: z.infer<P>, signal?: AbortSignal) => Promise<R>
}): FunctionTool<P, R> {
  return { name, description, parameters, execute } as FunctionTool<P, R>
}
