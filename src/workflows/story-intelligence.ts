import type {
  Chapter,
  Character,
  ConsistencyIssue,
  ConsistencyReport,
  Foreshadowing,
  GeneratedChapter,
  StoryState,
} from "../domain/types.js";

export type StoryFact = {
  type: "bible" | "character" | "timeline" | "foreshadowing" | "chapter";
  id: string;
  text: string;
  source: string;
  relevance: number;
};

export type ForeshadowingReview = {
  openCount: number;
  overdue: Foreshadowing[];
  issues: ConsistencyIssue[];
};

const now = (): string => new Date().toISOString();

function fact(type: StoryFact["type"], id: string, text: string, source: string, query: string): StoryFact {
  const normalizedQuery = query.trim();
  const relevance = !normalizedQuery ? 1 : text.includes(normalizedQuery) ? 2 : source.includes(normalizedQuery) ? 1 : 0;
  return { type, id, text, source, relevance };
}

/** 从结构化故事状态和章节元数据中检索事实，不把整本正文塞进模型上下文。 */
export function retrieveStoryFacts(state: StoryState, chapters: Chapter[], query = "", limit = 20): StoryFact[] {
  const facts: StoryFact[] = [];
  if (state.bible.summary) facts.push(fact("bible", "bible-summary", state.bible.summary, "世界观摘要", query));
  state.bible.rules.forEach((item, index) => facts.push(fact("bible", `rule-${index}`, item, "世界观规则", query)));
  state.bible.locations.forEach((item, index) => facts.push(fact("bible", `location-${index}`, item, "世界观地点", query)));
  state.bible.factions.forEach((item, index) => facts.push(fact("bible", `faction-${index}`, item, "世界观势力", query)));
  state.characters.forEach((character) => facts.push(fact("character", character.id, `${character.name}：${character.role}；${character.motivation}；状态=${character.status}；${character.note}`, "人物状态", query)));
  state.timeline.forEach((event) => facts.push(fact("timeline", event.id, `${event.occurredAt}：${event.summary}`, "时间线事件", query)));
  state.foreshadowing.forEach((item) => facts.push(fact("foreshadowing", item.id, `${item.summary}；重要性=${item.importance}；状态=${item.status}`, "伏笔状态", query)));
  chapters.forEach((chapter) => facts.push(fact("chapter", chapter.id, `第${chapter.number}章《${chapter.title}》：${chapter.summary}`, "章节摘要", query)));
  return facts.filter((item) => item.relevance > 0).sort((a, b) => b.relevance - a.relevance).slice(0, limit);
}

function findCharacter(characters: Character[], name: string, id?: string): Character | undefined {
  return characters.find((character) => (id && character.id === id) || character.name === name);
}

export function inspectGeneratedChapter(state: StoryState, generated: GeneratedChapter): ConsistencyReport {
  const issues: ConsistencyIssue[] = [];
  if (!generated.body.trim()) issues.push({ code: "empty-body", severity: "error", message: "章节正文为空" });

  for (const update of generated.characterUpdates) {
    const current = findCharacter(state.characters, update.name, update.id);
    if (current && (current.status === "dead" || current.status === "departed") && (update.status === "active" || update.status === "changed")) {
      issues.push({ code: "character-resurrection", severity: "error", message: `人物“${current.name}”已经是 ${current.status}，本章不能直接恢复为 ${update.status}` });
    }
  }

  for (const event of generated.timelineEvents) {
    if (state.timeline.some((existing) => existing.summary === event.summary)) {
      issues.push({ code: "duplicate-timeline", severity: "warning", message: `时间线事件重复：${event.summary}` });
    }
  }

  for (const clue of generated.foreshadowing) {
    if (clue.status !== "resolved") continue;
    const existing = state.foreshadowing.find((item) => item.summary === clue.summary);
    if (!existing) issues.push({ code: "dangling-foreshadowing", severity: "error", message: `试图回收不存在的伏笔：${clue.summary}` });
  }

  return { ok: issues.every((issue) => issue.severity !== "error"), issues, checkedAt: now() };
}

export function reviewForeshadowing(items: Foreshadowing[], currentChapterNumber: number): ForeshadowingReview {
  const overdue = items.filter((item) => item.status !== "resolved" && item.importance === "high" && item.firstChapterNumber !== undefined && currentChapterNumber - item.firstChapterNumber >= 3);
  const issues: ConsistencyIssue[] = overdue.map((item) => ({ code: "overdue-foreshadowing", severity: "warning", message: `高重要性伏笔长期未回收：${item.summary}` }));
  return { openCount: items.filter((item) => item.status !== "resolved").length, overdue, issues };
}

export function isStageComplete(state: StoryState, chapter: Chapter): boolean {
  return Boolean(state.currentStagePlan && chapter.stageComplete === true);
}
