/**
 * Pepu Admin Questions Scraper - Browser Extension Script
 *
 * HOW TO USE:
 * 1. Open Pepu Admin Panel in browser
 * 2. Open DevTools (F12) -> Console
 * 3. Paste this script and press Enter
 * 4. All questions will be scraped and downloaded as JSON
 */

(async function() {
  'use strict';

  const CONFIG = {
    // Maximum questions per subject to scrape
    MAX_QUESTIONS: 500,
    // Delay between requests (ms)
    DELAY: 500,
    // Enable debug logging
    DEBUG: true,
    // Custom API base URL (set via pepu.setAPI())
    customAPI: null
  };

  const STATE = {
    subjects: [],
    questions: [],
    currentSubjectIndex: 0,
    scrapedCount: 0
  };

  // Logger
  const log = {
    info: (msg, data) => console.log(`%c[SCRAPER] ${msg}`, 'color: #00ff00; font-weight: bold', data || ''),
    error: (msg, data) => console.error(`%c[SCRAPER] ${msg}`, 'color: #ff0000; font-weight: bold', data || ''),
    warn: (msg, data) => console.warn(`%c[SCRAPER] ${msg}`, 'color: #ffaa00; font-weight: bold', data || '')
  };

  // Get API base URL from current page
  function getApiBase() {
    if (CONFIG.customAPI) return CONFIG.customAPI;
    // Try to detect the backend API URL from environment or use current origin
    const possibleBases = [
      window.location.origin + '/api',
      window.location.origin.replace('admin.', '') + '/api',
      'https://api.pepu.krd/api',
      'https://pepu-api.vercel.app/api'
    ];
    return possibleBases[0]; // Default to current origin
  }

  // Fetch all subjects - try multiple endpoints
  async function fetchSubjects() {
    const endpoints = [
      '/api/extension/subjects',
      '/api/subjects',
      '/api/study/subjects',
      '/extension/subjects',
      '/subjects'
    ];

    for (const endpoint of endpoints) {
      try {
        const url = (endpoint.startsWith('http') ? endpoint : getApiBase() + endpoint);
        log.info(`Trying: ${url}`);
        const response = await fetch(url);
        if (response.ok) {
          const text = await response.text();
          if (!text) continue;
          const data = JSON.parse(text);
          const subjects = data.subjects || data.data || data;
          if (Array.isArray(subjects) && subjects.length > 0) {
            log.info(`✅ Found subjects at: ${endpoint}`);
            return subjects;
          }
        }
      } catch (error) {
        // Try next endpoint
        continue;
      }
    }

    log.error('Could not fetch subjects from any endpoint!');
    log.warn('Available endpoints to try:');
    endpoints.forEach(e => log.warn(`  - ${getApiBase()}${e}`));
    return [];
  }

  // Fetch questions for a subject
  async function fetchQuestions(subjectId) {
    try {
      const response = await fetch(`${getApiBase()}/extension/subjects/${subjectId}/questions`);
      const data = await response.json();
      return data.questions || [];
    } catch (error) {
      log.error(`Failed to fetch questions for subject ${subjectId}:`, error);
      return [];
    }
  }

  // Get all questions with pagination
  async function getAllQuestions(subjectId) {
    const allQuestions = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      try {
        const url = `${getApiBase()}/extension/subjects/${subjectId}/questions?limit=${limit}&offset=${offset}`;
        const response = await fetch(url);
        const data = await response.json();
        const questions = data.questions || [];

        if (questions.length === 0) break;

        allQuestions.push(...questions);
        log.info(`Fetched ${questions.length} questions (total: ${allQuestions.length})`);

        if (questions.length < limit) break;

        offset += limit;
        await sleep(CONFIG.DELAY);
      } catch (error) {
        log.error('Error fetching questions:', error);
        break;
      }
    }

    return allQuestions;
  }

  // Sleep function
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Scrape all subjects
  async function scrapeAll() {
    log.info('Starting Pepu Admin Questions Scraper...');
    log.info('API Base:', getApiBase());

    // Fetch subjects
    STATE.subjects = await fetchSubjects();
    log.info(`Found ${STATE.subjects.length} subjects:`, STATE.subjects.map(s => `${s.name} (${s.questionCount} questions)`));

    if (STATE.subjects.length === 0) {
      log.error('No subjects found! Are you logged in to Pepu Admin?');
      return;
    }

    // Scrape questions for each subject
    for (let i = 0; i < STATE.subjects.length; i++) {
      const subject = STATE.subjects[i];
      STATE.currentSubjectIndex = i;

      log.info(`[${i + 1}/${STATE.subjects.length}] Scraping: ${subject.name}...`);

      const questions = await getAllQuestions(subject.id);

      STATE.questions.push({
        subjectId: subject.id,
        subjectName: subject.name,
        subjectNameKu: subject.nameKu,
        questions: questions,
        totalQuestions: questions.length
      });

      STATE.scrapedCount += questions.length;
      log.info(`✅ ${subject.name}: ${questions.length} questions scraped`);

      await sleep(CONFIG.DELAY);
    }

    log.info(`🎉 Scraping complete! Total questions: ${STATE.scrapedCount}`);

    // Export results
    exportResults();
  }

  // Export results as JSON file
  function exportResults() {
    const data = {
      scrapedAt: new Date().toISOString(),
      apiBase: getApiBase(),
      totalSubjects: STATE.subjects.length,
      totalQuestions: STATE.scrapedCount,
      subjects: STATE.questions
    };

    // Create downloadable file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pepu-questions-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log.info('💾 File downloaded:', a.download);
    log.info('📊 Summary:', {
      totalSubjects: data.totalSubjects,
      totalQuestions: data.totalQuestions,
      subjects: STATE.questions.map(s => `${s.subjectName}: ${s.totalQuestions}`)
    });

    // Also copy to clipboard
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      .then(() => log.info('📋 Data copied to clipboard!'))
      .catch(() => log.warn('Could not copy to clipboard'));

    return data;
  }

  // Scrape single subject
  async function scrapeSingleSubject(subjectId) {
    log.info(`Scraping single subject: ${subjectId}`);

    const subject = STATE.subjects.find(s => s.id === subjectId);
    if (!subject) {
      log.error('Subject not found!');
      return;
    }

    const questions = await getAllQuestions(subjectId);

    const data = {
      scrapedAt: new Date().toISOString(),
      subjectId: subject.id,
      subjectName: subject.name,
      subjectNameKu: subject.nameKu,
      totalQuestions: questions.length,
      questions: questions
    };

    // Download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pepu-${subject.name.toLowerCase().replace(/\s+/g, '-')}-questions.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log.info(`✅ Downloaded ${questions.length} questions for ${subject.name}`);
    return data;
  }

  // Create UI panel
  function createUI() {
    // Remove existing panel
    const existing = document.getElementById('pepu-scraper-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'pepu-scraper-panel';
    panel.innerHTML = `
      <style>
        #pepu-scraper-panel {
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          z-index: 10000;
          min-width: 300px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: white;
        }
        #pepu-scraper-panel h3 {
          margin: 0 0 15px 0;
          font-size: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        #pepu-scraper-panel .btn {
          width: 100%;
          padding: 12px;
          margin: 5px 0;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        #pepu-scraper-panel .btn-primary {
          background: white;
          color: #667eea;
        }
        #pepu-scraper-panel .btn-primary:hover {
          transform: scale(1.02);
          box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        }
        #pepu-scraper-panel .btn-secondary {
          background: rgba(255,255,255,0.2);
          color: white;
        }
        #pepu-scraper-panel .select {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          border-radius: 8px;
          border: none;
          background: rgba(255,255,255,0.2);
          color: white;
          font-size: 14px;
        }
        #pepu-scraper-panel .select option {
          background: #667eea;
          color: white;
        }
        #pepu-scraper-panel .status {
          margin-top: 15px;
          padding: 10px;
          background: rgba(255,255,255,0.1);
          border-radius: 8px;
          font-size: 13px;
          max-height: 150px;
          overflow-y: auto;
        }
        #pepu-scraper-panel .close {
          position: absolute;
          top: 10px;
          right: 10px;
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          opacity: 0.7;
        }
        #pepu-scraper-panel .close:hover {
          opacity: 1;
        }
      </style>
      <button class="close" onclick="document.getElementById('pepu-scraper-panel').remove()">×</button>
      <h3>📚 Pepu Question Scraper</h3>
      <select id="subject-select" class="select">
        <option value="">Loading subjects...</option>
      </select>
      <button class="btn btn-primary" id="scrape-all">Scrape All Subjects</button>
      <button class="btn btn-secondary" id="scrape-one">Scrape Selected Subject</button>
      <div class="status" id="status">Ready to scrape!</div>
    `;

    document.body.appendChild(panel);

    // Load subjects
    fetchSubjects().then(subjects => {
      STATE.subjects = subjects;
      const select = document.getElementById('subject-select');
      select.innerHTML = '<option value="">-- Select Subject --</option>' +
        subjects.map(s => `<option value="${s.id}">${s.name} (${s.questionCount} questions)</option>`).join('');
      document.getElementById('status').textContent = `Found ${subjects.length} subjects`;
    });

    // Event listeners
    document.getElementById('scrape-all').addEventListener('click', scrapeAll);
    document.getElementById('scrape-one').addEventListener('click', () => {
      const select = document.getElementById('subject-select');
      if (select.value) {
        scrapeSingleSubject(select.value);
      } else {
        alert('Please select a subject first!');
      }
    });

    log.info('UI Panel created!');
  }

  // Detect available API endpoints
  async function detectAPI() {
    log.info('🔍 Detecting Pepu API...');
    log.info(`Current URL: ${window.location.href}`);
    log.info(`Origin: ${window.location.origin}`);

    // Check for common API paths
    const pathsToCheck = [
      '/api/extension/subjects',
      '/api/subjects',
      '/api/study/subjects'
    ];

    for (const path of pathsToCheck) {
      try {
        const response = await fetch(window.location.origin + path);
        log.info(`  ${path}: ${response.status} ${response.statusText}`);
      } catch (e) {
        log.info(`  ${path}: ERROR`);
      }
    }
  }

  // Auto-start
  log.info('Pepu Question Scraper loaded!');
  log.info('Commands available:');
  log.info('  - pepu.detectAPI()    - Detect available API endpoints');
  log.info('  - pepu.setAPI(url)    - Set custom API base URL');
  log.info('  - pepu.scrapeAll()    - Scrape all subjects');
  log.info('  - pepu.scrape(id)     - Scrape single subject by ID');
  log.info('  - pepu.ui()           - Show scraper panel');

  // Global API
  window.pepu = {
    scrapeAll,
    scrape: scrapeSingleSubject,
    ui: createUI,
    export: exportResults,
    detectAPI,
    setAPI: (url) => {
      CONFIG.customAPI = url;
      log.info(`API base set to: ${url}`);
    }
  };

  // Auto-detect API first
  await detectAPI();

  // Auto-show UI
  createUI();

})();
