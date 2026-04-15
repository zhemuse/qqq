import * as readline from "readline"

// 导出供测试的纯函数
export function parseAnswer(input: string): boolean {
  return ["y", "yes"].includes(input.trim().toLowerCase())
}

// 在终端显示提示并等待用户输入 [y/n]
export async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`\n⚠ ${prompt} [y/n] `, (answer) => {
      rl.close()
      resolve(parseAnswer(answer))
    })
  })
}
