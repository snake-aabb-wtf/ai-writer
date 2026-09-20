import { randomUUID } from "node:crypto";
import type { Task } from "../domain/types.js";
import { Store } from "../storage/store.js";
import { completeDynamicAgent } from "./dynamic-agents.js";

export class TaskTimeoutError extends Error {
  constructor(taskId: string, timeoutMs: number) {
    super(`任务 ${taskId} 超时（${timeoutMs}ms）`);
    this.name = "TaskTimeoutError";
  }
}

export class TaskPausedError extends Error {
  constructor(projectId: string) {
    super(`项目 ${projectId} 已暂停`);
    this.name = "TaskPausedError";
  }
}

export class TaskFailureError extends Error {
  constructor(message: string, readonly bestOutput?: unknown) {
    super(message);
    this.name = "TaskFailureError";
  }
}

export type TaskHandler<T = unknown> = (task: Task) => Promise<T>;

export type QueueRunResult = {
  task: Task;
  state: "succeeded" | "queued" | "failed" | "paused";
};

function now(): string { return new Date().toISOString(); }

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function withTimeout<T>(promise: Promise<T>, task: Task): Promise<T> {
  const timeoutMs = task.timeoutMs ?? 300_000;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TaskTimeoutError(task.id, timeoutMs)), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

/**
 * SQLite-backed durable queue. 任务状态存储在 Store 中，进程重启后可恢复 queued/running 任务。
 * 后续接 BullMQ 时只需替换此编排器，不改变任务领域模型和处理器接口。
 */
export class TaskQueue {
  constructor(private readonly store: Store) {}

  recoverInterruptedTasks(): Task[] {
    const recovered: Task[] = [];
    for (const task of this.store.listTasks()) {
      if (task.status !== "running") continue;
      const maxAttempts = task.maxAttempts ?? 3;
      const next: Task = task.attempts >= maxAttempts
        ? { ...task, status: "failed", error: "worker 重启后已达到最大尝试次数", updatedAt: now() }
        : { ...task, status: "queued", error: "worker 重启后重新排队", availableAt: now(), updatedAt: now() };
      this.store.updateTask(next);
      this.store.appendEvent({ id: randomUUID(), projectId: next.projectId, type: "task.recovered", taskId: next.id, agentId: next.dynamicAgentId, payload: { status: next.status, attempts: next.attempts }, createdAt: next.updatedAt });
      recovered.push(next);
    }
    return recovered;
  }

  async runNext<T = unknown>(handler: TaskHandler<T>, projectId?: string): Promise<QueueRunResult | undefined> {
    const task = this.store.claimNextTask(projectId);
    if (!task) return undefined;
    this.store.appendEvent({ id: randomUUID(), projectId: task.projectId, type: "task.claimed", taskId: task.id, agentId: task.dynamicAgentId, payload: { attempts: task.attempts, isolationKey: task.isolationKey }, createdAt: task.updatedAt });
    if (this.store.getProject(task.projectId)?.status === "paused") {
      const paused: Task = { ...task, status: "paused", error: "项目已暂停", updatedAt: now() };
      this.store.updateTask(paused);
      return { task: paused, state: "paused" };
    }

    try {
      const output = await withTimeout(handler(task), task);
      if (this.store.getProject(task.projectId)?.status === "paused") {
        const paused: Task = { ...task, status: "paused", output, error: "任务完成后检测到项目已暂停", updatedAt: now() };
        this.store.updateTask(paused);
        this.store.appendEvent({ id: randomUUID(), projectId: paused.projectId, type: "task.paused", taskId: paused.id, agentId: paused.dynamicAgentId, payload: { error: paused.error }, createdAt: paused.updatedAt });
        return { task: paused, state: "paused" };
      }
      const succeeded: Task = { ...task, status: "succeeded", output, error: undefined, updatedAt: now() };
      this.store.updateTask(succeeded);
      if (succeeded.dynamicAgentId) completeDynamicAgent(this.store, succeeded);
      this.store.appendEvent({ id: randomUUID(), projectId: succeeded.projectId, type: "task.succeeded", taskId: succeeded.id, agentId: succeeded.dynamicAgentId, payload: { attempts: succeeded.attempts }, createdAt: succeeded.updatedAt });
      return { task: succeeded, state: "succeeded" };
    } catch (error) {
      const message = errorText(error);
      const bestOutput = error instanceof TaskFailureError ? error.bestOutput : task.bestOutput;
      if (error instanceof TaskPausedError || this.store.getProject(task.projectId)?.status === "paused") {
        const paused: Task = { ...task, status: "paused", error: message, bestOutput, updatedAt: now() };
        this.store.updateTask(paused);
        this.store.appendEvent({ id: randomUUID(), projectId: paused.projectId, type: "task.paused", taskId: paused.id, agentId: paused.dynamicAgentId, payload: { error: message, hasBestOutput: bestOutput !== undefined }, createdAt: paused.updatedAt });
        return { task: paused, state: "paused" };
      }
      const maxAttempts = task.maxAttempts ?? 3;
      if (task.attempts < maxAttempts) {
        const retry: Task = { ...task, status: "queued", error: message, bestOutput, availableAt: now(), updatedAt: now() };
        this.store.updateTask(retry);
        this.store.appendEvent({ id: randomUUID(), projectId: retry.projectId, type: "task.retry", taskId: retry.id, agentId: retry.dynamicAgentId, payload: { error: message, attempts: retry.attempts, hasBestOutput: bestOutput !== undefined }, createdAt: retry.updatedAt });
        return { task: retry, state: "queued" };
      }
      const failed: Task = { ...task, status: "failed", error: message, output: bestOutput, bestOutput, updatedAt: now() };
      this.store.updateTask(failed);
      this.store.appendEvent({ id: randomUUID(), projectId: failed.projectId, type: "task.failed", taskId: failed.id, agentId: failed.dynamicAgentId, payload: { error: message, attempts: failed.attempts, hasBestOutput: bestOutput !== undefined }, createdAt: failed.updatedAt });
      return { task: failed, state: "failed" };
    }
  }

  async drain<T = unknown>(handler: TaskHandler<T>, options: { projectId?: string; maxJobs?: number } = {}): Promise<QueueRunResult[]> {
    const results: QueueRunResult[] = [];
    const maxJobs = options.maxJobs ?? 100;
    while (results.length < maxJobs) {
      const result = await this.runNext(handler, options.projectId);
      if (!result) break;
      results.push(result);
      if (result.state === "paused") break;
    }
    return results;
  }
}
