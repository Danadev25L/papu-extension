/**
 * Pepu Scraper - Fixed version (handles large JSON)
 */

(async function() {
  'use strict';

  const urlMatch = window.location.href.match(/Courses\/View\/(\d+)/);
  const courseId = urlMatch ? urlMatch[1] : null;

  if (!courseId) {
    alert('Go to a course page first!');
    return;
  }

  const subjectName = document.title.replace(' - Admin', '').trim();
  const filename = `pepu-${subjectName.toLowerCase().replace(/\s+/g, '-')}-2025-exam-questions.json`;
  const savePath = `/home/dana/Desktop/pepu/${filename}`;

  console.log(`%c🚀 Scraping: ${subjectName}`, 'color: #0f0');

  let allQuestions = [], offset = 0;
  while (true) {
    const res = await fetch(`/api/courses/${courseId}/questions?limit=50&offset=${offset}`);
    if (!res.ok) break;
    const data = await res.json();
    const items = data.items || data.questions || data.data || [];
    if (items.length === 0) break;
    allQuestions.push(...items);
    console.log(`📥 ${allQuestions.length} questions`);
    if (data.totalCount && allQuestions.length >= data.totalCount) break;
    offset += 50;
    await new Promise(r => setTimeout(r, 100));
  }

  const transformed = allQuestions.map((q, i) => ({
    number: q.question_number || i + 1,
    id: q.id || String(6900 + i),
    question: q.question_text || q.content || '',
    imageUrl: q.image_url || null,
    options: (q.options || []).map((opt, j) => ({
      value: String(j + 1),
      text: typeof opt === 'string' ? opt : (opt.text || ''),
      image: null
    })),
    correct_answer: q.correct_answer || '',
    unit: q.unit_name || q.unit || null
  }));

  console.log(`%c✅ Done! ${transformed.length} questions`, 'color: #0f0');
  console.log(`%cFile: ${savePath}`, 'color: #ff0');
  console.log(`%c📋 Run: copy(pepuData) then paste into file`, 'color: #88f');

  // Store in window for easy access
  window.pepuData = transformed;
  window.pepuFilename = filename;
  window.pepuPath = savePath;

  // Simple alert with instructions
  alert(`✅ Scraped ${transformed.length} questions!\n\n1. Type: copy(pepuData)\n2. Create: nano ${savePath}\n3. Paste & save\n\nFilename: ${filename}`);

  // Also download directly
  const blob = new Blob([JSON.stringify(transformed, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  console.log('%c💾 Download started!', 'color: #0f0');

})();
