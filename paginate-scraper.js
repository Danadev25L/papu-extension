/**
 * Pepu Pagination Scraper - Gets ALL questions using pagination
 *
 * HOW TO USE:
 * 1. Go to https://admin.pepu.krd/Courses/View/19
 * 2. Open DevTools (F12) -> Console
 * 3. Paste this script
 * 4. It will fetch ALL 604 questions
 */

(async function() {
  'use strict';

  const log = (msg, data) => console.log(`%c[PEPU] ${msg}`, 'color: #0f0; font-weight: bold', data || '');

  // Find the API endpoint from the captured data
  async function discoverAPI() {
    // Try the endpoint that returned data before
    const possiblePaths = [
      '/api/extension/subjects',
      '/api/questions',
      '/api/Exam/GetFilteredQuestions',
      '/api/Questions/GetFilteredQuestions'
    ];

    // Also try to find from current URL
    const match = window.location.href.match(/Courses\/View\/(\d+)/);
    const courseId = match ? match[1] : null;

    log('Course ID:', courseId);

    return courseId;
  }

  // Fetch all questions with pagination
  async function fetchAllQuestions(subjectId) {
    const allQuestions = [];
    let offset = 0;
    const limit = 50; // Try different limits: 10, 25, 50, 100

    log(`🚀 Starting pagination scrape (limit: ${limit})...`);

    while (true) {
      try {
        // Try multiple API patterns
        const attempts = [
          // Pattern 1: Extension API
          `/api/extension/subjects/${subjectId}/questions?limit=${limit}&offset=${offset}`,
          // Pattern 2: Questions API
          `/api/questions?subjectId=${subjectId}&limit=${limit}&offset=${offset}`,
          // Pattern 3: Course API
          `/api/courses/${subjectId}/questions?limit=${limit}&offset=${offset}`,
          // Pattern 4: Exam API
          `/api/Exam/GetFilteredQuestions?courseId=${subjectId}&limit=${limit}&offset=${offset}`,
          // Pattern 5: Study API
          `/api/study/questions?subjectId=${subjectId}&limit=${limit}&offset=${offset}`
        ];

        let data = null;
        let workingUrl = '';

        for (const url of attempts) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const json = await res.json();
              if (json && (json.items || json.questions || json.data)) {
                data = json;
                workingUrl = url;
                log(`✅ Working API: ${url.split('?')[0]}`);
                break;
              }
            }
          } catch (e) {
            // Try next
          }
        }

        if (!data) {
          log(`❌ No more data or API not found at offset ${offset}`);
          break;
        }

        // Extract items from response
        const items = data.items || data.questions || data.data || [];

        if (items.length === 0) {
          log('✅ No more items - reached the end!');
          break;
        }

        allQuestions.push(...items);
        log(`📥 Fetched ${items.length} items (total: ${allQuestions.length})`);

        // Check if we've got all items
        const totalCount = data.totalCount || data.total || data.count;
        if (totalCount && allQuestions.length >= totalCount) {
          log(`✅ Got all ${allQuestions.length} / ${totalCount} questions!`);
          break;
        }

        // Continue pagination
        offset += limit;
        await sleep(200); // Small delay between requests

      } catch (error) {
        log.error(`Error at offset ${offset}:`, error.message);
        break;
      }
    }

    return allQuestions;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Download results
  function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    log(`💾 Downloaded: ${filename}`);
  }

  // Main function
  async function scrapeAll() {
    log('🎯 Pepu Pagination Scraper');

    // Get subject/course ID from URL
    const match = window.location.href.match(/Courses\/View\/(\d+)/);
    const subjectId = match ? match[1] : null;

    if (!subjectId) {
      log.error('Could not find course ID in URL!');
      log.error('Make sure you are on a page like: /Courses/View/19');
      return;
    }

    log(`Subject/Course ID: ${subjectId}`);

    // Fetch all questions
    const questions = await fetchAllQuestions(subjectId);

    if (questions.length === 0) {
      log.error('❌ No questions found!');
      log.warn('Try:');
      log.warn('  1. Make sure you are logged in');
      log.warn('  2. Navigate to the subject page first');
      log.warn('  3. Check Network tab in DevTools for actual API calls');
      return;
    }

    // Save results
    const result = {
      subjectId,
      scrapedAt: new Date().toISOString(),
      totalQuestions: questions.length,
      questions: questions
    };

    downloadJSON(result, `pepu-all-questions-${Date.now()}.json`);

    log(`🎉 Done! Scraped ${questions.length} questions`);

    return result;
  }

  // Create UI
  function createUI() {
    const existing = document.getElementById('pepu-paginate');
    if (existing) existing.remove();

    const ui = document.createElement('div');
    ui.id = 'pepu-paginate';
    ui.innerHTML = `
      <style>
        #pepu-paginate {
          position: fixed;
          top: 10px;
          right: 10px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
          border-radius: 12px;
          z-index: 999999;
          font-family: system-ui, sans-serif;
          color: white;
          box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        }
        #pepu-paginate button {
          width: 100%;
          padding: 12px;
          margin: 8px 0;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          background: white;
          color: #667eea;
        }
        #pepu-paginate button:hover {
          transform: scale(1.02);
        }
        #pepu-paginate .status {
          margin-top: 15px;
          padding: 10px;
          background: rgba(255,255,255,0.1);
          border-radius: 8px;
          font-size: 13px;
        }
        #pepu-paginate .close {
          position: absolute;
          top: 8px;
          right: 10px;
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
        }
      </style>
      <button class="close" onclick="document.getElementById('pepu-paginate').remove()">×</button>
      <h3>📚 Pagination Scraper</h3>
      <p style="font-size:13px;opacity:0.9;">Fetches ALL pages automatically</p>
      <button id="scrape-btn">🚀 Scrape All Questions</button>
      <div class="status" id="status">Ready to scrape</div>
    `;

    document.body.appendChild(ui);

    document.getElementById('scrape-btn').onclick = async () => {
      const status = document.getElementById('status');
      status.textContent = '⏳ Scraping... Check console for progress';
      try {
        await scrapeAll();
        status.textContent = `✅ Done! Check console`;
      } catch (e) {
        status.textContent = `❌ Error: ${e.message}`;
      }
    };
  }

  log('✅ Pagination Scraper loaded!');
  log('Buttons will appear in top-right corner');

  createUI();

})();
