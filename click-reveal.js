/**
 * Pepu Click & Reveal Scraper
 *
 * The page shows questions with a "زۆرتر" (More) button
 * When clicked, it should reveal the options!
 *
 * HOW TO USE:
 * 1. Go to https://admin.pepu.krd/Courses/View/19
 * 2. Open Console and paste this script
 */

(async function() {
  'use strict';

  const log = (msg, data) => console.log(`%c[PEPU] ${msg}`, 'color: #0f0; font-weight: bold', data || '');

  // Get course ID from URL
  const urlMatch = window.location.href.match(/Courses\/View\/(\d+)/);
  const courseId = urlMatch ? urlMatch[1] : null;

  if (!courseId) {
    alert('Go to a course page first!');
    return;
  }

  log(`Course ID: ${courseId}`);

  // First, let's inspect what happens when we click "More"
  async function inspectMoreButton() {
    // Find all buttons with "زۆرتر" text
    const buttons = Array.from(document.querySelectorAll('button, a, div, span')).filter(el =>
      el.textContent.includes('زۆرتر') || el.textContent.includes('More')
    );

    log(`Found ${buttons.length} 'More' buttons`);

    if (buttons.length > 0) {
      const firstBtn = buttons[0];
      log('First button:', {
        tag: firstBtn.tagName,
        text: firstBtn.textContent.trim(),
        class: firstBtn.className,
        onclick: firstBtn.onclick ? 'has onclick' : 'no onclick',
        parent: firstBtn.parentElement?.className
      });

      // Try clicking and see what happens
      log('Clicking first button to see what reveals...');
      firstBtn.click();

      await new Promise(r => setTimeout(r, 500));

      // Check what was revealed nearby
      const parent = firstBtn.closest('[class*="question"], [class*="item"], div');
      if (parent) {
        log('Parent HTML after click:', parent.innerHTML.slice(0, 500));
      }
    }

    return buttons;
  }

  // Scrape by clicking all "More" buttons
  async function scrapeByClicking() {
    log('🚀 Starting click & reveal scrape...');

    // First scroll to load all
    log('Scrolling to load all questions...');
    let lastHeight = 0;
    while (true) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 500));
      const height = document.body.scrollHeight;
      if (height === lastHeight) break;
      lastHeight = height;
    }
    window.scrollTo(0, 0);

    // Find all "More" buttons
    const moreButtons = Array.from(document.querySelectorAll('button, a, div, span')).filter(el =>
      el.textContent.includes('زۆرتر') || el.textContent.includes('More')
    );

    log(`Found ${moreButtons} 'More' buttons`);

    const questions = [];
    const originalHTML = [];

    // Save original state
    moreButtons.forEach((btn, i) => {
      originalHTML[i] = btn.parentElement?.innerHTML;
    });

    // Click each button and scrape
    for (let i = 0; i < Math.min(moreButtons.length, 50); i++) { // Limit to 50 for testing
      const btn = moreButtons[i];
      log(`[${i+1}/${Math.min(moreButtons.length, 50)}] Clicking button ${i+1}...`);

      // Find the question container
      const container = btn.closest('[class*="question"], [class*="item"], .card, tr, div');
      if (!container) continue;

      // Click the button
      btn.click();
      await new Promise(r => setTimeout(r, 300));

      // Now scrape the revealed content
      const questionText = container.textContent;
      const inputs = container.querySelectorAll('input[type="radio"], input[type="checkbox"], label');
      const options = [];

      inputs.forEach((input, j) => {
        const label = input.nextElementSibling || input.parentElement;
        if (label) {
          const text = label.textContent?.trim();
          if (text && text.length > 0 && text.length < 100) {
            options.push(text);
          }
        }
      });

      // Extract question ID
      const idMatch = container.textContent.match(/پرسیاری\s*(\d+)/);
      const questionId = idMatch ? idMatch[1] : '';

      // Extract question text
      const questionEl = container.querySelector('[class*="question"], h3, h4, p');
      const question = questionEl?.textContent?.trim() || container.textContent.slice(0, 200);

      questions.push({
        id: questionId,
        question: question,
        options: options,
        fullHTML: container.innerHTML.slice(0, 1000)
      });
    }

    log(`✅ Scraped ${questions.length} questions`);
    if (questions.length > 0) {
      log('Sample:', questions[0]);
    }

    return questions;
  }

  // Alternative: Monitor fetch requests while manually clicking
  function monitorFetch() {
    const originalFetch = window.fetch;
    const captured = [];

    window.fetch = function(...args) {
      const url = args[0];
      return originalFetch.apply(this, args).then(async (response) => {
        const clone = response.clone();
        try {
          const data = await clone.json();
          if (url.includes('question') || url.includes('Question') || url.includes('exam')) {
            captured.push({ url, data, time: Date.now() });
            log(`📥 Captured API: ${url}`, data);
          }
        } catch (e) {}
        return response;
      });
    };

    log('✅ Fetch monitoring active - click some buttons!');
    window.capturedFetch = captured;
  }

  // Create UI
  function createUI() {
    const existing = document.getElementById('pepu-click-scrape');
    if (existing) existing.remove();

    const ui = document.createElement('div');
    ui.id = 'pepu-click-scrape';
    ui.style.cssText = 'position:fixed;top:10px;right:10px;background:#1a1a2e;color:#fff;padding:20px;border-radius:12px;z-index:999999;font-family:sans-serif;min-width:280px;';
    ui.innerHTML = `
      <button onclick="this.parentElement.remove()" style="float:right;background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">×</button>
      <h3>🖱️ Click & Reveal</h3>
      <p style="font-size:12px;opacity:0.8;">Click "More" buttons to reveal options</p>
      <button id="inspect-btn" style="width:100%;padding:10px;background:#667eea;color:#fff;border:none;border-radius:8px;margin:5px 0;cursor:pointer;">🔍 Inspect First Button</button>
      <button id="scrape-btn" style="width:100%;padding:10px;background:#00ff88;color:#000;border:none;border-radius:8px;margin:5px 0;font-weight:bold;cursor:pointer;">🚀 Click All & Scrape</button>
      <button id="monitor-btn" style="width:100%;padding:10px;background:#ff6b6b;color:#fff;border:none;border-radius:8px;margin:5px 0;cursor:pointer;">📥 Monitor Fetch</button>
      <div id="status" style="background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;font-size:12px;margin-top:10px;max-height:150px;overflow:auto;"></div>
    `;

    document.body.appendChild(ui);

    const status = document.getElementById('status');

    document.getElementById('inspect-btn').onclick = async () => {
      status.textContent = 'Inspecting...';
      const btns = await inspectMoreButton();
      status.textContent = `Found ${btns.length} buttons. Check console.`;
    };

    document.getElementById('scrape-btn').onclick = async () => {
      status.textContent = 'Scraping... Check console';
      try {
        const questions = await scrapeByClicking();
        status.textContent = `Got ${questions.length} questions`;

        // Download
        const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `pepu-click-scrape-${Date.now()}.json`;
        a.click();

        window.clickedScrape = questions;
      } catch (e) {
        status.textContent = `Error: ${e.message}`;
      }
    };

    document.getElementById('monitor-btn').onclick = () => {
      monitorFetch();
      status.textContent = 'Monitoring! Click buttons manually, then type: capturedFetch';
    };
  }

  log('✅ Click & Reveal Scraper loaded!');
  createUI();

})();
