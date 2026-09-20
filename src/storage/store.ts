import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Chapter, Project, StoryState, Task } from "../domain/types.js";

export class Store {
  readonly db: DatabaseSync;

  constructor(dataDir: string) {
    const databasePath = resolve(dataDir, "ai-writer.db");
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS story_states (
        project_id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );
      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        chapter_number INTEGER NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS chapters_project_number ON chapters(project_id, chapter_number);
      CREATE INDEX IF NOT EXISTS tasks_project_status ON tasks(project_id, status);
    `);
  }

  close(): void { this.db.close(); }

  createProject(project: Project, state: StoryState): void {
    const tx = this.db.prepare("INSERT INTO projects (id, payload, created_at, updated_at) VALUES (?, ?, ?, ?)");
    const stateTx = this.db.prepare("INSERT INTO story_states (project_id, payload, revision, updated_at) VALUES (?, ?, ?, ?)");
    tx.run(project.id, JSON.stringify(project), project.createdAt, project.updatedAt);
    stateTx.run(state.projectId, JSON.stringify(state), state.revision, state.updatedAt);
  }

  listProjects(): Project[] {
    const rows = this.db.prepare("SELECT payload FROM projects ORDER BY updated_at DESC").all() as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as Project);
  }

  getProject(id: string): Project | undefined {
    const row = this.db.prepare("SELECT payload FROM projects WHERE id = ?").get(id) as { payload?: string } | undefined;
    return row?.payload ? JSON.parse(row.payload) as Project : undefined;
  }

  updateProject(project: Project): void {
    this.db.prepare("UPDATE projects SET payload = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(project), project.updatedAt, project.id);
  }

  getStoryState(projectId: string): StoryState | undefined {
    const row = this.db.prepare("SELECT payload FROM story_states WHERE project_id = ?").get(projectId) as { payload?: string } | undefined;
    return row?.payload ? JSON.parse(row.payload) as StoryState : undefined;
  }

  saveStoryState(state: StoryState): void {
    this.db.prepare("UPDATE story_states SET payload = ?, revision = ?, updated_at = ? WHERE project_id = ?")
      .run(JSON.stringify(state), state.revision, state.updatedAt, state.projectId);
  }

  appendChapter(chapter: Chapter): void {
    this.db.prepare("INSERT INTO chapters (id, project_id, chapter_number, payload, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(chapter.id, chapter.projectId, chapter.number, JSON.stringify(chapter), chapter.createdAt);
  }

  listChapters(projectId: string): Chapter[] {
    const rows = this.db.prepare("SELECT payload FROM chapters WHERE project_id = ? ORDER BY chapter_number ASC").all(projectId) as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as Chapter);
  }

  getNextChapterNumber(projectId: string): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(chapter_number), 0) + 1 AS next FROM chapters WHERE project_id = ?").get(projectId) as { next: number };
    return row.next;
  }

  createTask(task: Task): void {
    this.db.prepare("INSERT INTO tasks (id, project_id, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(task.id, task.projectId, task.status, JSON.stringify(task), task.createdAt, task.updatedAt);
  }

  updateTask(task: Task): void {
    this.db.prepare("UPDATE tasks SET status = ?, payload = ?, updated_at = ? WHERE id = ?")
      .run(task.status, JSON.stringify(task), task.updatedAt, task.id);
  }

  getTask(id: string): Task | undefined {
    const row = this.db.prepare("SELECT payload FROM tasks WHERE id = ?").get(id) as { payload?: string } | undefined;
    return row?.payload ? JSON.parse(row.payload) as Task : undefined;
  }

  listTasks(projectId?: string): Task[] {
    const rows = projectId
      ? this.db.prepare("SELECT payload FROM tasks WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as Array<{ payload: string }>
      : this.db.prepare("SELECT payload FROM tasks ORDER BY created_at ASC").all() as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as Task);
  }

  claimNextTask(projectId?: string, at = new Date().toISOString()): Task | undefined {
    const candidates = this.listTasks(projectId)
      .filter((task) => task.status === "queued" && (!task.availableAt || task.availableAt <= at));
    const candidate = candidates[0];
    if (!candidate) return undefined;
    const claimed: Task = { ...candidate, status: "running", attempts: candidate.attempts + 1, updatedAt: at };
    this.updateTask(claimed);
    return claimed;
  }

  pauseQueuedTasks(projectId: string, at = new Date().toISOString()): void {
    for (const task of this.listTasks(projectId)) {
      if (task.status === "queued") this.updateTask({ ...task, status: "paused", error: "项目已暂停", updatedAt: at });
    }
  }

  resumePausedTasks(projectId: string, at = new Date().toISOString()): void {
    for (const task of this.listTasks(projectId)) {
      if (task.status === "paused") this.updateTask({ ...task, status: "queued", error: undefined, availableAt: at, updatedAt: at });
    }
  }
}
