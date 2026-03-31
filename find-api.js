/**
 * Find the correct API endpoint with full question data
 */

(async function() {
  const courseId = '19'; // or get from URL
  const endpoints = [
    `/api/courses/${courseId}/questions?limit=1&offset=0`,
    `/api/Questions?courseId=${courseId}`,
    `/api/Exam/GetQuestions?courseId=${courseId}`,
    `/api/Exam/GetFilteredQuestions?courseId=${courseId}`,
    `/api/extension/subjects/${courseId}/questions`,
    `/api/study/questions?subjectId=${courseId}`,
  ];

  console.log('%c🔍 Testing API endpoints...', 'color: #0f0');

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint);
      console.log(`%c${endpoint} → ${res.status}`, 'color: ' + (res.ok ? '#0f0' : '#f00'));

      if (res.ok) {
        const data = await res.json();
        const first = (data.items || data.questions || data.data || data)[0];
        if (first) {
          const keys = Object.keys(first);
          const hasOptions = keys.some(k => k.toLowerCase().includes('option'));
          console.log(`  Keys: ${keys.slice(0, 8).join(', ')}... | Has options: ${hasOptions}`);
        }
      }
    } catch (e) {
      console.log(`%c${endpoint} → ERROR`, 'color: #f00');
    }
  }

  // Also check what's loaded in the page
  console.log('%c=== Checking page state ===', 'color: #ff0');
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  console.log('Scripts:', scripts.map(s => s.src).slice(0, 5));

  // Check React state
  for (const key in window) {
    if (key.includes('NEXT') || key.includes('NUXT') || key.includes('__STATE')) {
      console.log(`Found: ${key}`);
    }
  }
})();
