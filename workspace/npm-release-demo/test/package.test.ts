import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("the demo package cannot be published", async () => {
  const child = Bun.spawn(
    ["npm", "publish", "--registry=http://127.0.0.1:9"],
    {
      cwd: join(import.meta.dir, ".."),
      env: {
        ...process.env,
        npm_config_cache: join(tmpdir(), "qqq-npm-release-demo-cache"),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  expect(exitCode).not.toBe(0)
  expect(`${stdout}\n${stderr}`).toContain("Demo package cannot be published")
})
