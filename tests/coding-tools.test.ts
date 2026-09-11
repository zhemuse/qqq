import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { bashTool } from "../src/coding/tools/bash"
import { readFileTool } from "../src/coding/tools/read-file"
import { strReplaceTool } from "../src/coding/tools/str-replace"
import { writeFileTool } from "../src/coding/tools/write-file"

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qqq-tools-"))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

test("read_file returns the exact file contents", async () => {
  const directory = await createTemporaryDirectory()
  const path = join(directory, "hello.ts")
  await Bun.write(path, "export const hello = 'world'\n")

  const result = await readFileTool.invoke({ path })

  expect(result).toBe("export const hello = 'world'\n")
})

test("bash preserves a non-zero exit status when the command has output", async () => {
  const result = await bashTool.invoke({ command: "printf failure; exit 7" })

  expect(result).toBe("exit 7\nfailure")
})

test("write_file creates missing parent directories", async () => {
  const directory = await createTemporaryDirectory()
  const path = join(directory, "src", "generated.ts")

  await writeFileTool.invoke({ path, content: "export const value = 42\n" })

  expect(await Bun.file(path).text()).toBe("export const value = 42\n")
})

test("str_replace changes one exact occurrence", async () => {
  const directory = await createTemporaryDirectory()
  const path = join(directory, "math.ts")
  await Bun.write(
    path,
    "export function add(a: number, b: number) {\n  return a - b\n}\n",
  )

  const result = await strReplaceTool.invoke({
    path,
    old: "return a - b",
    new: "return a + b",
  })

  expect(result).toBe(`Updated ${path}`)
  expect(await Bun.file(path).text()).toBe(
    "export function add(a: number, b: number) {\n  return a + b\n}\n",
  )
})

test("str_replace refuses an ambiguous replacement", async () => {
  const directory = await createTemporaryDirectory()
  const path = join(directory, "repeated.txt")
  await Bun.write(path, "same\nsame\n")

  await expect(
    strReplaceTool.invoke({ path, old: "same", new: "changed" }),
  ).rejects.toThrow("old text must appear exactly once, found 2")
  expect(await Bun.file(path).text()).toBe("same\nsame\n")
})
