# AI Writer

> **AI Agent 自动化小说创作工作台**

[![CI](https://github.com/snake-aabb-wtf/ai-writer/actions/workflows/ci.yml/badge.svg)](https://github.com/snake-aabb-wtf/ai-writer/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/snake-aabb-wtf/ai-writer?label=release)](https://github.com/snake-aabb-wtf/ai-writer/releases)
[![License](https://img.shields.io/github/license/snake-aabb-wtf/ai-writer)](LICENSE)

**别再把灵感丢在聊天记录里。**

AI Writer 把小说创作变成一条可观察、可控制、可持续演进的 Agent 生产线：从一句话灵感出发，自动搭建世界观、塑造人物、规划故事阶段、生成章节，并持续检查人物状态、时间线和伏笔的一致性。

它不是一个“输入提示词、吐出一段文字”的一次性生成器，而是一座属于你的**数字写作工作室**：每部小说独立管理，故事事实结构化沉淀，任务过程全程留痕，创作方向始终掌握在你手里。

## 为什么是 AI Writer？

### 从灵感，到可继续的故事

一句设想不再需要先写成几十页设定。AI Writer 会把模糊想法逐步展开为：

```text
一句话灵感
    ↓
世界观与人物
    ↓
故事阶段与章节目标
    ↓
复杂度评估：章节级 / 场景级
    ↓
章节正文与结构化产物
    ↓
一致性检查、伏笔追踪、下一阶段规划
```

### 让多个 Agent 各司其职

- **总控 Agent**：编排创作流程，决定每一步如何推进
- **设定 Agent**：构建世界规则、地点、势力和人物基础
- **规划 Agent**：把核心想法变成可执行的阶段目标
- **写作 Agent**：在故事事实约束下生成章节正文
- **连贯性 Agent**：检查人物不可逆状态、时间线和伏笔冲突
- **记忆 Agent**：维护结构化故事状态，让后续创作不靠“硬塞全文”

所有 Agent 共享同一个 OpenAI Chat Completions 兼容模型，但拥有不同的职责、提示词、上下文和工作流位置。**Agent 是分工，不是无序群聊。**

## 核心能力

| 能力 | 你得到什么 |
| --- | --- |
| **多小说工作台** | 同时管理多部作品，独立保存设定、章节和运行状态 |
| **结构化故事记忆** | 世界观、人物、时间线、伏笔和更正记录可查询、可追溯 |
| **动态故事规划** | 锁定核心方向，让未来剧情随着已发生事实自然演化 |
| **质量与一致性守门** | 发现冲突后记录问题，保护已生成正文不被静默篡改 |
| **可靠任务队列** | 支持重试、超时、暂停、继续和进程重启恢复 |
| **安全的项目生命周期** | 归档可恢复，永久删除需要输入完整项目名二次确认 |
| **创作观测台** | 运行状态、任务日志、人物、伏笔、时间线和正文集中查看 |
| **单模型兼容接入** | OpenAI、OpenRouter、DeepSeek 及其他兼容服务均可接入 |

## 产品观

### 过去是事实，未来可演化

已经生成的章节正文只追加、不覆盖。人物死亡、永久离场、重大变化和已发生事件都会沉淀为故事事实；如果后续发现问题，系统通过更正记录和未来剧情自洽处理，而不是偷偷改写历史。

### 失败也要可解释

每个任务都有状态、尝试次数、超时边界和事件记录。模型输出如果被 `finish_reason=length` 截断，系统会明确识别并重试；章节正文也有长度上限，不会让半截 JSON 或失控长文本悄悄进入故事库。

### 创作过程值得被看见

WebUI 不只是一个输入框和一个生成按钮。你可以看到项目正在经历哪个阶段、哪个 Agent 正在工作、哪些伏笔仍未回收，以及每一章是如何从故事状态中生长出来的。

## 当前版本

**v1.0.0 · 创作工作台 MVP**

当前版本已经完成 Phase 0–5：Vite + React 工作台、SQLite 持久化队列、事实检索、一致性检查、动态阶段规划、动态 Agent 授权与稳定性基础设施全部就位。

当前主链路聚焦于**从灵感稳定生成并保存第一章**；多章节后台连载、完整场景拆分、BullMQ/Redis、多模型路由和外部平台发布是后续演进方向。我们宁愿把边界写清楚，也不把路线图伪装成已交付功能。

## 快速开始

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

### Linux + Nginx 部署

仓库的 `deploy/` 提供了持久化服务和 Nginx 反代模板。当前部署使用三级域名 **`aiwriter.Luminthalia.top`**，Node 服务只监听本机 `4317` 端口：

```bash
sudo install -o root -g root -m 0644 deploy/ai-writer.service /etc/systemd/system/ai-writer.service
sudo install -o root -g root -m 0644 deploy/nginx-aiwriter.conf /etc/nginx/sites-available/aiwriter
sudo ln -s /etc/nginx/sites-available/aiwriter /etc/nginx/sites-enabled/aiwriter
sudo nginx -t && sudo systemctl daemon-reload
sudo systemctl enable --now ai-writer.service
sudo systemctl reload nginx
```

先为 `aiwriter.Luminthalia.top` 添加指向服务器公网 IP 的 DNS A 记录；DNS 生效后，再运行 `sudo certbot --nginx -d aiwriter.Luminthalia.top --redirect` 开启 HTTPS。

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

Phase 1 会依次执行设定初始化、阶段规划、复杂度评估、章节生成和复核任务。章节生成使用更大的独立输出预算，并要求正文不超过 3500 个字符；模型返回 `finish_reason=length` 时会被识别为截断错误并交给队列重试。模型未配置时使用确定性的降级内容，便于本地验收；配置 `.env` 后则所有步骤都调用同一个 OpenAI Chat Completions 兼容模型。

项目生命周期：工作台的“项目菜单”支持归档与恢复；归档只隐藏项目，不删除正文或故事状态。永久删除需要输入完整项目名称确认，并会级联删除该项目的正文、状态、任务、动态 Agent 和事件日志。

## 诚实的产品边界

- 正文表只提供追加写入接口，数据库唯一索引阻止覆盖同一项目的同一章节号。
- 结构化状态通过 revision 和 corrections 设计为追加式演进。
- Phase 1 只生成第一章，项目完成后进入暂停状态；Phase 2/3 已提供任务重试/超时、暂停/继续、进程恢复、章节/场景复杂度选择、事实检索、一致性报告、伏笔超期检测和阶段完成后的下一阶段规划基础能力。
- WebUI 已提供“生成第一章”按钮，并可查看章节正文、故事状态和完整任务记录。
- Phase 4 WebUI 已迁移到 Vite + React，提供多小说列表、项目创建、运行控制、阶段目标、人物/伏笔/时间线、任务日志和章节阅读。
- WebUI 项目菜单支持“归档项目”“恢复项目”和受保护的“永久删除”；运行中的项目必须先暂停才能归档或永久删除。
- Phase 5 提供动态 Agent 工厂、总控权限白名单、任务隔离、授权过期、失败最佳输出保留和持久化事件日志；可通过 `/api/projects/:id/events` 查看事件，通过 `/api/projects/:id/agents` 查看动态 Agent 生命周期。
- Phase 0 至 Phase 5 共六个计划阶段均已完成。多章节后台连载循环、完整场景拆分、BullMQ/Redis、模型路由和外部发布属于后续演进，不是当前 MVP 的承诺。
