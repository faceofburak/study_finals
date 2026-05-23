/* ═══════════════════════════════════════════════════
   PlanFlow — Full Application Script
   Intelligent Planner + Scheduling Engine
═══════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════
   1. GITHUB CONFIG (edit before deploy)
══════════════════════════════════════ */
const GITHUB_TOKEN  = "PASTE_TOKEN_HERE";   // ghp_xxxxxxxxxxxxxxxxxx
const REPO_OWNER    = "YOUR_USERNAME";
const REPO_NAME     = "YOUR_REPO";
const DATA_PATH     = "planner-data.json";  // path inside repo

/* ══════════════════════════════════════
   2. SUBJECT COLOR PALETTE
══════════════════════════════════════ */
const SUBJECT_COLORS = [
  { bg: 'rgba(245,166,35,0.15)',  text: '#f5a623', border: 'rgba(245,166,35,0.35)' },
  { bg: 'rgba(62,207,207,0.15)',  text: '#3ecfcf', border: 'rgba(62,207,207,0.35)' },
  { bg: 'rgba(139,124,248,0.15)', text: '#8b7cf8', border: 'rgba(139,124,248,0.35)' },
  { bg: 'rgba(240,106,142,0.15)', text: '#f06a8e', border: 'rgba(240,106,142,0.35)' },
  { bg: 'rgba(76,175,125,0.15)',  text: '#4caf7d', border: 'rgba(76,175,125,0.35)' },
  { bg: 'rgba(224,112,85,0.15)',  text: '#e07055', border: 'rgba(224,112,85,0.35)' },
  { bg: 'rgba(96,165,250,0.15)',  text: '#60a5fa', border: 'rgba(96,165,250,0.35)' },
  { bg: 'rgba(212,180,131,0.15)', text: '#d4b483', border: 'rgba(212,180,131,0.35)' },
];

/* ══════════════════════════════════════
   3. STATE
══════════════════════════════════════ */
let state = {
  currentUser: null,
  users: {},         // { username: { tasks, analytics, settings } }
  subjectColorMap: {},
  colorIndex: 0,
  editingTaskId: null,
  generatedSchedule: null,
  dragTask: null,
  dragSourceDate: null,
  githubSettings: { token: '', owner: '', repo: '' },
  preferences: { sessionLength: 60, dailyLimit: 6 },
};

/* ══════════════════════════════════════
   4. HELPERS
══════════════════════════════════════ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const dayName = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
const shortDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const addDays = (d, n) => { const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0,10); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function showToast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2800);
}

function showConfirm(msg, onOk) {
  const overlay = $('#confirmModal');
  $('#confirmMessage').textContent = msg;
  overlay.classList.remove('hidden');
  const okBtn = $('#confirmOk');
  const cancelBtn = $('#confirmCancel');
  const cleanup = () => overlay.classList.add('hidden');
  okBtn.onclick = () => { cleanup(); onOk(); };
  cancelBtn.onclick = cleanup;
}

/* ══════════════════════════════════════
   5. PERSISTENCE: localStorage + GitHub
══════════════════════════════════════ */
function saveLocal() {
  try {
    localStorage.setItem('planflow_state', JSON.stringify({
      users: state.users,
      subjectColorMap: state.subjectColorMap,
      colorIndex: state.colorIndex,
      githubSettings: state.githubSettings,
      preferences: state.preferences,
    }));
  } catch(e) { console.warn('localStorage save failed', e); }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem('planflow_state');
    if (!raw) return;
    const data = JSON.parse(raw);
    state.users = data.users || {};
    state.subjectColorMap = data.subjectColorMap || {};
    state.colorIndex = data.colorIndex || 0;
    state.githubSettings = data.githubSettings || { token: '', owner: '', repo: '' };
    state.preferences = data.preferences || { sessionLength: 60, dailyLimit: 6 };
  } catch(e) { console.warn('localStorage load failed', e); }
}

/* GitHub REST API sync */
async function githubSync(direction = 'push') {
  const { token, owner, repo } = state.githubSettings;
  if (!token || token === 'PASTE_TOKEN_HERE' || !owner || !repo) return null;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${DATA_PATH}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github.v3+json',
  };
  try {
    if (direction === 'push') {
      let sha = null;
      try {
        const getRes = await fetch(url, { headers });
        if (getRes.ok) { const d = await getRes.json(); sha = d.sha; }
      } catch(_) {}
      const content = btoa(unescape(encodeURIComponent(JSON.stringify({ users: state.users, subjectColorMap: state.subjectColorMap }))));
      const body = { message: 'PlanFlow sync', content };
      if (sha) body.sha = sha;
      await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
      showToast('Synced to GitHub ✓', 'success');
      return true;
    } else {
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      const d = await res.json();
      const decoded = decodeURIComponent(escape(atob(d.content)));
      const parsed = JSON.parse(decoded);
      if (parsed.users) state.users = parsed.users;
      if (parsed.subjectColorMap) state.subjectColorMap = parsed.subjectColorMap;
      saveLocal();
      return parsed;
    }
  } catch(e) {
    showToast('GitHub sync failed', 'error');
    return null;
  }
}

/* ══════════════════════════════════════
   6. USER MANAGEMENT
══════════════════════════════════════ */
function getKnownUsers() {
  return Object.keys(state.users);
}

function createUser(name) {
  if (!state.users[name]) {
    state.users[name] = { tasks: [], analytics: { completedByDate: {} } };
  }
}

function setCurrentUser(name) {
  name = name.trim();
  if (!name) return;
  createUser(name);
  state.currentUser = name;
  saveLocal();
  initApp();
}

function getCurrentUserData() {
  return state.users[state.currentUser] || { tasks: [], analytics: { completedByDate: {} } };
}

function getTasks() {
  return getCurrentUserData().tasks || [];
}

function saveTasks(tasks) {
  if (!state.users[state.currentUser]) createUser(state.currentUser);
  state.users[state.currentUser].tasks = tasks;
  saveLocal();
}

/* ══════════════════════════════════════
   7. SUBJECT COLOR SYSTEM
══════════════════════════════════════ */
function getSubjectColor(subject) {
  if (!subject) return SUBJECT_COLORS[7];
  const key = subject.toLowerCase().trim();
  if (!state.subjectColorMap[key]) {
    state.subjectColorMap[key] = state.colorIndex % SUBJECT_COLORS.length;
    state.colorIndex++;
    saveLocal();
  }
  return SUBJECT_COLORS[state.subjectColorMap[key]];
}

function renderSubjectLegend() {
  const el = $('#subjectLegend');
  el.innerHTML = '';
  const tasks = getTasks();
  const subjects = [...new Set(tasks.map(t => t.subject).filter(Boolean))];
  subjects.forEach(s => {
    const c = getSubjectColor(s);
    el.innerHTML += `<div class="subject-legend-item">
      <span class="subject-dot" style="background:${c.text}"></span>
      <span style="font-size:13px;color:var(--text-2)">${s}</span>
    </div>`;
  });
}

/* ══════════════════════════════════════
   8. SPLASH SCREEN
══════════════════════════════════════ */
function initSplash() {
  loadLocal();
  const users = getKnownUsers();
  const listEl = $('#userList');
  listEl.innerHTML = '';
  if (users.length > 0) {
    users.forEach(u => {
      const pill = document.createElement('button');
      pill.className = 'user-pill';
      pill.textContent = u;
      pill.onclick = () => {
        $('#nameInput').value = u;
        setCurrentUser(u);
      };
      listEl.appendChild(pill);
    });
  }
  $('#enterBtn').onclick = () => {
    const name = $('#nameInput').value.trim();
    if (!name) { showToast('Please enter your name', 'error'); return; }
    setCurrentUser(name);
  };
  $('#nameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#enterBtn').click();
  });
}

/* ══════════════════════════════════════
   9. APP INIT
══════════════════════════════════════ */
function initApp() {
  const splash = $('#splash');
  const app = $('#app');
  splash.style.opacity = '0';
  splash.style.transition = 'opacity .4s';
  setTimeout(() => splash.classList.add('hidden'), 400);
  app.classList.remove('hidden');

  $('#currentUserBadge').textContent = state.currentUser;
  $('#plannerTitle').textContent = `${state.currentUser}'s Planner`;

  // Load prefs into settings inputs
  $('#ghToken').value = state.githubSettings.token || '';
  $('#ghOwner').value = state.githubSettings.owner || '';
  $('#ghRepo').value  = state.githubSettings.repo  || '';
  $('#sessionLength').value = state.preferences.sessionLength || 60;
  $('#dailyLimit').value = state.preferences.dailyLimit || 6;

  // Set default start/end dates for generator
  const t = today();
  $('#startDateInput').value = t;
  $('#endDateInput').value = addDays(t, 21);

  renderPlanner();
  renderAnalytics();
  renderSubjectLegend();
  bindAppEvents();
}

/* ══════════════════════════════════════
   10. NAVIGATION / VIEWS
══════════════════════════════════════ */
function showView(name) {
  $$('.view').forEach(v => v.classList.add('hidden'));
  $$('.nav-link').forEach(l => l.classList.remove('active'));
  $(`#view${capitalize(name)}`).classList.remove('hidden');
  $(`[data-view="${name}"]`).classList.add('active');
  if (name === 'analytics') renderAnalytics();
  closeSidebar();
}
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#sidebarOverlay').classList.add('visible');
}
function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebarOverlay').classList.remove('visible');
}

/* ══════════════════════════════════════
   11. PLANNER RENDER
══════════════════════════════════════ */
function getDateRange() {
  const tasks = getTasks();
  if (!tasks.length) {
    const t = today();
    return [addDays(t, -1), ...Array.from({length:14}, (_,i) => addDays(t, i))];
  }
  const dates = tasks.map(t => t.date).filter(Boolean).sort();
  const min = dates[0] < addDays(today(), -3) ? dates[0] : addDays(today(), -3);
  const max = dates[dates.length-1] > addDays(today(), 14) ? addDays(dates[dates.length-1], 2) : addDays(today(), 14);
  const range = [];
  let cur = min;
  while (cur <= max) { range.push(cur); cur = addDays(cur, 1); }
  return range;
}

function renderPlanner() {
  const container = $('#dayCardsContainer');
  const tasks = getTasks();
  const t = today();
  const range = getDateRange();

  // Check overload
  let hasOverload = false;
  const dailyLimitMins = (state.preferences.dailyLimit || 6) * 60;

  let html = '';
  range.forEach(date => {
    const dayTasks = tasks.filter(tk => tk.date === date).sort((a,b) => (a.time||'').localeCompare(b.time||''));
    const totalMins = dayTasks.reduce((s, tk) => s + (tk.duration || 60), 0);
    const loadPct = Math.min(100, (totalMins / dailyLimitMins) * 100);
    const isToday = date === t;
    const isPast = date < t;
    const isOverloaded = totalMins > dailyLimitMins;
    if (isOverloaded) hasOverload = true;

    const completedCount = dayTasks.filter(tk => tk.completed).length;
    const completionPct = dayTasks.length ? Math.round(completedCount / dayTasks.length * 100) : 0;
    const conicColor = completionPct > 0 ? `conic-gradient(var(--amber) ${completionPct * 3.6}deg, var(--bg-4) 0deg)` : 'var(--bg-4)';

    const loadClass = loadPct >= 90 ? 'heavy' : loadPct >= 60 ? 'medium' : '';

    html += `<div class="day-card ${isToday ? 'is-today' : ''} ${isPast ? 'is-past' : ''} ${isOverloaded ? 'overloaded' : ''}" data-date="${date}" id="day-${date}">
      <div class="day-card-header" data-date="${date}">
        <div class="day-date-block">
          <span class="day-name">${dayName(date)}</span>
          <span class="day-date-label">${shortDate(date)}</span>
        </div>
        ${isToday ? '<span class="day-today-badge">TODAY</span>' : ''}
        <div class="day-meta">
          <div class="day-load-bar"><div class="day-load-fill ${loadClass}" style="width:${loadPct}%"></div></div>
          <div class="day-completion-ring" style="background:${conicColor}">
            <span class="day-completion-pct">${completionPct}%</span>
          </div>
          <span class="collapse-icon">▾</span>
        </div>
      </div>
      <div class="day-tasks" data-date="${date}">
        ${dayTasks.map(tk => renderTaskItem(tk, date)).join('')}
        <div class="add-task-row" data-date="${date}">
          <span>+</span><span>Add task</span>
        </div>
      </div>
    </div>`;
  });

  if (!html) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>No tasks yet. Generate a schedule or add tasks manually.</p>
    </div>`;
  } else {
    container.innerHTML = html;
  }

  $('#overloadWarning').classList.toggle('hidden', !hasOverload);

  // Today progress
  const todayTasks = tasks.filter(tk => tk.date === t);
  const todayDone = todayTasks.filter(tk => tk.completed).length;
  const pct = todayTasks.length ? Math.round(todayDone / todayTasks.length * 100) : 0;
  $('#progressFill').style.width = pct + '%';
  $('#progressLabel').textContent = `${pct}% today`;

  // Scroll to today
  setTimeout(() => {
    const todayEl = $(`#day-${t}`);
    if (todayEl) todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);

  bindPlannerEvents();
  renderSubjectLegend();
}

function renderTaskItem(task, date) {
  const c = getSubjectColor(task.subject);
  const checked = task.completed;
  const timeMeta = [task.time, task.duration ? `${task.duration}min` : null, task.notes].filter(Boolean).join(' · ');
  return `<div class="task-item ${checked ? 'completed' : ''}" data-id="${task.id}" data-date="${date}"
    draggable="true">
    <span class="drag-handle">⋮⋮</span>
    <div class="task-check ${checked ? 'checked' : ''}" data-id="${task.id}" data-action="check">
      ${checked ? '✓' : ''}
    </div>
    <div class="task-body">
      <div class="task-title-row">
        <span class="priority-dot ${task.priority || 'medium'}"></span>
        <span class="task-title">${escapeHtml(task.title)}</span>
        ${task.subject ? `<span class="subject-tag" style="background:${c.bg};color:${c.text};border:1px solid ${c.border}">${escapeHtml(task.subject)}</span>` : ''}
      </div>
      ${timeMeta ? `<div class="task-meta">${escapeHtml(timeMeta)}</div>` : ''}
    </div>
    <button class="task-edit-btn" data-id="${task.id}" data-action="edit">✏️</button>
  </div>`;
}

function escapeHtml(str = '') {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════
   12. PLANNER EVENTS
══════════════════════════════════════ */
function bindPlannerEvents() {
  // Day card collapse toggle
  $$('.day-card-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      const card = header.closest('.day-card');
      card.classList.toggle('collapsed');
    });
  });

  // Checkbox
  $$('[data-action="check"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      toggleTask(id);
    });
  });

  // Edit button
  $$('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTaskModal(btn.dataset.id);
    });
  });

  // Task item click (open edit)
  $$('.task-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]') || e.target.closest('.drag-handle')) return;
      openTaskModal(item.dataset.id);
    });
  });

  // Add task rows
  $$('.add-task-row').forEach(row => {
    row.addEventListener('click', () => openTaskModal(null, row.dataset.date));
  });

  // Drag and drop
  $$('.task-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      state.dragTask = item.dataset.id;
      state.dragSourceDate = item.dataset.date;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drag-over'); });
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (state.dragTask && state.dragTask !== item.dataset.id) {
        swapTasks(state.dragTask, item.dataset.id, item.dataset.date);
      }
    });
  });

  // Day task drop zone
  $$('.day-tasks').forEach(zone => {
    zone.addEventListener('dragover', e => e.preventDefault());
    zone.addEventListener('drop', e => {
      e.preventDefault();
      if (state.dragTask) {
        moveTaskToDate(state.dragTask, zone.dataset.date);
      }
    });
  });
}

function toggleTask(id) {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;
  // Update analytics
  if (!state.users[state.currentUser].analytics) state.users[state.currentUser].analytics = { completedByDate: {} };
  const d = task.date || today();
  if (!state.users[state.currentUser].analytics.completedByDate[d]) {
    state.users[state.currentUser].analytics.completedByDate[d] = 0;
  }
  state.users[state.currentUser].analytics.completedByDate[d] += task.completed ? 1 : -1;
  saveTasks(tasks);
  renderPlanner();
}

function swapTasks(dragId, dropId, dropDate) {
  const tasks = getTasks();
  const dragTask = tasks.find(t => t.id === dragId);
  const dropTask = tasks.find(t => t.id === dropId);
  if (dragTask && dropTask) {
    const tmp = dragTask.date;
    dragTask.date = dropTask.date;
    dropTask.date = tmp;
  }
  saveTasks(tasks);
  renderPlanner();
}

function moveTaskToDate(id, newDate) {
  const tasks = getTasks();
  const task = tasks.find(t => t.id === id);
  if (task && task.date !== newDate) {
    task.date = newDate;
    saveTasks(tasks);
    renderPlanner();
    showToast(`Moved to ${shortDate(newDate)}`);
  }
}

/* ══════════════════════════════════════
   13. TASK MODAL
══════════════════════════════════════ */
function openTaskModal(taskId = null, prefillDate = null) {
  const modal = $('#taskModal');
  state.editingTaskId = taskId;

  if (taskId) {
    const task = getTasks().find(t => t.id === taskId);
    if (!task) return;
    $('#taskModalTitle').textContent = 'Edit Task';
    $('#taskTitle').value = task.title || '';
    $('#taskDate').value = task.date || today();
    $('#taskTime').value = task.time || '';
    $('#taskDuration').value = task.duration || 60;
    $('#taskSubject').value = task.subject || '';
    $('#taskPriority').value = task.priority || 'medium';
    $('#taskNotes').value = task.notes || '';
    $('#deleteTaskBtn').classList.remove('hidden');
  } else {
    $('#taskModalTitle').textContent = 'Add Task';
    $('#taskTitle').value = '';
    $('#taskDate').value = prefillDate || today();
    $('#taskTime').value = '';
    $('#taskDuration').value = state.preferences.sessionLength || 60;
    $('#taskSubject').value = '';
    $('#taskPriority').value = 'medium';
    $('#taskNotes').value = '';
    $('#deleteTaskBtn').classList.add('hidden');
  }

  modal.classList.remove('hidden');
  setTimeout(() => $('#taskTitle').focus(), 50);
}

function closeTaskModal() {
  $('#taskModal').classList.add('hidden');
  state.editingTaskId = null;
}

function saveTask() {
  const title = $('#taskTitle').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }

  const taskData = {
    title,
    date:     $('#taskDate').value,
    time:     $('#taskTime').value,
    duration: parseInt($('#taskDuration').value) || 60,
    subject:  $('#taskSubject').value.trim(),
    priority: $('#taskPriority').value,
    notes:    $('#taskNotes').value.trim(),
  };

  const tasks = getTasks();
  if (state.editingTaskId) {
    const idx = tasks.findIndex(t => t.id === state.editingTaskId);
    if (idx !== -1) Object.assign(tasks[idx], taskData);
  } else {
    tasks.push({ id: uid(), completed: false, completedAt: null, ...taskData });
  }
  saveTasks(tasks);
  closeTaskModal();
  renderPlanner();
  showToast(state.editingTaskId ? 'Task updated' : 'Task added', 'success');
}

function deleteTask(id) {
  showConfirm('Delete this task?', () => {
    const tasks = getTasks().filter(t => t.id !== id);
    saveTasks(tasks);
    closeTaskModal();
    renderPlanner();
    showToast('Task deleted');
  });
}

/* ══════════════════════════════════════
   14. INTELLIGENT SCHEDULE PARSER
══════════════════════════════════════ */

/** Parse natural language prompt → schedule object */
function parseSchedulePrompt(text, startDate, endDate) {
  const lines = text.split(/\n|\.(?=\s)/).map(l => l.trim()).filter(Boolean);
  const exams = [];
  const blockedDates = [];
  const routines = [];
  const prefs = { intensity: 'medium', workoutTime: 'morning', studyEnd: 22, freeTime: false, lightWeekends: false, studyTime: null };

  // ── YEAR HELPER ──
  const guessYear = (month) => {
    const now = new Date();
    const cur = now.getMonth() + 1;
    let yr = now.getFullYear();
    if (month < cur - 1) yr++;
    return yr;
  };

  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,july:7,aug:8,sep:9,oct:10,nov:11,dec:12,
    january:1,february:2,march:3,april:4,june:6,july2:7,august:8,september:9,october:10,november:11,december:12 };

  function parseDate(str) {
    str = str.toLowerCase().trim();
    // "June 5", "5 June", "Jun 5", "June 5th"
    const m1 = str.match(/([a-z]+)\s+(\d{1,2})/);
    const m2 = str.match(/(\d{1,2})\s+([a-z]+)/);
    let month, day;
    if (m1 && MONTHS[m1[1]]) { month = MONTHS[m1[1]]; day = parseInt(m1[2]); }
    else if (m2 && MONTHS[m2[2]]) { month = MONTHS[m2[2]]; day = parseInt(m2[1]); }
    if (!month || !day) return null;
    const yr = guessYear(month);
    return `${yr}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  function parseDateRange(str) {
    // "May 30-June 1", "May 30-31"
    str = str.toLowerCase();
    const m = str.match(/([a-z]+ \d{1,2})\s*[-–]\s*([a-z]+ \d{1,2})/);
    if (m) return { from: parseDate(m[1]), to: parseDate(m[2]) };
    // "May 30-31"
    const m2 = str.match(/([a-z]+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/);
    if (m2 && MONTHS[m2[1]]) {
      const mon = MONTHS[m2[1]]; const yr = guessYear(mon);
      return {
        from: `${yr}-${String(mon).padStart(2,'0')}-${String(parseInt(m2[2])).padStart(2,'0')}`,
        to:   `${yr}-${String(mon).padStart(2,'0')}-${String(parseInt(m2[3])).padStart(2,'0')}`,
      };
    }
    return null;
  }

  function parseChapters(str) {
    const chapters = [];
    // "chapters 3 5 6 7" or "chapters 3,5,6" or "chapters 0-24" or "chapters 5-8"
    const rangeMatch = str.match(/chapters?\s+([\d]+)\s*[-–]\s*([\d]+)/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1]), end = parseInt(rangeMatch[2]);
      for (let i = start; i <= end; i++) chapters.push(i);
      return chapters;
    }
    const listMatch = str.match(/chapters?\s+([\d\s,]+)/i);
    if (listMatch) {
      return listMatch[1].split(/[\s,]+/).filter(Boolean).map(Number);
    }
    return [];
  }

  // ── PARSE EACH LINE ──
  lines.forEach(line => {
    const lc = line.toLowerCase();

    // BLOCKED DATES
    if (/no studying|blocked|off|break|vacation|holiday/i.test(lc)) {
      const dr = parseDateRange(line);
      if (dr && dr.from && dr.to) {
        let cur = dr.from;
        while (cur <= dr.to) { blockedDates.push(cur); cur = addDays(cur, 1); }
      } else {
        const d = parseDate(line.replace(/no studying|blocked|off|break/i, '').trim());
        if (d) blockedDates.push(d);
      }
    }

    // PREFERENCES
    if (/heavy\s*(workload|focus|work)/i.test(lc)) prefs.intensity = 'heavy';
    if (/light\s*(workload|schedule|work|weekends?)/i.test(lc) || /easy/i.test(lc)) prefs.intensity = 'light';
    if (/light\s*weekends?|no studying weekends?/i.test(lc)) prefs.lightWeekends = true;
    if (/no studying weekends?/i.test(lc)) prefs.lightWeekends = true;
    if (/free time|lots of free/i.test(lc)) prefs.freeTime = true;
    if (/afternoons?/i.test(lc)) prefs.studyTime = 'afternoon';
    if (/mornings?/i.test(lc) && !/gym|run|workout|exercise/i.test(lc)) prefs.studyTime = 'morning';
    if (/evenings?/i.test(lc)) prefs.studyTime = 'evening';
    if (/after\s*(\d{1,2})\s*pm/i.test(lc)) {
      const m = lc.match(/after\s*(\d{1,2})\s*pm/i);
      if (m) prefs.studyEnd = parseInt(m[1]) + 12;
    }
    if (/revision\s*week/i.test(lc)) prefs.revisionWeek = true;

    // WORKOUT / ROUTINE
    if (/gym|run|jog|workout|exercise|swim|cycle/i.test(lc)) {
      let freq = 'daily';
      if (/every day|daily/i.test(lc)) freq = 'daily';
      else if (/every\s*(morning|afternoon|evening)/i.test(lc)) freq = 'daily';
      else if (/weekdays?/i.test(lc)) freq = 'weekdays';
      else if (/twice/i.test(lc)) freq = 'twice';
      const timeOfDay = /afternoon/i.test(lc) ? 'afternoon' : /evening/i.test(lc) ? 'evening' : 'morning';
      const activityMatch = lc.match(/(gym|run|jog|workout|exercise|swim|cycling?)/i);
      routines.push({ type: 'workout', name: capitalize(activityMatch ? activityMatch[1] : 'Workout'), freq, timeOfDay });
    }

    // DSA / SYSTEM DESIGN / specific practices
    if (/dsa|algorithm|leetcode|coding practice/i.test(lc)) {
      const freq = /weekdays?/i.test(lc) ? 'weekdays' : 'daily';
      routines.push({ type: 'practice', name: 'DSA Practice', freq, timeOfDay: 'morning', duration: 90 });
    }
    if (/system design/i.test(lc)) {
      routines.push({ type: 'practice', name: 'System Design', freq: 'twice', timeOfDay: 'afternoon', duration: 90 });
    }

    // EXAMS
    // "SubjectName final/exam DATE chapters X-Y"
    const examPatterns = [
      /^(.+?)\s+(?:final|exam|test|midterm|quiz)\s+([a-z]+ \d{1,2})/i,
      /^(?:prepare for|prep for|study for)\s+(.+?)\s+(?:final|exam|interview)\s+([a-z]+ \d{1,2})/i,
    ];
    let matched = false;
    for (const pat of examPatterns) {
      const m = line.match(pat);
      if (m) {
        const subject = m[1].trim();
        const date = parseDate(m[2]);
        if (date) {
          const chapters = parseChapters(line);
          const intensityHint = /heavy focus/i.test(lc) ? 'heavy' : /light/i.test(lc) ? 'light' : null;
          exams.push({ subject, date, chapters, intensityHint });
          matched = true;
          break;
        }
      }
    }
    // Interview prep pattern
    if (!matched && /interview/i.test(lc)) {
      const dateM = parseDate(line.replace(/.*interview/i, '').trim()) || parseDate(line);
      if (dateM) {
        const subM = line.match(/for\s+(.+?)\s+interview/i);
        exams.push({ subject: subM ? subM[1] : 'Interview Prep', date: dateM, chapters: [], type: 'interview' });
      }
    }
  });

  return { exams, blockedDates, routines, prefs, startDate, endDate };
}

/** Build actual tasks from parsed schedule */
function buildSchedule(parsed) {
  const { exams, blockedDates, routines, prefs, startDate, endDate } = parsed;
  const tasks = [];
  const blockedSet = new Set(blockedDates);
  const intensityMultiplier = prefs.intensity === 'heavy' ? 1.3 : prefs.intensity === 'light' ? 0.7 : 1;
  const dailyLimitH = (state.preferences.dailyLimit || 6) * intensityMultiplier;
  const sessionMin = state.preferences.sessionLength || 60;

  // Build date range
  const dateRange = [];
  let cur = startDate;
  while (cur <= endDate) { dateRange.push(cur); cur = addDays(cur, 1); }

  // Precompute subject chapter distribution
  const subjectWork = exams.map(exam => {
    const totalChapters = exam.chapters.length || 8;
    const chaptersLeft = [...(exam.chapters.length ? exam.chapters : Array.from({length: totalChapters}, (_,i) => i+1))];
    const daysUntilExam = dateRange.filter(d => d < exam.date && !blockedSet.has(d)).length;
    const chapsPerDay = daysUntilExam > 0 ? totalChapters / daysUntilExam : totalChapters;
    return { ...exam, chaptersLeft, chapsPerDay: Math.max(0.3, chapsPerDay), daysUntilExam };
  });

  // Sort exams by date (earliest first = highest priority)
  subjectWork.sort((a, b) => a.date.localeCompare(b.date));

  dateRange.forEach(date => {
    const isBlocked = blockedSet.has(date);
    const dow = new Date(date + 'T00:00:00').getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;
    let dayBudgetH = isBlocked ? 0 : (isWeekend && prefs.lightWeekends ? dailyLimitH * 0.3 : dailyLimitH);

    let timeSlot = 7; // 7am start

    // ── ROUTINES FIRST ──
    routines.forEach(r => {
      const shouldAdd = r.freq === 'daily' || (r.freq === 'weekdays' && !isWeekend) || (r.freq === 'twice' && (dow === 1 || dow === 4));
      if (!shouldAdd) return;

      let routineHour;
      if (r.timeOfDay === 'morning') routineHour = 6.5;
      else if (r.timeOfDay === 'afternoon') routineHour = 14;
      else routineHour = 18;

      const duration = r.duration || (r.type === 'workout' ? 45 : 90);
      tasks.push({
        id: uid(), completed: false, completedAt: null,
        title: r.name,
        subject: r.type === 'workout' ? 'Fitness' : r.name,
        date,
        time: formatTime(routineHour),
        duration,
        priority: 'medium',
        notes: '',
      });
      if (r.timeOfDay === 'morning') timeSlot = Math.max(timeSlot, routineHour + duration / 60 + 0.5);
    });

    if (isBlocked) {
      tasks.push({ id: uid(), completed: false, completedAt: null, title: '🚫 No Study Day', subject: 'Blocked', date, time: '09:00', duration: 30, priority: 'low', notes: 'Blocked day' });
      return;
    }

    // Adjust start time
    if (prefs.studyTime === 'afternoon') timeSlot = Math.max(timeSlot, 13);
    else if (prefs.studyTime === 'evening') timeSlot = Math.max(timeSlot, 17);
    else timeSlot = Math.max(timeSlot, 8.5);

    let usedH = 0;

    // ── STUDY SESSIONS ──
    subjectWork.forEach(exam => {
      if (date >= exam.date) return; // past exam
      if (exam.chaptersLeft.length === 0) return;
      if (usedH >= dayBudgetH) return;
      const daysLeft = dateRange.filter(d => d >= date && d < exam.date && !blockedSet.has(d)).length;
      if (daysLeft <= 0) return;

      // Revision day: 2 days before exam
      const daysUntil = dateRange.filter(d => d >= date && d < exam.date).length;
      const isRevisionDay = daysUntil <= 2;

      if (isRevisionDay) {
        const dur = Math.min(sessionMin * 1.5, 120);
        tasks.push({
          id: uid(), completed: false, completedAt: null,
          title: `📝 ${exam.subject} — Revision`,
          subject: exam.subject, date,
          time: formatTime(timeSlot), duration: dur,
          priority: 'high', notes: 'Revision before exam',
        });
        timeSlot += dur / 60 + 0.25;
        usedH += dur / 60;
        return;
      }

      // Chapters for today
      const targetChaps = Math.max(1, Math.ceil(exam.chapsPerDay));
      const chapsToday = exam.chaptersLeft.splice(0, Math.min(targetChaps, exam.chaptersLeft.length));
      if (chapsToday.length === 0) return;

      const dur = Math.min(sessionMin + (chapsToday.length > 3 ? 30 : 0), 150);
      if (usedH + dur/60 > dayBudgetH + 0.5) return;

      const chapLabel = chapsToday.length === 1 ? `Ch.${chapsToday[0]}` : `Ch.${chapsToday[0]}–${chapsToday[chapsToday.length-1]}`;
      const title = exam.type === 'interview'
        ? `💻 ${exam.subject} — ${chapsToday[0] === 1 ? 'Session 1' : `Session ${chapsToday[0]}`}`
        : `📚 ${exam.subject} — ${chapLabel}`;

      const priority = daysUntil <= 5 ? 'high' : daysUntil <= 10 ? 'medium' : 'low';

      tasks.push({
        id: uid(), completed: false, completedAt: null,
        title, subject: exam.subject, date,
        time: formatTime(timeSlot), duration: dur,
        priority, notes: ``,
      });
      timeSlot += dur / 60 + 0.25;
      usedH += dur / 60;
    });

    // ── BREAK / FREE TIME ──
    if (usedH > 0 && usedH < dayBudgetH * 0.6 && prefs.freeTime) {
      tasks.push({
        id: uid(), completed: false, completedAt: null,
        title: '☀️ Free Time',
        subject: 'Free Time', date,
        time: formatTime(timeSlot + 0.5), duration: 90,
        priority: 'low', notes: 'Relax & recharge',
      });
    }

    // Short break reminder for heavy days
    if (usedH >= dailyLimitH * 0.8) {
      tasks.push({
        id: uid(), completed: false, completedAt: null,
        title: '😴 Rest & Recovery',
        subject: 'Wellness', date,
        time: formatTime(prefs.studyEnd - 1), duration: 60,
        priority: 'low', notes: 'Sleep 8h — protect your energy',
      });
    }
  });

  return tasks;
}

function formatTime(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

/* ══════════════════════════════════════
   15. GENERATE VIEW
══════════════════════════════════════ */
function renderGeneratePreview(tasks) {
  const preview = $('#generatePreview');
  if (!tasks.length) {
    preview.innerHTML = '<p style="color:var(--text-3);font-size:13px">No tasks could be generated. Please refine your prompt.</p>';
    return;
  }
  const byDate = {};
  tasks.forEach(t => { if (!byDate[t.date]) byDate[t.date] = []; byDate[t.date].push(t); });
  const dates = Object.keys(byDate).sort();

  let html = `<h3>📅 Generated Schedule — ${tasks.length} tasks across ${dates.length} days</h3>`;
  dates.forEach(date => {
    html += `<div class="preview-day">
      <div class="preview-day-label">${dayName(date)} · ${shortDate(date)}</div>
      ${byDate[date].map(t => {
        const c = getSubjectColor(t.subject);
        return `<div class="preview-task">
          <span class="pt-dot" style="background:${c.text}"></span>
          <span>${t.time ? t.time + ' · ' : ''}${escapeHtml(t.title)}</span>
          <span style="color:var(--text-3);margin-left:auto;font-size:11px">${t.duration}min</span>
        </div>`;
      }).join('')}
    </div>`;
  });
  preview.innerHTML = html;
  preview.classList.remove('hidden');
}

/* ══════════════════════════════════════
   16. ANALYTICS
══════════════════════════════════════ */
function computeAnalytics() {
  const tasks = getTasks();
  const t = today();

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const completionPct = totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0;

  // Streak: consecutive days with ≥1 completed task
  let streak = 0;
  let d = t;
  while (true) {
    const dayTasks = tasks.filter(tk => tk.date === d && tk.completed);
    if (!dayTasks.length) break;
    streak++;
    d = addDays(d, -1);
  }

  // Study hours (60min = 1h per completed study task)
  const studyHours = tasks.filter(t => t.completed && /study|chapter|revision|dsa|system/i.test(t.title))
    .reduce((s, t) => s + (t.duration || 60) / 60, 0);

  // Score: weighted by priority
  const score = tasks.reduce((s, t) => {
    if (!t.completed) return s;
    const w = t.priority === 'high' ? 3 : t.priority === 'medium' ? 2 : 1;
    return s + w;
  }, 0);

  // Weekly chart: last 7 days
  const weekDays = Array.from({length:7}, (_,i) => addDays(t, -6 + i));
  const weekData = weekDays.map(d => ({
    date: d, label: new Date(d+'T00:00:00').toLocaleDateString('en-US',{weekday:'short'}),
    done: tasks.filter(tk => tk.date === d && tk.completed).length,
    total: tasks.filter(tk => tk.date === d).length,
  }));
  const maxWeek = Math.max(1, ...weekData.map(w => w.total));

  // Subject progress
  const subjects = [...new Set(tasks.map(t => t.subject).filter(Boolean))];
  const subjectData = subjects.map(s => {
    const st = tasks.filter(t => t.subject === s);
    const done = st.filter(t => t.completed).length;
    return { subject: s, total: st.length, done, pct: st.length ? Math.round(done/st.length*100) : 0 };
  }).sort((a,b) => b.pct - a.pct);

  return { completionPct, streak, studyHours: Math.round(studyHours * 10)/10, score, weekData, maxWeek, subjectData };
}

function renderAnalytics() {
  const a = computeAnalytics();
  $('#statStreak').textContent = a.streak;
  $('#statCompletion').textContent = a.completionPct + '%';
  $('#statStudyHours').textContent = a.studyHours + 'h';
  $('#statScore').textContent = a.score;

  // Weekly chart
  const chart = $('#weeklyChart');
  chart.innerHTML = a.weekData.map(w => {
    const pct = Math.round((w.total / a.maxWeek) * 100);
    const donePct = w.total ? Math.round(w.done / w.total * 100) : 0;
    return `<div class="week-bar-wrap">
      <div class="week-bar-fill-wrap">
        <div class="week-bar" style="height:${pct}%;background:linear-gradient(0deg,var(--amber-glow) ${donePct}%,var(--bg-4) ${donePct}%)"></div>
      </div>
      <span class="week-bar-label">${w.label}</span>
    </div>`;
  }).join('');

  // Subject progress
  const sp = $('#subjectProgress');
  if (!a.subjectData.length) {
    sp.innerHTML = '<p style="color:var(--text-3);font-size:13px">No subjects yet.</p>';
    return;
  }
  sp.innerHTML = a.subjectData.map(s => {
    const c = getSubjectColor(s.subject);
    return `<div class="subject-progress-item">
      <div class="subject-progress-label">
        <span>${escapeHtml(s.subject)}</span>
        <span style="color:var(--text-3)">${s.done}/${s.total} · ${s.pct}%</span>
      </div>
      <div class="subject-progress-bar-bg">
        <div class="subject-progress-bar-fill" style="width:${s.pct}%;background:${c.text}"></div>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════
   17. EXPORT / IMPORT
══════════════════════════════════════ */
function exportData() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: state.currentUser,
    tasks: getTasks(),
    analytics: getCurrentUserData().analytics,
    subjectColorMap: state.subjectColorMap,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `planflow-${state.currentUser}-${today()}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Exported successfully', 'success');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.tasks) {
        saveTasks(data.tasks);
        if (data.subjectColorMap) Object.assign(state.subjectColorMap, data.subjectColorMap);
        renderPlanner();
        showToast(`Imported ${data.tasks.length} tasks`, 'success');
      } else showToast('Invalid file format', 'error');
    } catch { showToast('Failed to parse file', 'error'); }
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════
   18. BIND ALL APP EVENTS
══════════════════════════════════════ */
function bindAppEvents() {
  // Sidebar
  $('#menuBtn').onclick = openSidebar;
  $('#closeSidebar').onclick = closeSidebar;
  $('#sidebarOverlay').onclick = closeSidebar;
  $$('.nav-link').forEach(l => {
    l.onclick = (e) => { e.preventDefault(); showView(l.dataset.view); };
  });

  // Sync btn
  $('#syncBtn').onclick = async () => {
    const btn = $('#syncBtn');
    btn.classList.add('spinning');
    await githubSync('push');
    btn.classList.remove('spinning');
  };

  // Switch user
  $('#switchUserBtn').onclick = () => {
    state.currentUser = null;
    $('#app').classList.add('hidden');
    $('#splash').classList.remove('hidden');
    $('#splash').style.opacity = '1';
    initSplash();
  };

  // Planner buttons
  $('#todayBtn').onclick = () => {
    const el = $(`#day-${today()}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#addTaskBtn').onclick = () => openTaskModal(null, today());
  $('#fab').onclick = () => openTaskModal(null, today());

  // Task modal
  $('#closeTaskModal').onclick = closeTaskModal;
  $('#saveTaskBtn').onclick = saveTask;
  $('#deleteTaskBtn').onclick = () => deleteTask(state.editingTaskId);
  $('#taskModal').addEventListener('click', e => { if (e.target === $('#taskModal')) closeTaskModal(); });

  // Generate view
  $('#examplesToggle').onclick = () => {
    const body = $('#examplesBody');
    body.classList.toggle('hidden');
    $('#examplesToggle').parentElement.classList.toggle('open');
  };

  $$('.copy-btn').forEach(btn => {
    btn.onclick = () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) {
        navigator.clipboard.writeText(target.textContent.trim()).then(() => showToast('Copied!'));
      }
    };
  });

  $$('.chip').forEach(chip => {
    chip.onclick = () => {
      const ta = $('#promptInput');
      const add = chip.dataset.text;
      ta.value = ta.value.trim() + (ta.value.trim() ? '\n' : '') + add;
      ta.focus();
    };
  });

  $('#generateBtn').onclick = async () => {
    const prompt = $('#promptInput').value.trim();
    if (!prompt) { showToast('Please enter a prompt', 'error'); return; }
    const startDate = $('#startDateInput').value || today();
    const endDate = $('#endDateInput').value || addDays(today(), 21);

    const btn = $('#generateBtn');
    const btnText = $('#generateBtnText');
    btn.classList.add('loading');
    btnText.textContent = '⟳ Generating…';

    // Async to let UI update
    await new Promise(r => setTimeout(r, 50));

    try {
      const parsed = parseSchedulePrompt(prompt, startDate, endDate);
      const tasks = buildSchedule(parsed);
      state.generatedSchedule = tasks;
      renderGeneratePreview(tasks);
      $('#generateActions').classList.remove('hidden');
    } catch(e) {
      showToast('Error generating schedule', 'error');
      console.error(e);
    }

    btn.classList.remove('loading');
    btnText.textContent = '✨ Generate My Schedule';
  };

  $('#acceptScheduleBtn').onclick = () => {
    if (!state.generatedSchedule) return;
    const existing = getTasks();
    const merged = [...existing, ...state.generatedSchedule];
    saveTasks(merged);
    state.generatedSchedule = null;
    $('#generatePreview').classList.add('hidden');
    $('#generateActions').classList.add('hidden');
    renderSubjectLegend();
    showView('planner');
    showToast(`✓ Schedule added — ${merged.length} tasks total`, 'success');
    renderPlanner();
  };

  $('#discardScheduleBtn').onclick = () => {
    state.generatedSchedule = null;
    $('#generatePreview').classList.add('hidden');
    $('#generateActions').classList.add('hidden');
    showToast('Schedule discarded');
  };

  // Export / Import
  $('#exportBtn').onclick = exportData;
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = (e) => { if (e.target.files[0]) importData(e.target.files[0]); };

  // Settings
  $('#saveGhSettings').onclick = async () => {
    state.githubSettings = {
      token: $('#ghToken').value.trim(),
      owner: $('#ghOwner').value.trim(),
      repo:  $('#ghRepo').value.trim(),
    };
    state.preferences = {
      sessionLength: parseInt($('#sessionLength').value),
      dailyLimit: parseInt($('#dailyLimit').value),
    };
    saveLocal();
    const statusEl = $('#ghStatus');
    statusEl.textContent = 'Testing connection…';
    statusEl.style.color = 'var(--text-2)';
    const result = await githubSync('push');
    if (result) {
      statusEl.textContent = '✓ Connected and synced';
      statusEl.style.color = 'var(--success)';
    } else {
      statusEl.textContent = '✗ Could not connect. Check token/owner/repo.';
      statusEl.style.color = 'var(--danger)';
    }
  };

  $('#clearDataBtn').onclick = () => {
    showConfirm('Clear ALL your planner data? This cannot be undone.', () => {
      state.users[state.currentUser] = { tasks: [], analytics: { completedByDate: {} } };
      state.subjectColorMap = {};
      state.colorIndex = 0;
      saveLocal();
      renderPlanner();
      showToast('Data cleared');
    });
  };

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeTaskModal();
      $('#confirmModal').classList.add('hidden');
    }
    if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); openTaskModal();
    }
  });
}

/* ══════════════════════════════════════
   19. START
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  loadLocal();
  initSplash();
});
