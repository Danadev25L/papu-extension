/**
 * Pepu Admin Scraper - Multiple Methods
 *
 * DIFFERENT WAYS TO SCRAPE:
 *
 * METHOD 1 - Network Tab (Easiest):
 *   1. Open DevTools -> Network tab
 *   2. Filter by "fetch" or "XHR"
 *   3. Change filters on the page (year, term, units)
 *   4. Look for API calls returning questions
 *   5. Right-click -> Copy as cURL or Copy response
 *
 * METHOD 2 - Browser Extension:
 *   1. Install "Foxhole" or "Request Bin" extension
 *   2. It captures all API requests
 *   3. Export as JSON
 *
 * METHOD 3 - This Script (All-in-one):
 */

(async function() {
  'use strict';

  const log = (msg, data) => console.log(`%c[PEPU] ${msg}`, 'color: #0f0; font-weight: bold', data || '');

  // Store all captured requests
  const capturedRequests = [];

  // ============================================================
  // OPTION 1: INTERCEPT ALL FETCH REQUESTS
  // ============================================================
  function interceptAllFetches() {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
      return originalFetch.apply(this, args).then(async (response) => {
        // Clone to read without consuming original
        const clone = response.clone();
        try {
          const data = await clone.json();
          capturedRequests.push({ url, data, time: new Date().toISOString() });
          log(`📥 Captured: ${url}`, { keys: Object.keys(data) });
        } catch (e) {
          // Not JSON, ignore
        }
        return response;
      });
    };
    log('✅ Fetch interception ACTIVE - all API calls will be captured');
  }

  // ============================================================
  // OPTION 2: FIND NEXT.JS DATA
  // ============================================================
  function getNextJSData() {
    const sources = [
      window.__NEXT_DATA__,
      window.__NUXT__,
      window.__INITIAL_STATE__
    ];

    for (const source of sources) {
      if (source) {
        log('📦 Found framework data:', Object.keys(source));
        return source;
      }
    }
    return null;
  }

  // ============================================================
  // OPTION 3: SCAN FOR COMMON API PATTERNS
  // ============================================================
  async function scanAPIEndpoints() {
    const possiblePaths = [
      '/api/questions',
      '/api/Questions',
      '/api/exam',
      '/api/Exam',
      '/api/subject',
      '/api/Subject',
      '/api/courses',
      '/api/Courses',
      '/api/study',
      '/api/extension'
    ];

    log('🔍 Scanning for API endpoints...');

    for (const path of possiblePaths) {
      try {
        const res = await fetch(path);
        if (res.ok) {
          log(`✅ Found: ${path} (${res.status})`);
        }
      } catch (e) {}
    }
  }

  // ============================================================
  // OPTION 4: EXTRACT FROM WINDOW OBJECT
  // ============================================================
  function dumpWindowKeys() {
    const interestingKeys = Object.keys(window).filter(k =>
      k.includes('data') ||
      k.includes('state') ||
      k.includes('store') ||
      k.includes('api') ||
      k.includes('app') ||
      k.toUpperCase() === k || // All caps (constants)
      k.startsWith('__')      // Double underscore (internal)
    );

    log('🔑 Interesting window keys:', interestingKeys);

    // Try to find React state
    const allElements = document.querySelectorAll('[data-reactroot], [data-reactid]');
    log(`🎯 Found ${allElements.length} React elements`);

    return interestingKeys;
  }

  // ============================================================
  // OPTION 5: SCROLL AND LOAD (Lazy loading)
  // ============================================================
  async function scrollAndLoad() {
    log('📜 Scrolling to load all content...');

    const scrollHeight = document.documentElement.scrollHeight;
    let currentScroll = 0;

    while (currentScroll < scrollHeight) {
      window.scrollTo(0, currentScroll + 500);
      currentScroll += 500;
      await new Promise(r => setTimeout(r, 500));
    }

    window.scrollTo(0, 0);
    log('✅ Scrolled to bottom and back');
  }

  // ============================================================
  // OPTION 6: TRY COMMON BACKEND PORTS
  // ============================================================
  async function tryCommonPorts() {
    const host = window.location.hostname;
    const ports = ['3000', '3001', '4000', '5000', '8000', '8080', '1337'];

    log('🔌 Trying common backend ports...');

    for (const port of ports) {
      try {
        const url = `https://${host}:${port}/api/subjects`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          log(`🎉 FOUND BACKEND: https://${host}:${port}`);
          return url;
        }
      } catch (e) {}
    }
  }

  // ============================================================
  // OPTION 7: CHECK SERVICE WORKER & CACHE
  // ============================================================
  async function checkCache() {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      log('💾 Found caches:', cacheNames);

      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        log(`  ${name}:`, keys.map(k => k.url).slice(0, 5));
      }
    }
  }

  // ============================================================
  // OPTION 8: FOLLOW REDIRECTS & FIND API
  // ============================================================
  async function followRedirects() {
    // Check if there's a backend URL in meta tags or scripts
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const apiUrls = scripts
      .map(s => s.src)
      .filter(src => src.includes('/api') || src.includes('backend') || src.includes('api'));

    log('🔗 API URLs in scripts:', apiUrls);

    // Check for environment variables exposed to frontend
    const envKeys = Object.keys(window).filter(k => k.match(/ENV|CONFIG|API|BASE/ig));
    log('⚙️ Environment/config keys:', envKeys);
  }

  // ============================================================
  // OPTION 9: MANUAL API TESTER
  // ============================================================
  async function testAPI(path) {
    const url = path.startsWith('http') ? path : `${window.location.origin}${path}`;
    log(`🧪 Testing: ${url}`);

    try {
      const res = await fetch(url);
      const text = await res.text();
      log(`Status: ${res.status}`, {
        headers: Object.fromEntries(res.headers.entries()),
        preview: text.slice(0, 200)
      });

      try {
        const json = JSON.parse(text);
        log('JSON Response:', json);
        return json;
      } catch (e) {
        log('Not JSON, plain text');
        return text;
      }
    } catch (e) {
      log(`❌ Failed: ${e.message}`);
    }
  }

  // ============================================================
  // EXPORT ALL CAPTURED DATA
  // ============================================================
  function exportCaptured() {
    const data = {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      nextData: getNextJSData(),
      capturedRequests,
      windowKeys: dumpWindowKeys()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pepu-discovery-${Date.now()}.json`;
    a.click();
    log('💾 Exported discovery data');
  }

  // ============================================================
  // CREATE MENU
  // ============================================================
  function createMenu() {
    const existing = document.getElementById('pepu-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'pepu-menu';
    menu.innerHTML = `
      <style>
        #pepu-menu {
          position: fixed;
          top: 10px;
          right: 10px;
          background: linear-gradient(135deg, #1e3c72, #2a5298);
          padding: 15px;
          border-radius: 12px;
          z-index: 999999;
          font-family: system-ui, sans-serif;
          color: white;
          box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        }
        #pepu-menu h3 { margin: 0 0 10px; color: #00ff88; }
        #pepu-menu button {
          display: block;
          width: 100%;
          padding: 10px;
          margin: 5px 0;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          background: rgba(255,255,255,0.1);
          color: white;
          transition: all 0.2s;
        }
        #pepu-menu button:hover { background: rgba(255,255,255,0.2); }
        #pepu-menu button.primary { background: #00ff88; color: #000; }
        #pepu-menu .close {
          position: absolute;
          top: 8px;
          right: 10px;
          background: none;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
        }
        #pepu-menu input {
          width: 100%;
          padding: 8px;
          margin: 5px 0;
          border-radius: 6px;
          border: none;
          background: rgba(255,255,255,0.1);
          color: white;
        }
      </style>
      <button class="close" onclick="document.getElementById('pepu-menu').remove()">×</button>
      <h3>🔧 Pepu Discovery Tools</h3>

      <button onclick="pepu.scan()">🔍 Scan API Endpoints</button>
      <button onclick="pepu.dumpKeys()">🔑 Dump Window Keys</button>
      <button onclick="pepu.intercept()">📥 Intercept All Fetch</button>
      <button onclick="pepu.scroll()">📜 Scroll & Load All</button>
      <button onclick="pepu.cache()">💾 Check Cache</button>
      <button onclick="pepu.ports()">🔌 Try Backend Ports</button>
      <button onclick="pepu.follow()">🔗 Follow Redirects</button>

      <input type="text" id="api-test" placeholder="/api/..." />
      <button onclick="pepu.test(document.getElementById('api-test').value)">🧪 Test API</button>

      <button class="primary" onclick="pepu.export()">💾 Export Discovery</button>
    `;
    document.body.appendChild(menu);
  }

  // ============================================================
  // GLOBAL API
  // ============================================================
  window.pepu = {
    scan: scanAPIEndpoints,
    dumpKeys: dumpWindowKeys,
    intercept: interceptAllFetches,
    scroll: scrollAndLoad,
    cache: checkCache,
    ports: tryCommonPorts,
    follow: followRedirects,
    test: testAPI,
    export: exportCaptured,
    data: () => capturedRequests
  };

  log('✅ Pepu Discovery Tools loaded!');
  log('Commands: pepu.scan(), pepu.intercept(), pepu.test("/api/..."), pepu.export()');

  // Auto-start interception
  interceptAllFetches();

  // Show menu
  createMenu();

})();
