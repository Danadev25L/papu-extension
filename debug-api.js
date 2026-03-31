/**
 * Debug: See actual API structure
 * Paste this in console while on https://admin.pepu.krd/Courses/View/19
 */

(async function() {
  const urlMatch = window.location.href.match(/Courses\/View\/(\d+)/);
  const courseId = urlMatch ? urlMatch[1] : null;

  if (!courseId) {
    alert('Go to a course page first!');
    return;
  }

  console.log('%c🔍 Debugging API for Course:', 'color: #0f0', courseId);

  // Fetch first 2 questions
  const res = await fetch(`/api/courses/${courseId}/questions?limit=2&offset=0`);
  const data = await res.json();

  console.log('%c=== FULL RESPONSE ===', 'color: #ff0', JSON.stringify(data, null, 2));

  const firstItem = (data.items || data.questions || data.data || [])[0];
  if (firstItem) {
    console.log('%c=== FIRST ITEM KEYS ===', 'color: #0f0', Object.keys(firstItem));
    console.log('%c=== FIRST ITEM ===', 'color: #0f0', firstItem);
  }

  // Check for nested questions
  if (data.data && data.data.questions) {
    console.log('%c=== NESTED QUESTIONS ===', 'color: #ff0', data.data.questions.slice(0, 2));
  }

  // Save for inspection
  window.debugAPI = { courseId, fullResponse: data };
  console.log('%c💾 Saved to window.debugAPI', 'color: #0f0');
})();
