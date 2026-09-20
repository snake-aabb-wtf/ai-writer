# AI Writer

单用户、多小说的自动化小说生产工作台。当前是第一阶段 MVP：项目创建、故事状态初始化、任务记录、章节只追加存储和暂停/继续 API。

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

模型配置完成后，创建项目时将 `autoStart` 设为 `true`，系统会执行第一步设定初始化。未配置模型时仍可建立项目，初始化会保存一个可继续规划的空白状态。

## 当前边界

- 正文表只提供追加写入接口，数据库唯一索引阻止覆盖同一项目的同一章节号。
- 结构化状态通过 revision 和 corrections 设计为追加式演进。
- WebUI 和完整章节生产工作流将在下一阶段接入；当前 API 是可测试的后端骨架。
