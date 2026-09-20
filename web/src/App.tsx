import { useCallback, useEffect, useState } from "react";

type Project = { id: string; name: string; language: string; genre: string; style: string; premise: string; status: string; currentStage: string; updatedAt: string; archivedAt?: string; archivedFromStatus?: string };
type Character = { id: string; name: string; role: string; motivation: string; status: string; note: string };
type StoryState = { theme: string; endingDirection: string; bible: { summary: string; rules: string[]; locations: string[]; factions: string[] }; currentStagePlan?: { title: string; objective: string; conflict: string; progression: string[]; chapterGoal: string } | null; characters: Character[]; timeline: Array<{ id: string; occurredAt: string; summary: string }>; foreshadowing: Array<{ id: string; summary: string; importance: string; status: string }>; corrections: Array<{ reason: string; replacement: string }>; revision: number };
type Chapter = { id: string; number: number; title: string; summary: string; body: string; productionMode?: string; stageComplete?: boolean; consistencyReport?: { ok: boolean; issues: Array<{ severity: string; message: string }> } };
type Task = { id: string; kind: string; status: string; attempts: number; maxAttempts?: number; agentRole?: string };
type Detail = { project: Project; state: StoryState; chapters: Chapter[]; tasks: Task[] };

const statusLabels: Record<string, string> = { draft: "草稿", running: "运行中", paused: "已暂停", completed: "已完成", error: "需处理", archived: "已归档" };
const agentLabels: Record<string, string> = { orchestrator: "总控", "world-builder": "设定", planner: "规划", writer: "写作", continuity: "连贯性", memory: "记忆" };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "请求失败");
  return body;
}

function formatDate(value: string): string { return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function dotClass(status: string): string { return `status-dot status-${status}`; }

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<Detail>();
  const [modelConfigured, setModelConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [showCreate, setShowCreate] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"archive" | "purge">();

  const loadProjects = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [projectData, health] = await Promise.all([request<{ projects: Project[] }>("/api/projects?includeArchived=true"), request<{ modelConfigured: boolean }>("/health")]);
      setProjects(projectData.projects); setModelConfigured(health.modelConfigured);
      if (!selectedId && projectData.projects[0]) setSelectedId(projectData.projects[0].id);
      if (selectedId && !projectData.projects.some((project) => project.id === selectedId)) setSelectedId(projectData.projects[0]?.id);
      setError(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法连接 API"); }
    finally { setLoading(false); }
  }, [selectedId]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) { setDetail(undefined); return; }
    try {
      const [state, chapters, tasks] = await Promise.all([
        request<{ project: Project; state: StoryState }>(`/api/projects/${selectedId}/state`),
        request<{ chapters: Chapter[] }>(`/api/projects/${selectedId}/chapters`),
        request<{ tasks: Task[] }>(`/api/projects/${selectedId}/tasks`),
      ]);
      setDetail({ project: state.project, state: state.state, chapters: chapters.chapters, tasks: tasks.tasks });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法读取项目"); }
  }, [selectedId]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { void loadDetail(); }, [loadDetail]);
  useEffect(() => {
    if (!detail || detail.project.status !== "running") return undefined;
    const timer = window.setInterval(() => { void loadProjects(true); void loadDetail(); }, 2500);
    return () => window.clearInterval(timer);
  }, [detail, loadDetail, loadProjects]);

  async function runAction(action: "generate" | "pause" | "resume") {
    if (!selectedId) return;
    try { await request(`/api/projects/${selectedId}/${action}`, { method: "POST" }); await loadProjects(true); await loadDetail(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
  }

  async function createProject(payload: Record<string, string | boolean>) {
    try { const result = await request<{ project: Project }>("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); setSelectedId(result.project.id); setShowCreate(false); await loadProjects(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "创建失败"); }
  }

  async function restoreProject() {
    if (!selectedId) return;
    try { await request(`/api/projects/${selectedId}/restore`, { method: "POST" }); setShowProjectMenu(false); await loadProjects(true); await loadDetail(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "恢复失败"); }
  }

  async function confirmProjectAction(confirmedName = "") {
    if (!selectedId || !confirmAction) return;
    try {
      const path = `/api/projects/${selectedId}/${confirmAction}`;
      const options: RequestInit = { method: "POST" };
      if (confirmAction === "purge") {
        options.headers = { "content-type": "application/json" };
        options.body = JSON.stringify({ confirmName: confirmedName });
      }
      await request(path, options);
      setConfirmAction(undefined); setShowProjectMenu(false);
      if (confirmAction === "purge") { setSelectedId(undefined); setDetail(undefined); }
      await loadProjects(true);
      if (confirmAction !== "purge") await loadDetail();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
  }

  const activeProject = detail?.project ?? projects.find((project) => project.id === selectedId);
  const activeProjects = projects.filter((project) => project.status !== "archived");
  const archivedProjects = projects.filter((project) => project.status === "archived");
  return <div className="app-shell">
    <aside className="sidebar" aria-label="故事库导航">
      <div className="brand-lockup"><div className="brand-mark">AW</div><div><div className="brand-name">AI Writer</div><div className="brand-subtitle">创作观测台</div></div></div>
      <div className="sidebar-rule" /><div className="eyebrow">你的故事库 <span>{activeProjects.length.toString().padStart(2, "0")}</span></div>
      <div className="project-list">{activeProjects.map((project) => <ProjectListItem key={project.id} project={project} selectedId={selectedId} onSelect={setSelectedId} />)}{!activeProjects.length && <div className="empty-sidebar">还没有故事。<br />从一个念头开始。</div>}</div>
      {archivedProjects.length > 0 && <><div className="eyebrow archived-heading">已归档 <span>{archivedProjects.length.toString().padStart(2, "0")}</span></div><div className="project-list archived-project-list">{archivedProjects.map((project) => <ProjectListItem key={project.id} project={project} selectedId={selectedId} onSelect={setSelectedId} />)}</div></>}
      <button className="new-project-button" onClick={() => setShowCreate(true)}><span>＋</span> 新建小说</button>
      <div className="sidebar-footer"><span className={`signal ${modelConfigured ? "signal-on" : ""}`} />{modelConfigured ? "模型已连接" : "本地降级模式"}<span className="footer-version">v0.4</span></div>
    </aside>
    <main className="main-canvas">
      <header className="topbar"><div className="breadcrumb"><span>工作台</span><i>/</i><strong>{activeProject?.name ?? "故事库"}</strong></div><div className="topbar-actions"><span className="live-indicator"><span /> {detail?.project.status === "running" ? "实时同步中" : "状态已保存"}</span>{activeProject && <div className="project-menu-wrap"><button className="quiet-button menu-trigger" aria-expanded={showProjectMenu} onClick={() => setShowProjectMenu((open) => !open)}>项目菜单 <span>⋯</span></button>{showProjectMenu && <div className="project-menu" role="menu">{activeProject.status === "archived" ? <button role="menuitem" onClick={() => void restoreProject()}>恢复项目</button> : <button role="menuitem" onClick={() => { setConfirmAction("archive"); setShowProjectMenu(false); }}>归档项目</button>}<button className="danger-menu-item" role="menuitem" onClick={() => { setConfirmAction("purge"); setShowProjectMenu(false); }}>永久删除…</button></div>}</div>}<button className="icon-button" title="刷新" onClick={() => { void loadProjects(); void loadDetail(); }}>↻</button></div></header>
      {error && <div className="error-banner"><span>!</span>{error}<button onClick={() => setError(undefined)}>×</button></div>}
      {loading && !projects.length ? <LoadingState /> : activeProject && detail ? <Workspace detail={detail} onAction={runAction} onProjectAction={(action) => action === "restore" ? void restoreProject() : setConfirmAction(action)} /> : <WelcomeState onCreate={() => setShowCreate(true)} />}
    </main>
    {showCreate && <CreateDialog onClose={() => setShowCreate(false)} onCreate={createProject} />}
    {confirmAction && activeProject && <ProjectConfirmDialog action={confirmAction} project={activeProject} onClose={() => setConfirmAction(undefined)} onConfirm={(name) => void confirmProjectAction(name)} />}
  </div>;
}

function LoadingState() { return <div className="loading-state"><div className="loading-orbit" /><p>正在唤醒故事库…</p></div>; }
function WelcomeState({ onCreate }: { onCreate: () => void }) { return <div className="welcome-state"><div className="welcome-orbit">✦</div><p className="eyebrow">从一粒种子开始</p><h1>让故事找到<br /><em>自己的方向。</em></h1><p>创建一部小说，AI Writer 会帮你维护人物、事实、伏笔和每一步未来。</p><button className="primary-button" onClick={onCreate}>创建第一部小说 <span>→</span></button></div>; }

function ProjectListItem({ project, selectedId, onSelect }: { project: Project; selectedId?: string; onSelect: (id: string) => void }) { return <button className={`project-item ${project.id === selectedId ? "is-selected" : ""} ${project.status === "archived" ? "is-archived" : ""}`} onClick={() => onSelect(project.id)}><span className={dotClass(project.status)} /><span className="project-item-copy"><strong>{project.name}</strong><small>{project.genre} · {statusLabels[project.status]}</small></span><span className="project-arrow">↗</span></button>; }

function Workspace({ detail, onAction, onProjectAction }: { detail: Detail; onAction: (action: "generate" | "pause" | "resume") => void; onProjectAction: (action: "archive" | "restore" | "purge") => void }) {
  const { project, state, chapters, tasks } = detail; const latestChapter = chapters.at(-1); const runningTask = tasks.find((task) => task.status === "running") ?? tasks.find((task) => task.status === "queued"); const openThreads = state.foreshadowing.filter((item) => item.status !== "resolved").length;
  return <>
    <section className="story-hero"><div className="hero-copy"><div className="eyebrow">{project.genre} <span className="eyebrow-divider">·</span> {project.language}</div><h1>{project.name}</h1><p>{project.premise}</p><div className="hero-meta"><span className={`status-pill status-pill-${project.status}`}><span className={dotClass(project.status)} />{statusLabels[project.status]}</span><span>更新于 {formatDate(project.updatedAt)}</span><span>修订 {state.revision}</span></div></div><div className="hero-constellation"><span className="constellation-line line-one" /><span className="constellation-line line-two" /><span className="constellation-star star-one" /><span className="constellation-star star-two" /><span className="constellation-star star-three" /><span className="constellation-label">STORY<br />RUNTIME</span></div><div className="hero-controls">{project.status === "archived" ? <button className="primary-button" onClick={() => onProjectAction("restore")}>恢复项目 <span>↗</span></button> : <>{chapters.length === 0 && <button className="primary-button" onClick={() => onAction("generate")}>生成第一章 <span>→</span></button>}<button className="quiet-button" onClick={() => onAction(project.status === "running" ? "pause" : "resume")}>{project.status === "running" ? "暂停运行" : "继续运行"}</button></>}</div></section>
    <section className="metric-strip"><Metric value={chapters.length.toString().padStart(2, "0")} label="已生成章节" note={latestChapter ? `最新：${latestChapter.title}` : "尚未开始"} /><Metric value={state.characters.length.toString().padStart(2, "0")} label="故事人物" note={`${state.characters.filter((item) => item.status === "active").length} 位仍在场`} /><Metric value={openThreads.toString().padStart(2, "0")} label="未解线索" note={openThreads ? "等待未来章节" : "暂无悬置"} /><Metric value={tasks.filter((task) => task.status === "succeeded").length.toString().padStart(2, "0")} label="完成任务" note={runningTask ? `当前：${agentLabels[runningTask.agentRole ?? ""] ?? runningTask.kind}` : "队列空闲"} /></section>
    <div className="workspace-grid"><section className="reading-panel panel"><div className="panel-heading"><div><div className="eyebrow">正文阅读</div><h2>{latestChapter ? `第${latestChapter.number}章 · ${latestChapter.title}` : "还没有章节"}</h2></div>{latestChapter && <span className="chapter-mode">{latestChapter.productionMode === "scene" ? "场景模式" : "章节模式"}</span>}</div>{latestChapter ? <><p className="chapter-summary">{latestChapter.summary}</p><div className="chapter-body">{latestChapter.body.split("\n\n").map((paragraph, index) => <p key={`${latestChapter.id}-${index}`}>{paragraph}</p>)}</div><div className="chapter-footer"><span>第 {latestChapter.number} 章</span><span>{latestChapter.consistencyReport?.ok === false ? "存在待解释问题" : "连贯性检查通过"}</span></div></> : <EmptyPanel title="故事还在等第一道门" text="从一句灵感开始，生成第一章。" />}</section>
      <aside className="right-column"><section className="panel stage-panel"><PanelTitle eyebrow="当前阶段" title={state.currentStagePlan?.title ?? "等待规划"} /><div className="stage-objective"><span className="mini-label">目标</span><p>{state.currentStagePlan?.objective ?? "生成第一阶段的故事目标"}</p></div><div className="stage-conflict"><span className="mini-label">冲突</span><p>{state.currentStagePlan?.conflict ?? "冲突将在规划后出现"}</p></div>{state.currentStagePlan && <div className="stage-goal"><span className="mini-label">本阶段要抵达</span><strong>{state.currentStagePlan.chapterGoal}</strong></div>}</section><section className="panel state-panel"><PanelTitle eyebrow="故事事实" title="正在场的人与线索" /><div className="character-stack">{state.characters.slice(0, 4).map((character) => <div className="character-row" key={character.id}><span className={`avatar avatar-${character.status}`}>{character.name.slice(0, 1)}</span><div><strong>{character.name}</strong><small>{character.role} · {character.status === "active" ? "在场" : character.status}</small></div></div>)}{!state.characters.length && <div className="muted-copy">设定 Agent 尚未写入人物。</div>}</div><div className="thread-list">{state.foreshadowing.slice(0, 3).map((item) => <div className="thread-row" key={item.id}><span className={`thread-mark thread-${item.importance}`} /><div><strong>{item.summary}</strong><small>{item.status === "resolved" ? "已回收" : "未解线索"}</small></div></div>)}{!state.foreshadowing.length && <div className="muted-copy">暂无未解线索。</div>}</div></section></aside></div>
    <section className="bottom-grid"><section className="panel timeline-panel"><PanelTitle eyebrow="时间线" title="最近发生的事" /><div className="timeline-list">{state.timeline.slice(-4).reverse().map((event) => <div className="timeline-row" key={event.id}><span className="timeline-dot" /><div><small>{event.occurredAt}</small><p>{event.summary}</p></div></div>)}{!state.timeline.length && <div className="muted-copy">第一件事还没有发生。</div>}</div></section><section className="panel task-panel"><PanelTitle eyebrow="运行日志" title={runningTask ? "队列正在工作" : "最近的任务"} /><div className="task-list">{tasks.slice(0, 5).map((task) => <div className="task-row" key={task.id}><span className={`task-state task-${task.status}`} /><div className="task-copy"><strong>{agentLabels[task.agentRole ?? ""] ?? task.kind}</strong><small>{task.kind} · {task.attempts}/{task.maxAttempts ?? "—"} 次尝试</small></div><span className="task-status">{statusLabels[task.status] ?? task.status}</span></div>)}{!tasks.length && <div className="muted-copy">队列还没有任务。</div>}</div></section></section>
  </>;
}

function Metric({ value, label, note }: { value: string; label: string; note: string }) { return <div className="metric"><strong>{value}</strong><div><span>{label}</span><small>{note}</small></div></div>; }
function PanelTitle({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className="panel-title"><div className="eyebrow">{eyebrow}</div><h3>{title}</h3></div>; }
function EmptyPanel({ title, text }: { title: string; text: string }) { return <div className="empty-panel"><span>◌</span><strong>{title}</strong><p>{text}</p></div>; }

function CreateDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (payload: Record<string, string | boolean>) => void }) {
  const [form, setForm] = useState({ name: "", genre: "", style: "", premise: "", language: "中文简体", autoStart: false });
  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="create-dialog" onSubmit={(event) => { event.preventDefault(); void onCreate(form); }}><button className="dialog-close" type="button" onClick={onClose}>×</button><div className="eyebrow">新的故事坐标</div><h2>开一部小说</h2><p className="dialog-intro">先给它一个名字，再给它一粒足够自由的种子。</p><label>小说名称<input required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="例如：雾城失踪者" /></label><div className="form-two"><label>小说类型<input required value={form.genre} onChange={(event) => update("genre", event.target.value)} placeholder="科幻悬疑" /></label><label>生成语言<input value={form.language} onChange={(event) => update("language", event.target.value)} /></label></div><label>文风描述<input required value={form.style} onChange={(event) => update("style", event.target.value)} placeholder="冷峻、克制、节奏紧凑" /></label><label>灵感 / 梗概 / 完整设定<textarea required value={form.premise} onChange={(event) => update("premise", event.target.value)} placeholder="一句话也可以，剩下的交给故事自己长出来。" /></label><label className="checkbox-label"><input type="checkbox" checked={form.autoStart} onChange={(event) => update("autoStart", event.target.checked)} /> 创建后立即生成第一章</label><button className="primary-button full-button" type="submit">建立故事运行时 <span>→</span></button></form></div>;
}

function ProjectConfirmDialog({ action, project, onClose, onConfirm }: { action: "archive" | "purge"; project: Project; onClose: () => void; onConfirm: (confirmedName?: string) => void }) {
  const [name, setName] = useState("");
  const purge = action === "purge";
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className={`create-dialog project-confirm-dialog ${purge ? "is-danger" : ""}`} role="dialog" aria-modal="true" aria-labelledby="project-confirm-title" onSubmit={(event) => { event.preventDefault(); onConfirm(purge ? name : undefined); }}><button className="dialog-close" type="button" onClick={onClose}>×</button><div className="eyebrow">{purge ? "不可逆操作" : "故事库整理"}</div><h2 id="project-confirm-title">{purge ? "永久删除项目" : "归档项目"}</h2><p className="dialog-intro">{purge ? <>这会删除 <strong>{project.name}</strong> 的正文、人物、伏笔、任务和运行记录，无法恢复。</> : <>项目会从主故事库移到“已归档”，正文和全部状态都会保留，之后可以恢复。</>}</p>{purge && <label>输入项目名称确认<input required value={name} onChange={(event) => setName(event.target.value)} placeholder={project.name} /></label>}<div className="confirm-actions"><button className="quiet-button" type="button" onClick={onClose}>取消</button><button className={purge ? "danger-button" : "primary-button"} type="submit">{purge ? "永久删除" : "归档项目"}</button></div></form></div>;
}
