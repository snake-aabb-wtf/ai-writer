import { randomUUID } from "node:crypto";
import type {
  Character,
  Chapter,
  ConsistencyReport,
  Foreshadowing,
  GeneratedChapter,
  Project,
  StoryStage,
  StoryState,
  Task,
  TimelineEvent,
} from "../domain/types.js";
import { OpenAICompatibleClient, type ChatMessage } from "../model/openai.js";
import { Store } from "../storage/store.js";
import { assessChapterComplexity, type ComplexityAssessment } from "./complexity.js";
import { roleForTask } from "./agents.js";
import { TaskPausedError, TaskQueue } from "./queue.js";
import { inspectGeneratedChapter, isStageComplete, retrieveStoryFacts, reviewForeshadowing } from "./story-intelligence.js";

type ChatModel = Pick<OpenAICompatibleClient, "configured" | "chat">;

type BootstrapOutput = {
  theme: string;
  endingDirection: string;
  summary: string;
  rules: string[];
  locations: string[];
  factions: string[];
  characters: Array<{ name: string; role: string; motivation: string; note: string }>;
};

const now = (): string => new Date().toISOString();

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function jsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型响应不是 JSON 对象");
  const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("模型响应必须是 JSON 对象");
  return parsed as Record<string, unknown>;
}

function parseBootstrap(raw: string): BootstrapOutput {
  const value = jsonObject(raw);
  const characters = Array.isArray(value.characters) ? value.characters.map((item) => {
    const character = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return { name: text(character.name, "未命名角色"), role: text(character.role, "重要角色"), motivation: text(character.motivation, "推动故事继续发展"), note: text(character.note) };
  }) : [];
  return { theme: text(value.theme), endingDirection: text(value.endingDirection), summary: text(value.summary), rules: strings(value.rules), locations: strings(value.locations), factions: strings(value.factions), characters };
}

function parseStage(raw: string): StoryStage {
  const value = jsonObject(raw);
  return { title: text(value.title, "第一故事阶段"), objective: text(value.objective, "推动主线开始"), conflict: text(value.conflict, "主角必须面对最初的阻力"), progression: strings(value.progression), chapterGoal: text(value.chapterGoal, "完成第一章的开端并留下明确的继续动力") };
}

function parseChapter(raw: string): GeneratedChapter {
  const value = jsonObject(raw);
  const characterUpdates: GeneratedChapter["characterUpdates"] = Array.isArray(value.characterUpdates) ? value.characterUpdates.map((item) => {
    const update = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const status = update.status;
    return { id: typeof update.id === "string" ? update.id : undefined, name: text(update.name, "主角"), role: typeof update.role === "string" ? update.role : undefined, motivation: typeof update.motivation === "string" ? update.motivation : undefined, status: status === "active" || status === "dead" || status === "departed" || status === "changed" ? status : undefined, note: text(update.note, "本章继续行动") };
  }) : [];
  const timelineEvents: GeneratedChapter["timelineEvents"] = Array.isArray(value.timelineEvents) ? value.timelineEvents.map((item) => {
    const event = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return { occurredAt: text(event.occurredAt, "本章"), summary: text(event.summary, "本章发生了关键事件") };
  }) : [];
  const foreshadowing: GeneratedChapter["foreshadowing"] = Array.isArray(value.foreshadowing) ? value.foreshadowing.map((item) => {
    const clue = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const importance = clue.importance;
    const status = clue.status;
    return { summary: text(clue.summary, "一个尚未解释的线索"), importance: importance === "high" || importance === "medium" || importance === "low" ? importance : "medium", status: status === "advanced" || status === "resolved" || status === "open" ? status : "open" };
  }) : [];
  return { title: text(value.title, "第一章"), summary: text(value.summary, "故事从这里开始"), body: text(value.body, "故事从一个异常的瞬间开始。"), characterUpdates, timelineEvents, foreshadowing, stageComplete: value.stageComplete === true };
}

function fallbackBootstrap(project: Project): BootstrapOutput {
  return { theme: project.premise, endingDirection: "由后续故事阶段动态演化，暂不锁定具体结局。", summary: project.premise, rules: [], locations: [], factions: [], characters: [{ name: "主角", role: "故事核心人物", motivation: "弄清真相并改变现状", note: project.premise }] };
}

function fallbackStage(project: Project, state: StoryState): StoryStage {
  return { title: "第一幕：异常的开始", objective: "让主角正面接触故事核心问题", conflict: "主角必须在有限信息下选择是否追查异常", progression: [project.premise, `主角：${state.characters.map((character) => character.name).join("、") || "主角"}`], chapterGoal: "建立主线冲突，完成一次不可忽略的行动，并留下可追踪的线索。" };
}

function fallbackChapter(project: Project, stage: StoryStage): GeneratedChapter {
  return { title: "异常的开始", summary: `主角第一次正面接触“${project.premise}”所描述的异常，并决定继续追查。`, body: `那天，${project.premise}。主角原本以为这只是一个无法解释的小意外，直到异常再次出现，并留下了一条不能忽视的线索。\n\n主角没有立刻得到答案，却意识到自己已经被卷入其中。为了查清真相，主角做出了第一个行动决定。\n\n故事的第一道门打开了：${stage.chapterGoal}`, characterUpdates: [{ name: "主角", status: "active", note: "决定追查异常，开始进入主线。" }], timelineEvents: [{ occurredAt: "第一章", summary: "主角发现异常并决定追查。" }], foreshadowing: [{ summary: "异常背后的真正原因尚未揭开。", importance: "high", status: "open" }] };
}

async function ask(model: ChatModel, messages: ChatMessage[], fallback: string): Promise<string> {
  return model.configured ? model.chat(messages, { temperature: 0.7, maxTokens: 8000 }) : fallback;
}

export function makeTask(projectId: string, kind: Task["kind"], input: unknown = {}): Task {
  const createdAt = now();
  return { id: randomUUID(), projectId, kind, status: "queued", input, attempts: 0, maxAttempts: 3, timeoutMs: 120_000, availableAt: createdAt, agentRole: roleForTask(kind), createdAt, updatedAt: createdAt };
}

async function generateBootstrap(store: Store, model: ChatModel, project: Project, task: Task): Promise<StoryState> {
  const state = store.getStoryState(project.id);
  if (!state) throw new Error("项目故事状态不存在");
  const fallback = fallbackBootstrap(project);
  const raw = await ask(model, [{ role: "system", content: "你是小说总控 Agent。只输出 JSON，不要 Markdown。字段必须是 theme、endingDirection、summary、rules、locations、factions、characters；characters 是包含 name、role、motivation、note 的数组。" }, { role: "user", content: JSON.stringify({ genre: project.genre, style: project.style, premise: project.premise, language: project.language }) }], JSON.stringify(fallback));
  const generated = parseBootstrap(raw);
  const next: StoryState = { ...state, theme: generated.theme || project.premise, endingDirection: generated.endingDirection || state.endingDirection, bible: { summary: generated.summary || project.premise, rules: generated.rules, locations: generated.locations, factions: generated.factions }, characters: generated.characters.map((character) => ({ ...character, id: randomUUID(), status: "active" as const })), revision: state.revision + 1, updatedAt: now() };
  store.saveStoryState(next);
  return next;
}

async function generateStage(store: Store, model: ChatModel, project: Project, task: Task): Promise<StoryState> {
  const state = store.getStoryState(project.id);
  if (!state) throw new Error("项目故事状态不存在");
  const fallback = fallbackStage(project, state);
  const raw = await ask(model, [{ role: "system", content: "你是小说规划 Agent。只输出 JSON，不要 Markdown。字段必须是 title、objective、conflict、progression、chapterGoal。规划一个可以由第一章开始执行的故事阶段。" }, { role: "user", content: JSON.stringify({ project: { genre: project.genre, style: project.style, premise: project.premise }, storyState: state }) }], JSON.stringify(fallback));
  const stage = parseStage(raw);
  const next: StoryState = { ...state, currentStagePlan: stage, revision: state.revision + 1, updatedAt: now() };
  store.saveStoryState(next);
  return next;
}

function applyCharacterUpdates(characters: Character[], updates: GeneratedChapter["characterUpdates"]): Character[] {
  const result = characters.map((character) => ({ ...character }));
  for (const update of updates) {
    const index = result.findIndex((character) => (update.id && character.id === update.id) || character.name === update.name);
    if (index >= 0) {
      const current = result[index];
      if (current) result[index] = { ...current, role: update.role || current.role, motivation: update.motivation || current.motivation, status: update.status || current.status, note: update.note };
    } else {
      result.push({ id: update.id || randomUUID(), name: update.name, role: update.role || "新登场角色", motivation: update.motivation || "推动故事发展", status: update.status || "active", note: update.note });
    }
  }
  return result;
}

function applyTimelineEvents(events: TimelineEvent[], updates: GeneratedChapter["timelineEvents"], chapterId: string): TimelineEvent[] {
  return [...events, ...updates.map((event) => ({ id: randomUUID(), occurredAt: event.occurredAt, summary: event.summary, sourceChapterId: chapterId, createdAt: now() }))];
}

function applyForeshadowing(items: Foreshadowing[], updates: GeneratedChapter["foreshadowing"], chapterId: string, chapterNumber: number): Foreshadowing[] {
  const result = items.map((item) => ({ ...item }));
  for (const update of updates) {
    const index = result.findIndex((item) => item.summary === update.summary);
    if (index >= 0) {
      const current = result[index];
      if (current) result[index] = { ...current, status: update.status || current.status, lastAdvancedChapterNumber: chapterNumber, resolvedChapterId: update.status === "resolved" ? chapterId : current.resolvedChapterId };
    } else {
      result.push({ id: randomUUID(), summary: update.summary, importance: update.importance, status: update.status || "open", firstChapterId: chapterId, firstChapterNumber: chapterNumber, lastAdvancedChapterNumber: chapterNumber, createdAt: now() });
    }
  }
  return result;
}

async function generateChapter(store: Store, model: ChatModel, project: Project, task: Task): Promise<Chapter> {
  const state = store.getStoryState(project.id);
  if (!state?.currentStagePlan) throw new Error("故事阶段不存在");
  const number = store.getNextChapterNumber(project.id);
  if (number !== 1) throw new Error("Phase 1 只允许生成第一章，后续章节将在队列阶段实现");
  const fallback = fallbackChapter(project, state.currentStagePlan);
  const raw = await ask(model, [{ role: "system", content: "你是小说写作 Agent。只输出 JSON，不要 Markdown。字段必须是 title、summary、body、characterUpdates、timelineEvents、foreshadowing。body 必须是完整的中文章节正文；characterUpdates 记录本章后人物状态；timelineEvents 记录本章事件；foreshadowing 记录新增、推进或回收的伏笔。" }, { role: "user", content: JSON.stringify({ project, storyState: state, chapterNumber: number }) }], JSON.stringify(fallback));
  const generated = parseChapter(raw);
  const chapterId = randomUUID();
  const consistencyReport = inspectGeneratedChapter(state, generated);
  const productionMode = task.kind === "produce-scene" ? "scene" : "chapter";
  const chapter: Chapter = { id: chapterId, projectId: project.id, number, title: generated.title, summary: generated.summary, body: generated.body, createdAt: now(), sourceTaskId: task.id, productionMode, stageComplete: generated.stageComplete, consistencyReport };
  store.appendChapter(chapter);
  store.saveStoryState({ ...state, characters: applyCharacterUpdates(state.characters, generated.characterUpdates), timeline: applyTimelineEvents(state.timeline, generated.timelineEvents, chapterId), foreshadowing: applyForeshadowing(state.foreshadowing, generated.foreshadowing, chapterId, number), revision: state.revision + 1, updatedAt: now() });
  return chapter;
}

function correctionTarget(code: ConsistencyReport["issues"][number]["code"]): "character" | "timeline" | "foreshadowing" | "bible" {
  if (code === "character-resurrection") return "character";
  if (code === "duplicate-timeline") return "timeline";
  if (code === "dangling-foreshadowing" || code === "overdue-foreshadowing") return "foreshadowing";
  return "bible";
}

async function generateNextStage(model: ChatModel, project: Project, state: StoryState): Promise<StoryStage> {
  const facts = retrieveStoryFacts(state, [], "", 20);
  const fallback: StoryStage = { title: "下一幕：线索继续", objective: "承接上一阶段留下的后果", conflict: "新的阻力迫使人物改变行动策略", progression: ["承接已完成阶段", "扩大核心冲突"], chapterGoal: "让新的阶段目标变得可执行，并留下下一步动力。" };
  const raw = await ask(model, [{ role: "system", content: "你是动态总纲规划 Agent。只输出 JSON，不要 Markdown。字段必须是 title、objective、conflict、progression、chapterGoal。只能基于已经发生的故事事实规划下一阶段，不得修改过去。" }, { role: "user", content: JSON.stringify({ project: { genre: project.genre, style: project.style, premise: project.premise }, completedStages: state.completedStages ?? [], facts }) }], JSON.stringify(fallback));
  return parseStage(raw);
}

async function reviewChapter(store: Store, model: ChatModel, project: Project, chapter: Chapter): Promise<{ report: ConsistencyReport; factCount: number; openForeshadowing: number; stageCompleted: boolean }> {
  const state = store.getStoryState(project.id);
  if (!state) throw new Error("项目故事状态不存在");
  const chapters = store.listChapters(project.id);
  const facts = retrieveStoryFacts(state, chapters, "", 50);
  const foreshadowingReview = reviewForeshadowing(state.foreshadowing, chapter.number);
  const baseReport = chapter.consistencyReport ?? { ok: true, issues: [], checkedAt: now() };
  const report: ConsistencyReport = { ok: baseReport.ok, issues: [...baseReport.issues, ...foreshadowingReview.issues], checkedAt: now() };
  const corrections = report.issues.map((issue) => ({ id: randomUUID(), targetType: correctionTarget(issue.code), reason: issue.message, replacement: "保留历史事实，由后续剧情解释或绕开该问题。", createdAt: now() }));
  const stageCompleted = isStageComplete(state, chapter);
  let nextState = corrections.length > 0
    ? { ...state, corrections: [...state.corrections, ...corrections], revision: state.revision + 1, updatedAt: now() }
    : state;
  for (const correction of corrections) {
    store.appendEvent({ id: randomUUID(), projectId: project.id, type: "state.correction", taskId: chapter.sourceTaskId, payload: correction, createdAt: correction.createdAt });
  }
  if (stageCompleted && state.currentStagePlan) {
    const completedStages = [...(nextState.completedStages ?? []), { ...state.currentStagePlan }];
    const nextStage = await generateNextStage(model, project, { ...nextState, completedStages });
    nextState = { ...nextState, completedStages, currentStagePlan: nextStage, revision: nextState.revision + 1, updatedAt: now() };
  }
  if (nextState !== state) store.saveStoryState(nextState);
  return { report, factCount: facts.length, openForeshadowing: foreshadowingReview.openCount, stageCompleted };
}

async function runQueuedTask<T>(queue: TaskQueue, task: Task, operation: (runningTask: Task) => Promise<T>): Promise<T> {
  const results = await queue.drain(operation, { projectId: task.projectId, maxJobs: task.maxAttempts ?? 3 });
  const result = results.at(-1);
  if (!result) throw new Error(`任务 ${task.id} 未执行`);
  if (result.state === "succeeded") return result.task.output as T;
  if (result.state === "paused") throw new TaskPausedError(task.projectId);
  throw new Error(result.task.error || `任务 ${task.id} 执行失败`);
}

export async function runPhaseOne(store: Store, model: ChatModel, project: Project): Promise<Chapter> {
  if (store.listChapters(project.id).length > 0) throw new Error("项目已经生成过章节，不能重复运行 Phase 1");
  const queue = new TaskQueue(store);
  const runningProject: Project = { ...project, status: "running", currentStage: "phase1-running", updatedAt: now() };
  store.updateProject(runningProject);
  try {
    const bootstrapTask = makeTask(project.id, "bootstrap", { phase: 1, step: "bootstrap" });
    store.createTask(bootstrapTask);
    const state = await runQueuedTask(queue, bootstrapTask, (task) => generateBootstrap(store, model, project, task));
    const stageTask = makeTask(project.id, "plan-stage", { phase: 1, step: "plan-stage" });
    store.createTask(stageTask);
    const plannedState = await runQueuedTask(queue, stageTask, (task) => generateStage(store, model, project, task));
    const complexityTask = makeTask(project.id, "assess-complexity", { phase: 2, step: "assess-complexity", basedOnRevision: plannedState.revision });
    store.createTask(complexityTask);
    const assessment = await runQueuedTask<ComplexityAssessment>(queue, complexityTask, async () => assessChapterComplexity(project, plannedState));
    const chapterKind = assessment.mode === "scene" ? "produce-scene" : "produce-chapter";
    const chapterTask = makeTask(project.id, chapterKind, { phase: 2, step: chapterKind, productionMode: assessment.mode, complexity: assessment });
    store.createTask(chapterTask);
    const chapter = await runQueuedTask<Chapter>(queue, chapterTask, (task) => generateChapter(store, model, project, task));
    const reviewTask = makeTask(project.id, "review", { phase: 3, step: "review-chapter", chapterId: chapter.id });
    store.createTask(reviewTask);
    const review = await runQueuedTask(queue, reviewTask, () => reviewChapter(store, model, project, chapter));
    store.updateProject({ ...runningProject, status: "paused", currentStage: review.stageCompleted ? "next-stage-planned" : "chapter-1-reviewed", updatedAt: now() });
    return chapter;
  } catch (error) {
    if (error instanceof TaskPausedError) {
      store.updateProject({ ...runningProject, status: "paused", currentStage: "paused", updatedAt: now() });
    } else {
      store.updateProject({ ...runningProject, status: "error", currentStage: "phase1-error", updatedAt: now() });
    }
    throw error;
  }
}

export function makeBootstrapTask(projectId: string): Task {
  return makeTask(projectId, "bootstrap", { legacy: true });
}
