# npm release demo

这是第四讲使用的演示包。它提供一个可以测试、修改版本并执行 `npm pack --dry-run` 的隔离工作空间，不对应任何真实 npm 包。

```ts
import { greet } from "qqq-agent-course-release-demo"

greet("Agent")
```
