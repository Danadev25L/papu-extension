/**
 * Pepu API Monitor - Discover the correct API endpoint
 *
 * HOW TO USE:
 * 1. Go to https://admin.pepu.krd/Courses/View/19
 * 2. Paste this script in Console
 * 3. Change filters, click questions, etc.
 * 4. Check what API calls are captured
 * 5. Use the captured URL patterns to build the scraper
 */

(function() {
  'use strict';

  console.log('%c🔍 Pepu API Monitor Active!', 'color: #0f0; font-size: 16px; font-weight: bold');
  console.log('%c➡️ Now do these actions:', 'color: #ff0; font-size: 14px');
  console.log('  1. Click on a question');
  console.log('  2. Change a filter (year, term, unit)');
  console.log('  3. Click "More" (زۆرتر) button');
  console.log('  4. Check the captured URLs below');
  console.log('');

  const captured = [];

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';

    return originalFetch.apply(this, args).then(async (response) => {
      // Only capture API calls
      if (url.includes('/api/') || url.includes('question') || url.includes('Question') || url.includes('exam')) {
        const clone = response.clone();

        try {
          const data = await clone.json();

          captured.push({
            url: url,
            status: response.status,
            keys: Object.keys(data),
            hasOptions: JSON.stringify(data).includes('option') || JSON.stringify(data).includes('Option'),
            hasCorrectAnswer: JSON.stringify(data).includes('answer') || JSON.stringify(data).includes('Answer'),
            sample: data
          });

          // Log immediately
          const hasOpt = captured[captured.length - 1].hasOptions ? '✅' : '❌';
          const hasAns = captured[captured.length - 1].hasCorrectAnswer ? '✅' : '❌';
          console.log(`%c${url}`, `color: ${captured[captured.length - 1].hasOptions ? '#0f0' : '#f99'}`);
          console.log(`  Status: ${response.status} | Options: ${hasOpt} | Answer: ${hasAns}`);
          console.log(`  Keys: ${Object.keys(data).slice(0, 8).join(', ')}`);

        } catch (e) {
          // Not JSON
          captured.push({
            url: url,
            status: response.status,
            error: 'Not JSON'
          });
        }
      }

      return response;
    });
  };

  // Also intercept XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._url = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function() {
    this.addEventListener('load', function() {
      if (this._url.includes('/api/') || this._url.includes('question')) {
        try {
          const data = JSON.parse(this.responseText);
          console.log(`%cXHR: ${this._url}`, 'color: #0ff');
          console.log('  Response:', data);
        } catch (e) {}
      }
    });
    return originalSend.apply(this, arguments);
  };

  // Save captured data
  window.capturedAPI = captured;

  // Function to analyze captured data
  window.analyzeCaptured = function() {
    console.log('%c=== ANALYSIS ===', 'color: #ff0; font-size: 14px; font-weight: bold');
    console.log(`Total captured: ${captured.length}`);

    const withOptions = captured.filter(c => c.hasOptions);
    const withAnswer = captured.filter(c => c.hasCorrectAnswer);

    console.log(`With options: ${withOptions.length}`);
    console.log(`With answers: ${withAnswer.length}`);

    if (withOptions.length > 0) {
      console.log('%c✅ FOUND API WITH OPTIONS!', 'color: #0f0; font-size: 14px; font-weight: bold');
      console.log('URL patterns:');
      withOptions.forEach(c => {
        console.log(`  - ${c.url}`);
      });
    }

    if (withAnswer.length > 0) {
      console.log('%c✅ FOUND API WITH ANSWERS!', 'color: #0f0; font-size: 14px; font-weight: bold');
      withAnswer.forEach(c => {
        console.log(`  - ${c.url}`);
      });
    }

    // Download captured data
    const blob = new Blob([JSON.stringify(captured, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pepu-api-capture-${Date.now()}.json`;
    a.click();
    console.log('%c💾 Downloaded capture file', 'color: #0f0');
  };

  console.log('');
  console.log('%cCommands:', 'color: #ff0; font-weight: bold');
  console.log('  capturedAPI      - View all captured API calls');
  console.log('  analyzeCaptured() - Analyze and download results');
  console.log('');

})();
