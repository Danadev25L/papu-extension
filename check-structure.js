/**
 * Quick check - what does the API actually return?
 */

(async function() {
  const urlMatch = window.location.href.match(/Courses\/View\/(\d+)/);
  const courseId = urlMatch ? urlMatch[1] : null;

  if (!courseId) {
    alert('Go to a course page first!');
    return;
  }

  console.log('%c🔍 Checking API structure for course:', 'color: #0f0', courseId);

  const res = await fetch(`/api/courses/${courseId}/questions?limit=2&offset=0`);
  const data = await res.json();

  console.log('%c=== FULL RESPONSE ===', 'color: #ff0', data);
  console.log('%c=== FIRST ITEM ===', 'color: #ff0', JSON.stringify(data.items?.[0] || data.questions?.[0] || data.data?.[0] || data[0], null, 2));

  const firstItem = data.items?.[0] || data.questions?.[0] || data.data?.[0] || data[0];
  if (firstItem) {
    console.log('%c=== KEYS ===', 'color: #0f0', Object.keys(firstItem));
    console.log('%c=== UNIT FIELD VALUE ===', 'color: #0f0', firstItem.unit_name || firstItem.unitName || firstItem.unit || firstItem.subject_unit || 'NOT FOUND');
  }
})();
