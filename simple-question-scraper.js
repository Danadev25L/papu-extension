/**
 * Pepu Simple Scraper - Just questions and units
 *
 * Gets all questions with their units
 * No options needed
 */

(async function() {
  'use strict';

  // Get course ID from URL
  const urlMatch = window.location.href.match(/Courses\/View\/(\d+)/);
  const courseId = urlMatch ? urlMatch[1] : null;

  if (!courseId) {
    alert('Go to a course page first! (e.g., /Courses/View/19)');
    return;
  }

  console.log('%c🔍 Scraping questions for course:', 'color: #0f0', courseId);

  let allQuestions = [];
  let offset = 0;
  const limit = 100;

  // Fetch all pages
  while (true) {
    try {
      const apiUrl = `/api/courses/${courseId}/questions?limit=${limit}&offset=${offset}`;
      console.log(`Fetching: offset=${offset}`);

      const res = await fetch(apiUrl);
      if (!res.ok) {
        console.error('Failed:', res.status);
        break;
      }

      const data = await res.json();
      const items = data.items || data.questions || data.data || [];

      console.log(`📥 Got ${items.length} items | Total: ${allQuestions.length + items.length}`);

      if (items.length === 0) {
        console.log('✅ No more items');
        break;
      }

      // Log first item to see structure
      if (allQuestions.length === 0 && items.length > 0) {
        console.log('%c=== FIRST ITEM STRUCTURE ===', 'color: #ff0');
        console.log(JSON.stringify(items[0], null, 2));
      }

      allQuestions.push(...items);

      // Check if done
      const totalCount = data.totalCount || data.total || data.count;
      if (totalCount && allQuestions.length >= totalCount) {
        console.log(`%c✅ Complete! ${allQuestions.length}/${totalCount}`, 'color: #0f0');
        break;
      }

      if (items.length < limit) {
        console.log('✅ Got less than limit, done');
        break;
      }

      offset += limit;
      await new Promise(r => setTimeout(r, 200));

    } catch (error) {
      console.error('Error:', error);
      break;
    }
  }

  // Transform to correct format (just question and unit)
  const transformed = allQuestions.map((q, i) => {
    // Try different possible field names
    const questionText = q.question_text || q.content || q.question || q.text || '';
    const unitName = q.unit_name || q.unitName || q.unit || q.unit_name || q.subject_unit || '';

    return {
      number: q.question_number || q.number || i + 1,
      id: q.id || String(6900 + i),
      question: questionText,
      imageUrl: q.image_url || q.imageUrl || null,
      options: [],  // Empty as requested
      correct_answer: '',  // Empty as requested
      unit: unitName || null
    };
  });

  // Count by unit
  const byUnit = {};
  transformed.forEach(q => {
    const unit = q.unit || 'Unknown';
    byUnit[unit] = (byUnit[unit] || 0) + 1;
  });

  console.log('%c📊 Questions by unit:', 'color: #0f0', byUnit);
  console.log('%c✅ Total:', 'color: #0f0', transformed.length, 'questions');

  // Generate filename
  const subjectName = document.title.replace(' - Admin', '').trim();
  const filename = `pepu-${subjectName.toLowerCase().replace(/\s+/g, '-')}-exam-questions.json`;

  // Download
  const blob = new Blob([JSON.stringify(transformed, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();

  console.log('%c💾 Downloaded:', 'color: #0f0', filename);

  // Save to window
  window.pepuQuestions = transformed;

  alert(`✅ Scraped ${transformed.length} questions!\n\nBy unit:\n${Object.entries(byUnit).map(([u, c]) => `  ${u}: ${c}`).join('\n')}\n\nFile: ${filename}`);

})();
