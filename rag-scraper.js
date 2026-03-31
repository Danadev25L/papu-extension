/**
 * Pepu RAG Scraper - Get all questions with units
 * For RAG (Retrieval-Augmented Generation) system
 *
 * USAGE:
 * 1. Go to https://admin.pepu.krd/Courses/View/19 (or any course)
 * 2. Open Console (F12)
 * 3. Paste this script
 * 4. JSON file will download
 */

(async function() {
  'use strict';

  const urlMatch = window.location.href.match(/Courses\/View\/(\d+)/);
  const courseId = urlMatch ? urlMatch[1] : null;

  if (!courseId) {
    alert('⚠️ Please go to a course page first!\n\nExample: https://admin.pepu.krd/Courses/View/19');
    return;
  }

  console.log('%c🚀 Pepu RAG Scraper', 'color: #0f0; font-size: 16px; font-weight: bold');
  console.log('%cCourse ID:', 'color: #0f0', courseId);
  console.log('%cSubject:', 'color: #0f0', document.title.replace(' - Admin', '').trim());

  const allQuestions = [];
  let offset = 0;
  const limit = 100;

  // Fetch all pages
  console.log('%c📥 Fetching questions...', 'color: #ff0');

  while (true) {
    try {
      const apiUrl = `/api/courses/${courseId}/questions?limit=${limit}&offset=${offset}`;
      const res = await fetch(apiUrl);

      if (!res.ok) {
        console.error(`❌ Failed: ${res.status}`);
        break;
      }

      const data = await res.json();
      const items = data.items || data.questions || data.data || [];

      if (items.length === 0) break;

      allQuestions.push(...items);
      console.log(`  ✅ Fetched ${items.length} | Total: ${allQuestions.length}`);

      const totalCount = data.totalCount || data.total;
      if (totalCount && allQuestions.length >= totalCount) break;
      if (items.length < limit) break;

      offset += limit;
      await new Promise(r => setTimeout(r, 100));

    } catch (error) {
      console.error('Error:', error);
      break;
    }
  }

  console.log(`%c✅ Total questions: ${allQuestions.length}`, 'color: #0f0');

  // Debug: Show structure of first item
  if (allQuestions.length > 0) {
    const first = allQuestions[0];
    console.log('%c📋 First item keys:', 'color: #ff0', Object.keys(first));
    console.log('%c📋 Sample unit field values:', 'color: #ff0',
      first.unit_name || first.unitName || first.unit || first.subject_unit || 'NOT FOUND');
  }

  // Transform to RAG format
  const ragFormat = allQuestions.map((q, i) => {
    // Try all possible field names for unit
    const unit = q.unit_name || q.unitName || q.unit || q.subject_unit ||
                 q.unit?.name || q.unitName || null;

    // Clean question text (remove HTML tags if present)
    let questionText = q.question_text || q.content || q.question || q.text || '';
    // Remove HTML tags
    questionText = questionText.replace(/<[^>]*>/g, '').trim();

    return {
      number: q.question_number || q.number || i + 1,
      id: q.id || String(6900 + i),
      question: questionText,
      imageUrl: q.image_url || q.imageUrl || null,
      options: [],
      correct_answer: '',
      unit: unit || 'Unknown'
    };
  });

  // Statistics by unit
  const byUnit = {};
  ragFormat.forEach(q => {
    const unit = q.unit || 'Unknown';
    byUnit[unit] = (byUnit[unit] || 0) + 1;
  });

  console.log('%c📊 Questions by unit:', 'color: #0f0', byUnit);

  // Generate filename
  const subjectName = document.title.replace(' - Admin', '').trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]/g, '');
  const filename = `pepu-${subjectName}-exam-questions.json`;

  // Download
  const blob = new Blob([JSON.stringify(ragFormat, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();

  console.log('%c💾 Downloaded:', 'color: #0f0', filename);
  console.log('%c✅ Ready for RAG system!', 'color: #0f0; font-size: 14px');

  // Save to window for inspection
  window.ragQuestions = ragFormat;

  // Summary
  const unitSummary = Object.entries(byUnit)
    .map(([unit, count]) => `  • ${unit}: ${count}`)
    .join('\n');

  alert(`✅ Scraped ${ragFormat.length} questions for RAG!\n\n${filename}\n\nBy unit:\n${unitSummary}`);

})();
