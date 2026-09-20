import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/storage/store.js";
import { runPhaseOne } from "../src/workflows/bootstrap.js";
import type { ChatMessage } from "../src/model/openai.js";
import type { Project, StoryState } from "../src/domain/types.js";

describe("Phase 1", () => {
  it("从设定初始化生成故事阶段和第一章，并保存章节产物", async () => {
    const store = new Store(mkdtempSync(join(tmpdir(), "ai-writer-phase1-")));
    const now = new Date().toISOString();
    const project: Project = { id: "phase1-project", name: "月背来信", language: "中文简体", genre: "科幻悬疑", style: "冷峻、克制", premise: "一名维修员收到来自月背的求救信", status: "draft", currentStage: "created", createdAt: now, updatedAt: now };
    const state: StoryState = { projectId: project.id, theme: "", endingDirection: "", bible: { summary: "", rules: [], locations: [], factions: [] }, currentStagePlan: null, characters: [], timeline: [], foreshadowing: [], corrections: [], revision: 1, updatedAt: now };
    store.createProject(project, state);

    const responses = [
      JSON.stringify({ theme: "真相与孤独", endingDirection: "主角逐步接近信件来源", summary: "月面殖民地隐藏着一段被抹去的历史", rules: ["月背通信必须经过中继站"], locations: ["静海维修站"], factions: ["轨道通信局"], characters: [{ name: "林岚", role: "维修员", motivation: "确认求救者是否真实存在", note: "擅长修复老旧通信设备" }] }),
      JSON.stringify({ title: "月背的回声", objective: "让林岚确认求救信不是设备故障", conflict: "通信局要求她删除异常记录", progression: ["收到求救信", "发现记录被篡改"], chapterGoal: "林岚找到第一条来自月背的真实坐标" }),
      JSON.stringify({ title: "第一封信", summary: "林岚收到求救信并发现坐标被人为隐藏。", body: "静海维修站的灯光在月尘中闪烁。林岚打开了那封不该存在的信。", characterUpdates: [{ name: "林岚", status: "active", note: "决定保留异常记录并追查坐标。" }], timelineEvents: [{ occurredAt: "月面历 17 日", summary: "林岚收到来自月背的求救信。" }], foreshadowing: [{ summary: "求救信的发送者身份未知。", importance: "high", status: "open" }] }),
    ];
    let calls = 0;
    const model = {
      configured: true,
      async chat(_messages: ChatMessage[]): Promise<string> {
        const response = responses[calls];
        calls += 1;
        if (!response) throw new Error("模型调用次数超出测试预期");
        return response;
      },
    };

    const chapter = await runPhaseOne(store, model, project);
    const savedProject = store.getProject(project.id);
    const savedState = store.getStoryState(project.id);
    const tasks = store.listTasks(project.id);

    assert.equal(calls, 3);
    assert.equal(chapter.number, 1);
    assert.equal(chapter.title, "第一封信");
    assert.equal(savedProject?.status, "paused");
    assert.equal(savedProject?.currentStage, "chapter-1-complete");
    assert.equal(savedState?.revision, 4);
    assert.equal(savedState?.characters[0]?.name, "林岚");
    assert.equal(savedState?.currentStagePlan?.title, "月背的回声");
    assert.equal(savedState?.timeline[0]?.sourceChapterId, chapter.id);
    assert.equal(savedState?.foreshadowing[0]?.firstChapterId, chapter.id);
    assert.deepEqual(tasks.map((task) => [task.kind, task.status]), [["produce-chapter", "succeeded"], ["plan-stage", "succeeded"], ["bootstrap", "succeeded"]]);
    assert.rejects(() => runPhaseOne(store, model, project), /已经生成过章节/);
    store.close();
  });
});
