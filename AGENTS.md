# AGENTS.md

## 项目概览

AI Writer 是一个单用户、多小说的自动化小说生产工作台。当前已完成 **Phase 4：Vite + React WebUI 工作台**；后续实现应以 [PLAN.md](/data1/project/AI%20Writer/PLAN.md) 为总体设计依据，并保持阶段边界清晰。

## 技术栈与常用命令

- Node.js 24+
- TypeScript，ES modules
- Node 内置 `node:sqlite` 持久化
- Vite + React WebUI，源代码位于 `web/`
- `npm run build`：编译 TypeScript
- `npm run build:api`：只编译 API TypeScript
- `npm run build:web`：只构建 Vite + React 到 `public/`
- `npm test`：运行测试
- `npm start`：启动生产构建后的 API/WebUI
- `npm run dev`：开发模式启动
- `npm run dev:web`：启动 Vite WebUI 开发服务器

每次修改后至少运行 `npm run build` 和 `npm test`。

运行时默认监听 `http://localhost:4317`。数据目录可通过 `AI_WRITER_DATA_DIR` 指定；测试和验收优先使用临时数据目录，避免污染仓库内的运行时数据库。

## 架构边界

- `src/domain/`：领域类型和状态模型。
- `src/storage/`：SQLite 存储及数据不变量。
- `src/model/`：OpenAI Chat Completions 兼容模型调用层；模型配置来自环境变量。
- `src/workflows/`：工作流初始化和任务编排。
- `src/server.ts`：HTTP API 与静态 WebUI 服务。
- `public/`：浏览器端界面。
- `web/`：React 页面、组件和样式；不要把业务状态重新放回 `public/` 手写脚本。
- `test/`：存储和工作流行为测试。

Agent 角色属于应用层逻辑，不应绕过工作流和存储层直接修改数据库或正文文件。`src/workflows/queue.ts` 是当前队列编排入口，`src/workflows/agents.ts` 保存固定核心 Agent 的角色映射，`src/workflows/complexity.ts` 保存确定性复杂度评估器，`src/workflows/story-intelligence.ts` 保存事实检索和故事一致性规则。

## 当前实现（Phase 1–4）

- `POST /api/projects` 创建小说项目，支持自定义类型、语言、文风以及一句话灵感/梗概/完整设定。
- `POST /api/projects/:id/generate` 按顺序执行：初始设定与人物 → 故事阶段 → 第一章正文。
- 生成结果会保存章节标题、摘要、正文、人物状态、时间线和伏笔；生成完成后项目暂停，防止 Phase 1 自动继续生产。
- 模型层只使用一个 OpenAI Chat Completions 兼容配置：`OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`。所有 Agent/工作流步骤共享该模型，不要在第一版引入按 Agent 路由。
- 未配置模型时允许使用本地降级闭环，仅用于开发和验收；不能把降级文本误认为真实模型质量。
- Phase 2 已提供 SQLite-backed durable task queue：任务状态保存在数据库中，支持 claim、重试、超时、暂停、继续和进程重启后的 `running` 任务恢复。
- 当前固定核心 Agent 角色为总控、设定、规划、写作、连贯性和记忆；角色映射只描述权限/职责，不创建多个模型实例。所有角色仍共用 `.env` 中的一个模型。
- 复杂度评估器根据人物、时间线、伏笔、规则、势力和不可逆人物状态计算分数；低复杂度选择 `chapter`，高复杂度选择 `scene`。Phase 2 的场景模式已能被任务和章节元数据记录，完整场景拆分仍属于后续工作。
- 当前队列是 SQLite 实现，不要求本机运行 Redis；`TaskQueue` 的 handler 接口应保持稳定，未来可以替换为 BullMQ/Redis transport。
- Phase 3 会从结构化世界观、人物、时间线、伏笔和章节摘要中检索有限事实，供后续 Agent 使用；不要把整本正文无上限拼入提示词。
- 每章写入前生成 `consistencyReport`，检查人物不可逆状态、重复时间线事件、空正文和无来源伏笔回收；问题只追加为 `Correction`，不回改正文。
- 伏笔记录首现章节和最近推进章节，高重要性伏笔长期未回收时生成 warning；warning 不会覆盖历史，也不会自动修改正文。
- 阶段只有在模型显式返回 `stageComplete: true` 时才算完成；完成后把旧阶段追加到 `completedStages`，再根据事实检索结果规划下一阶段。
- 当前仍没有完整的后台自动连载循环、动态 Agent、完整场景拆分或 WebUI 故事工作台；不要把 Phase 3 的规划/检查基础能力误写成这些功能已经完成。
- Phase 4 的 React 工作台展示多小说列表、创建项目、运行状态、阶段目标、人物、伏笔、时间线、任务日志和章节正文；生成、暂停/继续和刷新操作通过现有 API 完成。
- Vite 生产构建输出到 `public/`，API 必须继续提供 `index.html`、`app.js` 和 `assets/` 静态资源；不要让前端开发服务器成为生产运行依赖。

主要项目接口还包括：

- `GET /api/projects`
- `GET /api/projects/:id`
- `GET /api/projects/:id/state`
- `GET /api/projects/:id/tasks`
- `GET /api/projects/:id/chapters`
- `POST /api/projects/:id/pause`
- `POST /api/projects/:id/resume`

## 故事数据规则

- 已生成的章节正文只能追加，不能覆盖或删除。
- 过去章节不能被自动修订；未来剧情通过新章节自洽。
- 人物状态、伏笔和时间线的更正采用追加事件，保留历史可追溯性。
- 新增持久化行为必须补充规范测试。
- 运行时数据库位于 `data/`，不提交数据库、密钥或 `.env` 文件。
- 第一版只负责生成和保存，不实现外部平台自动发布。
- 正文生成必须通过工作流调用 `Store`；不要在 HTTP 路由或前端直接写 SQLite。
- 模型返回内容必须在写入故事状态或章节前解析、校验并转换为领域类型；不要信任模型返回的任意 JSON。
- 一致性检查应使用写入前的旧状态和当前候选产物；不能用已经被候选产物污染的状态证明候选产物正确。
- 动态规划只能生成未来阶段；`completedStages` 和历史章节是只追加事实，不能被新阶段覆盖或伪造。
- 章节号由存储层决定并保持递增；不要让客户端指定一个可能覆盖历史的章节编号。
- 任务状态应反映真实执行结果：开始前 `queued`，执行中 `running`，成功为 `succeeded`，失败为 `failed`；不得用“返回 HTTP 200”代替任务成功。
- 队列任务必须设置合理的 `maxAttempts` 和 `timeoutMs`；重试不能绕过追加式写入规则，也不能静默覆盖已有章节。
- 超时只代表当前 worker 不再等待该任务；模型请求本身未必可被底层取消，因此 handler 必须尽量在持久化前完成校验并保持幂等。
- 暂停项目时，queued 任务转为 `paused`；继续项目时才恢复为 `queued`。正在执行的任务允许完成当前不可分割步骤，但不得启动后续任务。

## 开发约定

- 优先保持小而明确的模块边界，避免引入未经计划的基础设施。
- API 输入、模型输出和持久化数据都要做显式校验。
- 不要把 API 密钥写入源码、测试、日志或提交记录。
- 变更工作流时同步更新 `PLAN.md` 或相关文档，并保留可回滚、可审计的任务状态。

## 测试约定

- `test/store.test.ts` 验证项目、任务、章节和追加式状态更正等存储不变量。
- `test/phase1.test.ts` 使用假的兼容模型验证 Phase 1 三步生成链路及结构化产物落库。
- `test/phase2.test.ts` 验证复杂度分流、任务重试、超时、暂停、继续和 worker 重启恢复。
- `test/phase3.test.ts` 验证事实检索、一致性问题、伏笔超期检测和阶段完成后的动态规划。
- 新增或改变 API/工作流行为时，优先补充规范测试，再修改实现；测试不得依赖真实云端 API。
- 完成修改后至少执行：`npm run build && npm test`。若涉及 HTTP 路由，再做一次临时数据目录的启动级验收。

## 下一阶段边界

Phase 5 才实现动态 Agent 工厂、总控授权、临时任务隔离、失败降级和完整恢复测试。WebUI 只是故事状态的观察和控制面，不是事实源；新增前端操作必须通过 API 和领域规则完成。
