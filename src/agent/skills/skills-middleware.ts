import type { AgentMiddleware } from "../agent-middleware"
import { discoverSkills, type SkillMetadata } from "./skill-reader"

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function formatSkillsPrompt(skills: SkillMetadata[]): string {
  const catalog = skills
    .map(
      (skill) => `  <skill>
    <name>${escapeXml(skill.name)}</name>
    <description>${escapeXml(skill.description)}</description>
    <path>${escapeXml(skill.path)}</path>
  </skill>`,
    )
    .join("\n")

  return `<skills>
${catalog}
</skills>`
}

export function createSkillsMiddleware(
  skillsDirectory: string,
): AgentMiddleware {
  let skills: SkillMetadata[] = []

  return {
    async beforeAgentRun() {
      skills = await discoverSkills(skillsDirectory)
    },

    beforeModel(_agentContext, modelContext) {
      if (skills.length === 0) {
        return
      }

      return {
        prompt:
          (modelContext.prompt ? `${modelContext.prompt}\n\n` : "") +
          formatSkillsPrompt(skills),
      }
    },
  }
}
