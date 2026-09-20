import "node:process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { loadConfig } from "./config.js";
import type { CreateProjectInput, Project, StoryState, Task } from "./domain/types.js";
import { OpenAICompatibleClient } from "./model/openai.js";
import { Store } from "./storage/store.js";
import { runPhaseOne } from "./workflows/bootstrap.js";
import { TaskQueue } from "./workflows/queue.js";

const config = loadConfig();
const store = new Store(config.dataDir);
const model = new OpenAICompatibleClient(config);
const queue = new TaskQueue(store);
queue.recoverInterruptedTasks();

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

function staticContentType(filePath: string): string {
  const extension = extname(filePath);
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<boolean> {
  const publicRoot = resolve(process.cwd(), "public");
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}/`)) return false;
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": staticContentType(filePath) });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!Buffer.concat(chunks).length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function route(pathname: string): string[] { return pathname.split("/").filter(Boolean); }

function startPhaseOne(project: Project): void {
  void runPhaseOne(store, model, project).catch((error: unknown) => {
    console.error(`Phase 1 执行失败：${error instanceof Error ? error.message : String(error)}`);
  });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const parts = route(new URL(req.url ?? "/", "http://localhost").pathname);
  if (method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS", "access-control-allow-headers": "content-type" }); res.end(); return; }
  if (method === "GET" && (parts.length === 0 || parts[0] === "app.js" || parts[0] === "assets")) {
    if (await serveStatic(new URL(req.url ?? "/", "http://localhost").pathname, res)) return;
  }
  if (method === "GET" && parts[0] === "health") { send(res, 200, { ok: true, modelConfigured: model.configured }); return; }
  if (method === "GET" && parts[0] === "api" && parts[1] === "projects" && parts.length === 2) { send(res, 200, { projects: store.listProjects() }); return; }
  if (method === "POST" && parts[0] === "api" && parts[1] === "projects" && parts.length === 2) {
    const input = await readJson(req) as Partial<CreateProjectInput>;
    if (!input.name || !input.genre || !input.style || !input.premise) { send(res, 400, { error: "name、genre、style、premise 均为必填项" }); return; }
    const now = new Date().toISOString();
    const project: Project = { id: randomUUID(), name: input.name, language: input.language ?? "中文简体", genre: input.genre, style: input.style, premise: input.premise, status: "draft", currentStage: "created", createdAt: now, updatedAt: now };
    const state: StoryState = { projectId: project.id, theme: "", endingDirection: "", bible: { summary: "", rules: [], locations: [], factions: [] }, currentStagePlan: null, characters: [], timeline: [], foreshadowing: [], corrections: [], revision: 1, updatedAt: now };
    store.createProject(project, state);
    if (input.autoStart) startPhaseOne(project);
    send(res, 201, { project: store.getProject(project.id), tasks: store.listTasks(project.id) }); return;
  }
  if (parts[0] === "api" && parts[1] === "projects" && parts[2]) {
    const project = store.getProject(parts[2]);
    if (!project) { send(res, 404, { error: "项目不存在" }); return; }
    if (method === "GET" && parts[3] === "state") { send(res, 200, { project, state: store.getStoryState(project.id) }); return; }
    if (method === "GET" && parts[3] === "chapters") { send(res, 200, { chapters: store.listChapters(project.id) }); return; }
    if (method === "GET" && parts[3] === "tasks") { send(res, 200, { tasks: store.listTasks(project.id) }); return; }
    if (method === "GET" && parts[3] === "events") { send(res, 200, { events: store.listEvents(project.id) }); return; }
    if (method === "GET" && parts[3] === "agents") { send(res, 200, { agents: store.listDynamicAgents(project.id) }); return; }
    if (method === "POST" && parts[3] === "generate") {
      if (project.status === "running") { send(res, 409, { error: "项目正在生成中" }); return; }
      if (store.listChapters(project.id).length > 0) { send(res, 409, { error: "项目已经生成过第一章，Phase 2 才会支持继续生成" }); return; }
      startPhaseOne(project);
      send(res, 202, { project: store.getProject(project.id), message: "Phase 1 已开始执行" }); return;
    }
    if (method === "POST" && parts[3] === "pause") { const next = { ...project, status: "paused" as const, updatedAt: new Date().toISOString() }; store.updateProject(next); store.pauseQueuedTasks(project.id, next.updatedAt); send(res, 200, { project: next, tasks: store.listTasks(project.id) }); return; }
    if (method === "POST" && parts[3] === "resume") { const next = { ...project, status: "running" as const, updatedAt: new Date().toISOString() }; store.updateProject(next); store.resumePausedTasks(project.id, next.updatedAt); send(res, 200, { project: next, tasks: store.listTasks(project.id) }); return; }
  }
  send(res, 404, { error: "路由不存在" });
}

const server = createServer((req, res) => { handle(req, res).catch((error: Error) => send(res, 500, { error: error.message })); });
server.listen(config.port, () => console.log(`AI Writer API listening on http://localhost:${config.port}`));
process.on("SIGINT", () => { store.close(); server.close(); });
