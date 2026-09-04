let PROFILE = null;
let CHAPTERS = [];
let LESSONS = {};
let OUTCOMES = {};
let RESOURCES = {};
let QUESTIONS = {};
let PROGRESS = {};
const rendered = {};

function scoreFor(lessonId) {
  const qs = QUESTIONS[lessonId] || [];
  let done = 0, correct = 0;
  qs.forEach(q => { const p = PROGRESS[q.id]; if (p) { done++; if (p.is_correct) correct++; } });
  return { total: qs.length, done, correct };
}

function totalProgress() {
  let totalQ = 0, doneQ = 0, correctQ = 0;
  Object.keys(QUESTIONS).forEach(lid => {
    QUESTIONS[lid].forEach(q => {
      totalQ++;
      const p = PROGRESS[q.id];
      if (p) { doneQ++; if (p.is_correct) correctQ++; }
    });
  });
  return { totalQ, doneQ, correctQ };
}

function renderProgressStrip() {
  const { totalQ, doneQ, correctQ } = totalProgress();
  const pct = doneQ ? Math.round(100 * correctQ / doneQ) : 0;
  document.getElementById('progressStrip').innerHTML = `
    <div class="progress-card"><div class="n">${CHAPTERS.length}</div><div class="l">Chapters</div></div>
    <div class="progress-card"><div class="n">${Object.values(LESSONS).reduce((a,l)=>a+l.length,0)}</div><div class="l">Lessons</div></div>
    <div class="progress-card"><div class="n">${doneQ} / ${totalQ}</div><div class="l">Answered</div></div>
    <div class="progress-card"><div class="n">${pct}%</div><div class="l">Accuracy</div></div>`;
}

function extractYouTubeId(url) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|watch\?v=|shorts\/))([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function buildResourceCard(res) {
  const card = document.createElement('div');
  card.className = 'res-card';
  const title = document.createElement('div');
  title.className = 'res-title';
  title.textContent = (res.type === 'video' ? '🎬 ' : res.type === 'worksheet' ? '📄 ' : '📘 ') + res.title;
  card.appendChild(title);

  if (res.type === 'video') {
    const vid = extractYouTubeId(res.url);
    const wrap = document.createElement('div');
    wrap.className = 'video-wrap';
    if (vid) {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${vid}`;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true;
      wrap.appendChild(iframe);
      let logged = false;
      iframe.addEventListener('load', () => {
        if (logged) return;
        logged = true;
        sb.from('video_views').insert({ student_id: PROFILE.id, resource_id: res.id });
      });
    }
    const wm = document.createElement('div');
    wm.className = 'watermark';
    const label = (PROFILE.full_name || PROFILE.username) + '  ·  ' + PROFILE.username;
    for (let i = 0; i < 12; i++) { const s = document.createElement('span'); s.textContent = label; wm.appendChild(s); }
    wrap.appendChild(wm);
    card.appendChild(wrap);
  } else {
    const a = document.createElement('a');
    a.className = 'worksheet-link';
    a.href = res.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'Open ' + (res.type === 'worksheet' ? 'worksheet' : 'file') + ' →';
    card.appendChild(a);
    const note = document.createElement('div');
    note.className = 'worksheet-note';
    note.textContent = `Watermarked for ${PROFILE.full_name || PROFILE.username} (${PROFILE.username}) — do not redistribute.`;
    card.appendChild(note);
  }
  return card;
}

function buildOutcomesBox(lessonId) {
  const outs = OUTCOMES[lessonId] || [];
  if (!outs.length) return null;
  const box = document.createElement('div');
  box.className = 'outcomes';
  const label = document.createElement('div');
  label.className = 'outcomes-label';
  label.textContent = 'Learning Outcomes';
  box.appendChild(label);
  outs.forEach(o => {
    const line = document.createElement('div');
    line.className = 'outcome-line';
    const chk = document.createElement('span');
    chk.className = 'outcome-check';
    const txt = document.createElement('span');
    txt.textContent = o.text_en;
    line.appendChild(chk);
    line.appendChild(txt);
    box.appendChild(line);
  });
  return box;
}

function buildQuestionCard(q) {
  const card = document.createElement('div');
  card.className = 'qcard';
  card.dataset.qid = q.id;
  const existing = PROGRESS[q.id];

  const qt = document.createElement('div');
  qt.className = 'qtext';
  qt.textContent = q.number + '. ' + q.question_text;
  card.appendChild(qt);

  if (q.question_ar) {
    const qa = document.createElement('div');
    qa.className = 'qtext-ar';
    qa.textContent = q.question_ar;
    card.appendChild(qa);
  }

  if (q.image_url) {
    const img = document.createElement('img');
    img.className = 'qimg';
    img.src = q.image_url;
    img.alt = 'Question diagram';
    card.appendChild(img);
  }

  const grid = document.createElement('div');
  grid.className = 'choices';
  const choices = q.choices;
  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.type = 'button';
    const mark = document.createElement('span');
    mark.className = 'mark';
    const label = document.createElement('span');
    label.textContent = choice.choice_text;
    btn.appendChild(mark);
    btn.appendChild(label);

    if (existing) {
      if (choice.is_correct) btn.classList.add('is-correct');
      if (existing.chosen_choice_id === choice.id) {
        btn.classList.add('is-picked');
        if (!choice.is_correct) btn.classList.add('is-wrong');
      }
    }

    btn.addEventListener('click', async () => {
      if (card.classList.contains('answered')) return;
      const isCorrect = !!choice.is_correct;
      card.classList.add('answered', isCorrect ? 'correct' : 'incorrect');
      const allBtns = grid.querySelectorAll('.choice');
      choices.forEach((c, i) => { if (c.is_correct) allBtns[i].classList.add('is-correct'); });
      btn.classList.add('is-picked');
      if (!isCorrect) btn.classList.add('is-wrong');
      showExplanation(card, choice);

      PROGRESS[q.id] = { chosen_choice_id: choice.id, is_correct: isCorrect };
      updateLessonHeader(q.lesson_id);
      renderProgressStrip();

      await sb.from('student_progress').upsert({
        student_id: PROFILE.id, question_id: q.id, chosen_choice_id: choice.id, is_correct: isCorrect,
      }, { onConflict: 'student_id,question_id' });
    });

    grid.appendChild(btn);
  });

  if (existing) {
    card.classList.add('answered', existing.is_correct ? 'correct' : 'incorrect');
  }
  card.appendChild(grid);

  const explainBox = document.createElement('div');
  explainBox.className = 'explain';
  card.appendChild(explainBox);
  if (existing) {
    const pickedChoice = choices.find(c => c.id === existing.chosen_choice_id);
    if (pickedChoice) showExplanation(card, pickedChoice);
  }

  return card;
}

function showExplanation(card, choice) {
  const box = card.querySelector('.explain');
  if (!box) return;
  if (choice.explanation) {
    box.textContent = choice.explanation;
    box.classList.add('show');
  }
}

function updateLessonHeader(lessonId) {
  const el = document.querySelector(`.lesson[data-lesson="${lessonId}"] .score`);
  if (el) {
    const s = scoreFor(lessonId);
    el.textContent = `${s.correct} / ${s.done}`;
    if (s.done === s.total && s.total > 0) el.classList.add('complete'); else el.classList.remove('complete');
  }
}

function renderLessonBody(lesson, bodyInner) {
  if (rendered[lesson.id]) return;

  if (lesson.guide_en) {
    const guide = document.createElement('div');
    guide.className = 'guide';
    guide.innerHTML = `<div class="guide-label">How to Solve <span class="arabic" style="text-transform:none">كيفية الحل</span></div>
      <div class="guide-en">${escapeHtml(lesson.guide_en)}</div>
      <div class="guide-ar">${escapeHtml(lesson.guide_ar || '')}</div>`;
    bodyInner.appendChild(guide);
  }

  const outcomesBox = buildOutcomesBox(lesson.id);
  if (outcomesBox) bodyInner.appendChild(outcomesBox);

  const res = RESOURCES[lesson.id] || [];
  if (res.length) {
    const resWrap = document.createElement('div');
    resWrap.className = 'resources';
    res.forEach(r => resWrap.appendChild(buildResourceCard(r)));
    bodyInner.appendChild(resWrap);
  }

  const grid = document.createElement('div');
  grid.className = 'qgrid';
  (QUESTIONS[lesson.id] || []).forEach(q => grid.appendChild(buildQuestionCard(q)));
  bodyInner.appendChild(grid);

  rendered[lesson.id] = true;
}

function buildLesson(lesson) {
  const wrap = document.createElement('div');
  wrap.className = 'lesson';
  wrap.dataset.lesson = lesson.id;

  const s = scoreFor(lesson.id);
  const completeClass = (s.done === s.total && s.total > 0) ? 'complete' : '';
  const head = document.createElement('button');
  head.className = 'lesson-head';
  head.type = 'button';
  head.innerHTML = `
    <span class="lesson-num">${lesson.number}</span>
    <span class="lesson-titles">
      <span class="lesson-title-en">${escapeHtml(lesson.title_en)}</span>
      <span class="lesson-title-ar">${escapeHtml(lesson.title_ar)}</span>
    </span>
    <span class="lesson-meta">
      <span class="score ${completeClass}">${s.correct} / ${s.done}</span>
      <span class="chev"></span>
    </span>`;

  const body = document.createElement('div');
  body.className = 'lesson-body';
  const bodyInner = document.createElement('div');
  bodyInner.className = 'lesson-body-inner';
  body.appendChild(bodyInner);

  head.addEventListener('click', () => {
    const isOpen = wrap.classList.contains('open');
    if (isOpen) {
      wrap.classList.remove('open');
      body.style.maxHeight = null;
    } else {
      renderLessonBody(lesson, bodyInner);
      wrap.classList.add('open');
      requestAnimationFrame(() => { body.style.maxHeight = bodyInner.scrollHeight + 60 + 'px'; });
    }
  });

  wrap.appendChild(head);
  wrap.appendChild(body);
  return wrap;
}

function showPasswordGate() {
  document.getElementById('pwGate').style.display = 'flex';
  document.getElementById('pwSaveBtn').addEventListener('click', async () => {
    const pw1 = document.getElementById('pwNew').value;
    const pw2 = document.getElementById('pwConfirm').value;
    const errEl = document.getElementById('pwErr');
    errEl.style.display = 'none';
    if (pw1.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
    if (pw1 !== pw2) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }
    const { error: pwErr } = await sb.auth.updateUser({ password: pw1 });
    if (pwErr) { errEl.textContent = 'Error: ' + pwErr.message; errEl.style.display = 'block'; return; }
    const { error: profErr } = await sb.from('profiles').update({ must_change_password: false }).eq('id', PROFILE.id);
    if (profErr) { errEl.textContent = 'Error: ' + profErr.message; errEl.style.display = 'block'; return; }
    PROFILE.must_change_password = false;
    document.getElementById('pwGate').style.display = 'none';
  });
}

async function init() {
  PROFILE = await requireAuth(['student']);
  if (!PROFILE) return;

  if (PROFILE.must_change_password) showPasswordGate();

  document.getElementById('studentName').textContent = PROFILE.full_name || PROFILE.username;
  document.getElementById('logoutBtn').addEventListener('click', async () => { await sb.auth.signOut(); window.location.href = 'index.html'; });

  const [{ data: chapters }, { data: lessons }, { data: outcomes }, { data: resources }, { data: questions }, { data: choices }, { data: progress }] =
    await Promise.all([
      sb.from('chapters').select('*').order('sort_order'),
      sb.from('lessons').select('*').order('sort_order'),
      sb.from('learning_outcomes').select('*').order('sort_order'),
      sb.from('lesson_resources').select('*').order('sort_order'),
      sb.from('questions').select('*').order('sort_order'),
      sb.from('choices').select('*').order('sort_order'),
      sb.from('student_progress').select('*').eq('student_id', PROFILE.id),
    ]);

  CHAPTERS = chapters || [];
  (lessons || []).forEach(l => { (LESSONS[l.chapter_id] = LESSONS[l.chapter_id] || []).push(l); });
  (outcomes || []).forEach(o => { (OUTCOMES[o.lesson_id] = OUTCOMES[o.lesson_id] || []).push(o); });
  (resources || []).forEach(r => { if (r.lesson_id) (RESOURCES[r.lesson_id] = RESOURCES[r.lesson_id] || []).push(r); });
  const choicesByQ = {};
  (choices || []).forEach(c => { (choicesByQ[c.question_id] = choicesByQ[c.question_id] || []).push(c); });
  (questions || []).forEach(q => { q.choices = choicesByQ[q.id] || []; (QUESTIONS[q.lesson_id] = QUESTIONS[q.lesson_id] || []).push(q); });
  (progress || []).forEach(p => { PROGRESS[p.question_id] = p; });

  renderProgressStrip();

  const main = document.getElementById('main');
  main.innerHTML = '';
  if (!CHAPTERS.length) { main.innerHTML = '<div class="loading">No chapters available yet.</div>'; return; }

  CHAPTERS.forEach(ch => main.appendChild(buildChapterCard(ch)));
}

function buildChapterCard(ch) {
  const card = document.createElement('div');
  card.className = 'chapter-card';

  const cover = document.createElement('div');
  cover.className = 'chapter-cover';
  if (ch.cover_image_url) {
    cover.style.backgroundImage = `url('${ch.cover_image_url}')`;
  } else {
    const hue = (ch.number * 47) % 360;
    cover.style.background = `linear-gradient(135deg, hsl(${hue},55%,40%), hsl(${hue + 40},55%,30%))`;
    const wm = document.createElement('div');
    wm.className = 'chapter-cover-num';
    wm.textContent = ch.number;
    cover.appendChild(wm);
  }
  const overlay = document.createElement('div');
  overlay.className = 'chapter-cover-overlay';
  overlay.innerHTML = `<div class="chapter-cover-title">${escapeHtml(ch.title_en)}</div><div class="chapter-cover-title-ar">${escapeHtml(ch.title_ar)}</div>`;
  cover.appendChild(overlay);
  card.appendChild(cover);

  const lessonsWrap = document.createElement('div');
  lessonsWrap.className = 'lessons-grid';
  (LESSONS[ch.id] || []).forEach(lesson => lessonsWrap.appendChild(buildLesson(lesson)));
  card.appendChild(lessonsWrap);

  return card;
}

init();
