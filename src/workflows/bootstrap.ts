import { randomUUID } from "node:crypto";
import type { Project, StoryState, Task } from "../domain/types.js";
import { OpenAICompatibleClient } from "../model/openai.js";
import { Store } from "../storage/store.js";

export async function bootstrapProject(store: Store, model: OpenAICompatibleClient, project: Project, task: Task): Promise<void> {
  const state = store.getStoryState(project.id);
  if (!state) throw new Error("项目故事状态不存在");

  let generated = { theme: "", endingDirection: "", summary: "", rules: [] as string[], locations: [] as string[], factions: [] as string[] };
  if (model.configured) {
    const text = await model.chat([
      { role: "system", content: "你是小说总控 Agent。只输出 JSON，不要 Markdown。字段必须是 theme、endingDirection、summary、rules、locations、factions。" },
      { role: "user", content: JSON.stringify({ genre: project.genre, style: project.style, premise: project.premise, language: project.language }) },
    ], { temperature: 0.7, maxTokens: 1800 });
    generated = JSON.parse(text) as typeof generated;
  } else {
    generated = {
      theme: project.premise,
      endingDirection: "由后续故事阶段动态演化，暂不锁定具体结局。",
      summary: project.premise,
      rules: [], locations: [], factions: [],
    };
  }

  const next: StoryState = {
    ...state,
    theme: generated.theme || project.premise,
    endingDirection: generated.endingDirection || state.endingDirection,
    bible: { summary: generated.summary || project.premise, rules: generated.rules ?? [], locations: generated.locations ?? [], factions: generated.factions ?? [] },
    revision: state.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  store.saveStoryState(next);
  const updatedProject = { ...project, currentStage: "bootstrap-complete", status: "paused" as const, updatedAt: new Date().toISOString() };
  store.updateProject(updatedProject);
  store.updateTask({ ...task, status: "succeeded", output: { stateRevision: next.revision }, updatedAt: new Date().toISOString() });
}

export function makeBootstrapTask(projectId: string): Task {
  const now = new Date().toISOString();
  return { id: randomUUID(), projectId, kind: "bootstrap", status: "queued", input: {}, attempts: 0, createdAt: now, updatedAt: now };
}
