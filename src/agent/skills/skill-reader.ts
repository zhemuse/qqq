import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

export type SkillMetadata = {
  name: string
  description: string
  path: string
}

function unquote(value: string): string {
  const first = value[0]
  const last = value.at(-1)

  if (value.length >= 2 && first === last && (first === '"' || first === "'")) {
    return value.slice(1, -1)
  }

  return value
}

function parseSkill(source: string, path: string): SkillMetadata {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!frontmatter) {
    throw new Error(`Skill frontmatter not found: ${path}`)
  }

  const fields = new Map<string, string>()
  for (const line of frontmatter[1].split(/\r?\n/)) {
    const separator = line.indexOf(":")
    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim()
    const value = unquote(line.slice(separator + 1).trim())
    fields.set(key, value)
  }

  const name = fields.get("name")
  const description = fields.get("description")
  if (!name || !description) {
    throw new Error(`Skill name and description are required: ${path}`)
  }

  return { name, description, path }
}

export async function discoverSkills(
  skillsDirectory: string,
): Promise<SkillMetadata[]> {
  let entries

  try {
    entries = await readdir(skillsDirectory, { withFileTypes: true })
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return []
    }

    throw error
  }

  const skills: SkillMetadata[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) {
      continue
    }

    const path = join(skillsDirectory, entry.name, "SKILL.md")
    try {
      skills.push(parseSkill(await readFile(path, "utf8"), path))
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue
      }

      throw error
    }
  }

  return skills
}
