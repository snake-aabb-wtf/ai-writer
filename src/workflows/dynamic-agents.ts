import { randomUUID } from "node:crypto";
import type { AgentAuthorization, AgentCapability, DynamicAgent, Task } from "../domain/types.js";
import { Store } from "../storage/store.js";

const ALL_CAPABILITIES: ReadonlySet<AgentCapability> = new Set([
  "read-story",
  "read-chapters",
  "propose-draft",
  "write-current-task",
  "append-story-state",
]);

function now(): string { return new Date().toISOString(); }

function uniqueCapabilities(capabilities: AgentCapability[]): AgentCapability[] {
  return [...new Set(capabilities)];
}

function assertCapabilities(capabilities: AgentCapability[]): void {
  for (const capability of capabilities) {
    if (!ALL_CAPABILITIES.has(capability)) throw new Error(`不支持的动态 Agent 权限：${capability}`);
  }
}

function isExpired(agent: DynamicAgent, at = now()): boolean {
  return agent.expiresAt <= at;
}

export function createDynamicAgent(store: Store, projectId: string, purpose: string, requestedCapabilities: AgentCapability[], ttlMs = 120_000): DynamicAgent {
  if (!purpose.trim()) throw new Error("动态 Agent 必须有明确用途");
  const requested = uniqueCapabilities(requestedCapabilities);
  assertCapabilities(requested);
  const createdAt = now();
  const agent: DynamicAgent = {
    id: randomUUID(),
    projectId,
    purpose: purpose.trim(),
    requestedCapabilities: requested,
    grantedCapabilities: [],
    status: "created",
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    createdAt,
    updatedAt: createdAt,
  };
  store.createDynamicAgent(agent);
  store.appendEvent({ id: randomUUID(), projectId, type: "agent.created", agentId: agent.id, payload: { purpose: agent.purpose, requestedCapabilities: requested }, createdAt });
  return agent;
}

/** 只有总控可以调用此函数；动态 Agent 不存在自我授权路径。 */
export function authorizeDynamicAgent(store: Store, agentId: string, taskId: string, grantedCapabilities: AgentCapability[]): { agent: DynamicAgent; authorization: AgentAuthorization } {
  const agent = store.getDynamicAgent(agentId);
  if (!agent) throw new Error("动态 Agent 不存在");
  if (agent.status !== "created") throw new Error(`动态 Agent 当前状态不可授权：${agent.status}`);
  if (isExpired(agent)) throw new Error("动态 Agent 授权已过期");
  const granted = uniqueCapabilities(grantedCapabilities);
  assertCapabilities(granted);
  if (granted.some((capability) => !agent.requestedCapabilities.includes(capability))) {
    throw new Error("总控不能授予动态 Agent 未请求的权限");
  }
  const updatedAt = now();
  const updated: DynamicAgent = { ...agent, grantedCapabilities: granted, status: "authorized", taskId, updatedAt };
  store.updateDynamicAgent(updated);
  const authorization: AgentAuthorization = { agentId, taskId, grantedCapabilities: granted, expiresAt: agent.expiresAt };
  store.appendEvent({ id: randomUUID(), projectId: agent.projectId, type: "agent.authorized", taskId, agentId, payload: { grantedCapabilities: granted }, createdAt: updatedAt });
  return { agent: updated, authorization };
}

export function makeDynamicTask(projectId: string, agent: DynamicAgent, authorization: AgentAuthorization, input: unknown = {}): Task {
  if (agent.status !== "authorized" || agent.taskId !== authorization.taskId) throw new Error("动态 Agent 未绑定到当前任务");
  return {
    id: authorization.taskId,
    projectId,
    kind: "dynamic-special",
    status: "queued",
    input,
    attempts: 0,
    maxAttempts: 2,
    timeoutMs: 60_000,
    availableAt: now(),
    agentRole: "dynamic",
    dynamicAgentId: agent.id,
    isolationKey: `dynamic:${agent.id}`,
    authorization,
    createdAt: now(),
    updatedAt: now(),
  };
}

export function assertDynamicCapability(task: Task, capability: AgentCapability, at = now()): void {
  if (task.kind !== "dynamic-special" || !task.authorization || !task.dynamicAgentId) throw new Error("当前任务不是受授权的动态 Agent 任务");
  if (task.authorization.agentId !== task.dynamicAgentId || task.authorization.taskId !== task.id) throw new Error("动态 Agent 任务授权不匹配");
  if (task.authorization.expiresAt <= at) throw new Error("动态 Agent 任务授权已过期");
  if (!task.authorization.grantedCapabilities.includes(capability)) throw new Error(`动态 Agent 未获授予权限：${capability}`);
}

export function completeDynamicAgent(store: Store, task: Task): void {
  if (!task.dynamicAgentId) return;
  const agent = store.getDynamicAgent(task.dynamicAgentId);
  if (!agent) return;
  const updatedAt = now();
  store.updateDynamicAgent({ ...agent, status: "completed", updatedAt });
}
