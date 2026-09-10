export interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  invoke(input: Record<string, unknown>): Promise<unknown>
}
