/**
 * Pepu Scraper - Gets ALL questions, even if 100+ per unit
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

  console.log('%c🚀 Scraping ALL questions for:', 'color: #0f0', subjectName);

  let allQuestions = [];
  let offset = 0;
  const limit = 100; // Increased to 100 for efficiency

  while (true) {
    try {
      const apiUrl = `/api/courses/${courseId}/questions?limit=${limit}&offset=${offset}`;
      console.log(`Fetching: limit=${limit}, offset=${offset}`);

      const res = await fetch(apiUrl);
      if (!res.ok) {
        console.error('Failed:', res.status);
        break;
      }

      const data = await res.json();
      const items = data.items || data.questions || data.data || [];

      console.log(`📥 Got ${items.length} items | Total so far: ${allQuestions.length + items.length}`);

      if (items.length === 0) {
        console.log('✅ No more items (empty page)');
        break;
      }

      allQuestions.push(...items);

      // Check if we've got everything
      const totalCount = data.totalCount || data.total || data.count;
      if (totalCount && allQuestions.length >= totalCount) {
        console.log(`%c✅ Complete! Got all ${allQuestions.length} / ${totalCount} questions`, 'color: #0f0');
        break;
      }

      // Safety check: if we got less than limit, we're probably done
      if (items.length < limit) {
        console.log('✅ Got less than limit, probably done');
        break;
      }

      offset += limit;
      await new Promise(r => setTimeout(r, 200)); // Small delay

    } catch (error) {
      console.error('Error:', error);
      break;
    }
  }

  // Transform to correct format
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

  // Count by unit
  const byUnit = {};
  transformed.forEach(q => {
    const unit = q.unit || 'Unknown';
    byUnit[unit] = (byUnit[unit] || 0) + 1;
  });

  console.log('%c📊 Questions by unit:', 'color: #0f0', byUnit);

  // Save to window
  window.pepuData = transformed;
  window.pepuFilename = filename;

  // Download
  const blob = new Blob([JSON.stringify(transformed, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();

  console.log('%c💾 Downloaded:', 'color: #0f0', filename);
  console.log('%c✅ Total:', 'color: #0f0', transformed.length, 'questions');
  console.log('%c📋 Type: copy(pepuData) to copy', 'color: #ff0');

  alert(`✅ Scraped ${transformed.length} questions!\n\nBy unit:\n${Object.entries(byUnit).map(([u, c]) => `  ${u}: ${c}`).join('\n')}\n\nFile: ${filename}`);

})();
