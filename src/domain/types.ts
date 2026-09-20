export type ProjectStatus = "draft" | "running" | "paused" | "completed" | "error";

export type Project = {
  id: string;
  name: string;
  language: string;
  genre: string;
  style: string;
  premise: string;
  status: ProjectStatus;
  currentStage: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryState = {
  projectId: string;
  theme: string;
  endingDirection: string;
  bible: { summary: string; rules: string[]; locations: string[]; factions: string[] };
  currentStagePlan?: StoryStage | null;
  completedStages?: StoryStage[];
  characters: Character[];
  timeline: TimelineEvent[];
  foreshadowing: Foreshadowing[];
  corrections: Correction[];
  revision: number;
  updatedAt: string;
};

export type StoryStage = {
  title: string;
  objective: string;
  conflict: string;
  progression: string[];
  chapterGoal: string;
};

export type ConsistencySeverity = "warning" | "error";

export type ConsistencyIssue = {
  code: "empty-body" | "character-resurrection" | "duplicate-timeline" | "dangling-foreshadowing" | "overdue-foreshadowing";
  severity: ConsistencySeverity;
  message: string;
};

export type ConsistencyReport = {
  ok: boolean;
  issues: ConsistencyIssue[];
  checkedAt: string;
};

export type Character = {
  id: string;
  name: string;
  role: string;
  motivation: string;
  status: "active" | "dead" | "departed" | "changed";
  note: string;
};

export type TimelineEvent = {
  id: string;
  occurredAt: string;
  summary: string;
  sourceChapterId?: string;
  createdAt: string;
};

export type Foreshadowing = {
  id: string;
  summary: string;
  importance: "low" | "medium" | "high";
  status: "open" | "advanced" | "resolved";
  firstChapterId?: string;
  resolvedChapterId?: string;
  firstChapterNumber?: number;
  lastAdvancedChapterNumber?: number;
  createdAt: string;
};

export type Correction = {
  id: string;
  targetType: "character" | "timeline" | "foreshadowing" | "bible";
  targetId?: string;
  reason: string;
  replacement: string;
  createdAt: string;
};

export type Chapter = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  summary: string;
  body: string;
  createdAt: string;
  sourceTaskId?: string;
  productionMode?: ProductionMode;
  stageComplete?: boolean;
  consistencyReport?: ConsistencyReport;
};

export type ProductionMode = "chapter" | "scene";

export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "paused";

export type CoreAgentRole = "orchestrator" | "world-builder" | "planner" | "writer" | "continuity" | "memory";

export type Task = {
  id: string;
  projectId: string;
  kind: "bootstrap" | "produce-chapter" | "produce-scene" | "review" | "plan-stage" | "assess-complexity";
  status: TaskStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  attempts: number;
  maxAttempts?: number;
  timeoutMs?: number;
  availableAt?: string;
  agentRole?: CoreAgentRole;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  language?: string;
  genre: string;
  style: string;
  premise: string;
  autoStart?: boolean;
};

export type GeneratedChapter = {
  title: string;
  summary: string;
  body: string;
  characterUpdates: Array<{
    id?: string;
    name: string;
    role?: string;
    motivation?: string;
    status?: Character["status"];
    note: string;
  }>;
  timelineEvents: Array<{ occurredAt: string; summary: string }>;
  foreshadowing: Array<{
    summary: string;
    importance: Foreshadowing["importance"];
    status?: Foreshadowing["status"];
  }>;
  stageComplete?: boolean;
};
