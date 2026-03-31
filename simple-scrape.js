/**
 * Simple Pagination Scraper for /api/courses/19/questions
 */

(async function() {
  'use strict';

  const courseId = '19'; // Change if needed
  const limit = 50;
  let offset = 0;
  let allQuestions = [];

  console.log('%c🚀 Starting Paginated Scrape...', 'color: #0f0; font-size: 14px');

  while (true) {
    try {
      const url = `/api/courses/${courseId}/questions?limit=${limit}&offset=${offset}`;
      console.log(`Fetching: ${url}`);

      const res = await fetch(url);
      if (!res.ok) {
        console.error(`❌ Failed: ${res.status}`);
        break;
      }

      const data = await res.json();
      const items = data.items || data.questions || data.data || [];

      if (items.length === 0) {
        console.log('✅ No more items!');
        break;
      }

      allQuestions.push(...items);
      console.log(`📥 Got ${items.length} items | Total: ${allQuestions.length}`);

      if (data.totalCount && allQuestions.length >= data.totalCount) {
        console.log(`✅ Got all ${allQuestions.length} / ${data.totalCount} questions!`);
        break;
      }

      offset += limit;
      await new Promise(r => setTimeout(r, 100));

    } catch (e) {
      console.error('Error:', e);
      break;
    }
  }

  // Download
  const blob = new Blob([JSON.stringify({
    courseId,
    scrapedAt: new Date().toISOString(),
    totalQuestions: allQuestions.length,
    questions: allQuestions
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pepu-course-${courseId}-all-${Date.now()}.json`;
  a.click();
  console.log('%c💾 Download complete!', 'color: #0f0; font-size: 14px');

})();
