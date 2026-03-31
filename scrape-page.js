/**
 * Pepu Admin Scraper - Scrape directly from the page
 *
 * HOW TO USE:
 * 1. Go to https://admin.pepu.krd/Courses/View/19 (or any subject page)
 * 2. Open DevTools (F12) -> Console
 * 3. Paste this script and press Enter
 * 4. All questions will be scraped and downloaded
 */

(function() {
  'use strict';

  const log = {
    info: (msg, data) => console.log(`%c[SCRAPER] ${msg}`, 'color: #00ff00; font-weight: bold', data || ''),
    error: (msg, data) => console.error(`%c[SCRAPER] ${msg}`, 'color: #ff0000; font-weight: bold', data || ''),
    warn: (msg, data) => console.warn(`%c[SCRAPER] ${msg}`, 'color: #ffaa00; font-weight: bold', data || '')
  };

  // Get current subject info from page
  function getPageInfo() {
    const url = window.location.href;
    const match = url.match(/Courses\/View\/(\d+)/);
    const courseId = match ? match[1] : null;

    // Try to get subject name from page
    const titleEl = document.querySelector('h1, h2, .title, [class*="title"], [class*="subject"]');
    const title = titleEl?.textContent?.trim() || 'Unknown Subject';

    return { courseId, title, url };
  }

  // Find questions in the DOM
  function scrapeQuestionsFromDOM() {
    const questions = [];

    // Common selectors for question containers
    const selectors = [
      '[class*="question"]',
      '[class*="Question"]',
      '.question-item',
      '.exam-question',
      'tr', // Table rows
      '[role="row"]'
    ];

    // Try to find data in React's internal state or window object
    const possibleData = [
      window.__NEXT_DATA__,
      window.__INITIAL_STATE__,
      window.__REACT_ARGS__,
      window.__STATE__
    ];

    for (const data of possibleData) {
      if (data && typeof data === 'object') {
        log.info('Found data in window object:', Object.keys(data).slice(0, 10));
      }
    }

    // Look for questions in various DOM structures
    const questionContainers = document.querySelectorAll('[class*="question"], [class*="Question"], [class*="exam"], [class*="Exam"]');
    log.info(`Found ${questionContainers.length} potential question containers`);

    // Look for table data
    const tables = document.querySelectorAll('table');
    log.info(`Found ${tables.length} tables`);

    tables.forEach((table, idx) => {
      const rows = table.querySelectorAll('tbody tr, tr');
      rows.forEach((row, rowIdx) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          const question = {
            number: cells[0]?.textContent?.trim(),
            questionText: cells[1]?.textContent?.trim(),
            unit: cells[2]?.textContent?.trim(),
            examYear: cells[3]?.textContent?.trim(),
            examPeriod: cells[4]?.textContent?.trim(),
            options: []
          };
          if (question.questionText && question.questionText.length > 10) {
            questions.push(question);
          }
        }
      });
    });

    return questions;
  }

  // Intercept fetch/XHR requests
  function interceptRequests(callback) {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      return originalFetch.apply(this, args).then(async (response) => {
        const url = args[0];
        if (url.includes('/questions') || url.includes('/exam') || url.includes('/subject')) {
          log.info(`API Request: ${url}`);
          const clone = response.clone();
          try {
            const data = await clone.json();
            callback(url, data);
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
        return response;
      });
    };
    log.info('✅ Fetch interception enabled');
  }

  // Find and call the internal API
  async function callInternalAPI(subjectId) {
    const possiblePaths = [
      `/api/subjects/${subjectId}/questions`,
      `/api/study/subjects/${subjectId}/questions`,
      `/api/extension/subjects/${subjectId}/questions`,
      `/api/admin/subjects/${subjectId}/questions`,
      `/api/courses/${subjectId}/questions`,
      `/api/questions?subjectId=${subjectId}`,
      `/Questions/GetQuestions?subjectId=${subjectId}`
    ];

    for (const path of possiblePaths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const data = await response.json();
          log.info(`✅ Found API at: ${path}`);
          return data;
        }
      } catch (e) {
        // Try next
      }
    }
    return null;
  }

  // Look for data in React components
  function findReactData() {
    const all = document.querySelectorAll('*');
    const data = [];

    for (const el of all) {
      for (const key in el) {
        if (key.startsWith('__react') || key.startsWith('_react')) {
          const prop = el[key];
          if (prop && typeof prop === 'object' && prop.memoizedState) {
            data.push(prop.memoizedState);
          }
        }
      }
    }

    return data;
  }

  // Main scrape function
  async function scrape() {
    log.info('🚀 Starting Pepu Admin Scraper...');

    const pageInfo = getPageInfo();
    log.info('Page Info:', pageInfo);

    // Method 1: Try to find API endpoint
    if (pageInfo.courseId) {
      log.info('Trying internal API...');
      const apiData = await callInternalAPI(pageInfo.courseId);
      if (apiData) {
        downloadData({ source: 'api', data: apiData });
        return apiData;
      }
    }

    // Method 2: Scrape from DOM
    log.info('Scraping from DOM...');
    const domQuestions = scrapeQuestionsFromDOM();
    if (domQuestions.length > 0) {
      log.info(`✅ Found ${domQuestions.length} questions in DOM`);
      downloadData({ source: 'dom', questions: domQuestions });
      return domQuestions;
    }

    // Method 3: Look for React data
    log.info('Looking for React data...');
    const reactData = findReactData();
    if (reactData.length > 0) {
      log.info(`Found ${reactData.length} React state objects`);
      downloadData({ source: 'react', data: reactData });
      return reactData;
    }

    log.error('❌ Could not find any questions to scrape!');
    log.warn('Try navigating to the page and letting it load completely first.');
  }

  // Download data as JSON
  function downloadData(data) {
    const filename = `pepu-scrape-${new Date().toISOString().split('T')[0]}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log.info(`💾 Downloaded: ${filename}`);
  }

  // Monitor for new data (for SPA navigation)
  function monitor() {
    log.info('👀 Monitoring page for questions data...');
    let capturedData = [];

    interceptRequests((url, data) => {
      log.info(`📥 Captured: ${url}`);
      capturedData.push({ url, data, timestamp: Date.now() });
    });

    // Auto-download when we have enough data
    setInterval(() => {
      if (capturedData.length > 0) {
        downloadData({ source: 'monitored', captures: capturedData });
        capturedData = [];
      }
    }, 10000); // Check every 10 seconds
  }

  // Create UI
  function createUI() {
    const existing = document.getElementById('pepu-scraper');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'pepu-scraper';
    panel.innerHTML = `
      <style>
        #pepu-scraper {
          position: fixed;
          top: 10px;
          right: 10px;
          background: #1a1a2e;
          color: #eee;
          padding: 15px;
          border-radius: 10px;
          z-index: 999999;
          font-family: system-ui, -apple-system, sans-serif;
          box-shadow: 0 5px 30px rgba(0,0,0,0.5);
          min-width: 200px;
        }
        #pepu-scraper h4 {
          margin: 0 0 10px 0;
          color: #00ff88;
        }
        #pepu-scraper button {
          width: 100%;
          padding: 8px;
          margin: 5px 0;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: 600;
        }
        #pepu-scraper .btn-scrape { background: #00ff88; color: #000; }
        #pepu-scraper .btn-monitor { background: #ff6b6b; color: #fff; }
        #pepu-scraper .btn-stop { background: #666; color: #fff; }
        #pepu-scraper .status {
          font-size: 11px;
          padding: 5px;
          background: rgba(255,255,255,0.1);
          border-radius: 5px;
          margin-top: 10px;
        }
        #pepu-scraper .close {
          position: absolute;
          top: 5px;
          right: 5px;
          background: none;
          border: none;
          color: #999;
          cursor: pointer;
        }
      </style>
      <button class="close" onclick="document.getElementById('pepu-scraper').remove()">×</button>
      <h4>📚 Pepu Scraper</h4>
      <button class="btn-scrape" id="scrape-btn">Scrape This Page</button>
      <button class="btn-monitor" id="monitor-btn">Monitor API</button>
      <button class="btn-stop" id="explore-btn">Explore Page Data</button>
      <div class="status" id="status">Ready</div>
    `;

    document.body.appendChild(panel);

    document.getElementById('scrape-btn').onclick = () => {
      document.getElementById('status').textContent = 'Scraping...';
      scrape().then(() => {
        document.getElementById('status').textContent = 'Done!';
      });
    };

    document.getElementById('monitor-btn').onclick = () => {
      monitor();
      document.getElementById('status').textContent = 'Monitoring API...';
    };

    document.getElementById('explore-btn').onclick = () => {
      const pageInfo = getPageInfo();
      const domQuestions = scrapeQuestionsFromDOM();
      log.info('=== PAGE DATA ===');
      log.info('Page Info:', pageInfo);
      log.info('DOM Questions:', domQuestions.length);

      // Log all data attributes
      document.querySelectorAll('[data-*]').forEach(el => {
        console.log(el.dataset);
      });

      document.getElementById('status').textContent = 'Check console';
    };
  }

  log.info('✅ Pepu Admin Scraper Loaded!');
  log.info('UI created - use the panel to scrape');

  createUI();

})();
