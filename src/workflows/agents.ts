import type { CoreAgentRole, Task } from "../domain/types.js";

export const CORE_AGENTS: ReadonlyArray<{ role: CoreAgentRole; label: string; taskKinds: ReadonlyArray<Task["kind"]> }> = [
  { role: "orchestrator", label: "总控 Agent", taskKinds: ["bootstrap", "review"] },
  { role: "world-builder", label: "设定 Agent", taskKinds: ["bootstrap"] },
  { role: "planner", label: "规划 Agent", taskKinds: ["plan-stage", "assess-complexity"] },
  { role: "writer", label: "写作 Agent", taskKinds: ["produce-chapter", "produce-scene"] },
  { role: "continuity", label: "连贯性 Agent", taskKinds: ["review"] },
  { role: "memory", label: "记忆 Agent", taskKinds: ["review"] },
];

export function roleForTask(kind: Task["kind"]): CoreAgentRole {
  const agent = CORE_AGENTS.find((candidate) => candidate.taskKinds.includes(kind));
  return agent?.role ?? "orchestrator";
}
