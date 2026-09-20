import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/storage/store.js";
import type { Chapter, Project, StoryState } from "../src/domain/types.js";

describe("Store", () => {
  it("只能追加章节，重复章节号会被数据库约束拒绝", () => {
    const store = new Store(mkdtempSync(join(tmpdir(), "ai-writer-")));
    const now = new Date().toISOString();
    const project: Project = { id: "p1", name: "测试", language: "中文简体", genre: "奇幻", style: "克制", premise: "测试故事", status: "draft", currentStage: "created", createdAt: now, updatedAt: now };
    const state: StoryState = { projectId: "p1", theme: "", endingDirection: "", bible: { summary: "", rules: [], locations: [], factions: [] }, characters: [], timeline: [], foreshadowing: [], corrections: [], revision: 1, updatedAt: now };
    store.createProject(project, state);
    const chapter: Chapter = { id: "c1", projectId: "p1", number: 1, title: "第一章", summary: "摘要", body: "正文", createdAt: now };
    store.appendChapter(chapter);
    assert.equal(store.listChapters("p1").length, 1);
    assert.throws(() => store.appendChapter({ ...chapter, id: "c2" }));
    store.close();
  });

  it("项目生命周期会保存项目、状态和任务，并按章节号递增", () => {
    const store = new Store(mkdtempSync(join(tmpdir(), "ai-writer-")));
    const now = new Date().toISOString();
    const project: Project = { id: "p2", name: "生命周期测试", language: "中文简体", genre: "奇幻", style: "明快", premise: "一枚失踪的钥匙", status: "draft", currentStage: "created", createdAt: now, updatedAt: now };
    const state: StoryState = { projectId: "p2", theme: "寻找", endingDirection: "开放", bible: { summary: "", rules: [], locations: [], factions: [] }, characters: [], timeline: [], foreshadowing: [], corrections: [], revision: 1, updatedAt: now };
    store.createProject(project, state);

    assert.deepEqual(store.getProject("p2"), project);
    assert.equal(store.getStoryState("p2")?.revision, 1);
    assert.equal(store.getNextChapterNumber("p2"), 1);

    const task = { id: "t2", projectId: "p2", kind: "bootstrap" as const, status: "queued" as const, input: { source: "test" }, attempts: 0, createdAt: now, updatedAt: now };
    store.createTask(task);
    store.updateTask({ ...task, status: "succeeded", output: { ok: true }, updatedAt: new Date().toISOString() });
    assert.equal(store.listTasks("p2")[0]?.status, "succeeded");

    const chapter: Chapter = { id: "c2", projectId: "p2", number: 1, title: "钥匙", summary: "找到线索", body: "正文", createdAt: now, sourceTaskId: task.id };
    store.appendChapter(chapter);
    assert.equal(store.getNextChapterNumber("p2"), 2);
    assert.equal(store.listChapters("p2")[0]?.sourceTaskId, task.id);

    store.saveStoryState({ ...state, revision: 2, corrections: [{ id: "correction-1", targetType: "bible", reason: "测试更正", replacement: "保留历史并追加更正", createdAt: now }], updatedAt: new Date().toISOString() });
    assert.equal(store.getStoryState("p2")?.corrections.length, 1);
    assert.equal(store.getStoryState("p2")?.revision, 2);
    store.close();
  });
});
