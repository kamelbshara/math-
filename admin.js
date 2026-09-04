let ADMIN = null;
let CLASSROOMS = [];
let CHAPTERS = [];
let LESSONS = [];
let OUTCOMES = [];
let USERS = [];
let RESOURCES = [];
let BULK_ROWS = [];
let QUESTIONS = [];
let SELECTED_QIDS = new Set();
let EDIT_QID = null;
let EDIT_RID = null;
let EDIT_CHID = null;
let EDIT_LSID = null;
let QB_PENDING_IMAGE_FILE = null;
let QB_REMOVE_IMAGE = false;
const OPEN_OUTCOMES = new Set();

function showMsg(id, text, ok) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'msg ' + (ok ? 'ok' : 'err');
}

let ANALYTICS_LOADED = false;
let AUDIT_LOADED = false;

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'analytics' && !ANALYTICS_LOADED) { ANALYTICS_LOADED = true; loadAnalytics(); }
    if (tab.dataset.tab === 'auditlog' && !AUDIT_LOADED) { AUDIT_LOADED = true; loadAuditLog(); }
  });
});

async function loadAnalytics() {
  const [{ data: progress }, { data: questions }, { data: choices }, { data: profiles }, { data: views }, { data: resources }] = await Promise.all([
    sb.from('student_progress').select('*'),
    sb.from('questions').select('id, number, question_text, lesson_id'),
    sb.from('choices').select('id, question_id, is_correct'),
    sb.from('profiles').select('id, full_name, username, role, classrooms(name)'),
    sb.from('video_views').select('*').order('viewed_at', { ascending: false }).limit(200),
    sb.from('lesson_resources').select('id, title'),
  ]);
  const lessonById = Object.fromEntries(LESSONS.map(l => [l.id, l]));
  const questionById = Object.fromEntries((questions || []).map(q => [q.id, q]));
  const profileById = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  const resourceById = Object.fromEntries((resources || []).map(r => [r.id, r]));

  // Missed questions
  const byQuestion = {};
  (progress || []).forEach(p => {
    if (!byQuestion[p.question_id]) byQuestion[p.question_id] = { attempts: 0, correct: 0 };
    byQuestion[p.question_id].attempts++;
    if (p.is_correct) byQuestion[p.question_id].correct++;
  });
  const missedRows = Object.entries(byQuestion)
    .map(([qid, stats]) => ({ qid, ...stats, pct: Math.round(100 * stats.correct / stats.attempts) }))
    .filter(r => r.attempts >= 1)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 25);
  document.querySelector('#missedTable tbody').innerHTML = missedRows.map(r => {
    const q = questionById[r.qid];
    const lesson = q ? lessonById[q.lesson_id] : null;
    return `<tr><td>${lesson ? 'L' + lesson.number : '—'}</td><td>${q ? escapeHtml(q.question_text) : '—'}</td><td>${r.attempts}</td><td>${r.pct}%</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="hint">No data yet.</td></tr>';

  // Per-student
  const byStudent = {};
  (progress || []).forEach(p => {
    if (!byStudent[p.student_id]) byStudent[p.student_id] = { answered: 0, correct: 0 };
    byStudent[p.student_id].answered++;
    if (p.is_correct) byStudent[p.student_id].correct++;
  });
  const studentRows = Object.entries(byStudent)
    .map(([sid, stats]) => ({ sid, ...stats, pct: Math.round(100 * stats.correct / stats.answered) }))
    .sort((a, b) => b.answered - a.answered);
  document.querySelector('#studentStatsTable tbody').innerHTML = studentRows.map(r => {
    const p = profileById[r.sid];
    return `<tr><td>${p ? escapeHtml(p.full_name) : '—'}</td><td>${p && p.classrooms ? escapeHtml(p.classrooms.name) : '—'}</td><td>${r.answered}</td><td>${r.pct}%</td><td><button class="small-btn" data-act="viewstudent" data-id="${r.sid}">View</button></td></tr>`;
  }).join('') || '<tr><td colspan="5" class="hint">No data yet.</td></tr>';
  document.querySelectorAll('#studentStatsTable button[data-act="viewstudent"]').forEach(btn => {
    btn.addEventListener('click', () => showStudentDetail(btn.dataset.id, progress || [], questions || [], profiles || [], views || [], resources || []));
  });

  // Video views
  document.querySelector('#videoViewsTable tbody').innerHTML = (views || []).map(v => {
    const p = profileById[v.student_id];
    const r = resourceById[v.resource_id];
    return `<tr><td>${r ? escapeHtml(r.title) : '—'}</td><td>${p ? escapeHtml(p.full_name) : '—'}</td><td>${new Date(v.viewed_at).toLocaleString()}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="hint">No views recorded yet.</td></tr>';
}

function showStudentDetail(studentId, progress, questions, profiles, views, resources) {
  const profile = profiles.find(p => p.id === studentId);
  const questionById = Object.fromEntries(questions.map(q => [q.id, q]));
  const lessonById = Object.fromEntries(LESSONS.map(l => [l.id, l]));
  const resourceById = Object.fromEntries(resources.map(r => [r.id, r]));

  document.getElementById('studentDetailCard').style.display = 'block';
  document.getElementById('studentDetailTitle').textContent = 'Progress — ' + (profile ? profile.full_name : studentId);

  const byLesson = {};
  progress.filter(p => p.student_id === studentId).forEach(p => {
    const q = questionById[p.question_id];
    if (!q) return;
    const lid = q.lesson_id;
    if (!byLesson[lid]) byLesson[lid] = { answered: 0, correct: 0 };
    byLesson[lid].answered++;
    if (p.is_correct) byLesson[lid].correct++;
  });
  const rows = Object.entries(byLesson).map(([lid, stats]) => {
    const lesson = lessonById[lid];
    const pct = Math.round(100 * stats.correct / stats.answered);
    return `<tr><td>${lesson ? lesson.number + '. ' + escapeHtml(lesson.title_en) : '—'}</td><td>${stats.answered}</td><td>${pct}%</td></tr>`;
  }).join('');
  document.querySelector('#studentDetailTable tbody').innerHTML = rows || '<tr><td colspan="3" class="hint">No questions answered yet.</td></tr>';

  const studentViews = views.filter(v => v.student_id === studentId);
  document.querySelector('#studentDetailVideos tbody').innerHTML = studentViews.map(v => {
    const r = resourceById[v.resource_id];
    return `<tr><td>${r ? escapeHtml(r.title) : '—'}</td><td>${new Date(v.viewed_at).toLocaleString()}</td></tr>`;
  }).join('') || '<tr><td colspan="2" class="hint">No videos watched yet.</td></tr>';

  document.getElementById('studentDetailCard').scrollIntoView({ behavior: 'smooth' });
}

async function loadAuditLog() {
  const { data: entries } = await sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(150);
  document.querySelector('#auditTable tbody').innerHTML = (entries || []).map(e => `<tr>
    <td>${new Date(e.created_at).toLocaleString()}</td>
    <td>${escapeHtml(e.actor_username || '—')}</td>
    <td>${escapeHtml(e.action)}</td>
    <td>${escapeHtml(e.table_name)}</td>
  </tr>`).join('') || '<tr><td colspan="4" class="hint">No activity logged yet.</td></tr>';
}

async function loadAll() {
  const [{ data: classrooms }, { data: chapters }, { data: lessons }, { data: outcomes }, { data: profiles }, { data: resources }, { data: questions }, { data: choices }] = await Promise.all([
    sb.from('classrooms').select('*').order('name'),
    sb.from('chapters').select('*').order('sort_order'),
    sb.from('lessons').select('*').order('sort_order'),
    sb.from('learning_outcomes').select('*').order('sort_order'),
    sb.from('profiles').select('*, classrooms(name)').order('username'),
    sb.from('lesson_resources').select('*, lessons(title_en)').order('sort_order'),
    sb.from('questions').select('*').order('sort_order'),
    sb.from('choices').select('*').order('sort_order'),
  ]);
  CLASSROOMS = classrooms || [];
  CHAPTERS = chapters || [];
  LESSONS = lessons || [];
  OUTCOMES = outcomes || [];
  USERS = profiles || [];
  RESOURCES = resources || [];

  const choicesByQ = {};
  (choices || []).forEach(c => { (choicesByQ[c.question_id] = choicesByQ[c.question_id] || []).push(c); });
  QUESTIONS = (questions || []).map(q => ({ ...q, choices: choicesByQ[q.id] || [] }));

  renderStats(questions || []);
  renderClassroomSelects();
  renderChapterSelects();
  renderLessonSelects();
  renderUsersTable();
  renderClassroomsTable();
  renderChapterTree();
  renderResourcesTable();
  renderQuestionBankLessonFilter();
  renderQuestionBank();
}

function renderStats(questions) {
  document.getElementById('statStrip').innerHTML = `
    <div class="stat"><div class="n">${CHAPTERS.length}</div><div class="l">Chapters</div></div>
    <div class="stat"><div class="n">${LESSONS.length}</div><div class="l">Lessons</div></div>
    <div class="stat"><div class="n">${questions.length}</div><div class="l">Questions</div></div>
    <div class="stat"><div class="n">${USERS.filter(u=>u.role==='student').length}</div><div class="l">Students</div></div>
    <div class="stat"><div class="n">${CLASSROOMS.length}</div><div class="l">Classrooms</div></div>`;
}

function renderClassroomSelects() {
  document.getElementById('nu_classroom').innerHTML = '<option value="">— None —</option>' + CLASSROOMS.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}
function renderChapterSelects() {
  document.getElementById('ls_chapter').innerHTML = CHAPTERS.map(c => `<option value="${c.id}">${c.number}. ${escapeHtml(c.title_en)}</option>`).join('');
}
function renderLessonSelects() {
  const opts = LESSONS.map(l => `<option value="${l.id}">${l.number}. ${escapeHtml(l.title_en)}</option>`).join('');
  document.getElementById('rs_lesson').innerHTML = opts;
  document.getElementById('qb_lesson').innerHTML = opts;
}

/* ---------- Users ---------- */
function renderUsersTable() {
  const tbody = document.querySelector('#usersTable tbody');
  tbody.innerHTML = USERS.map(u => `<tr>
    <td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.full_name)}</td><td>${u.role}</td>
    <td>${u.classrooms ? escapeHtml(u.classrooms.name) : '—'}</td>
    <td><span class="pill ${u.active ? 'active' : 'inactive'}">${u.active ? 'Active' : 'Inactive'}</span></td>
    <td class="row-actions">
      <button data-act="toggle" data-id="${u.id}" data-active="${u.active}">${u.active ? 'Deactivate' : 'Activate'}</button>
      <button data-act="delete" data-id="${u.id}" class="danger">Delete</button>
    </td></tr>`).join('');
  tbody.querySelectorAll('button[data-act="toggle"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try { await callAdminFn('set_active', { id: btn.dataset.id, active: btn.dataset.active !== 'true' }); await loadAll(); }
      catch (e) { alert('Error: ' + e.message); }
    });
  });
  tbody.querySelectorAll('button[data-act="delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this user permanently?')) return;
      try { await callAdminFn('delete_user', { id: btn.dataset.id }); await loadAll(); }
      catch (e) { alert('Error: ' + e.message); }
    });
  });
}

document.getElementById('addUserBtn').addEventListener('click', async () => {
  const username = document.getElementById('nu_username').value.trim();
  const full_name = document.getElementById('nu_fullname').value.trim();
  const password = document.getElementById('nu_password').value;
  const role = document.getElementById('nu_role').value;
  const classroom_id = document.getElementById('nu_classroom').value || null;
  if (!username || !full_name || !password) { showMsg('addUserMsg', 'All fields required.', false); return; }
  try {
    await callAdminFn('create_user', { username, full_name, password, role, classroom_id });
    showMsg('addUserMsg', 'User created.', true);
    document.getElementById('nu_username').value = '';
    document.getElementById('nu_fullname').value = '';
    document.getElementById('nu_password').value = '';
    await loadAll();
  } catch (e) { showMsg('addUserMsg', 'Error: ' + e.message, false); }
});

document.getElementById('xlsxInput').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  BULK_ROWS = rows.map(r => ({
    username: String(r.username || r.Username || '').trim(),
    full_name: String(r.full_name || r['Full Name'] || r.name || '').trim(),
    password: String(r.password || r.Password || '').trim(),
    classroom: String(r.classroom || r.Classroom || '').trim(),
  })).filter(r => r.username && r.password);
  const preview = document.getElementById('xlsxPreview');
  preview.style.display = 'block';
  preview.innerHTML = '<table><thead><tr><th>Username</th><th>Full Name</th><th>Classroom</th></tr></thead><tbody>' +
    BULK_ROWS.map(r => `<tr><td>${escapeHtml(r.username)}</td><td>${escapeHtml(r.full_name)}</td><td>${escapeHtml(r.classroom||'—')}</td></tr>`).join('') +
    '</tbody></table>';
  document.getElementById('bulkImportBtn').style.display = BULK_ROWS.length ? 'inline-block' : 'none';
  showMsg('bulkMsg', `${BULK_ROWS.length} rows parsed.`, true);
});

document.getElementById('bulkImportBtn').addEventListener('click', async () => {
  const classroomByName = Object.fromEntries(CLASSROOMS.map(c => [c.name.toLowerCase(), c.id]));
  const rows = BULK_ROWS.map(r => ({
    username: r.username, full_name: r.full_name, password: r.password,
    classroom_id: r.classroom ? (classroomByName[r.classroom.toLowerCase()] || null) : null,
  }));
  try {
    const res = await callAdminFn('bulk_create', { rows });
    const failed = res.results.filter(r => !r.ok);
    showMsg('bulkMsg', `Imported ${res.results.length - failed.length} of ${res.results.length}. ${failed.length ? failed.length + ' failed.' : ''}`, failed.length === 0);
    await loadAll();
  } catch (e) { showMsg('bulkMsg', 'Error: ' + e.message, false); }
});

/* ---------- Classrooms ---------- */
function renderClassroomsTable() {
  document.querySelector('#classroomsTable tbody').innerHTML = CLASSROOMS.map(c =>
    `<tr><td>${escapeHtml(c.name)}</td><td>${USERS.filter(u => u.classroom_id === c.id).length}</td><td></td></tr>`).join('');
}
document.getElementById('addClassroomBtn').addEventListener('click', async () => {
  const name = document.getElementById('cr_name').value.trim();
  if (!name) return;
  const { error } = await sb.from('classrooms').insert({ name });
  if (error) { showMsg('classroomMsg', 'Error: ' + error.message, false); return; }
  showMsg('classroomMsg', 'Classroom added.', true);
  document.getElementById('cr_name').value = '';
  await loadAll();
});

/* ---------- Chapters & Lessons & Outcomes ---------- */
let CH_PENDING_IMAGE_FILE = null;
let CH_REMOVE_IMAGE = false;

function resetChapterForm() {
  EDIT_CHID = null;
  CH_PENDING_IMAGE_FILE = null;
  CH_REMOVE_IMAGE = false;
  document.getElementById('ch_form_title').textContent = 'Add chapter';
  document.getElementById('saveChapterBtn').textContent = 'Add Chapter';
  document.getElementById('ch_cancelBtn').style.display = 'none';
  document.getElementById('ch_number').value = '';
  document.getElementById('ch_title_en').value = '';
  document.getElementById('ch_title_ar').value = '';
  document.getElementById('ch_image_input').value = '';
  document.getElementById('ch_img_preview').style.display = 'none';
  document.getElementById('ch_removeImgBtn').style.display = 'none';
}
function startEditChapter(id) {
  const c = CHAPTERS.find(c => c.id === id);
  if (!c) return;
  EDIT_CHID = id;
  CH_PENDING_IMAGE_FILE = null;
  CH_REMOVE_IMAGE = false;
  document.getElementById('ch_form_title').textContent = 'Edit chapter';
  document.getElementById('saveChapterBtn').textContent = 'Save Changes';
  document.getElementById('ch_cancelBtn').style.display = 'inline-block';
  document.getElementById('ch_number').value = c.number;
  document.getElementById('ch_title_en').value = c.title_en;
  document.getElementById('ch_title_ar').value = c.title_ar;
  document.getElementById('ch_image_input').value = '';
  if (c.cover_image_url) {
    document.getElementById('ch_img_preview').src = c.cover_image_url;
    document.getElementById('ch_img_preview').style.display = 'inline-block';
    document.getElementById('ch_removeImgBtn').style.display = 'inline-block';
  } else {
    document.getElementById('ch_img_preview').style.display = 'none';
    document.getElementById('ch_removeImgBtn').style.display = 'none';
  }
  document.getElementById('panel-content').scrollIntoView({ behavior: 'smooth' });
}
document.getElementById('ch_image_input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  CH_PENDING_IMAGE_FILE = file;
  CH_REMOVE_IMAGE = false;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('ch_img_preview').src = reader.result;
    document.getElementById('ch_img_preview').style.display = 'inline-block';
    document.getElementById('ch_removeImgBtn').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
});
document.getElementById('ch_removeImgBtn').addEventListener('click', () => {
  CH_PENDING_IMAGE_FILE = null;
  CH_REMOVE_IMAGE = true;
  document.getElementById('ch_image_input').value = '';
  document.getElementById('ch_img_preview').style.display = 'none';
  document.getElementById('ch_removeImgBtn').style.display = 'none';
});
async function uploadChapterCover(file, chapterId) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${chapterId}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('chapter-covers').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = sb.storage.from('chapter-covers').getPublicUrl(path);
  return data.publicUrl;
}
document.getElementById('ch_cancelBtn').addEventListener('click', resetChapterForm);
document.getElementById('saveChapterBtn').addEventListener('click', async () => {
  const number = parseInt(document.getElementById('ch_number').value, 10);
  const title_en = document.getElementById('ch_title_en').value.trim();
  const title_ar = document.getElementById('ch_title_ar').value.trim();
  if (!number || !title_en || !title_ar) { showMsg('chapterMsg', 'All fields required.', false); return; }
  try {
    let error;
    if (EDIT_CHID) {
      let imgPatch = {};
      if (CH_REMOVE_IMAGE) imgPatch = { cover_image_url: null };
      if (CH_PENDING_IMAGE_FILE) imgPatch = { cover_image_url: await uploadChapterCover(CH_PENDING_IMAGE_FILE, EDIT_CHID) };
      ({ error } = await sb.from('chapters').update({ number, title_en, title_ar, sort_order: number, ...imgPatch }).eq('id', EDIT_CHID));
    } else {
      const { data: newCh, error: insErr } = await sb.from('chapters').insert({ number, title_en, title_ar, sort_order: number }).select().single();
      error = insErr;
      if (!error && CH_PENDING_IMAGE_FILE) {
        const url = await uploadChapterCover(CH_PENDING_IMAGE_FILE, newCh.id);
        await sb.from('chapters').update({ cover_image_url: url }).eq('id', newCh.id);
      }
    }
    if (error) { showMsg('chapterMsg', 'Error: ' + error.message, false); return; }
    showMsg('chapterMsg', EDIT_CHID ? 'Chapter updated.' : 'Chapter added.', true);
    resetChapterForm();
    await loadAll();
  } catch (e) { showMsg('chapterMsg', 'Error: ' + e.message, false); }
});

function resetLessonForm() {
  EDIT_LSID = null;
  document.getElementById('ls_form_title').textContent = 'Add lesson';
  document.getElementById('saveLessonBtn').textContent = 'Add Lesson';
  document.getElementById('ls_cancelBtn').style.display = 'none';
  document.getElementById('ls_number').value = '';
  document.getElementById('ls_title_en').value = '';
  document.getElementById('ls_title_ar').value = '';
  document.getElementById('ls_guide_en').value = '';
  document.getElementById('ls_guide_ar').value = '';
}
function startEditLesson(id) {
  const l = LESSONS.find(l => l.id === id);
  if (!l) return;
  EDIT_LSID = id;
  document.getElementById('ls_form_title').textContent = 'Edit lesson';
  document.getElementById('saveLessonBtn').textContent = 'Save Changes';
  document.getElementById('ls_cancelBtn').style.display = 'inline-block';
  document.getElementById('ls_chapter').value = l.chapter_id;
  document.getElementById('ls_number').value = l.number;
  document.getElementById('ls_title_en').value = l.title_en;
  document.getElementById('ls_title_ar').value = l.title_ar;
  document.getElementById('ls_guide_en').value = l.guide_en || '';
  document.getElementById('ls_guide_ar').value = l.guide_ar || '';
  document.getElementById('panel-content').scrollIntoView({ behavior: 'smooth' });
}
document.getElementById('ls_cancelBtn').addEventListener('click', resetLessonForm);
document.getElementById('saveLessonBtn').addEventListener('click', async () => {
  const chapter_id = document.getElementById('ls_chapter').value;
  const number = parseInt(document.getElementById('ls_number').value, 10);
  const title_en = document.getElementById('ls_title_en').value.trim();
  const title_ar = document.getElementById('ls_title_ar').value.trim();
  const guide_en = document.getElementById('ls_guide_en').value.trim();
  const guide_ar = document.getElementById('ls_guide_ar').value.trim();
  if (!chapter_id || !number || !title_en || !title_ar) { showMsg('lessonMsg', 'Chapter, number, and titles required.', false); return; }
  let error;
  if (EDIT_LSID) {
    ({ error } = await sb.from('lessons').update({ chapter_id, number, title_en, title_ar, guide_en, guide_ar, sort_order: number }).eq('id', EDIT_LSID));
  } else {
    ({ error } = await sb.from('lessons').insert({ chapter_id, number, title_en, title_ar, guide_en, guide_ar, sort_order: number }));
  }
  if (error) { showMsg('lessonMsg', 'Error: ' + error.message, false); return; }
  showMsg('lessonMsg', EDIT_LSID ? 'Lesson updated.' : 'Lesson added.', true);
  resetLessonForm();
  await loadAll();
});

function renderChapterTree() {
  const wrap = document.getElementById('chapterTree');
  wrap.innerHTML = CHAPTERS.map(ch => {
    const lessonsForCh = LESSONS.filter(l => l.chapter_id === ch.id).sort((a,b) => a.sort_order - b.sort_order);
    const lessonsHtml = lessonsForCh.map(l => {
      const outs = OUTCOMES.filter(o => o.lesson_id === l.id).sort((a,b) => a.sort_order - b.sort_order);
      const isOpen = OPEN_OUTCOMES.has(l.id);
      const outcomesHtml = outs.map((o, i) => `<div class="outcome-item">
        <span><span class="badge">${i+1}</span>${escapeHtml(o.text_en)}</span>
        <span class="row-actions"><button data-act="delout" data-id="${o.id}" class="danger">Remove</button></span>
      </div>`).join('') || '<div style="font-size:12.5px;color:var(--muted);">No learning outcomes yet.</div>';
      return `<div class="lesson-row">
        <div class="top">
          <div class="info">
            <div class="title">${l.number}. ${escapeHtml(l.title_en)}</div>
            <div class="sub">${escapeHtml(l.title_ar)} · ${outs.length} learning outcome${outs.length===1?'':'s'}</div>
          </div>
          <div class="row-actions">
            <button data-act="ledit" data-id="${l.id}">Edit</button>
            <button data-act="outcomes" data-id="${l.id}">Outcomes</button>
            <button data-act="ldelete" data-id="${l.id}" class="danger">Delete</button>
          </div>
        </div>
        <div class="outcomes-box ${isOpen ? 'open' : ''}" data-lesson="${l.id}">
          ${outcomesHtml}
          <div class="form-row" style="margin-top:10px;">
            <div class="field"><input placeholder="New learning outcome (English)" class="new-outcome-en" data-lesson="${l.id}"></div>
            <div class="field" style="flex:none;width:60px;"><button class="small-btn" data-act="addout" data-id="${l.id}">Add</button></div>
          </div>
        </div>
      </div>`;
    }).join('') || '<div style="padding:14px 18px;font-size:13px;color:var(--muted);">No lessons in this chapter yet.</div>';
    return `<div class="chapter-block">
      <div class="chapter-head">
        <div class="title">${ch.number}. ${escapeHtml(ch.title_en)} <span style="font-size:12px;color:var(--muted);font-weight:400;">— ${escapeHtml(ch.title_ar)}</span></div>
        <div class="row-actions">
          <button data-act="cedit" data-id="${ch.id}">Edit</button>
          <button data-act="cdelete" data-id="${ch.id}" class="danger">Delete</button>
        </div>
      </div>
      ${lessonsHtml}
    </div>`;
  }).join('') || '<p class="hint">No chapters yet — add one above.</p>';

  wrap.querySelectorAll('button[data-act="cedit"]').forEach(b => b.addEventListener('click', () => startEditChapter(b.dataset.id)));
  wrap.querySelectorAll('button[data-act="cdelete"]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this chapter and ALL its lessons, questions, and resources permanently?')) return;
    const { error } = await sb.from('chapters').delete().eq('id', b.dataset.id);
    if (error) { alert('Error: ' + error.message); return; }
    await loadAll();
  }));
  wrap.querySelectorAll('button[data-act="ledit"]').forEach(b => b.addEventListener('click', () => startEditLesson(b.dataset.id)));
  wrap.querySelectorAll('button[data-act="ldelete"]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this lesson and ALL its questions, outcomes, and resources permanently?')) return;
    const { error } = await sb.from('lessons').delete().eq('id', b.dataset.id);
    if (error) { alert('Error: ' + error.message); return; }
    await loadAll();
  }));
  wrap.querySelectorAll('button[data-act="outcomes"]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.id;
    if (OPEN_OUTCOMES.has(id)) OPEN_OUTCOMES.delete(id); else OPEN_OUTCOMES.add(id);
    renderChapterTree();
  }));
  wrap.querySelectorAll('button[data-act="delout"]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Remove this learning outcome?')) return;
    const { error } = await sb.from('learning_outcomes').delete().eq('id', b.dataset.id);
    if (error) { alert('Error: ' + error.message); return; }
    await loadAll();
  }));
  wrap.querySelectorAll('button[data-act="addout"]').forEach(b => b.addEventListener('click', async () => {
    const lessonId = b.dataset.id;
    const input = wrap.querySelector(`.new-outcome-en[data-lesson="${lessonId}"]`);
    const text = input.value.trim();
    if (!text) return;
    const count = OUTCOMES.filter(o => o.lesson_id === lessonId).length;
    const { error } = await sb.from('learning_outcomes').insert({ lesson_id: lessonId, text_en: text, sort_order: count });
    if (error) { alert('Error: ' + error.message); return; }
    OPEN_OUTCOMES.add(lessonId);
    await loadAll();
  }));
}

/* ---------- Question Bank ---------- */
function renderQuestionBankLessonFilter() {
  const sel = document.getElementById('qb_lesson_filter');
  const current = sel.value;
  sel.innerHTML = '<option value="">— All lessons —</option>' + LESSONS.map(l => `<option value="${l.id}">${l.number}. ${escapeHtml(l.title_en)}</option>`).join('');
  if (current) sel.value = current;
}
function correctChoiceText(q) {
  const c = (q.choices || []).find(c => c.is_correct);
  return c ? c.choice_text : '—';
}
function renderQuestionBank() {
  const filterLesson = document.getElementById('qb_lesson_filter').value;
  const lessonById = Object.fromEntries(LESSONS.map(l => [l.id, l]));
  const list = QUESTIONS.filter(q => !filterLesson || q.lesson_id === filterLesson)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const tbody = document.querySelector('#qbTable tbody');
  tbody.innerHTML = list.map(q => {
    const lesson = lessonById[q.lesson_id];
    const lessonLabel = lesson ? `L${lesson.number}` : '—';
    const thumb = q.image_url ? `<img src="${q.image_url}" class="thumb" style="width:40px;height:40px;">` : '';
    return `<tr>
      <td><input type="checkbox" class="qb-check" data-id="${q.id}" ${SELECTED_QIDS.has(q.id) ? 'checked' : ''}></td>
      <td>${thumb}</td>
      <td>${lessonLabel} · ${escapeHtml(q.number)}</td>
      <td>${escapeHtml(q.question_text)}</td>
      <td>${escapeHtml(correctChoiceText(q))}</td>
      <td class="row-actions">
        <button data-act="qedit" data-id="${q.id}">Edit</button>
        <button data-act="qdelete" data-id="${q.id}" class="danger">Delete</button>
      </td></tr>`;
  }).join('');

  tbody.querySelectorAll('.qb-check').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) SELECTED_QIDS.add(cb.dataset.id); else SELECTED_QIDS.delete(cb.dataset.id);
    updateQbSelCount();
  }));
  tbody.querySelectorAll('button[data-act="qedit"]').forEach(btn => btn.addEventListener('click', () => startEditQuestion(btn.dataset.id)));
  tbody.querySelectorAll('button[data-act="qdelete"]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this question and its choices permanently?')) return;
    const { error } = await sb.from('questions').delete().eq('id', btn.dataset.id);
    if (error) { alert('Error: ' + error.message); return; }
    SELECTED_QIDS.delete(btn.dataset.id);
    await loadAll();
  }));
  document.getElementById('qb_selectAll').checked = list.length > 0 && list.every(q => SELECTED_QIDS.has(q.id));
  updateQbSelCount();
}
function updateQbSelCount() { document.getElementById('qb_selCount').textContent = SELECTED_QIDS.size; }

document.getElementById('qb_lesson_filter').addEventListener('change', renderQuestionBank);
document.getElementById('qb_selectAll').addEventListener('change', (e) => {
  const filterLesson = document.getElementById('qb_lesson_filter').value;
  const list = QUESTIONS.filter(q => !filterLesson || q.lesson_id === filterLesson);
  if (e.target.checked) list.forEach(q => SELECTED_QIDS.add(q.id)); else list.forEach(q => SELECTED_QIDS.delete(q.id));
  renderQuestionBank();
});

function resetQuestionForm() {
  EDIT_QID = null;
  QB_PENDING_IMAGE_FILE = null;
  QB_REMOVE_IMAGE = false;
  document.getElementById('qb_form_title').textContent = 'Add question';
  document.getElementById('qb_saveBtn').textContent = 'Add Question';
  document.getElementById('qb_cancelBtn').style.display = 'none';
  document.getElementById('qb_number').value = '';
  document.getElementById('qb_question_en').value = '';
  document.getElementById('qb_question_ar').value = '';
  document.getElementById('qb_choice0').value = '';
  document.getElementById('qb_choice1').value = '';
  document.getElementById('qb_choice2').value = '';
  document.getElementById('qb_choice3').value = '';
  document.getElementById('qb_explain0').value = '';
  document.getElementById('qb_explain1').value = '';
  document.getElementById('qb_explain2').value = '';
  document.getElementById('qb_explain3').value = '';
  document.getElementById('qb_image_input').value = '';
  document.getElementById('qb_img_preview').style.display = 'none';
  document.getElementById('qb_removeImgBtn').style.display = 'none';
  document.querySelector('input[name="qb_correct"][value="0"]').checked = true;
}
function startEditQuestion(id) {
  const q = QUESTIONS.find(q => q.id === id);
  if (!q) return;
  EDIT_QID = id;
  QB_PENDING_IMAGE_FILE = null;
  QB_REMOVE_IMAGE = false;
  document.getElementById('qb_form_title').textContent = 'Edit question';
  document.getElementById('qb_saveBtn').textContent = 'Save Changes';
  document.getElementById('qb_cancelBtn').style.display = 'inline-block';
  document.getElementById('qb_lesson').value = q.lesson_id;
  document.getElementById('qb_number').value = q.number;
  document.getElementById('qb_question_en').value = q.question_text;
  document.getElementById('qb_question_ar').value = q.question_ar || '';
  document.getElementById('qb_image_input').value = '';
  if (q.image_url) {
    document.getElementById('qb_img_preview').src = q.image_url;
    document.getElementById('qb_img_preview').style.display = 'inline-block';
    document.getElementById('qb_removeImgBtn').style.display = 'inline-block';
  } else {
    document.getElementById('qb_img_preview').style.display = 'none';
    document.getElementById('qb_removeImgBtn').style.display = 'none';
  }
  const sorted = [...q.choices].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  for (let i = 0; i < 4; i++) {
    document.getElementById('qb_choice' + i).value = sorted[i] ? sorted[i].choice_text : '';
    document.getElementById('qb_explain' + i).value = sorted[i] ? (sorted[i].explanation || '') : '';
    if (sorted[i] && sorted[i].is_correct) document.querySelector(`input[name="qb_correct"][value="${i}"]`).checked = true;
  }
  document.getElementById('panel-questionbank').scrollIntoView({ behavior: 'smooth' });
}
document.getElementById('qb_cancelBtn').addEventListener('click', resetQuestionForm);

document.getElementById('qb_image_input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  QB_PENDING_IMAGE_FILE = file;
  QB_REMOVE_IMAGE = false;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('qb_img_preview').src = reader.result;
    document.getElementById('qb_img_preview').style.display = 'inline-block';
    document.getElementById('qb_removeImgBtn').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
});
document.getElementById('qb_removeImgBtn').addEventListener('click', () => {
  QB_PENDING_IMAGE_FILE = null;
  QB_REMOVE_IMAGE = true;
  document.getElementById('qb_image_input').value = '';
  document.getElementById('qb_img_preview').style.display = 'none';
  document.getElementById('qb_removeImgBtn').style.display = 'none';
});

async function uploadQuestionImage(file, questionId) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${questionId}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('question-images').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = sb.storage.from('question-images').getPublicUrl(path);
  return data.publicUrl;
}

document.getElementById('qb_saveBtn').addEventListener('click', async () => {
  const lesson_id = document.getElementById('qb_lesson').value;
  const number = document.getElementById('qb_number').value.trim();
  const question_text = document.getElementById('qb_question_en').value.trim();
  const question_ar = document.getElementById('qb_question_ar').value.trim() || null;
  const choiceTexts = [0, 1, 2, 3].map(i => document.getElementById('qb_choice' + i).value.trim());
  const choiceExplanations = [0, 1, 2, 3].map(i => document.getElementById('qb_explain' + i).value.trim() || null);
  const correctIdx = parseInt(document.querySelector('input[name="qb_correct"]:checked').value, 10);

  if (!lesson_id || !number || !question_text || choiceTexts.some(c => !c)) {
    showMsg('qbMsg', 'Lesson, number, question text, and all 4 choices are required.', false);
    return;
  }
  try {
    if (EDIT_QID) {
      let image_url_patch = {};
      if (QB_REMOVE_IMAGE) image_url_patch = { image_url: null };
      if (QB_PENDING_IMAGE_FILE) image_url_patch = { image_url: await uploadQuestionImage(QB_PENDING_IMAGE_FILE, EDIT_QID) };
      const { error: qErr } = await sb.from('questions').update({ lesson_id, number, question_text, question_ar, ...image_url_patch }).eq('id', EDIT_QID);
      if (qErr) throw qErr;
      const existing = QUESTIONS.find(q => q.id === EDIT_QID);
      const sorted = [...existing.choices].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      for (let i = 0; i < 4; i++) {
        const isCorrect = i === correctIdx;
        if (sorted[i]) {
          const { error } = await sb.from('choices').update({ choice_text: choiceTexts[i], is_correct: isCorrect, explanation: choiceExplanations[i] }).eq('id', sorted[i].id);
          if (error) throw error;
        } else {
          const { error } = await sb.from('choices').insert({ question_id: EDIT_QID, choice_text: choiceTexts[i], is_correct: isCorrect, sort_order: i, explanation: choiceExplanations[i] });
          if (error) throw error;
        }
      }
      showMsg('qbMsg', 'Question updated.', true);
    } else {
      const { data: newQ, error: qErr } = await sb.from('questions').insert({ lesson_id, number, question_text, question_ar, sort_order: QUESTIONS.length }).select().single();
      if (qErr) throw qErr;
      if (QB_PENDING_IMAGE_FILE) {
        const url = await uploadQuestionImage(QB_PENDING_IMAGE_FILE, newQ.id);
        await sb.from('questions').update({ image_url: url }).eq('id', newQ.id);
      }
      const rows = choiceTexts.map((text, i) => ({ question_id: newQ.id, choice_text: text, is_correct: i === correctIdx, sort_order: i, explanation: choiceExplanations[i] }));
      const { error: cErr } = await sb.from('choices').insert(rows);
      if (cErr) throw cErr;
      showMsg('qbMsg', 'Question added.', true);
    }
    resetQuestionForm();
    await loadAll();
  } catch (e) { showMsg('qbMsg', 'Error: ' + e.message, false); }
});

function openPrintWindow(withAnswers) {
  if (SELECTED_QIDS.size === 0) { alert('Select at least one question to print.'); return; }
  const selected = QUESTIONS.filter(q => SELECTED_QIDS.has(q.id)).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const rowsHtml = selected.map((q, idx) => {
    const img = q.image_url ? `<img src="${q.image_url}" style="max-width:320px;display:block;margin:8px 0;">` : '';
    const choicesHtml = q.choices.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((c, i) => `<div class="choice">${String.fromCharCode(65 + i)}. ${escapeHtml(c.choice_text)}${withAnswers && c.is_correct ? ' ✓' : ''}</div>`).join('');
    return `<div class="q">
      <div class="qhead">${idx + 1}. <span class="qtext">${escapeHtml(q.question_text)}</span></div>
      ${img}
      ${q.question_ar ? `<div class="qar">${escapeHtml(q.question_ar)}</div>` : ''}
      <div class="choices">${choicesHtml}</div>
    </div>`;
  }).join('');
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Worksheet</title>
    <style>
      body{font-family:Georgia,serif;color:#111;max-width:800px;margin:30px auto;padding:0 20px;}
      h1{font-size:20px;border-bottom:2px solid #111;padding-bottom:8px;}
      .meta{font-size:12px;color:#555;margin-bottom:24px;}
      .q{margin-bottom:22px;page-break-inside:avoid;}
      .qhead{font-size:14.5px;font-weight:600;margin-bottom:4px;}
      .qar{direction:rtl;text-align:right;font-size:13px;color:#555;margin-bottom:6px;}
      .choices{margin-left:18px;}
      .choice{font-size:13.5px;margin-bottom:3px;}
      @media print{ body{margin:0;padding:14px;} }
    </style></head><body>
    <h1>Polynomials — Worksheet${withAnswers ? ' (Answer Key)' : ''}</h1>
    <div class="meta">Name: _______________________  &nbsp;&nbsp; Date: _____________ &nbsp;&nbsp; ${selected.length} questions</div>
    ${rowsHtml}
    <script>window.onload = () => window.print();<\/script>
    </body></html>`);
  win.document.close();
}
document.getElementById('qb_printBtn').addEventListener('click', () => openPrintWindow(false));
document.getElementById('qb_printAnswersBtn').addEventListener('click', () => openPrintWindow(true));

/* ---------- Resources ---------- */
function renderResourcesTable() {
  const tbody = document.querySelector('#resourcesTable tbody');
  tbody.innerHTML = RESOURCES.map(r => `<tr>
    <td>${r.lessons ? escapeHtml(r.lessons.title_en) : '—'}</td><td>${r.type}</td><td>${escapeHtml(r.title)}</td>
    <td class="row-actions">
      <button data-id="${r.id}" data-act="editres">Edit</button>
      <button data-id="${r.id}" class="danger" data-act="delres">Delete</button>
    </td></tr>`).join('');
  tbody.querySelectorAll('button[data-act="delres"]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Delete this resource?')) return;
    await sb.from('lesson_resources').delete().eq('id', btn.dataset.id);
    await loadAll();
  }));
  tbody.querySelectorAll('button[data-act="editres"]').forEach(btn => btn.addEventListener('click', () => startEditResource(btn.dataset.id)));
}
function resetResourceForm() {
  EDIT_RID = null;
  document.getElementById('rs_form_title').textContent = 'Add resource';
  document.getElementById('addResourceBtn').textContent = 'Add Resource';
  document.getElementById('rs_cancelBtn').style.display = 'none';
  document.getElementById('rs_title').value = '';
  document.getElementById('rs_url').value = '';
}
function startEditResource(id) {
  const r = RESOURCES.find(r => r.id === id);
  if (!r) return;
  EDIT_RID = id;
  document.getElementById('rs_form_title').textContent = 'Edit resource';
  document.getElementById('addResourceBtn').textContent = 'Save Changes';
  document.getElementById('rs_cancelBtn').style.display = 'inline-block';
  document.getElementById('rs_lesson').value = r.lesson_id;
  document.getElementById('rs_type').value = r.type;
  document.getElementById('rs_title').value = r.title;
  document.getElementById('rs_url').value = r.url;
  document.getElementById('panel-resources').scrollIntoView({ behavior: 'smooth' });
}
document.getElementById('rs_cancelBtn').addEventListener('click', resetResourceForm);
document.getElementById('addResourceBtn').addEventListener('click', async () => {
  const lesson_id = document.getElementById('rs_lesson').value;
  const type = document.getElementById('rs_type').value;
  const title = document.getElementById('rs_title').value.trim();
  const url = document.getElementById('rs_url').value.trim();
  if (!lesson_id || !title || !url) { showMsg('resourceMsg', 'All fields required.', false); return; }
  let error;
  if (EDIT_RID) ({ error } = await sb.from('lesson_resources').update({ lesson_id, type, title, url }).eq('id', EDIT_RID));
  else ({ error } = await sb.from('lesson_resources').insert({ lesson_id, type, title, url, sort_order: 0 }));
  if (error) { showMsg('resourceMsg', 'Error: ' + error.message, false); return; }
  showMsg('resourceMsg', EDIT_RID ? 'Resource updated.' : 'Resource added.', true);
  resetResourceForm();
  await loadAll();
});

/* ---------- Init ---------- */
async function checkEdgeFn() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ action: '__ping__' }),
    });
    if (res.status === 404) document.getElementById('edgeFnWarning').style.display = 'block';
  } catch (e) { document.getElementById('edgeFnWarning').style.display = 'block'; }
}
async function init() {
  ADMIN = await requireAuth(['admin']);
  if (!ADMIN) return;
  document.getElementById('adminName').textContent = ADMIN.full_name || ADMIN.username;
  document.getElementById('logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); window.location.href = 'index.html'; });
  await loadAll();
  await checkEdgeFn();
}
init();
