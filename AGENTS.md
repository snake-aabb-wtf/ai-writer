# AGENTS.md

## 项目概览

AI Writer 是一个单用户、多小说的自动化小说生产工作台。当前版本是可启动的 MVP，后续实现应以 [PLAN.md](/data1/project/AI%20Writer/PLAN.md) 为总体设计依据。

## 技术栈与常用命令

- Node.js 24+
- TypeScript，ES modules
- Node 内置 `node:sqlite` 持久化
- 原生 HTML/CSS/JavaScript WebUI，暂不引入前端框架
- `npm run build`：编译 TypeScript
- `npm test`：运行测试
- `npm start`：启动生产构建后的 API/WebUI
- `npm run dev`：开发模式启动

每次修改后至少运行 `npm run build` 和 `npm test`。

## 架构边界

- `src/domain/`：领域类型和状态模型。
- `src/storage/`：SQLite 存储及数据不变量。
- `src/model/`：OpenAI Chat Completions 兼容模型调用层；模型配置来自环境变量。
- `src/workflows/`：工作流初始化和任务编排。
- `src/server.ts`：HTTP API 与静态 WebUI 服务。
- `public/`：浏览器端界面。
- `test/`：存储和工作流行为测试。

Agent 角色属于应用层逻辑，不应绕过工作流和存储层直接修改数据库或正文文件。

## 故事数据规则

- 已生成的章节正文只能追加，不能覆盖或删除。
- 过去章节不能被自动修订；未来剧情通过新章节自洽。
- 人物状态、伏笔和时间线的更正采用追加事件，保留历史可追溯性。
- 新增持久化行为必须补充规范测试。
- 运行时数据库位于 `data/`，不提交数据库、密钥或 `.env` 文件。
- 第一版只负责生成和保存，不实现外部平台自动发布。

## 开发约定

- 优先保持小而明确的模块边界，避免引入未经计划的基础设施。
- API 输入、模型输出和持久化数据都要做显式校验。
- 不要把 API 密钥写入源码、测试、日志或提交记录。
- 变更工作流时同步更新 `PLAN.md` 或相关文档，并保留可回滚、可审计的任务状态。
