/**
 * Pepu Full Scraper - Gets questions WITH options and correct answers
 *
 * PROBLEM: The list API doesn't return options or correct_answer
 * SOLUTION: Try multiple methods to get complete data
 *
 * HOW TO USE:
 * 1. Go to https://admin.pepu.krd/Courses/View/19
 * 2. Open DevTools (F12) -> Console
 * 3. Paste this script
 */

(async function() {
  'use strict';

  const log = (msg, data) => console.log(`%c[PEPU] ${msg}`, 'color: #0f0; font-weight: bold', data || '');

  // Get course ID from URL
  const urlMatch = window.location.href.match(/Courses\/View\/(\d+)/);
  const courseId = urlMatch ? urlMatch[1] : null;

  if (!courseId) {
    alert('Please go to a course page first! (e.g., /Courses/View/19)');
    return;
  }

  log(`Course ID: ${courseId}`);

  // Method 1: Try to get question details via API
  async function getQuestionDetails(questionId) {
    const attempts = [
      `/api/Questions/Edit?id=${questionId}&courseId=${courseId}`,
      `/api/questions/${questionId}`,
      `/api/courses/${courseId}/questions/${questionId}`,
      `/api/Exam/Question?id=${questionId}`,
      `/api/Questions/GetById?id=${questionId}`,
    ];

    for (const url of attempts) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          log(`✅ Found details for Q${questionId} via: ${url}`);
          return data;
        }
      } catch (e) {
        // Try next
      }
    }
    return null;
  }

  // Method 2: Scrape edit page by fetching its HTML
  async function scrapeEditPage(questionId) {
    try {
      const url = `/Courses/Questions/Edit?id=${questionId}&courseId=${courseId}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const html = await res.text();

      // Parse HTML to extract data
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Try to find question data in script tags
      const scripts = doc.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (text.includes('question') || text.includes('options')) {
          try {
            // Look for JSON data
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[0]);
              if (data.question || data.options) {
                return data;
              }
            }
          } catch (e) {}
        }
      }

      // Try to find input fields with question data
      const inputs = doc.querySelectorAll('input, textarea');
      const data = {};
      inputs.forEach(input => {
        const name = input.name;
        const value = input.value;
        if (name && value) {
          data[name] = value;
        }
      });

      if (Object.keys(data).length > 0) {
        return data;
      }

    } catch (e) {
      console.error('Error scraping edit page:', e);
    }
    return null;
  }

  // Method 3: Check for React state on current page
  function findReactState() {
    const all = document.querySelectorAll('*');
    const questionsData = [];

    for (const el of all) {
      for (const key in el) {
        if (key.startsWith('__reactProps') || key.startsWith('__reactInternalInstance')) {
          try {
            const props = el[key];
            if (props && typeof props === 'object') {
              const str = JSON.stringify(props);
              if (str.includes('options') && str.includes('question')) {
                questionsData.push(props);
              }
            }
          } catch (e) {}
        }
      }
    }

    return questionsData;
  }

  // Main scraping function
  async function scrapeAll() {
    log('🚀 Starting full scrape...');

    // First, get all question IDs via pagination
    let allQuestions = [];
    let offset = 0;
    const limit = 100;

    log('Step 1: Fetching all question IDs...');

    while (true) {
      const res = await fetch(`/api/courses/${courseId}/questions?limit=${limit}&offset=${offset}`);
      if (!res.ok) break;

      const data = await res.json();
      const items = data.items || data.questions || data.data || [];

      if (items.length === 0) break;

      allQuestions.push(...items);
      log(`  Fetched ${items.length} items (total: ${allQuestions.length})`);

      if (items.length < limit) break;

      offset += limit;
      await new Promise(r => setTimeout(r, 100));
    }

    log(`✅ Got ${allQuestions.length} questions`);

    // Step 2: Try to get full details for each question
    log('Step 2: Fetching full details (options, correct_answer)...');

    const enriched = [];
    let withOptions = 0;

    for (let i = 0; i < allQuestions.length; i++) {
      const q = allQuestions[i];
      const qId = q.id || q.questionId;

      log(`[${i+1}/${allQuestions.length}] Q${qId}: Getting details...`);

      // Try API first
      let details = await getQuestionDetails(qId);

      // If API fails, try scraping edit page
      if (!details) {
        details = await scrapeEditPage(qId);
      }

      // Merge data
      const enrichedQ = {
        number: q.question_number || i + 1,
        id: qId,
        question: q.question_text || q.content || q.question || '',
        imageUrl: q.image_url || null,
        options: [],
        correct_answer: '',
        unit: q.unit_name || q.unit || null
      };

      if (details) {
        // Extract options from details
        if (details.options && Array.isArray(details.options)) {
          enrichedQ.options = details.options.map((opt, j) => ({
            value: String(j + 1),
            text: typeof opt === 'string' ? opt : (opt.text || opt.content || ''),
            image: opt.image || null
          }));
          withOptions++;
        }

        // Extract correct answer
        if (details.correct_answer !== undefined) {
          enrichedQ.correct_answer = String(details.correct_answer);
        }
        if (details.answer !== undefined) {
          enrichedQ.correct_answer = String(details.answer);
        }
        if (details.correctAnswer !== undefined) {
          enrichedQ.correct_answer = String(details.correctAnswer);
        }
      }

      enriched.push(enrichedQ);

      // Small delay to avoid rate limiting
      if (i % 10 === 0) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    log(`✅ Enriched ${enriched.length} questions`);
    log(`📊 ${withOptions} questions have options`);

    // Count by unit
    const byUnit = {};
    enriched.forEach(q => {
      const unit = q.unit || 'Unknown';
      byUnit[unit] = (byUnit[unit] || 0) + 1;
    });

    log('📊 Questions by unit:', byUnit);

    // Generate filename
    const subjectName = document.title.replace(' - Admin', '').trim().toLowerCase().replace(/\s+/g, '-');
    const filename = `pepu-${subjectName}-${new Date().toISOString().split('T')[0]}-exam-questions.json`;

    // Download
    const blob = new Blob([JSON.stringify(enriched, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();

    log(`💾 Downloaded: ${filename}`);
    log(`✅ Total: ${enriched.length} questions | ${withOptions} with options`);

    // Save to window for inspection
    window.pepuScraped = enriched;

    alert(`✅ Scraped ${enriched.length} questions!\n\n${withOptions} have options\n\nFile: ${filename}`);
  }

  // Create UI
  function createUI() {
    const existing = document.getElementById('pepu-full-scrape');
    if (existing) existing.remove();

    const ui = document.createElement('div');
    ui.id = 'pepu-full-scrape';
    ui.style.cssText = 'position:fixed;top:10px;right:10px;background:#1a1a2e;color:#fff;padding:20px;border-radius:12px;z-index:999999;font-family:sans-serif;min-width:280px;';
    ui.innerHTML = `
      <button onclick="this.parentElement.remove()" style="float:right;background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">×</button>
      <h3>📚 Pepu Full Scraper</h3>
      <p style="font-size:12px;opacity:0.8;">Gets questions WITH options</p>
      <button id="scrape-btn" style="width:100%;padding:12px;background:#00ff88;color:#000;border:none;border-radius:8px;font-weight:bold;cursor:pointer;margin:10px 0;">🚀 Scrape All</button>
      <div id="status" style="background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;font-size:12px;margin-top:10px;">Ready</div>
    `;

    document.body.appendChild(ui);

    document.getElementById('scrape-btn').onclick = async () => {
      const status = document.getElementById('status');
      status.textContent = '⏳ Scraping... Check console';
      try {
        await scrapeAll();
        status.textContent = '✅ Done! Check downloads';
      } catch (e) {
        status.textContent = `❌ Error: ${e.message}`;
        console.error(e);
      }
    };
  }

  log('✅ Pepu Full Scraper loaded!');
  createUI();

})();
