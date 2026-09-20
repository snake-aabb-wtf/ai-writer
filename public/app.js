let selectedId = null;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function request(path, options) { const response = await fetch(path, options); const body = await response.json(); if (!response.ok) throw new Error(body.error || '请求失败'); return body; }

async function loadHealth() { const data = await request('/health'); $('#health').textContent = data.modelConfigured ? '模型已配置' : '模型未配置（可先建项目）'; }

async function loadProjects() {
  const data = await request('/api/projects');
  const container = $('#projects');
  if (!data.projects.length) { container.textContent = '暂无项目'; return; }
  container.innerHTML = data.projects.map((project) => `<div class="project ${project.id === selectedId ? 'active' : ''}" data-id="${project.id}"><strong>${escapeHtml(project.name)}</strong><div class="muted">${escapeHtml(project.genre)} · <span class="status">${escapeHtml(project.status)}</span></div><div class="muted">阶段：${escapeHtml(project.currentStage)}</div></div>`).join('');
  container.querySelectorAll('.project').forEach((node) => node.addEventListener('click', () => { selectedId = node.dataset.id; loadProjects(); loadDetail(); }));
}

async function loadDetail() {
  if (!selectedId) { $('#detail').innerHTML = '<div class="muted">选择一个项目查看故事状态</div>'; return; }
  const [state, tasks] = await Promise.all([request(`/api/projects/${selectedId}/state`), request(`/api/projects/${selectedId}/tasks`)]);
  const project = state.project;
  $('#detail').innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><div><h2>${escapeHtml(project.name)}</h2><div class="muted">${escapeHtml(project.premise)}</div></div><div class="row"><button class="secondary" id="pause">暂停</button><button id="resume">继续</button></div></div><h3>故事状态</h3><pre>${escapeHtml(JSON.stringify(state.state, null, 2))}</pre><h3>任务</h3><pre>${escapeHtml(JSON.stringify(tasks.tasks, null, 2))}</pre></div>`;
  $('#pause').addEventListener('click', () => changeRunState('pause'));
  $('#resume').addEventListener('click', () => changeRunState('resume'));
}

async function changeRunState(action) { await request(`/api/projects/${selectedId}/${action}`, { method: 'POST' }); await loadProjects(); await loadDetail(); }

$('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = new FormData(event.target); const payload = Object.fromEntries(form.entries()); payload.autoStart = form.get('autoStart') === 'on';
  try { const data = await request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); selectedId = data.project.id; event.target.reset(); await loadProjects(); await loadDetail(); } catch (error) { alert(error.message); }
});
$('#refresh').addEventListener('click', () => Promise.all([loadHealth(), loadProjects(), loadDetail()]));
Promise.all([loadHealth(), loadProjects()]);
