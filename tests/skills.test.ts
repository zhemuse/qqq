import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Agent } from "../src/agent/agent"
import {
  discoverSkills,
} from "../src/agent/skills/skill-reader"
import { createSkillsMiddleware } from "../src/agent/skills/skills-middleware"
import type { AssistantMessage } from "../src/foundation/messages"
import {
  Model,
  type ModelProvider,
  type ModelProviderInput,
} from "../src/foundation/models"

const temporaryDirectories: string[] = []

async function createSkillDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "qqq-skills-"))
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

class PromptProvider implements ModelProvider {
  prompt = ""

  async invoke(input: ModelProviderInput): Promise<AssistantMessage> {
    const system = input.messages[0]
    const firstBlock =
      system && Array.isArray(system.content) ? system.content[0] : undefined
    this.prompt = firstBlock?.type === "text" ? firstBlock.text : ""

    return {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
    }
  }
}

test("discovers Skill metadata from SKILL.md frontmatter", async () => {
  const directory = await createSkillDirectory()
  const skillDirectory = join(directory, "npm-release")
  await mkdir(skillDirectory)
  await Bun.write(
    join(skillDirectory, "SKILL.md"),
    `---
name: npm-release
description: Prepare an npm package release safely.
---

# Private release workflow
`,
  )

  expect(await discoverSkills(directory)).toEqual([
    {
      name: "npm-release",
      description: "Prepare an npm package release safely.",
      path: join(skillDirectory, "SKILL.md"),
    },
  ])
})

test("injects only the Skill catalog into the model prompt", async () => {
  const directory = await createSkillDirectory()
  const skillDirectory = join(directory, "npm-release")
  await mkdir(skillDirectory)
  await Bun.write(
    join(skillDirectory, "SKILL.md"),
    `---
name: npm-release
description: Prepare an npm package release safely.
---

SECRET WORKFLOW BODY
`,
  )
  const provider = new PromptProvider()
  const agent = new Agent(
    new Model("test-model", provider),
    "Base prompt",
    [],
    1,
    [createSkillsMiddleware(directory)],
  )

  await agent.run("Prepare a release")

  expect(provider.prompt).toContain("Base prompt")
  expect(provider.prompt).toContain("<name>npm-release</name>")
  expect(provider.prompt).toContain(
    "<description>Prepare an npm package release safely.</description>",
  )
  expect(provider.prompt).toContain(
    `<path>${join(skillDirectory, "SKILL.md")}</path>`,
  )
  expect(provider.prompt).not.toContain("SECRET WORKFLOW BODY")
})
