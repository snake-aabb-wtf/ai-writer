import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/storage/store.js";
import { TaskQueue } from "../src/workflows/queue.js";
import { assessChapterComplexity } from "../src/workflows/complexity.js";
import { makeTask } from "../src/workflows/bootstrap.js";
import type { Project, StoryState } from "../src/domain/types.js";

function fixture(status: Project["status"] = "running"): { store: Store; project: Project; state: StoryState } {
  const store = new Store(mkdtempSync(join(tmpdir(), "ai-writer-phase2-")));
  const now = new Date().toISOString();
  const project: Project = { id: "phase2-project", name: "队列测试", language: "中文简体", genre: "悬疑", style: "克制", premise: "一条反复出现的线索", status, currentStage: "phase2", createdAt: now, updatedAt: now };
  const state: StoryState = { projectId: project.id, theme: "", endingDirection: "", bible: { summary: "", rules: [], locations: [], factions: [] }, characters: [], timeline: [], foreshadowing: [], corrections: [], revision: 1, updatedAt: now };
  store.createProject(project, state);
  return { store, project, state };
}

describe("Phase 2", () => {
  it("根据结构化故事状态选择章节级或场景级生产", () => {
    const simple = fixture();
    assert.equal(assessChapterComplexity(simple.project, simple.state).mode, "chapter");
    simple.store.close();

    const complex = fixture();
    const state: StoryState = {
      ...complex.state,
      bible: { summary: "复杂设定", rules: ["规则1", "规则2", "规则3", "规则4"], locations: [], factions: ["势力1", "势力2", "势力3"] },
      characters: ["甲", "乙", "丙", "丁"].map((name, index) => ({ id: String(index), name, role: "角色", motivation: "目标", status: "active" as const, note: "" })),
      timeline: ["事件1", "事件2", "事件3", "事件4"].map((summary, index) => ({ id: String(index), occurredAt: "现在", summary, createdAt: new Date().toISOString() })),
      foreshadowing: ["线索1", "线索2", "线索3", "线索4"].map((summary, index) => ({ id: String(index), summary, importance: "high" as const, status: "open" as const, createdAt: new Date().toISOString() })),
    };
    assert.equal(assessChapterComplexity(complex.project, state).mode, "scene");
    complex.store.close();
  });

  it("失败任务会按最大尝试次数重新排队并最终成功", async () => {
    const { store, project } = fixture();
    const task = makeTask(project.id, "review", { purpose: "retry" });
    task.maxAttempts = 2;
    store.createTask(task);
    let calls = 0;
    const results = await new TaskQueue(store).drain(async () => {
      calls += 1;
      if (calls === 1) throw new Error("第一次失败");
      return { ok: true };
    }, { projectId: project.id, maxJobs: 2 });
    assert.deepEqual(results.map((result) => result.state), ["queued", "succeeded"]);
    assert.equal(store.getTask(task.id)?.attempts, 2);
    assert.deepEqual(store.getTask(task.id)?.output, { ok: true });
    store.close();
  });

  it("超时达到上限后任务失败，暂停项目不会继续消费任务", async () => {
    const first = fixture();
    const timeoutTask = makeTask(first.project.id, "review", { purpose: "timeout" });
    timeoutTask.maxAttempts = 2;
    timeoutTask.timeoutMs = 5;
    first.store.createTask(timeoutTask);
    const timeoutResults = await new TaskQueue(first.store).drain(() => new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("late failure")), 30)), { projectId: first.project.id, maxJobs: 2 });
    assert.deepEqual(timeoutResults.map((result) => result.state), ["queued", "failed"]);
    assert.match(first.store.getTask(timeoutTask.id)?.error ?? "", /超时/);
    first.store.close();

    const paused = fixture("paused");
    const pausedTask = makeTask(paused.project.id, "review");
    paused.store.createTask(pausedTask);
    const pausedResult = await new TaskQueue(paused.store).runNext(async () => ({ shouldNotRun: true }), paused.project.id);
    assert.equal(pausedResult?.state, "paused");
    assert.equal(paused.store.getTask(pausedTask.id)?.status, "paused");
    paused.store.close();
  });

  it("进程恢复会把未完成的 running 任务重新排队", () => {
    const { store, project } = fixture();
    const task = makeTask(project.id, "review");
    store.createTask({ ...task, status: "running", attempts: 1 });
    const recovered = new TaskQueue(store).recoverInterruptedTasks();
    assert.equal(recovered[0]?.status, "queued");
    assert.match(recovered[0]?.error ?? "", /重启/);
    const queued = makeTask(project.id, "review");
    store.createTask(queued);
    store.pauseQueuedTasks(project.id);
    assert.equal(store.getTask(queued.id)?.status, "paused");
    store.resumePausedTasks(project.id);
    assert.equal(store.getTask(queued.id)?.status, "queued");
    store.close();
  });
});
