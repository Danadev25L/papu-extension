/**
 * Pepu DOM Scraper - Extracts questions directly from the page HTML
 * Because the API doesn't return options!
 */

(async function() {
  'use strict';

  console.log('%c🔍 Scraping from page HTML...', 'color: #0f0');

  const questions = [];

  // Find all question containers
  // These are common selectors - we'll try multiple
  const possibleContainers = [
    '.question-item',
    '.exam-question',
    '[class*="question"]',
    '[class*="Question"]',
    '.q-item',
    '.card',
    'tr', // Table rows
  ];

  let foundQuestions = [];

  // First, try to find in the DOM
  console.log('%c📋 Looking for questions in DOM...', 'color: #ff0');

  // Check if questions are in a table
  const tables = document.querySelectorAll('table');
  console.log(`Found ${tables.length} tables`);

  tables.forEach((table, tableIdx) => {
    const rows = table.querySelectorAll('tbody tr, tr');
    console.log(`Table ${tableIdx}: ${rows.length} rows`);

    rows.forEach((row, rowIdx) => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 2) {
        // Try to extract question and options from row
        const questionText = cells[1]?.textContent?.trim() || cells[0]?.textContent?.trim();
        const unitText = cells[2]?.textContent?.trim() || '';

        // Look for options within the row or nearby
        const options = [];

        // Check for buttons or radio inputs (option selectors)
        const buttons = row.querySelectorAll('button, input[type="radio"], input[type="checkbox"]');
        const labels = row.querySelectorAll('label');

        buttons.forEach((btn, i) => {
          const text = btn.textContent?.trim() || labels[i]?.textContent?.trim() || '';
          if (text && text.length > 0 && text.length < 100) {
            options.push(text);
          }
        });

        // Also check cells that might contain options
        for (let i = 3; i < cells.length; i++) {
          const cellText = cells[i].textContent?.trim();
          if (cellText && cellText.length > 0 && cellText.length < 100 &&
              (cellText.includes('A)') || cellText.includes('B)') || cellText.includes('C)') || cellText.includes('D)'))) {
            options.push(cellText);
          }
        }

        if (questionText && questionText.length > 10) {
          foundQuestions.push({
            question: questionText,
            unit: unitText,
            options: options,
            rawHTML: row.innerHTML
          });
        }
      }
    });
  });

  console.log(`%cFound ${foundQuestions.length} questions from tables`, 'color: #0f0');

  // Also try to find from cards or divs
  const cards = document.querySelectorAll('[class*="question"], [class*="Question"], .card, .item');
  console.log(`Found ${cards.length} potential question cards`);

  cards.forEach((card, i) => {
    const text = card.textContent?.trim();
    if (text && text.length > 20 && text.length < 1000) {
      // This might be a question
      foundQuestions.push({
        question: text,
        rawHTML: card.innerHTML
      });
    }
  });

  // Check what's actually displayed
  console.log('%c=== PAGE ANALYSIS ===', 'color: #ff0');
  console.log('Page title:', document.title);
  console.log('URL:', window.location.href);

  // Check for common React patterns
  const root = document.getElementById('__NEXT_DATA__') || document.getElementById('__NUXT__');
  if (root) {
    console.log('Found Next.js data');
  }

  // Save results
  window.scrapedQuestions = foundQuestions;

  console.log('%c=== RESULTS ===', 'color: #0f0');
  console.log('Total questions found:', foundQuestions.length);

  if (foundQuestions.length > 0) {
    console.log('Sample:', foundQuestions[0]);
    console.log('%c💾 Type: copy(window.scrapedQuestions) to copy', 'color: #ff0');
  } else {
    console.log('%c❌ No questions found in DOM!', 'color: #f00');
    console.log('The page might load questions dynamically via JavaScript.');
    console.log('Try scrolling down or changing filters first.');
  }

  // Create a simple UI to show results
  const ui = document.createElement('div');
  ui.id = 'pepu-scrape-results';
  ui.style.cssText = 'position:fixed;top:10px;right:10px;background:#1a1a2e;color:#fff;padding:20px;border-radius:12px;z-index:999999;font-family:sans-serif;max-height:80vh;overflow-y:auto;';
  ui.innerHTML = `
    <button onclick="this.parentElement.remove()" style="float:right;background:none;border:none;color:#fff;font-size:20px;">×</button>
    <h3>Scrape Results</h3>
    <p>Found: <strong>${foundQuestions.length}</strong> items</p>
    <button onclick="copyResults()" style="padding:10px;background:#00ff88;color:#000;border:none;border-radius:5px;font-weight:bold;cursor:pointer;">📋 Copy All</button>
    <button onclick="downloadResults()" style="padding:10px;background:#667eea;color:#fff;border:none;border-radius:5px;font-weight:bold;cursor:pointer;">💾 Download</button>
    <pre style="background:rgba(0,0,0,0.3);padding:10px;border-radius:5px;margin-top:10px;max-height:300px;overflow:auto;">${JSON.stringify(foundQuestions.slice(0, 3), null, 2)}</pre>
  `;

  document.body.appendChild(ui);

  window.copyResults = () => {
    navigator.clipboard.writeText(JSON.stringify(foundQuestions, null, 2));
    alert('Copied!');
  };

  window.downloadResults = () => {
    const blob = new Blob([JSON.stringify(foundQuestions, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pepu-scrape-${Date.now()}.json`;
    a.click();
  };

})();
