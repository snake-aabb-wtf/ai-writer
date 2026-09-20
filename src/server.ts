import "node:process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import type { CreateProjectInput, Project, StoryState, Task } from "./domain/types.js";
import { OpenAICompatibleClient } from "./model/openai.js";
import { Store } from "./storage/store.js";
import { bootstrapProject, makeBootstrapTask } from "./workflows/bootstrap.js";

const config = loadConfig();
const store = new Store(config.dataDir);
const model = new OpenAICompatibleClient(config);

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!Buffer.concat(chunks).length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function route(pathname: string): string[] { return pathname.split("/").filter(Boolean); }

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const parts = route(new URL(req.url ?? "/", "http://localhost").pathname);
  if (method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS", "access-control-allow-headers": "content-type" }); res.end(); return; }
  if (method === "GET" && parts.length === 0) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(await readFile(join(process.cwd(), "public/index.html"))); return; }
  if (method === "GET" && parts.length === 1 && parts[0] === "app.js") { res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" }); res.end(await readFile(join(process.cwd(), "public/app.js"))); return; }
  if (method === "GET" && parts[0] === "health") { send(res, 200, { ok: true, modelConfigured: model.configured }); return; }
  if (method === "GET" && parts[0] === "api" && parts[1] === "projects" && parts.length === 2) { send(res, 200, { projects: store.listProjects() }); return; }
  if (method === "POST" && parts[0] === "api" && parts[1] === "projects" && parts.length === 2) {
    const input = await readJson(req) as Partial<CreateProjectInput>;
    if (!input.name || !input.genre || !input.style || !input.premise) { send(res, 400, { error: "name、genre、style、premise 均为必填项" }); return; }
    const now = new Date().toISOString();
    const project: Project = { id: randomUUID(), name: input.name, language: input.language ?? "中文简体", genre: input.genre, style: input.style, premise: input.premise, status: "draft", currentStage: "created", createdAt: now, updatedAt: now };
    const state: StoryState = { projectId: project.id, theme: "", endingDirection: "", bible: { summary: "", rules: [], locations: [], factions: [] }, characters: [], timeline: [], foreshadowing: [], corrections: [], revision: 1, updatedAt: now };
    store.createProject(project, state);
    const task = makeBootstrapTask(project.id); store.createTask(task);
    if (input.autoStart) { void bootstrapProject(store, model, project, task).catch((error: Error) => { store.updateTask({ ...task, status: "failed", attempts: task.attempts + 1, error: error.message, updatedAt: new Date().toISOString() }); }); }
    send(res, 201, { project, task }); return;
  }
  if (parts[0] === "api" && parts[1] === "projects" && parts[2]) {
    const project = store.getProject(parts[2]);
    if (!project) { send(res, 404, { error: "项目不存在" }); return; }
    if (method === "GET" && parts[3] === "state") { send(res, 200, { project, state: store.getStoryState(project.id) }); return; }
    if (method === "GET" && parts[3] === "chapters") { send(res, 200, { chapters: store.listChapters(project.id) }); return; }
    if (method === "GET" && parts[3] === "tasks") { send(res, 200, { tasks: store.listTasks(project.id) }); return; }
    if (method === "POST" && parts[3] === "pause") { const next = { ...project, status: "paused" as const, updatedAt: new Date().toISOString() }; store.updateProject(next); send(res, 200, { project: next }); return; }
    if (method === "POST" && parts[3] === "resume") { const next = { ...project, status: "running" as const, updatedAt: new Date().toISOString() }; store.updateProject(next); send(res, 200, { project: next }); return; }
  }
  send(res, 404, { error: "路由不存在" });
}

const server = createServer((req, res) => { handle(req, res).catch((error: Error) => send(res, 500, { error: error.message })); });
server.listen(config.port, () => console.log(`AI Writer API listening on http://localhost:${config.port}`));
process.on("SIGINT", () => { store.close(); server.close(); });
