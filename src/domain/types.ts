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
  characters: Character[];
  timeline: TimelineEvent[];
  foreshadowing: Foreshadowing[];
  corrections: Correction[];
  revision: number;
  updatedAt: string;
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
};

export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "paused";

export type Task = {
  id: string;
  projectId: string;
  kind: "bootstrap" | "produce-chapter" | "review" | "plan-stage";
  status: TaskStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  attempts: number;
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
