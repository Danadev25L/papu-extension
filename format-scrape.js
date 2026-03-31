/**
 * Pepu Scraper - Downloads to Desktop in correct JSON format
 */

(async function() {
  'use strict';

  // Get course ID from URL
  const urlMatch = window.location.href.match(/Courses\/View\/(\d+)/);
  const courseId = urlMatch ? urlMatch[1] : null;

  if (!courseId) {
    alert('❌ Go to a course page first!\nExample: https://admin.pepu.krd/Courses/View/19');
    return;
  }

  // Get subject name from page title
  const subjectName = document.title.replace(' - Admin', '').trim() || 'Unknown';

  // Format: subject-language-year-exam-questions.json
  const date = new Date();
  const year = date.getFullYear();
  const filename = `pepu-${subjectName.toLowerCase().replace(/\s+/g, '-')}-${year}-exam-questions.json`;
  const desktopPath = `/home/dana/Desktop/pepu/${filename}`;

  console.log(`%c🚀 Scraping: ${subjectName} (Course ${courseId})`, 'color: #0f0; font-size: 14px');
  console.log(`%c💾 Will save to: ${desktopPath}`, 'color: #888');

  const limit = 50;
  let offset = 0;
  let allQuestions = [];

  // Scrape all pages
  while (true) {
    try {
      const apiUrl = `/api/courses/${courseId}/questions?limit=${limit}&offset=${offset}`;
      const res = await fetch(apiUrl);
      if (!res.ok) break;

      const data = await res.json();
      const items = data.items || data.questions || data.data || [];
      if (items.length === 0) break;

      allQuestions.push(...items);
      console.log(`📥 ${allQuestions.length} / ${data.totalCount || '?'} questions`);

      if (data.totalCount && allQuestions.length >= data.totalCount) break;
      offset += limit;
      await new Promise(r => setTimeout(r, 100));
    } catch (e) { break; }
  }

  // Transform to match arabic-2024-exam-questions.json format
  const transformedQuestions = allQuestions.map((q, index) => ({
    number: q.question_number || index + 1,
    id: q.id || String(6900 + index),
    question: q.question_text || q.content || q.question || '',
    imageUrl: q.image_url || q.imageUrl || null,
    options: (q.options || []).map((opt, i) => ({
      value: String(i + 1),
      text: typeof opt === 'string' ? opt : (opt.text || opt.option_text || ''),
      image: opt.image || null
    })),
    correct_answer: q.correct_answer || q.correctAnswer || '',
    unit: q.unit_name || q.unitName || q.unit || null
  }));

  // Create final JSON structure
  const finalJSON = transformedQuestions;

  // Show popup with Copy button and file info
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pepu - ${subjectName}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 30px; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; color: #eee; }
        h1 { color: #00ff88; }
        .info { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 12px; margin: 20px 0; }
        .file-path { background: rgba(0,255,136,0.1); border: 1px solid #00ff88; padding: 15px; border-radius: 8px; font-family: monospace; word-break: break-all; }
        button { padding: 15px 30px; margin: 10px 5px; font-size: 16px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .btn-copy { background: #00ff88; color: #000; }
        .btn-download { background: #667eea; color: #fff; }
        .preview { background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin-top: 20px; }
        code { color: #00ff88; }
      </style>
    </head>
    <body>
      <h1>✅ ${subjectName}</h1>
      <div class="info">
        <p><strong>Total Questions:</strong> ${transformedQuestions.length}</p>
        <p><strong>Course ID:</strong> ${courseId}</p>
        <p><strong>Filename:</strong> ${filename}</p>
      </div>

      <div class="file-path">
        💾 Save to: <code>${desktopPath}</code>
      </div>

      <button class="btn-copy" onclick="doCopy()">📋 Copy JSON</button>
      <button class="btn-download" onclick="doDownload()">💾 Download File</button>

      <div class="preview">
        <h3>Preview (first 3 questions):</h3>
        <pre>${JSON.stringify(transformedQuestions.slice(0, 3), null, 2)}</pre>
      </div>

      <script>
        const data = ${JSON.stringify(JSON.stringify(finalJSON, null, 2))};

        function doCopy() {
          navigator.clipboard.writeText(data);
          alert('✅ Copied! Now create a file at:\\n\\n' + '${desktopPath}');
        }

        function doDownload() {
          const blob = new Blob([data], {type: 'application/json'});
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = '${filename}';
          a.click();
          alert('⬇️ File downloaded! Move it to:\\n\\n' + '${desktopPath}');
        }
      </script>
    </body>
    </html>
  `);

  console.log(`%c✅ DONE!`, 'color: #0f0; font-size: 18px');
  console.log(`%cCreate file at: ${desktopPath}`, 'color: #ff0');

  alert(`✅ ${transformedQuestions.length} questions ready!\n\nFilename: ${filename}\nPath: ${desktopPath}\n\nUse the popup to Copy or Download.`);

})();
