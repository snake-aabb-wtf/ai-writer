import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/storage/store.js";
import { runPhaseOne } from "../src/workflows/bootstrap.js";
import { inspectGeneratedChapter, retrieveStoryFacts, reviewForeshadowing } from "../src/workflows/story-intelligence.js";
import type { ChatMessage } from "../src/model/openai.js";
import type { GeneratedChapter, Project, StoryState } from "../src/domain/types.js";

function baseFixture(): { store: Store; project: Project; state: StoryState } {
  const store = new Store(mkdtempSync(join(tmpdir(), "ai-writer-phase3-")));
  const now = new Date().toISOString();
  const project: Project = { id: "phase3-project", name: "事实检查", language: "中文简体", genre: "悬疑", style: "克制", premise: "钟表每天慢一分钟", status: "draft", currentStage: "created", createdAt: now, updatedAt: now };
  const state: StoryState = { projectId: project.id, theme: "时间异常", endingDirection: "查明原因", bible: { summary: "城市时间正在失真", rules: ["所有公共钟表同步"], locations: ["旧钟楼"], factions: ["校时局"] }, currentStagePlan: { title: "异常", objective: "确认钟表异常", conflict: "校时局阻止调查", progression: ["发现异常"], chapterGoal: "找到钟楼线索" }, characters: [{ id: "c1", name: "林岚", role: "调查者", motivation: "查明真相", status: "active", note: "" }], timeline: [{ id: "t1", occurredAt: "第一日", summary: "钟表慢了一分钟", createdAt: now }], foreshadowing: [{ id: "f1", summary: "钟楼地下藏着校时记录", importance: "high", status: "open", firstChapterNumber: 1, createdAt: now }], corrections: [], revision: 1, updatedAt: now };
  store.createProject(project, state);
  return { store, project, state };
}

describe("Phase 3", () => {
  it("可以按查询从故事状态检索事实，并识别一致性问题", () => {
    const { store, state } = baseFixture();
    const facts = retrieveStoryFacts(state, [], "钟楼");
    assert.equal(facts.length, 2);
    assert.match(facts[0]?.text ?? "", /钟楼/);

    const generated: GeneratedChapter = { title: "回声", summary: "异常继续", body: "林岚回到钟楼。", characterUpdates: [{ name: "林岚", status: "active", note: "继续行动" }], timelineEvents: [{ occurredAt: "第二日", summary: "钟表慢了一分钟" }], foreshadowing: [{ summary: "不存在的伏笔", importance: "high", status: "resolved" }] };
    const report = inspectGeneratedChapter({ ...state, characters: [{ ...state.characters[0]!, status: "dead" }] }, generated);
    assert.equal(report.ok, false);
    assert.deepEqual(report.issues.map((issue) => issue.code), ["character-resurrection", "duplicate-timeline", "dangling-foreshadowing"]);
    store.close();
  });

  it("会标记长期未回收的高重要性伏笔", () => {
    const { store, state } = baseFixture();
    const review = reviewForeshadowing(state.foreshadowing, 4);
    assert.equal(review.openCount, 1);
    assert.equal(review.overdue.length, 1);
    assert.equal(review.issues[0]?.code, "overdue-foreshadowing");
    store.close();
  });

  it("阶段显式完成后会追加历史阶段并动态规划下一阶段", async () => {
    const { store, project } = baseFixture();
    const responses = [
      JSON.stringify({ theme: "时间异常", endingDirection: "查明原因", summary: "城市时间正在失真", rules: [], locations: [], factions: [], characters: [{ name: "林岚", role: "调查者", motivation: "查明真相", note: "" }] }),
      JSON.stringify({ title: "异常", objective: "确认异常", conflict: "调查受到阻止", progression: ["发现异常"], chapterGoal: "找到线索" }),
      JSON.stringify({ title: "阶段终点", summary: "林岚找到钟楼线索", body: "林岚在钟楼找到了一份校时记录。", characterUpdates: [{ name: "林岚", status: "active", note: "找到关键记录" }], timelineEvents: [{ occurredAt: "第二日", summary: "林岚找到校时记录" }], foreshadowing: [], stageComplete: true }),
      JSON.stringify({ title: "追踪记录", objective: "追查记录来源", conflict: "记录指向被封锁的档案库", progression: ["进入档案库"], chapterGoal: "获得下一条线索" }),
    ];
    let calls = 0;
    const model = { configured: true, async chat(_messages: ChatMessage[]): Promise<string> { const response = responses[calls]; calls += 1; if (!response) throw new Error("调用次数超出预期"); return response; } };
    const chapter = await runPhaseOne(store, model, project);
    const nextState = store.getStoryState(project.id);
    assert.equal(calls, 4);
    assert.equal(chapter.stageComplete, true);
    assert.equal(store.getProject(project.id)?.currentStage, "next-stage-planned");
    assert.equal(nextState?.completedStages?.length, 1);
    assert.equal(nextState?.currentStagePlan?.title, "追踪记录");
    assert.equal(nextState?.revision, 5);
    store.close();
  });
});
