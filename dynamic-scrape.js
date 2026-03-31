/**
 * Pepu Dynamic Scraper - Works with ANY course!
 * Automatically detects the course ID from the current URL
 */

(async function() {
  'use strict';

  // Get course ID from current URL automatically
  const urlMatch = window.location.href.match(/Courses\/View\/(\d+)/);
  const courseId = urlMatch ? urlMatch[1] : null;

  if (!courseId) {
    alert('❌ Please navigate to a course page first!\n\nGo to: https://admin.pepu.krd/Courses/View/XX');
    console.error('No course ID found in URL!');
    return;
  }

  const limit = 50;
  let offset = 0;
  let allQuestions = [];

  console.log(`%c🚀 Scraping Course ID: ${courseId}`, 'color: #0f0; font-size: 16px');
  console.log(`%cURL: ${window.location.href}`, 'color: #888');

  // Progress indicator
  const progressLog = console.log(`%c⏳ Starting...`, 'color: #ff0');

  while (true) {
    try {
      const url = `/api/courses/${courseId}/questions?limit=${limit}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`❌ Failed (${res.status}): ${url}`);
        break;
      }

      const data = await res.json();
      const items = data.items || data.questions || data.data || [];

      if (items.length === 0) break;

      allQuestions.push(...items);

      // Update progress in console
      const total = data.totalCount || '?';
      console.log(`📥 [${allQuestions.length}/${total}] Fetching page ${Math.ceil(offset/limit) + 1}...`);

      if (data.totalCount && allQuestions.length >= data.totalCount) {
        console.log(`%c✅ Complete! Got all ${allQuestions.length} questions`, 'color: #0f0; font-size: 14px');
        break;
      }

      offset += limit;
      await new Promise(r => setTimeout(r, 100));

    } catch (e) {
      console.error('Error:', e);
      break;
    }
  }

  // Prepare data
  const result = {
    courseId: courseId,
    courseUrl: window.location.href,
    scrapedAt: new Date().toISOString(),
    totalQuestions: allQuestions.length,
    questions: allQuestions
  };

  // Show in popup window
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pepu Course ${courseId} - ${allQuestions.length} Questions</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 20px; background: #1a1a2e; color: #eee; }
        h1 { color: #00ff88; }
        .btn { padding: 15px 30px; margin: 10px; font-size: 16px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .btn-copy { background: #00ff88; color: #000; }
        .btn-download { background: #667eea; color: #fff; }
        .stats { background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin: 20px 0; }
        textarea { width: 100%; height: 200px; background: rgba(0,0,0,0.3); color: #0f0; padding: 10px; border-radius: 8px; font-family: monospace; }
      </style>
    </head>
    <body>
      <h1>✅ Successfully Scraped!</h1>
      <div class="stats">
        <p><strong>Course ID:</strong> ${courseId}</p>
        <p><strong>Total Questions:</strong> ${allQuestions.length}</p>
        <p><strong>Scraped At:</strong> ${new Date().toLocaleString()}</p>
      </div>
      <button class="btn btn-copy" onclick="copyToClipboard()">📋 Copy to Clipboard</button>
      <button class="btn btn-download" onclick="downloadFile()">💾 Download as JSON</button>
      <h3>Preview (first 500 chars):</h3>
      <textarea readonly>${JSON.stringify(result, null, 2).slice(0, 500)}...</textarea>
      <script>
        const data = ${JSON.stringify(JSON.stringify(result, null, 2))};
        function copyToClipboard() {
          navigator.clipboard.writeText(data);
          alert('✅ Copied ALL questions to clipboard!');
        }
        function downloadFile() {
          const blob = new Blob([data], {type: 'application/json'});
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'pepu-course-${courseId}-${allQuestions.length}-questions.json';
          a.click();
        }
      </script>
    </body>
    </html>
  `);

  // Also log to console
  console.log(`%c✅ DONE! ${allQuestions.length} questions scraped for Course ${courseId}`, 'color: #0f0; font-size: 18px');
  console.log(`%cCheck the popup window!`, 'color: #ff0; font-size: 14px');

  alert(`✅ Scraped ${allQuestions.length} questions from Course ${courseId}!\n\nCheck the popup window to copy or download.`);

})();
