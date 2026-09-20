import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Store, StateConflictError } from "../src/storage/store.js";
import { makeTask } from "../src/workflows/bootstrap.js";
import { createDynamicAgent, authorizeDynamicAgent, assertDynamicCapability, makeDynamicTask } from "../src/workflows/dynamic-agents.js";
import { TaskFailureError, TaskQueue } from "../src/workflows/queue.js";
import type { Project, StoryState } from "../src/domain/types.js";

function fixture(): { store: Store; project: Project; state: StoryState } {
  const store = new Store(mkdtempSync(join(tmpdir(), "ai-writer-phase5-")));
  const now = new Date().toISOString();
  const project: Project = { id: "phase5-project", name: "稳定性测试", language: "中文简体", genre: "悬疑", style: "克制", premise: "一份无法伪造的记录", status: "running", currentStage: "phase5", createdAt: now, updatedAt: now };
  const state: StoryState = { projectId: project.id, theme: "记录", endingDirection: "查明来源", bible: { summary: "", rules: [], locations: [], factions: [] }, currentStagePlan: null, characters: [], timeline: [], foreshadowing: [], corrections: [], revision: 1, updatedAt: now };
  store.createProject(project, state);
  return { store, project, state };
}

describe("Phase 5", () => {
  it("动态 Agent 默认只读，授权必须来自总控且任务隔离", async () => {
    const { store, project } = fixture();
    const agent = createDynamicAgent(store, project.id, "设计一条特殊谜题", ["read-story", "propose-draft", "write-current-task"]);
    assert.deepEqual(agent.grantedCapabilities, []);
    assert.throws(() => authorizeDynamicAgent(store, agent.id, "wrong-task", ["append-story-state"]), /未请求的权限/);
    const { agent: authorized, authorization } = authorizeDynamicAgent(store, agent.id, "dynamic-task-1", ["read-story", "propose-draft"]);
    const task = makeDynamicTask(project.id, authorized, authorization, { clue: "clock" });
    assert.equal(task.agentRole, "dynamic");
    assert.equal(task.isolationKey, `dynamic:${agent.id}`);
    assert.doesNotThrow(() => assertDynamicCapability(task, "read-story"));
    assert.throws(() => assertDynamicCapability(task, "write-current-task"), /未获授予/);
    store.createTask(task);
    const result = await new TaskQueue(store).runNext(async (runningTask) => {
      assert.equal(runningTask.isolationKey, task.isolationKey);
      assertDynamicCapability(runningTask, "propose-draft");
      return { draft: "只提交建议" };
    }, project.id);
    assert.equal(result?.state, "succeeded");
    assert.equal(store.getDynamicAgent(agent.id)?.status, "completed");
    assert.ok(store.listEvents(project.id).some((event) => event.type === "agent.authorized"));
    assert.ok(store.listEvents(project.id).some((event) => event.type === "task.succeeded"));
    store.close();
  });

  it("失败任务会保留最佳输出，事件日志记录重试和最终失败", async () => {
    const { store, project } = fixture();
    const task = makeTask(project.id, "review", { purpose: "best-version" });
    task.maxAttempts = 2;
    store.createTask(task);
    const results = await new TaskQueue(store).drain(async () => {
      throw new TaskFailureError("检查未达标", { body: "当前最佳草稿", score: 0.72 });
    }, { projectId: project.id, maxJobs: 2 });
    assert.deepEqual(results.map((result) => result.state), ["queued", "failed"]);
    assert.deepEqual(store.getTask(task.id)?.output, { body: "当前最佳草稿", score: 0.72 });
    const eventTypes = store.listEvents(project.id).map((event) => event.type);
    assert.ok(eventTypes.includes("task.retry"));
    assert.ok(eventTypes.includes("task.failed"));
    store.close();
  });

  it("状态写入支持乐观版本检查，恢复任务会留下恢复事件", () => {
    const { store, project, state } = fixture();
    assert.throws(() => store.saveStoryState({ ...state, revision: 2 }, 99), StateConflictError);
    const task = makeTask(project.id, "review");
    store.createTask({ ...task, status: "running", attempts: 1 });
    const recovered = new TaskQueue(store).recoverInterruptedTasks();
    assert.equal(recovered[0]?.status, "queued");
    assert.ok(store.listEvents(project.id).some((event) => event.type === "task.recovered"));
    store.close();
  });
});
