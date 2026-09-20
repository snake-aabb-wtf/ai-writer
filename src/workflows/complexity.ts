import type { ProductionMode, Project, StoryState } from "../domain/types.js";

export type ComplexityAssessment = {
  score: number;
  mode: ProductionMode;
  factors: string[];
  assessedAt: string;
};

/**
 * Phase 2 的确定性复杂度评估器。
 * 它只读取结构化故事状态，不调用模型，便于测试、重试和复现。
 */
export function assessChapterComplexity(_project: Project, state: StoryState): ComplexityAssessment {
  let score = 0;
  const factors: string[] = [];
  const openForeshadowing = state.foreshadowing.filter((item) => item.status !== "resolved").length;

  if (state.characters.length >= 4) { score += 2; factors.push("人物数量较多"); }
  else if (state.characters.length >= 2) { score += 1; factors.push("涉及多个主要人物"); }
  if (state.timeline.length >= 4) { score += 2; factors.push("时间线事件较多"); }
  else if (state.timeline.length >= 2) { score += 1; factors.push("存在多条时间线事件"); }
  if (openForeshadowing >= 4) { score += 2; factors.push("未回收伏笔较多"); }
  else if (openForeshadowing >= 2) { score += 1; factors.push("存在多个未回收伏笔"); }
  if (state.bible.rules.length >= 4) { score += 2; factors.push("需要引用较多世界观规则"); }
  else if (state.bible.rules.length >= 2) { score += 1; factors.push("需要保持世界观规则一致"); }
  if (state.bible.factions.length >= 3) { score += 1; factors.push("涉及多个势力"); }
  if ((state.currentStagePlan?.progression.length ?? 0) >= 4) { score += 1; factors.push("阶段推进目标较多"); }
  if (state.characters.some((character) => character.status === "changed" || character.status === "dead" || character.status === "departed")) {
    score += 1;
    factors.push("包含不可逆人物状态");
  }

  return { score, mode: score >= 4 ? "scene" : "chapter", factors, assessedAt: new Date().toISOString() };
}
