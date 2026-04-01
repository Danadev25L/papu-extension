// Papu extension - Background service worker

console.log('[Background] Script loading...');

// Open browser page when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  console.log('[Background] Icon clicked, opening browser.html');
  const url = chrome.runtime.getURL("browser.html");
  await chrome.tabs.create({ url });
});

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[Background] Message received:', msg?.type);

  // PING for connection test
  if (msg?.type === "PING") {
    console.log('[Background] PING -> PONG');
    sendResponse({ pong: true });
    return true;
  }

  // Fill specific tab
  if (msg?.type === "FILL_SPECIFIC_TAB") {
    (async () => {
      try {
        const tabId = msg.tabId;
        if (!tabId) {
          sendResponse({ ok: false, error: "No tab ID" });
          return;
        }

        const tab = await chrome.tabs.get(tabId);
        if (!tab?.url) {
          sendResponse({ ok: false, error: "Tab not found" });
          return;
        }

        // Get mapping from storage
        let hostname = "";
        try {
          hostname = new URL(tab.url).hostname;
        } catch {
          sendResponse({ ok: false, error: "Invalid URL" });
          return;
        }

        const data = await chrome.storage.local.get(["papuExt_mapping"]);
        const mapping =
          data.papuExt_mapping?.[hostname] ||
          data.papuExt_mapping?.[hostname.replace(/^www\./, "")] ||
          data.papuExt_mapping?.["www." + hostname];

        if (!mapping?.questionSelector) {
          sendResponse({ ok: false, error: "No mapping for " + hostname });
          return;
        }

        // Execute fill script
        const payload = msg.payload || {};
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: papuInjectedFill,
          args: [payload, mapping],
        });

        const diagnostics = (results || []).map((x) => x.result).filter(Boolean);
        const diag = diagnostics[0];
        sendResponse({ ok: true, result: diag });
      } catch (e) {
        console.error('[Background] Fill error:', e);
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  // Debug fields
  if (msg?.type === "DEBUG_FIELDS") {
    (async () => {
      try {
        const host = (msg.hostname || "").toLowerCase().trim();
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => t.url && new URL(t.url).hostname.toLowerCase() === host);
        if (!tab?.id) {
          sendResponse({ ok: false, error: "No tab for " + host });
          return;
        }
        const r = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: papuDebugFields,
        });
        const byFrame = (r || []).filter((x) => x.result != null).map((x) => ({ frameId: x.frameId, result: x.result }));
        sendResponse({ ok: true, fields: JSON.stringify(byFrame, null, 2) });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  // Detect selectors
  if (msg?.type === "DETECT_SELECTORS") {
    (async () => {
      try {
        const host = (msg.hostname || "").toLowerCase().trim();
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => t.url && new URL(t.url).hostname.toLowerCase() === host);
        if (!tab?.id) {
          sendResponse({ ok: false, error: "No tab found for \"" + host + "\"" });
          return;
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: papuDetectSelectors,
        });
        const candidates = (results || []).map((x) => x.result).filter(Boolean);
        const r = candidates.find((m) => m?.questionSelector && m?.optionSelectors?.length) || candidates[0];
        if (!r?.questionSelector || !r?.optionSelectors?.length) {
          sendResponse({ ok: false, error: "Could not find form fields" });
          return;
        }
        sendResponse({ ok: true, mapping: r });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  // Click save and wait
  if (msg?.type === "CLICK_SAVE_AND_WAIT") {
    (async () => {
      try {
        const tabId = msg.tabId;
        if (!tabId) {
          sendResponse({ ok: false, error: "No tab ID" });
          return;
        }

        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            const saveBtn = document.querySelector('button[type="submit"], input[type="submit"], .btn-primary[type="submit"]');
            if (saveBtn) saveBtn.click();
          }
        });

        // Wait a bit for navigation
        await new Promise(r => setTimeout(r, 2000));
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});

console.log('[Background] Loaded successfully');

// ============================================
// Injected functions
// ============================================

function papuDebugFields() {
  const inputs = document.querySelectorAll('input, textarea, select');
  const fields = [];
  inputs.forEach(el => {
    const tag = el.tagName?.toLowerCase() || "";
    const type = el.type?.toLowerCase() || "";
    const name = el.name || el.id || "";
    if (name) {
      fields.push({
        tag,
        type,
        name,
        id: el.id || "",
        placeholder: el.placeholder || "",
        visible: el.offsetParent !== null
      });
    }
  });
  return { fields, url: window.location.href };
}

function papuDetectSelectors() {
  const textareas = Array.from(document.querySelectorAll('textarea'));
  const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="search"]'));
  const qCandidates = [...textareas, ...inputs].filter(el => el.offsetParent !== null);

  const questionSelector = qCandidates[0]?.id
    ? '#' + qCandidates[0].id
    : qCandidates[0]?.name
      ? '[name="' + qCandidates[0].name + '"]'
      : 'textarea:first-of-type';

  const optionInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="radio"], input[type="checkbox"]'))
    .filter(el => el.offsetParent !== null && el !== qCandidates[0]);

  const optionSelectors = optionInputs.slice(0, 4).map(el =>
    el.id ? '#' + el.id : el.name ? '[name="' + el.name + '"]' : 'input'
  );

  // Find correct answer checkboxes (IsCorrect checkboxes)
  const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  const correctCheckboxes = checkboxes.filter(el => {
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    return name.includes('iscorrect') || name.includes('is_correct') || name.includes('correct') ||
           id.includes('iscorrect') || id.includes('is_correct') || id.includes('correct');
  });

  const correctAnswerCheckboxSelectors = correctCheckboxes.slice(0, 4).map(el =>
    el.id ? '#' + el.id : el.name ? '[name="' + el.name + '"]' : 'input[type="checkbox"]'
  );

  return {
    questionSelector,
    optionSelectors,
    correctAnswerCheckboxSelectors,
    url: window.location.href
  };
}

async function papuInjectedFill(payload, mapping) {
  console.log('[Injected] Filling form...');

  // Debug: Log ALL select elements on the page
  const allSelects = Array.from(document.querySelectorAll('select'));
  console.log('[Injected] All selects on page:', allSelects.map(s => ({
    name: s.name,
    id: s.id,
    className: s.className,
    value: s.value
  })));

  function findEl(selStr) {
    if (!selStr) return null;
    const parts = String(selStr).split(",").map(s => s.trim()).filter(Boolean);
    for (const sel of parts) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function setNativeValue(el, value) {
    if (!el || value == null) return false;
    el.focus?.();
    const tag = el.tagName?.toUpperCase();
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") {
      const stringValue = String(value);
      el.value = stringValue;

      // For SELECT, also try to find and select the matching option
      if (tag === "SELECT") {
        // First try direct value
        let found = false;
        for (const opt of el.options) {
          if (opt.value === stringValue) {
            opt.selected = true;
            found = true;
            break;
          }
        }
        // If not found by value, try by text content
        if (!found) {
          for (const opt of el.options) {
            if (opt.textContent?.trim() === stringValue || opt.textContent?.includes(stringValue)) {
              opt.selected = true;
              el.value = opt.value;
              break;
            }
          }
        }
      }

      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    }
    return false;
  }

  function stripQuestionNumber(s) {
    if (!s || typeof s !== "string") return s;
    return s
      .replace(/^[٠-٩ٔ]+[\.\.\s\s]*/, "")
      .replace(/^[0-9]+[\.\.\s\s]*/, "")
      .trim();
  }

  function stripOptionLabel(s) {
    if (!s || typeof s !== "string") return s;
    return s
      .replace(/^[A-Da-d][\.\)\:\s]+/, "")
      .trim();
  }

  const found = { question: false, options: [], correct: false };

  // Fill question text
  if (mapping.questionSelector && payload.questionText) {
    const el = findEl(mapping.questionSelector);
    if (el) {
      const cleanQuestionText = stripQuestionNumber(payload.questionText);
      found.question = setNativeValue(el, cleanQuestionText);

      // Handle question image
      if (payload.questionImages && Array.isArray(payload.questionImages) && payload.questionImages.length > 0) {
        if (el.tagName === "TEXTAREA") {
          const imageUrl = payload.questionImages[0];
          let absoluteUrl = imageUrl;
          if (imageUrl.startsWith('/uploads/')) {
            absoluteUrl = 'https://pepumangment-backend.danabestun.dev' + imageUrl;
          }
          console.log('[Fill] Question image - fetching from:', absoluteUrl);
          try {
            const imageResponse = await fetch(absoluteUrl);
            if (imageResponse.ok) {
              const blob = await imageResponse.blob();
              const file = new File([blob], 'question_image.jpg', { type: blob.type || 'image/jpeg' });
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              const dropEvent = new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer
              });
              el.dispatchEvent(dropEvent);
              console.log('[Fill] Question image - dispatched drop event');
              await new Promise(r => setTimeout(r, 1500));
            }
          } catch (err) {
            console.error('[Fill] Failed to set question image:', err);
          }
        }
      }
    }
  }

  // Fill options
  if (payload.options && Array.isArray(mapping.optionSelectors)) {
    const choiceTextareas = mapping.optionSelectors.map(sel => findEl(sel)).filter(Boolean);

    // Handle choice images
    if (payload.choiceImages && typeof payload.choiceImages === 'object') {
      for (const [idx, imageUrl] of Object.entries(payload.choiceImages)) {
        const i = parseInt(idx, 10);
        const targetTextarea = choiceTextareas[i];
        if (targetTextarea) {
          try {
            let absoluteUrl = imageUrl;
            if (imageUrl.startsWith('/uploads/')) {
              absoluteUrl = 'https://pepumangment-backend.danabestun.dev' + imageUrl;
            }
            console.log(`[Fill] Choice ${i} - fetching image from:`, absoluteUrl);
            const imageResponse = await fetch(absoluteUrl);
            if (imageResponse.ok) {
              const blob = await imageResponse.blob();
              const file = new File([blob], `choice_${i}.jpg`, { type: 'image/jpeg' });
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              const dropEvent = new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                dataTransfer: dataTransfer
              });
              targetTextarea.dispatchEvent(dropEvent);
              console.log(`[Fill] Choice ${i} - dispatched drop event`);
              await new Promise(r => setTimeout(r, 1500));
            }
          } catch (err) {
            console.error(`[Fill] Failed to set choice ${i} image:`, err);
          }
        }
      }
    }

    // Fill option text
    payload.options.forEach((opt, i) => {
      const sel = mapping.optionSelectors[i];
      if (sel) {
        const el = findEl(sel);
        if (el) {
          found.options[i] = setNativeValue(el, opt);
        }
      }
    });
  }

  // Fill correct answer with checkboxes
  if (payload.correctAnswer) {
    const checkboxSels = mapping.correctAnswerCheckboxSelectors || [];
    const fallbackCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"][name*="IsCorrect"]'));

    if (checkboxSels.length > 0 || fallbackCheckboxes.length > 0) {
      const opts = (payload.options || []).map(stripOptionLabel);
      const norm = (s) => String(s || "").trim().replace(/\s+/g, " ");
      const want = norm(stripOptionLabel(payload.correctAnswer));
      let idx = -1;

      for (let i = 0; i < opts.length; i++) {
        if (norm(opts[i]) === want) {
          idx = i;
          break;
        }
      }
      if (idx < 0 && want) {
        for (let i = 0; i < opts.length; i++) {
          const o = norm(opts[i]);
          if (o && (o.includes(want) || want.includes(o))) {
            idx = i;
            break;
          }
        }
      }

      if (idx >= 0) {
        const checkbox = checkboxSels[idx] ? findEl(checkboxSels[idx]) : fallbackCheckboxes[idx];
        if (checkbox) {
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
          found.correct = true;
        }
      }
    }
  }

  // Set unit dropdown by index - NO EVENTS to avoid creating new entries
  if (payload.unitNumber) {
    const unitSelect = document.querySelector('select[name="Question.UnitId"], select[name="UnitId"], #UnitId');
    if (unitSelect) {
      const allOptions = Array.from(unitSelect.options);
      const validOptions = allOptions.filter(opt => opt.value && opt.value !== "");
      const unitIndex = parseInt(payload.unitNumber, 10);
      if (unitIndex > 0 && unitIndex <= validOptions.length) {
        const targetOption = validOptions[unitIndex - 1];
        if (targetOption) {
          unitSelect.value = targetOption.value;
          console.log('[Injected] Set unit to:', targetOption.value, 'without events');
        }
      }
    }
  }

  // Set difficulty - using radio buttons
  if (payload.difficulty) {
    console.log('[Injected] Looking for difficulty radio buttons, value to set:', payload.difficulty);

    // Find all radio buttons for difficulty
    const diffRadios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(radio => {
      const name = (radio.name || '').toLowerCase();
      const id = (radio.id || '').toLowerCase();
      return name.includes('difficulty') || id.includes('difficulty') ||
             name.includes('qabar') || id.includes('qabar') ||
             name.includes('level') || id.includes('level');
    });

    console.log('[Injected] Found difficulty radios:', diffRadios.map(r => ({ name: r.name, value: r.value, id: r.id })));

    if (diffRadios.length > 0) {
      // Map difficulty values (0.1, 0.3, 0.5, 0.7, 1.0) to radio button indices or values
      // Usually: 0.1=easy/1st, 0.3=medium-easy/2nd, 0.5=medium/3rd, 0.7=hard/4th, 1.0=very-hard/5th
      const diffValue = parseFloat(payload.difficulty);
      let targetRadio = null;

      // Try to find radio by value matching
      targetRadio = diffRadios.find(r => parseFloat(r.value) === diffValue);

      // If not found by value, try by index (0.1 -> 0th index, 0.3 -> 1st, etc.)
      if (!targetRadio) {
        const indexMap = { 0.1: 0, 0.3: 1, 0.5: 2, 0.7: 3, 1.0: 4 };
        const index = indexMap[diffValue];
        if (index !== undefined && diffRadios[index]) {
          targetRadio = diffRadios[index];
        }
      }

      if (targetRadio) {
        targetRadio.checked = true;
        // Try both click and change events
        targetRadio.dispatchEvent(new Event("click", { bubbles: true }));
        targetRadio.dispatchEvent(new Event("change", { bubbles: true }));
        console.log('[Injected] Set difficulty radio to:', targetRadio.value, 'id:', targetRadio.id, 'checked:', targetRadio.checked);

        // Verify it stayed checked
        setTimeout(() => {
          const stillChecked = document.getElementById(targetRadio.id);
          console.log('[Injected] After 100ms - difficulty still checked:', stillChecked?.checked, 'value:', stillChecked?.value);
        }, 100);
      } else {
        console.log('[Injected] Could not find matching radio for difficulty:', diffValue);
      }
    } else {
      console.log('[Injected] No difficulty radio buttons found');
    }
  } else {
    console.log('[Injected] No difficulty in payload');
  }

  // Set term - only if we have a valid term value
  // DON'T trigger events to avoid creating new entries
  if (payload.termId && payload.termId !== undefined && payload.termId !== null && payload.termId !== "") {
    const termSelect =
      document.querySelector('select[name="Question.TermId"]') ||
      document.querySelector('select[name="TermId"]') ||
      document.querySelector('#TermId') ||
      document.querySelector('select[id*="term" i]') ||
      document.querySelector('select[name*="term" i]');

    if (termSelect) {
      termSelect.value = String(payload.termId);
      console.log('[Injected] Set term to:', payload.termId, 'without triggering events');
    }
  } else {
    console.log('[Injected] Skipping term - no value provided');
  }

  return found;
}
