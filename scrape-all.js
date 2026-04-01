// PEPU Comprehensive Scraper - Browser Console Script
// Run this in the browser console on admin.pepu.krd after logging in
//
// Usage:
// 1. Login to admin.pepu.krd
// 2. Open browser console (F12)
// 3. Paste this entire script
// 4. Click "Start Scraping" button
//
// Features:
// - Scrapes ALL courses, units, and questions
// - Uses pagination to get ALL questions
// - Extracts topics, units, terms
// - Downloads JSON file

(function() {
  'use strict';

  const UI_ID = 'pepu-all-scraper';
  const STATE_KEY = 'pepu_all_scraper_v1';

  // Check if already initialized
  if (document.getElementById(UI_ID)) {
    console.log('[PEPU All Scraper] Already initialized');
    return;
  }

  // Load or init state
  let state = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');

  function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function log(msg) {
    console.log('[PEPU All Scraper] ' + msg);
  }

  // Create UI
  const ui = document.createElement('div');
  ui.id = UI_ID;
  ui.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 99999;
    background: white;
    border: 2px solid #2196F3;
    padding: 15px;
    border-radius: 8px;
    font-family: system-ui;
    min-width: 300px;
    max-width: 400px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;

  ui.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div style="font-weight:bold;color:#2196F3;font-size:16px;">🌍 PEPU All Scraper</div>
      <button id="ps-close" style="background:none;border:none;font-size:18px;cursor:pointer;">&times;</button>
    </div>
    <div id="ps-courses" style="margin-bottom:10px;">
      <label style="font-size:12px;">Course:</label>
      <select id="ps-course-select" style="width:100%;padding:5px;margin-top:2px;">
        <option value="">Loading courses...</option>
      </select>
    </div>
    <div id="ps-status" style="margin-bottom:10px;font-size:14px;">Ready</div>
    <button id="ps-discover" style="padding:8px 12px;margin:2px;background:#9C27B0;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;">1️⃣ Discover Units</button>
    <button id="ps-scrape" style="padding:8px 12px;margin:2px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;" disabled>2️⃣ Start Scraping</button>
    <button id="ps-dl" style="padding:8px 12px;margin:2px;background:#FF9800;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;" disabled>📥 Download Results</button>
    <button id="ps-rst" style="padding:8px 12px;margin:2px;background:#f44336;color:white;border:none;border-radius:4px;cursor:pointer;width:100%;">🔄 Reset</button>
    <div id="ps-log" style="background:#000;color:#0f0;padding:8px;margin-top:10px;height:150px;overflow:auto;font-size:11px;font-family:monospace;border-radius:4px;"></div>
  `;

  document.body.appendChild(ui);

  const statusEl = ui.querySelector('#ps-status');
  const logEl = ui.querySelector('#ps-log');
  const courseSelect = ui.querySelector('#ps-course-select');
  const discoverBtn = ui.querySelector('#ps-discover');
  const scrapeBtn = ui.querySelector('#ps-scrape');
  const dlBtn = ui.querySelector('#ps-dl');
  const rstBtn = ui.querySelector('#ps-rst');
  const closeBtn = ui.querySelector('#ps-close');

  function uiLog(msg) {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function updateStatus(msg) {
    statusEl.textContent = msg;
  }

  // Close button
  closeBtn.addEventListener('click', () => {
    ui.remove();
  });

  // Fetch all courses
  async function fetchCourses() {
    try {
      uiLog('Fetching courses...');
      const res = await fetch('/api/courses');
      const courses = await res.json();

      courseSelect.innerHTML = '<option value="all">ALL COURSES</option>';
      for (const c of courses) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (ID: ${c.id})`;
        courseSelect.appendChild(opt);
      }

      uiLog(`Loaded ${courses.length} courses`);
      updateStatus('Ready to discover units');
    } catch (e) {
      uiLog(`Error: ${e.message}`);
    }
  }

  // Discover units for selected course(s)
  async function discoverUnits() {
    const courseId = courseSelect.value;
    if (!courseId) {
      alert('Please select a course first');
      return;
    }

    discoverBtn.disabled = true;
    state.units = {};

    try {
      if (courseId === 'all') {
        // Discover for all courses
        const courses = await (await fetch('/api/courses')).json();
        for (const course of courses) {
          updateStatus(`Discovering units for ${course.name}...`);
          await discoverUnitsForCourse(course.id, course.name);
        }
      } else {
        const courses = await (await fetch('/api/courses')).json();
        const course = courses.find(c => c.id == courseId);
        await discoverUnitsForCourse(courseId, course?.name || courseId);
      }

      saveState();
      uiLog(`Discovery complete!`);
      scrapeBtn.disabled = false;

      const totalUnits = Object.values(state.units).reduce((sum, arr) => sum + arr.length, 0);
      updateStatus(`Found ${totalUnits} units across ${Object.keys(state.units).length} courses`);
    } catch (e) {
      uiLog(`Error: ${e.message}`);
    } finally {
      discoverBtn.disabled = false;
    }
  }

  // Discover units for a single course
  async function discoverUnitsForCourse(courseId, courseName) {
    uiLog(`Discovering: ${courseName}`);

    const units = new Set();

    // Try unit IDs 1-200
    for (let unitId = 1; unitId <= 200; unitId++) {
      try {
        const res = await fetch(`/api/courses/${courseId}/questions?limit=1&unitId=${unitId}`);
        const data = await res.json();

        if (data.items && data.items.length > 0) {
          units.add(unitId);
        }

        // Small delay to avoid rate limiting
        if (unitId % 20 === 0) {
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (e) {
        // Continue
      }
    }

    const unitList = Array.from(units).sort((a, b) => a - b);
    state.units[courseId] = unitList;
    uiLog(`  Course ${courseId} (${courseName}): ${unitList.length} units`);
  }

  // Get all question IDs for a unit (with pagination)
  async function getQuestionIdsForUnit(courseId, unitId) {
    const ids = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      try {
        const res = await fetch(`/api/courses/${courseId}/questions?limit=${limit}&offset=${offset}&unitId=${unitId}`);
        const data = await res.json();

        if (data.items && data.items.length > 0) {
          const batchIds = data.items.map(q => q.id);
          ids.push(...batchIds);
          offset += limit;

          if (data.items.length < limit) break;
        } else {
          break;
        }

        // Small delay
        await new Promise(r => setTimeout(r, 50));
      } catch (e) {
        uiLog(`Error fetching unit ${unitId} offset ${offset}: ${e.message}`);
        break;
      }
    }

    return ids;
  }

  // Navigate to question edit page and scrape
  function scrapeQuestionData() {
    const form = document.querySelector('form');
    if (!form) return null;

    const data = {
      choices: []
    };

    form.querySelectorAll('input,textarea,select').forEach(el => {
      if (!el.name?.startsWith('Question.')) return;
      const v = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value;

      switch (el.name) {
        case 'Question.Id':
          data.id = parseInt(v);
          break;
        case 'Question.CourseId':
          data.courseId = parseInt(v);
          break;
        case 'Question.UnitId':
          data.unitId = parseInt(v);
          const sel = form.querySelector('select[name="Question.UnitId"]');
          if (sel?.selectedOptions?.[0]) data.unitName = sel.selectedOptions[0].textContent.trim();
          break;
        case 'Question.TermId':
          data.termId = parseInt(v);
          break;
        case 'Question.Content':
          data.content = v;
          break;
        case 'Question.Topics[0].TopicId':
          if (v && parseInt(v) > 0) {
            data.topicId = parseInt(v);
            const ts = form.querySelector('select[name="Question.Topics[0].TopicId"]');
            if (ts?.selectedOptions?.[0]) data.topicName = ts.selectedOptions[0].textContent.trim();
          }
          break;
      }
      if (el.name === 'Question.Difficulty' && el.checked) {
        data.difficulty = v;
      }
    });

    // Extract choices
    for (let i = 0; i < 10; i++) {
      const c = form.querySelector(`textarea[name="Question.Choices[${i}].Content"]`);
      if (!c) break;
      data.choices.push({
        index: i,
        content: c.value,
        isCorrect: form.querySelector(`input[name="Question.Choices[${i}].IsCorrect"]`)?.checked || false
      });
    }

    return data.id ? data : null;
  }

  // Start scraping process
  async function startScraping() {
    const courseId = courseSelect.value;

    if (!state.units || Object.keys(state.units).length === 0) {
      alert('Please discover units first!');
      return;
    }

    // Initialize data collection
    state.data = state.data || {};
    state.queue = [];
    state.currentIdx = 0;

    // Build question queue
    for (const [cid, units] of Object.entries(state.units)) {
      if (courseId !== 'all' && cid != courseId) continue;

      for (const unitId of units) {
        uiLog(`Fetching question IDs for course ${cid}, unit ${unitId}...`);
        const ids = await getQuestionIdsForUnit(cid, unitId);
        uiLog(`  Unit ${unitId}: ${ids.length} questions`);

        for (const id of ids) {
          state.queue.push({ courseId: cid, unitId, questionId: id });
        }
      }
    }

    state.totalQuestions = state.queue.length;
    state.scraped = state.data courseId ? (state.data[courseId] || []).length : 0;

    saveState();
    uiLog(`Total ${state.totalQuestions} questions to scrape`);

    scrapeBtn.disabled = true;
    navigateToNext();
  }

  // Navigate to next question
  function navigateToNext() {
    if (state.currentIdx >= state.queue.length) {
      uiLog('🎉 All questions scraped!');
      updateStatus(`Done! ${state.scraped} questions scraped`);
      scrapeBtn.disabled = true;
      dlBtn.disabled = false;
      return;
    }

    const item = state.queue[state.currentIdx];
    updateStatus(`${state.currentIdx + 1}/${state.totalQuestions} - Q${item.questionId}`);
    uiLog(`→ Q${item.questionId} (course ${item.courseId}, unit ${item.unitId})`);

    window.location.href = `/Courses/Questions/Edit?id=${item.questionId}&courseId=${item.courseId}`;
  }

  // Auto-scrape current page
  function autoScrape() {
    const data = scrapeQuestionData();
    if (!data) {
      uiLog('No data found on page, continuing...');
      setTimeout(nextQuestion, 500);
      return;
    }

    const courseId = data.courseId;
    state.data[courseId] = state.data[courseId] || [];

    // Check if already scraped
    if (state.data[courseId].find(q => q.id === data.id)) {
      uiLog(`  Q${data.id} already scraped`);
    } else {
      state.data[courseId].push(data);
      state.scraped++;
      uiLog(`  ✅ Q${data.id} (${state.scraped}/${state.totalQuestions})`);
    }

    saveState();
    nextQuestion();
  }

  // Move to next question
  function nextQuestion() {
    state.currentIdx++;
    saveState();
    navigateToNext();
  }

  // Download results
  function downloadResults() {
    const results = [];

    for (const [courseId, questions] of Object.entries(state.data || {})) {
      // Get course name from select
      const opt = courseSelect.querySelector(`option[value="${courseId}"]`);
      results.push({
        course: {
          id: parseInt(courseId),
          name: opt?.textContent?.split(' (ID:')[0] || `Course ${courseId}`
        },
        questions: questions
      });
    }

    const output = {
      scrapedAt: new Date().toISOString(),
      totalQuestions: results.reduce((sum, r) => sum + r.questions.length, 0),
      courses: results
    };

    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pepu-all-questions-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    uiLog('Results downloaded!');
  }

  // Reset state
  function resetState() {
    if (confirm('Reset all scraping data?')) {
      localStorage.removeItem(STATE_KEY);
      location.reload();
    }
  }

  // Event listeners
  discoverBtn.addEventListener('click', discoverUnits);
  scrapeBtn.addEventListener('click', startScraping);
  dlBtn.addEventListener('click', downloadResults);
  rstBtn.addEventListener('click', resetState);

  // Initialize
  fetchCourses();

  // Auto-scrape if we're on a question page and have active scraping
  if (window.location.pathname.includes('/Questions/Edit') && state.queue && state.queue.length > 0) {
    const waitForForm = setInterval(() => {
      if (document.querySelector('form')) {
        clearInterval(waitForForm);
        setTimeout(autoScrape, 500);
      }
    }, 100);
  } else if (state.data && Object.keys(state.data).length > 0) {
    // Restore UI state
    const total = Object.values(state.data).reduce((sum, arr) => sum + arr.length, 0);
    uiLog(`Resumed: ${total} questions already scraped`);
    dlBtn.disabled = false;

    if (state.units && Object.keys(state.units).length > 0) {
      scrapeBtn.disabled = false;
    }
  }

  log('All Scraper initialized');
})();
