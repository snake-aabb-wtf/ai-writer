# AI Writer

单用户、多小说的自动化小说生产工作台。当前已完成 Phase 5：提供 Vite + React 创作观测台、SQLite 任务队列、事实检索、一致性检查、动态阶段规划，以及受总控授权的动态 Agent 稳定性基础设施。

## 运行

```bash
npm install
cp .env.example .env
npm run build
npm start
```

默认监听 `http://localhost:4317`。Node.js 需要 24+，因为 MVP 使用内置 `node:sqlite`。

开发时可分别运行 API 和前端：

```bash
npm run dev       # API
npm run dev:web   # Vite + React
```

生产构建会把 React 页面输出到 `public/`，由同一个 Node API 服务静态资源。

Windows 用户可以先复制并填写 `.env`，然后双击 `start.bat` 启动；Linux/macOS 用户运行 `./start.sh`。两个脚本都会使用 Node 24 的 `--env-file=.env` 加载模型配置，若尚未构建则先执行 `npm run build`。

## API 快速验证

```bash
curl http://localhost:4317/health
curl -X POST http://localhost:4317/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"我的小说","genre":"科幻悬疑","style":"冷峻、节奏紧凑","premise":"一个普通人发现城市每天都会少一个人","autoStart":false}'
```

模型配置完成后，创建项目时将 `autoStart` 设为 `true`，系统会异步执行完整 Phase 1。未配置模型时仍可运行本地降级闭环。

创建项目后也可以单独启动 Phase 1：

```bash
curl -X POST http://localhost:4317/api/projects/<project-id>/generate
curl http://localhost:4317/api/projects/<project-id>/chapters
```

Phase 1 会依次执行三个任务：`bootstrap`、`plan-stage`、`produce-chapter`。模型未配置时使用确定性的降级内容，便于本地验收；配置 `.env` 后则三步都调用同一个 OpenAI Chat Completions 兼容模型。

## 当前边界

- 正文表只提供追加写入接口，数据库唯一索引阻止覆盖同一项目的同一章节号。
- 结构化状态通过 revision 和 corrections 设计为追加式演进。
- Phase 1 只生成第一章，项目完成后进入暂停状态；Phase 2/3 已提供任务重试/超时、暂停/继续、进程恢复、章节/场景复杂度选择、事实检索、一致性报告、伏笔超期检测和阶段完成后的下一阶段规划基础能力。
- WebUI 已提供“生成第一章”按钮，并可查看章节正文、故事状态和三步任务记录。
- Phase 4 WebUI 已迁移到 Vite + React，提供多小说列表、项目创建、运行控制、阶段目标、人物/伏笔/时间线、任务日志和章节阅读。
- Phase 5 提供动态 Agent 工厂、总控权限白名单、任务隔离、授权过期、失败最佳输出保留和持久化事件日志；可通过 `/api/projects/:id/events` 查看事件，通过 `/api/projects/:id/agents` 查看动态 Agent 生命周期。
- Phase 0 至 Phase 5 共六个计划阶段均已完成。多章节后台连载循环、完整场景拆分、BullMQ/Redis、模型路由和外部发布属于后续演进，不是当前 MVP 的承诺。
