# AI Writer

单用户、多小说的自动化小说生产工作台。当前已完成 Phase 2：可以从项目灵感依次生成初始设定/人物、故事阶段和第一章，并通过 SQLite 任务队列提供重试、超时、暂停/继续和恢复基础能力。

## 运行

```bash
npm install
cp .env.example .env
npm run build
npm start
```

默认监听 `http://localhost:4317`。Node.js 需要 24+，因为 MVP 使用内置 `node:sqlite`。

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
- Phase 1 只生成第一章，项目完成后进入暂停状态；Phase 2 已提供任务重试/超时、暂停/继续、进程恢复和章节/场景复杂度选择基础能力，连续章节和完整场景拆分属于后续阶段。
- WebUI 已提供“生成第一章”按钮，并可查看章节正文、故事状态和三步任务记录。
