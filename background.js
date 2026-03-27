// Open browser page when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  const url = chrome.runtime.getURL("browser.html");
  await chrome.tabs.create({ url });
});

/**
 * Injected into the active tab. Fills form and returns diagnostic.
 * Must be self-contained — no external refs (findEl inlined).
 */
function papuInjectedFill(payload, mapping) {
  function findEl(selStr) {
    if (!selStr || typeof selStr !== "string") return null;
    const parts = String(selStr).split(",").map((s) => s.trim()).filter(Boolean);
    for (const sel of parts) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }
  const found = { question: false, options: [], correct: false };
  function setNativeValue(el, value) {
    if (!el || value === undefined || value === null) return false;
    const v = String(value);
    el.focus?.();
    const tag = (el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") {
      const proto = tag === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : tag === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, v);
      else el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    }
    if (el.isContentEditable || el.getAttribute?.("contenteditable") === "true") {
      el.textContent = v;
      el.innerText = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }

  function stripQuestionNumber(s) {
    if (!s || typeof s !== "string") return s;
    return s
      // Remove Arabic/Persian/Kurdish numerals at start (٠١٢٣٤٥٦٧٨٩)
      .replace(/^[٠-٩ٔ]+[\.\.\s\s]*/, "")
      // Remove English numerals at start (0-9)
      .replace(/^[0-9]+[\.\.\s\s]*/, "")
      .trim();
  }

  const qSel = mapping.questionSelector;
  if (qSel && payload.questionText) {
    const el = findEl(qSel);
    const cleanQuestionText = stripQuestionNumber(payload.questionText);
    found.question = setNativeValue(el, cleanQuestionText);
  }

  // Set unit if provided in payload
  if (payload.unitId) {
    const unitSelect = document.querySelector('select[name="Question.UnitId"], select[name="UnitId"], #UnitId');
    if (unitSelect) {
      setNativeValue(unitSelect, payload.unitId);
      console.log("[Fill] Set unit to:", payload.unitId);
    }
  }

  function stripOptionLabel(s) {
    if (!s || typeof s !== "string") return s;
    return s
      .replace(/^[A-Da-d][).:\s]+/, "")
      .replace(/^تەواوکەری بەیاریدە\s*/i, "")
      .trim();
  }
  // Get choice textareas - filter to only those with "Choices" in name
  const choiceTextareas = Array.from(document.querySelectorAll("textarea"))
    .filter(t => (t.name || "").includes("Choices"));

  (payload.options || []).forEach((text, i) => {
    const cleanText = stripOptionLabel(text);
    const el = choiceTextareas[i];
    found.options.push(setNativeValue(el, cleanText));
  });

  const checkboxSels = mapping.correctAnswerCheckboxSelectors;
  const fallbackCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"][name*="IsCorrect"]'));
  if (payload.correctAnswer && ((Array.isArray(checkboxSels) && checkboxSels.length > 0) || fallbackCheckboxes.length > 0)) {
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
    function setCheckbox(el, on) {
      if (!el || el.type !== "checkbox") return false;
      const v = !!on;
      el.focus?.();
      el.checked = v;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    const checkboxes = fallbackCheckboxes.length >= 4 ? fallbackCheckboxes : null;
    let okCorrect = false;
    for (let i = 0; i < 4; i++) {
      let el = Array.isArray(checkboxSels) && checkboxSels[i] ? findEl(checkboxSels[i]) : null;
      if (!el && checkboxes && checkboxes[i]) el = checkboxes[i];
      const on = idx >= 0 && i === idx;
      if (el && setCheckbox(el, on) && on) okCorrect = true;
    }
    found.correct = okCorrect;
  } else {
    const caSel = mapping.correctAnswerSelector;
    if (caSel && payload.correctAnswer) {
      const el = findEl(caSel);
      found.correct = setNativeValue(el, payload.correctAnswer);
    }
  }
  return found;
}

/** Runs in page context to detect form fields. Must be self-contained. */
function papuDetectSelectors() {
  function makeSelector(el) {
    try {
      if (el.id && /^[a-zA-Z_][\w-.:]*$/.test(el.id)) return "#" + (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(el.id) : el.id);
    } catch (_) {}
    const tag = el.tagName.toLowerCase();
    if (el.name) return tag + '[name="' + String(el.name).replace(/"/g, '\\"') + '"]';
    if (el.placeholder) return tag + '[placeholder="' + String(el.placeholder).slice(0, 50).replace(/"/g, '\\"') + '"]';
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
      if (siblings.length > 1) {
        const i = siblings.indexOf(el) + 1;
        return tag + ":nth-of-type(" + i + ")";
      }
    }
    return null;
  }
  const doc = document;
  const fields = [];
  const sel = "textarea, input[type=text], input[type=email], input[type=search], input:not([type]), input[type=''], [contenteditable=true]";
  doc.querySelectorAll(sel).forEach((el) => {
    if (el.offsetParent === null || el.hidden || el.disabled) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 3) return;
    try {
      const s = makeSelector(el);
      if (s && document.querySelectorAll(s).length === 1) {
        fields.push({ selector: s, tag: el.tagName.toLowerCase(), y: rect.top + window.scrollY, height: rect.height });
      } else if (el.name) {
        const fallback = el.tagName.toLowerCase() + '[name="' + String(el.name).replace(/"/g, '\\"') + '"]';
        if (document.querySelectorAll(fallback).length === 1) {
          fields.push({ selector: fallback, tag: el.tagName.toLowerCase(), y: rect.top + window.scrollY, height: rect.height });
        }
      }
    } catch (_) {}
  });
  fields.sort((a, b) => a.y - b.y);
  const textareas = fields.filter((f) => f.tag === "textarea");
  const question = textareas.length > 0 ? textareas.reduce((a, b) => (a.height >= b.height ? a : b)) : fields[0];
  const others = fields.filter((f) => f !== question);
  const options = others.slice(0, 6).map((f) => f.selector);
  return {
    questionSelector: question?.selector || "",
    optionSelectors: options,
    correctAnswerSelector: null,
  };
}

function papuDebugFields() {
  const out = [];
  const sel = "textarea, input:not([type=hidden]):not([type=submit]):not([type=button]), select, [contenteditable=true]";
  document.querySelectorAll(sel).forEach((el) => {
    if (el.offsetParent === null && el.type !== "hidden") return;
    const tag = el.tagName.toLowerCase();
    const name = el.name || "";
    const id = el.id || "";
    const ph = (el.placeholder || "").slice(0, 30);
    const ce = el.getAttribute?.("contenteditable") || "";
    let s = "";
    if (id && /^[a-zA-Z_][\w.-]*$/.test(id)) s = "#" + id;
    else if (name) s = tag + '[name="' + String(name).replace(/"/g, '\\"') + '"]';
    if (s && document.querySelectorAll(s).length === 1) {
      out.push({ tag, name, id, placeholder: ph, contenteditable: ce, selector: s });
    }
  });
  return JSON.stringify(out, null, 2);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
  if (msg?.type === "DETECT_SELECTORS") {
    (async () => {
      try {
        const host = (msg.hostname || "").toLowerCase().trim();
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => t.url && new URL(t.url).hostname.toLowerCase() === host);
        if (!tab?.id) {
          sendResponse({ ok: false, error: `No tab found for "${host}". Open the form page in a tab first.` });
          return;
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: papuDetectSelectors,
        });
        const candidates = (results || []).map((x) => x.result).filter(Boolean);
        const r = candidates.find((m) => m?.questionSelector && m?.optionSelectors?.length) || candidates[0];
        if (!r?.questionSelector || !r?.optionSelectors?.length) {
          sendResponse({ ok: false, error: "Could not find form fields. Make sure the form is visible (including inside iframes)." });
          return;
        }
        sendResponse({ ok: true, mapping: r });
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (msg?.type === "FILL_SPECIFIC_TAB") {
    (async () => {
      try {
        const tabId = msg.tabId;
        if (!tabId) {
          sendResponse({ ok: false, error: "No tab ID provided" });
          return;
        }

        const tab = await chrome.tabs.get(tabId);
        if (!tab?.url) {
          sendResponse({ ok: false, error: "Tab not found" });
          return;
        }

        let hostname = "";
        try {
          hostname = new URL(tab.url).hostname;
        } catch {
          sendResponse({ ok: false, error: "Invalid tab URL" });
          return;
        }

        const data = await chrome.storage.local.get(["papuExt_mapping"]);
        const mapping =
          data.papuExt_mapping?.[hostname] ||
          data.papuExt_mapping?.[hostname.replace(/^www\./, "")] ||
          data.papuExt_mapping?.["www." + hostname];
        if (!mapping?.questionSelector) {
          sendResponse({
            ok: false,
            error: `No mapping for "${hostname}". Open options, enter hostname, use Auto-detect or preset, then Save.`,
          });
          return;
        }

        const payload = msg.payload || {};
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabId, allFrames: true },
          func: papuInjectedFill,
          args: [payload, mapping],
        });
        const diagnostics = (results || []).map((x) => x.result).filter(Boolean);
        const diag = diagnostics.find((d) => {
          const n = [d?.question, ...(d?.options || []), d?.correct].filter(Boolean).length;
          return n > 0;
        }) || diagnostics[0];
        const okCount = [diag?.question, ...(diag?.options || []), diag?.correct].filter(Boolean).length;
        const total = 1 + (payload?.options?.length || 0) + (payload?.correctAnswer ? 1 : 0);
        if (okCount === 0) {
          sendResponse({ ok: false, error: "No fields found. Check selectors in options." });
        } else {
          sendResponse({ ok: true, filled: okCount + "/" + total });
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        sendResponse({ ok: false, error: err });
      }
    })();
    return true;
  }

  // Handle CLICK_SAVE_AND_WAIT for bulk create
  if (msg?.type === "CLICK_SAVE_AND_WAIT") {
    (async () => {
      try {
        const tabId = msg.tabId;
        if (!tabId) {
          sendResponse({ ok: false, error: "No tab ID provided" });
          return;
        }

        console.log("[Background] CLICK_SAVE_AND_WAIT starting for tab:", tabId);

        // Get current URL before clicking
        const tab = await chrome.tabs.get(tabId);
        const originalUrl = tab.url;
        console.log("[Background] Original URL:", originalUrl);

        // Just click the save button - don't wait for navigation in injected script
        console.log("[Background] About to executeScript...");
        let results;
        try {
          results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
            console.log("[Injected] Looking for save button...");
            let saveBtn = null;

            // Try common selectors
            const selectors = [
              'button[type="submit"]',
              'input[type="submit"]',
              'button.submit',
              'button.btn-primary',
            ];

            for (const selector of selectors) {
              const btn = document.querySelector(selector);
              if (btn) {
                saveBtn = btn;
                console.log("[Injected] Found save button:", selector, btn.textContent?.slice(0, 30));
                break;
              }
            }

            // Try by text content
            if (!saveBtn) {
              const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
              saveBtn = buttons.find(btn =>
                btn.textContent?.toLowerCase().includes('save') ||
                btn.textContent?.includes('خەزن') ||
                btn.textContent?.includes('حەزن') ||
                btn.value?.toLowerCase().includes('save')
              );
            }

            if (!saveBtn) {
              console.error("[Injected] No save button found!");
              return { ok: false, error: "Save button not found" };
            }

            console.log("[Injected] Clicking save button...");
            saveBtn.click();
            return { ok: true, clicked: true };
          }
        });
        console.log("[Background] executeScript completed, results:", results);

        } catch (execError) {
          console.error("[Background] executeScript error:", execError);
          sendResponse({ ok: false, error: "executeScript failed: " + (execError instanceof Error ? execError.message : String(execError)) });
          return;
        }

        const clickResult = results?.[0]?.result;
        console.log("[Background] Click result:", clickResult);

        if (!clickResult?.ok) {
          sendResponse({ ok: false, error: clickResult?.error || "Failed to click save" });
          return;
        }

        // Now wait for URL change by polling
        console.log("[Background] Waiting for URL change...");
        let checkCount = 0;
        const maxChecks = 40; // 20 seconds max (40 * 500ms)

        while (checkCount < maxChecks) {
          await new Promise(resolve => setTimeout(resolve, 500));
          checkCount++;

          const updatedTab = await chrome.tabs.get(tabId);
          if (updatedTab.url !== originalUrl) {
            console.log("[Background] URL changed to:", updatedTab.url);
            sendResponse({ ok: true, newUrl: updatedTab.url });
            return;
          }
        }

        // Timeout but button was clicked - assume success
        console.log("[Background] Timeout waiting for URL change, but button was clicked");
        sendResponse({ ok: true, newUrl: null, timeout: true });

      } catch (e) {
        console.error("[Background] CLICK_SAVE_AND_WAIT error:", e);
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (msg?.type !== "FILL_ACTIVE_TAB") return;

  (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }

      const url = tab.url || "";
      let hostname = "";
      try {
        hostname = new URL(url).hostname;
      } catch {
        sendResponse({ ok: false, error: "Tab URL not available (restricted page?)" });
        return;
      }

      const data = await chrome.storage.local.get(["papuExt_mapping"]);
      const mapping =
        data.papuExt_mapping?.[hostname] ||
        data.papuExt_mapping?.[hostname.replace(/^www\./, "")] ||
        data.papuExt_mapping?.["www." + hostname];
      if (!mapping?.questionSelector || !Array.isArray(mapping.optionSelectors) || mapping.optionSelectors.length === 0) {
        sendResponse({
          ok: false,
          error: `No mapping for "${hostname}". Open options, enter hostname, use Auto-detect or preset, then Save.`,
        });
        return;
      }

      const payload = msg.payload || {};
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: papuInjectedFill,
        args: [payload, mapping],
      });
      const diagnostics = (results || []).map((x) => x.result).filter(Boolean);
      const diag = diagnostics.find((d) => {
        const n = [d?.question, ...(d?.options || []), d?.correct].filter(Boolean).length;
        return n > 0;
      }) || diagnostics[0];
      const okCount = [diag?.question, ...(diag?.options || []), diag?.correct].filter(Boolean).length;
      const total = 1 + (payload?.options?.length || 0) + (payload?.correctAnswer ? 1 : 0);
      if (okCount === 0) {
        sendResponse({ ok: false, error: "No fields found. Check selectors in options. Run Auto-detect on the form page. If the form is in an iframe, try again." });
      } else {
        sendResponse({ ok: true, filled: okCount + "/" + total });
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      sendResponse({ ok: false, error: err });
    }
  })();

  return true;
});
