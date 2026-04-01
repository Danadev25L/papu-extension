// PEPU Biology Scraper - Content Script
// Auto-injects on admin.pepu.krd pages

(async function() {
  'use strict';

  // Don't run on login page
  if (window.location.pathname.includes('/Account/')) return;

  const KEY = 'pepu_scraper_v1';

  // Load or init state
  let state = JSON.parse(localStorage.getItem(KEY) || '{"qs":[],"idx":0,"data":[]}');

  function saveState() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function log(msg) {
    console.log('[PEPU Scraper] ' + msg);
  }

  // Check if UI already exists
  if (document.getElementById('pepu-scraper-ui')) {
    log('UI already exists, skipping');
    return;
  }

  // Create UI
  const ui = document.createElement('div');
  ui.id = 'pepu-scraper-ui';
  ui.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;background:white;border:2px solid #2196F3;padding:12px;border-radius:8px;font-family:system-ui;min-width:200px;box-shadow:0 2px 10px rgba(0,0,0,0.2);';
  ui.innerHTML = `
    <div style="font-weight:bold;margin-bottom:10px;color:#2196F3">🧪 PEPU Scraper</div>
    <div id="ps-status" style="margin-bottom:8px;font-size:14px">Ready</div>
    <button id="ps-start" style="padding:8px 16px;margin:2px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer">🚀 Start</button>
    <button id="ps-next" style="padding:8px 16px;margin:2px;background:#2196F3;color:white;border:none;border-radius:4px;cursor:pointer" disabled>⏭️ Next</button>
    <button id="ps-dl" style="padding:8px 16px;margin:2px;background:#FF9800;color:white;border:none;border-radius:4px;cursor:pointer" disabled>📋 Copy</button>
    <button id="ps-rst" style="padding:8px 16px;margin:2px;background:#f44336;color:white;border:none;border-radius:4px;cursor:pointer">🔄</button>
    <div id="ps-log" style="background:#000;color:#0f0;padding:8px;margin-top:10px;height:80px;overflow:auto;font-size:11px;font-family:monospace;border-radius:4px"></div>
  `;

  document.body.appendChild(ui);

  const statusEl = ui.querySelector('#ps-status');
  const logEl = ui.querySelector('#ps-log');
  const startBtn = ui.querySelector('#ps-start');
  const nextBtn = ui.querySelector('#ps-next');
  const dlBtn = ui.querySelector('#ps-dl');
  const rstBtn = ui.querySelector('#ps-rst');

  function uiLog(msg) {
    logEl.innerHTML += msg + '<br>';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function updateUI() {
    const total = state.qs.length;
    const done = state.data.length;
    statusEl.textContent = `${done}/${total} scraped`;

    if (total > 0) {
      startBtn.disabled = true;
      nextBtn.disabled = false;
      dlBtn.disabled = done === 0;
    } else {
      startBtn.disabled = false;
      nextBtn.disabled = true;
      dlBtn.disabled = true;
    }

    if (state.idx >= total && total > 0) {
      nextBtn.disabled = true;
      statusEl.textContent = `Done! ${done} scraped`;
    }
  }

  // Load all question IDs
  async function loadQuestions() {
    uiLog('Loading questions...');
    const units = [85,86,87,91,92,93,94,95,96,97,98];
    const allIds = [];

    for (const u of units) {
      try {
        const r = await fetch(`/api/courses/17/questions?limit=1000&offset=0&unitId=${u}`);
        const d = await r.json();
        const ids = (d.items || []).map(q => q.id);
        allIds.push(...ids);
        uiLog(`Unit ${u}: ${ids.length} questions`);
      } catch (e) {
        uiLog(`❌ Unit ${u}: ${e.message}`);
      }
    }

    state.qs = [...new Set(allIds)];
    state.idx = 0;
    state.data = [];
    saveState();
    uiLog(`✅ Loaded ${state.qs.length} questions`);
    updateUI();
    log('Questions loaded. Click Next to start.');
    return state.qs.length;
  }

  // Scrape current page
  function scrapeCurrent() {
    const f = document.querySelector('form');
    if (!f) return null;

    const r = { choices: [] };

    f.querySelectorAll('input,textarea,select').forEach(el => {
      if (!el.name?.startsWith('Question.')) return;
      const v = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value;

      switch (el.name) {
        case 'Question.Id': r.id = parseInt(v); break;
        case 'Question.UnitId':
          r.unitId = parseInt(v);
          const sel = f.querySelector('select[name="Question.UnitId"]');
          if (sel?.selectedOptions?.[0]) r.unitName = sel.selectedOptions[0].textContent.trim();
          break;
        case 'Question.TermId': r.termId = parseInt(v); break;
        case 'Question.Content': r.content = v; break;
        case 'Question.Topics[0].TopicId':
          if (v > 0) {
            r.topicId = parseInt(v);
            const ts = f.querySelector('select[name="Question.Topics[0].TopicId"]');
            if (ts?.selectedOptions?.[0]) r.topicName = ts.selectedOptions[0].textContent.trim();
          }
          break;
      }
      if (el.name === 'Question.Difficulty' && el.checked) r.difficulty = v;
    });

    for (let i = 0; i < 10; i++) {
      const c = f.querySelector(`textarea[name="Question.Choices[${i}].Content"]`);
      if (!c) break;
      r.choices.push({
        index: i,
        content: c.value,
        isCorrect: f.querySelector(`input[name="Question.Choices[${i}].IsCorrect"]`)?.checked || false
      });
    }

    return r;
  }

  // Navigate to next question
  function goNext() {
    // Scrape current first
    const scraped = scrapeCurrent();
    if (scraped?.id) {
      if (!state.data.find(q => q.id === scraped.id)) {
        state.data.push(scraped);
        saveState();
        uiLog(`✅ Q${scraped.id} (${state.data.length}/${state.qs.length})`);
        updateUI();
      }
    }

    state.idx++;
    saveState();

    if (state.idx >= state.qs.length) {
      uiLog('🎉 All done!');
      updateUI();
      return;
    }

    const nextId = state.qs[state.idx];
    uiLog(`→ Q${nextId}...`);
    window.location.assign(`/Courses/Questions/Edit?id=${nextId}&courseId=17`);
  }

  // Event handlers
  startBtn.addEventListener('click', async () => {
    const count = await loadQuestions();
    if (count > 0) {
      uiLog('Starting...');
      window.location.assign(`/Courses/Questions/Edit?id=${state.qs[0]}&courseId=17`);
    }
  });

  nextBtn.addEventListener('click', goNext);

  dlBtn.addEventListener('click', () => {
    const json = JSON.stringify({ course: {id: 17, name: 'Biology'}, questions: state.data }, null, 2);

    // Copy to clipboard
    navigator.clipboard.writeText(json).then(() => {
      uiLog('📋 Copied to clipboard!');
    }).catch(() => {
      // Fallback: download
      const blob = new Blob([json], {type: 'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `biology-${state.data.length}q.json`;
      a.click();
      uiLog('💾 Downloaded to Downloads folder');
    });
  });

  rstBtn.addEventListener('click', () => {
    if (confirm('Reset all progress?')) {
      localStorage.removeItem(KEY);
      location.reload();
    }
  });

  // Arrow key shortcut
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' && state.qs.length > 0 && state.idx < state.qs.length) {
      goNext();
    }
  });

  // Init
  updateUI();

  // Auto-scrape and navigate if we have questions
  if (state.qs.length > 0 && window.location.pathname.includes('/Questions/Edit')) {

    // Wait for form to be ready
    const waitForForm = () => {
      if (document.querySelector('form')) {
        runAutoScrape();
      } else {
        setTimeout(waitForForm, 100);
      }
    };

    const runAutoScrape = () => {
      const scraped = scrapeCurrent();
      if (scraped?.id) {
        if (!state.data.find(q => q.id === scraped.id)) {
          state.data.push(scraped);
          saveState();
          uiLog(`✅ ${scraped.id} (${state.data.length})`);
          updateUI();
        }
      }

      state.idx++;
      saveState();

      if (state.idx >= state.qs.length) {
        uiLog('🎉 Done!');
        updateUI();
        return;
      }

      const nextId = state.qs[state.idx];
      window.location.assign(`/Courses/Questions/Edit?id=${nextId}&courseId=17`);
    };

    waitForForm();
  } else if (state.qs.length > 0) {
    uiLog(`${state.data.length}/${state.qs.length} done. Click Next or wait...`);
  } else {
    uiLog('Ready! Click Start to auto-scrape all');
  }

  log('Scraper ready.');
})();
