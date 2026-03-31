/**
 * Pepu Scraper - Saves to visible location with alert
 */

(async function() {
  'use strict';

  const courseId = '19';
  const limit = 50;
  let offset = 0;
  let allQuestions = [];

  console.log('%c🚀 Starting Paginated Scrape...', 'color: #0f0; font-size: 14px');

  while (true) {
    try {
      const url = `/api/courses/${courseId}/questions?limit=${limit}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) break;

      const data = await res.json();
      const items = data.items || data.questions || data.data || [];
      if (items.length === 0) break;

      allQuestions.push(...items);
      console.log(`📥 Progress: ${allQuestions.length} / ${data.totalCount || '?'}`);

      if (data.totalCount && allQuestions.length >= data.totalCount) break;
      offset += limit;
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      break;
    }
  }

  // Create file and show in new tab
  const json = JSON.stringify({
    courseId,
    scrapedAt: new Date().toISOString(),
    totalQuestions: allQuestions.length,
    questions: allQuestions
  }, null, 2);

  // Show in new window for easy copy
  const win = window.open('', '_blank');
  win.document.write(`
    <html>
      <head><title>Pepu Questions - ${allQuestions.length} items</title></head>
      <body style="padding:20px;font-family:monospace;">
        <h1>✅ Scraped ${allQuestions.length} questions!</h1>
        <p><button onclick="copyToClipboard()">📋 Copy JSON</button></p>
        <p><button onclick="downloadFile()">💾 Download File</button></p>
        <script>
          const data = ${JSON.stringify(JSON.parse(JSON.stringify(json)), null, 2)};
          function copyToClipboard() {
            navigator.clipboard.writeText(data);
            alert('✅ Copied to clipboard!');
          }
          function downloadFile() {
            const blob = new Blob([data], {type: 'application/json'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'pepu-course-19-all.json';
            a.click();
          }
        </script>
      </body>
    </html>
  `);

  console.log('%c✅ Done! Check the popup window', 'color: #0f0; font-size: 16px');
  alert(`✅ Scraped ${allQuestions.length} questions! Check the popup window.`);

})();
