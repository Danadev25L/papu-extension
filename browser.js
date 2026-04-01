/** Papu extension — Full question browser tab */

const PROD_API_URL = "https://pepumangment-backend.danabestun.dev/api";
const LOCAL_API_URL = "http://localhost:3001/api";
const ALL = "__all__";

// Global error handler - show errors on screen
window.addEventListener('error', (e) => {
  console.error('[Global Error]', e.message, e.filename, e.lineno, e.error);
  showError(e.message + '\n' + (e.error?.stack || ''));
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Promise Rejection]', e.reason);
  showError('Promise: ' + String(e.reason));
});

function showError(msg) {
  const el = document.getElementById('errorDisplay');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 10000);
  }
}

function getExamYears() {
  const now = new Date();
  const endYear = now.getFullYear();
  const years = [];
  for (let y = 2010; y <= endYear; y++) years.push(`${y}-${y + 1}`);
  return years;
}

const EXAM_PERIODS = [
  { value: "", label: "هەموو" },
  { value: "elementary", label: "سەرەتایی" },
  { value: "first_term", label: "قۆناغی یەکەم" },
  { value: "second_term", label: "قۆناغی دووەم" },
];

const DIFFICULTY_LEVELS = [
  { value: "", label: "هەموو قەبارەیەک" },
  { value: "0.1", label: "زۆر ئاسان" },
  { value: "0.3", label: "ئاسان" },
  { value: "0.5", label: "ناوەندی" },
  { value: "0.7", label: "گران" },
  { value: "1.0", label: "زۆر گران" }
];

let state = {
  subjects: [],
  questions: [],
  subjectId: "",
  examYear: "",
  examPeriod: "",
  unitId: "", // Our unit from API (for filtering)
  adminUnitId: "", // Admin unit from admin panel (for uploading)
  adminTermId: "", // Admin term from admin panel (for uploading)
  selectedQuestions: new Set(), // Track selected question IDs for bulk create
  questionImages: [], // Store uploaded question image URLs
  choiceImages: {}, // Store uploaded choice image URLs: {0: url, 1: url, ...}
};

// Track filled question temporarily (for green flash effect)
let filledQuestionId = null;

// Track bulk create state
let bulkCreateInProgress = false;

async function apiFetch(path) {
  // Try production first, fallback to localhost on error
  const urls = [PROD_API_URL, LOCAL_API_URL];

  for (const baseUrl of urls) {
    try {
      const fullUrl = `${baseUrl}${path.startsWith("/") ? path : "/" + path}`;
      const res = await fetch(fullUrl, { credentials: "omit", signal: AbortSignal.timeout(5000) });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // If it's a 404 or other client error, don't retry - throw immediately
        if (res.status >= 400 && res.status < 500) throw new Error(data.error || `HTTP ${res.status}`);
        // For server errors, try next URL
        continue;
      }

      const data = await res.json();
      // Log which server we're using
      console.log(`[API] Using: ${baseUrl === PROD_API_URL ? "PROD" : "LOCAL"}`);
      return data;
    } catch (e) {
      // If fetch fails completely (network error), try next URL
      if (baseUrl === urls[urls.length - 1]) {
        // Last URL failed, throw error
        throw e;
      }
      // Try next URL
      continue;
    }
  }

  throw new Error("All API endpoints failed");
}

/**
 * Upload an image file to the server and return the URL
 * Uses fallback logic: prod -> local
 */
async function uploadImage(file) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      const base64 = reader.result;
      const urls = [PROD_API_URL, LOCAL_API_URL];

      for (const baseUrl of urls) {
        try {
          const res = await fetch(`${baseUrl}/upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: base64 }),
            signal: AbortSignal.timeout(30000),
          });

          const data = await res.json();
          if (data.url) {
            console.log(`[Upload] Using: ${baseUrl === PROD_API_URL ? "PROD" : "LOCAL"}`);
            resolve(data.url);
            return;
          }
        } catch (e) {
          // Try next URL
          if (baseUrl === urls[urls.length - 1]) {
            reject(e);
            return;
          }
        }
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function fillSelect(sel, options) {
  sel.innerHTML = "";
  for (const v of options) {
    const o = document.createElement("option");
    o.value = typeof v === "object" ? v.value : v;
    o.textContent = typeof v === "object" ? v.label : v;
    sel.appendChild(o);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function filteredQuestions() {
  let results = state.questions;

  // Filter by search text
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  if (q) {
    results = results.filter((item) =>
      (item.questionText || "").toLowerCase().includes(q)
    );
  }

  return results;
}

async function fillActive(payload, cardElement) {
  try {
    const tabs = await chrome.tabs.query({});
    console.log('[fillActive] All tabs:', tabs.map(t => ({id: t.id, url: t.url})));

    const targetTab = tabs.find(t =>
      t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd"))
    );

    console.log('[fillActive] Target tab:', targetTab ? {id: targetTab.id, url: targetTab.url} : 'NOT FOUND');

    if (!targetTab) {
      showToast("admin.pepu.krd تاب نەدۆزرایەوە", "error");
      return { ok: false, error: "Tab not found" };
    }

    // Use adminUnitId for saving (from dropdown), unitId is just for filtering
    const unitIdForSave = state.adminUnitId || payload.unitId || undefined;

    // Include current state's choice images
    // Use payload.choiceImages (from question) first, fallback to state (user uploaded)
    const enrichedPayload = {
      ...payload,
      // Preserve unit fields from question for auto-selection
      unitNumber: payload.unitNumber,
      unitId: payload.unitId,
      unitNameKu: payload.unitNameKu,
      // For bulk create, override unitId with admin selection
      unitIdForSave: unitIdForSave,
      difficulty: payload.difficulty || undefined,
      termId: payload.termId || state.adminTermId || undefined,
      questionImages: (payload.questionImages && payload.questionImages.length > 0)
        ? payload.questionImages
        : state.questionImages,
      choiceImages: (payload.choiceImages && Object.keys(payload.choiceImages).length > 0)
        ? payload.choiceImages
        : state.choiceImages
    };

    // Add retry logic for connection errors
    let res;
    let lastError;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`[fillActive] Attempt ${attempt + 1}/3 to send message...`);
        res = await chrome.runtime.sendMessage({
          type: "FILL_SPECIFIC_TAB",
          tabId: targetTab.id,
          payload: enrichedPayload
        });
        break; // Success, exit retry loop
      } catch (err) {
        lastError = err;
        console.warn(`[fillActive] Attempt ${attempt + 1} failed:`, err);
        if (attempt < 2) {
          // Wait before retry (except on last attempt)
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    if (res?.ok) {
      showToast("✓ پڕکرایەوە!", "success");
      // Toggle green - if green, remove it; if not green, add it
      if (cardElement) {
        cardElement.classList.toggle("filled");
      }
    } else {
      const errorMsg = res?.error || lastError?.message || String(lastError) || "هەڵە";
      console.error("[fillActive] Final error:", errorMsg);
      showToast(errorMsg, "error");
    }
    return res || { ok: false, error: lastError?.message || "Connection failed" };
  } catch (e) {
    console.error("Fill error:", e);
    showToast(e instanceof Error ? e.message : String(e), "error");
    return { ok: false, error: String(e) };
  }
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.className = "toast";
  }, 2500);
}

function renderQuestions() {
  const container = document.getElementById("questionsList");
  const countLabel = document.getElementById("countLabel");
  container.innerHTML = "";
  const items = filteredQuestions();
  countLabel.textContent = `${items.length} پرسیار`;

  // Update select all button state
  updateSelectAllButton();

  if (items.length === 0) {
    container.innerHTML = `<p class="empty">هیچ پرسیارێک نەدۆزرایەوە.</p>`;
    return;
  }

  items.forEach((q) => {
    // Debug: check question images
    console.log('[Render] Question', q.questionNumber, 'questionImages:', q.questionImages);

    const card = document.createElement("div");
    card.className = "q-card";
    if (state.selectedQuestions.has(q.id)) {
      card.classList.add("selected");
    }

    // DEBUG: Add choiceImages info to unit label
    const imageCount = Object.keys(q.choiceImages || {}).length;
    const debugLabel = imageCount > 0 ? ` 🖼️${imageCount}` : '';
    if (state.selectedQuestions.has(q.id)) {
      card.classList.add("selected");
    }

    const unitLabel = q.unitNameKu || (q.unitNumber ? `بەند ${q.unitNumber}` : "");
    const yearLabel = q.examYear || "";
    const isSelected = state.selectedQuestions.has(q.id);
    const hasQuestionImages = (q.questionImages?.length ?? 0) > 0;
    const hasChoiceImages = Object.keys(q.choiceImages ?? {}).length > 0;

    // Get difficulty label
    const difficultyLabels = {0.1: "زۆر ئاسان", 0.3: "ئاسان", 0.5: "ناوەندی", 0.7: "گران", 1.0: "زۆر گران"};
    const difficultyLabel = q.difficulty !== undefined ? difficultyLabels[q.difficulty] || "" : "";
    const difficultyClass = q.difficulty >= 0.7 ? "q-difficulty-hard" :
                          q.difficulty >= 0.5 ? "q-difficulty-medium" : "q-difficulty-easy";

    card.innerHTML = `
      <input type="checkbox" class="q-checkbox" data-id="${q.id}" ${isSelected ? "checked" : ""}>
      <div class="q-header">
        <span class="q-number">#${q.questionNumber}</span>
        <div class="q-meta">
          ${difficultyLabel ? `<span class="q-difficulty ${difficultyClass}">${escapeHtml(difficultyLabel)}</span>` : ""}
          ${unitLabel ? `<span class="q-unit">${escapeHtml(unitLabel)}</span>` : ""}
          ${yearLabel ? `<span class="q-year">${yearLabel}</span>` : ""}
          ${hasQuestionImages ? `<span class="q-images">🖼️ ${q.questionImages?.length || 0}</span>` : ""}
          ${hasChoiceImages ? `<span class="q-images">🖼️ ${Object.keys(q.choiceImages || {}).length}</span>` : ""}
        </div>
      </div>
      ${hasQuestionImages ? `<div class="q-question-image"><img src="${escapeHtml(q.questionImages[0])}" alt="Question image" loading="lazy"></div>` : ""}
      <p class="q-text">${escapeHtml((q.questionText || "").slice(0, 200))}${(q.questionText || "").length > 200 ? "..." : ""}</p>
      ${(q.options || []).length > 0 ? `
        <div class="q-options">
          ${(q.options || []).slice(0, 4).map((opt, i) => {
            // Handle both string options and object options with imageUrl
            let optText = "";
            let optImageUrl = undefined;

            if (typeof opt === "string") {
              optText = opt;
            } else if (typeof opt === "object" && opt !== null) {
              optText = opt.text || opt.label || "";
              optImageUrl = opt.imageUrl;
            }

            // Also check choiceImages from extension state
            const hasImageFromState = q.choiceImages?.[i];
            // Convert relative URLs to absolute backend URLs
            const backendUrl = "https://pepumangment-backend.danabestun.dev";
            const displayImageUrl = optImageUrl || (hasImageFromState && hasImageFromState.startsWith('/')
              ? backendUrl + hasImageFromState
              : hasImageFromState);

            const defaultLabel = (i === 0 ? 'A' : i === 1 ? 'B' : i === 2 ? 'C' : 'D');
            const truncatedText = escapeHtml(String(optText).slice(0, 40)) + (String(optText).length > 40 ? "..." : "");
            const hasText = optText && optText.trim().length > 0;

            if (displayImageUrl) {
              const labelText = hasText ? truncatedText : defaultLabel;
              return `<span class="q-opt q-opt-with-image"><img src="${escapeHtml(displayImageUrl)}" class="q-opt-image" alt="option ${i + 1}" loading="lazy"><span class="q-opt-text">${labelText}</span></span>`;
            }
            // Text-only option - show text or fallback label
            const displayText = hasText ? truncatedText : defaultLabel;
            return `<span class="q-opt">${displayText}</span>`;
          }).join("")}
        </div>
      ` : ""}
    `;

    // Checkbox click - toggle selection
    const checkbox = card.querySelector(".q-checkbox");
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleQuestionSelection(q.id, card);
    });

    // Card click - fill the form
    card.addEventListener("click", async () => {
      // DEBUG: Show visual indicator that click was received
      card.style.border = "3px solid red";
      setTimeout(() => card.style.border = "", 500);

      // Debug: log unit fields
      console.log("[Card Click] Question unit data:", {
        id: q.id,
        unitNumber: q.unitNumber,
        unit_number: q.unit_number,
        unitNameKu: q.unitNameKu,
        unit_name_ku: q.unit_name_ku,
        unitId: q.unitId,
        unit_id: q.unit_id
      });

      // Debug: log difficulty fields
      console.log("[Card Click] Question difficulty data:", {
        id: q.id,
        difficulty: q.difficulty,
        difficulty_level: q.difficulty_level
      });

      await fillActive({
        questionId: q.id,
        questionText: q.questionText,
        options: q.options || [],
        correctAnswer: q.correctAnswer || "",
        unitNumber: q.unit_number || q.unitNumber || undefined,
        unitId: q.unit_id || q.unitId || undefined,
        unitNameKu: q.unit_name_ku || q.unitNameKu || undefined,
        difficulty: q.difficulty || q.difficulty_level || undefined,
        termId: state.adminTermId || undefined,  // Only use saved admin term, not question's term
        questionImages: q.questionImages || [],
        choiceImages: q.choiceImages || {}
      }, card);
    });

    container.appendChild(card);
  });

  // Add class for checkbox styling
  document.querySelectorAll(".q-checkbox").forEach(cb => {
    cb.closest(".q-card")?.classList.add("has-checkbox");
  });
}

// Toggle question selection for bulk create
function toggleQuestionSelection(questionId, cardElement) {
  if (state.selectedQuestions.has(questionId)) {
    state.selectedQuestions.delete(questionId);
    cardElement?.classList.remove("selected");
  } else {
    state.selectedQuestions.add(questionId);
    cardElement?.classList.add("selected");
  }
  updateBulkUI();
}

// Update bulk create button visibility and count
function updateBulkUI() {
  const bulkSection = document.getElementById("bulkSection");
  const selectedCount = document.getElementById("selectedCount");

  if (state.selectedQuestions.size > 0) {
    bulkSection.style.display = "flex";
    selectedCount.textContent = state.selectedQuestions.size;
  } else {
    bulkSection.style.display = "none";
  }
}

// Clear all selections
function clearSelections() {
  state.selectedQuestions.clear();
  document.querySelectorAll(".q-card.selected").forEach(card => {
    card.classList.remove("selected");
    const checkbox = card.querySelector(".q-checkbox");
    if (checkbox) checkbox.checked = false;
  });
  updateBulkUI();
}

// Select or deselect all visible questions
function toggleSelectAll() {
  const items = filteredQuestions();
  const allSelected = items.length > 0 && items.every(q => state.selectedQuestions.has(q.id));

  if (allSelected) {
    // Deselect all
    state.selectedQuestions.clear();
  } else {
    // Select all visible questions
    items.forEach(q => state.selectedQuestions.add(q.id));
  }

  // Update UI
  document.querySelectorAll(".q-card").forEach(card => {
    const checkbox = card.querySelector(".q-checkbox");
    const questionId = checkbox?.dataset.id;
    if (questionId && state.selectedQuestions.has(questionId)) {
      card.classList.add("selected");
      if (checkbox) checkbox.checked = true;
    } else {
      card.classList.remove("selected");
      if (checkbox) checkbox.checked = false;
    }
  });

  updateBulkUI();
  updateSelectAllButton();
}

// Update select all button text
function updateSelectAllButton() {
  const btn = document.getElementById("selectAllBtn");
  const items = filteredQuestions();
  if (!btn || items.length === 0) return;

  const allSelected = items.every(q => state.selectedQuestions.has(q.id));
  btn.textContent = allSelected ? "پەچەکردن" : "هەڵبژاردنی هەموو";
}

// Bulk create questions
async function bulkCreate() {
  if (state.selectedQuestions.size === 0 || bulkCreateInProgress) return;

  bulkCreateInProgress = true;
  const selectedIds = Array.from(state.selectedQuestions);
  const selectedQuestions = state.questions.filter(q => state.selectedQuestions.has(q.id));

  // Get courseId from the current admin.pepu.krd tab
  const allTabs = await chrome.tabs.query({});
  const adminTab = allTabs.find(t =>
    t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd"))
  );

  let courseId = 16; // Default fallback
  if (adminTab && adminTab.url) {
    const match = adminTab.url.match(/courseId=(\d+)/i);
    if (match) {
      courseId = match[1];
    }
  }
  console.log("[Bulk Create] Using courseId:", courseId);
  const editUrl = `https://admin.pepu.krd/Courses/Questions/Edit?courseId=${courseId}`;

  console.log("[Bulk Create] Starting with questions:", selectedQuestions.map(q => q.id));

  // Show progress
  const bulkProgress = document.getElementById("bulkProgress");
  const bulkSection = document.getElementById("bulkSection");
  const progressText = document.getElementById("progressText");
  const progressCount = document.getElementById("progressCount");
  const progressFill = document.getElementById("progressFill");

  bulkSection.style.display = "none";
  bulkProgress.style.display = "block";

  let successCount = 0;
  let failCount = 0;

  // Use adminTab as targetTab
  const targetTab = adminTab;

  if (!targetTab) {
    showToast("❌ admin.pepu.kرد تاب نەدۆزرایەوە", "error");
    bulkProgress.style.display = "none";
    bulkCreateInProgress = false;
    return;
  }

  console.log("[Bulk Create] Target tab:", targetTab.url);

  // === Get admin unit ID from the form (always read current selection) ===
  console.log("[Bulk Create] Getting admin unit from form...");
  const unitResult = await chrome.scripting.executeScript({
    target: { tabId: targetTab.id },
    func: () => {
      const unitSelect = document.querySelector('select[name="Question.UnitId"]');
      if (!unitSelect) return null;
      // Get current value
      const currentValue = unitSelect.value;
      if (currentValue && currentValue !== "") {
        return currentValue;
      }
      // Get first valid unit option
      const firstOption = Array.from(unitSelect.options).find(opt =>
        opt.value && opt.value !== ""
      );
      return firstOption?.value || null;
    }
  });

  const adminUnitId = unitResult?.[0]?.result;
  console.log("[Bulk Create] Admin unit from form:", adminUnitId);

  // Validate we have an admin unit ID (required for saving)
  if (!adminUnitId || adminUnitId === "") {
    bulkProgress.style.display = "none";
    bulkCreateInProgress = false;
    showToast("❌ تکایە لە فۆڕمی admin.pepu.krd یەکەیەک هەڵبژێرە!", "error");
    return;
  }

  console.log("[Bulk Create] Using adminUnitId:", adminUnitId, "for saving");
  console.log("[Bulk Create] Our unitId (for filter):", state.unitId);

  for (let i = 0; i < selectedQuestions.length; i++) {
    const q = selectedQuestions[i];
    const card = document.querySelector(`.q-checkbox[data-id="${q.id}"]`)?.closest(".q-card");

    // Update progress
    progressText.textContent = `دروستکردنی پرسیار ${i + 1} لە ${selectedQuestions.length}...`;
    progressCount.textContent = `${i + 1}/${selectedQuestions.length}`;
    progressFill.style.width = `${((i + 1) / selectedQuestions.length) * 100}%`;

    // Mark card as processing
    card?.classList.add("bulk-processing");

    try {
      console.log(`[Bulk Create] Processing question ${i + 1}:`, q.id);
      console.log("[Bulk Create] Question text:", q.questionText?.slice(0, 50));
      console.log("[Bulk Create] Options:", q.options);

      // FIRST: Set the admin unit dropdown (required for saving)
      // Wait for page to be ready if this isn't the first question
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const setUnitResult = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: (unitId) => {
          const unitSelect = document.querySelector('select[name="Question.UnitId"], select[name="UnitId"], #UnitId');
          if (!unitSelect) {
            console.log("[Bulk Create] Unit dropdown NOT found!");
            return { success: false, error: "Unit dropdown not found" };
          }
          console.log("[Bulk Create] Unit dropdown found, options:", unitSelect.options.length);
          unitSelect.value = unitId;
          unitSelect.dispatchEvent(new Event("change", { bubbles: true }));
          console.log("[Bulk Create] Set unit to:", unitId, "current value after set:", unitSelect.value);
          return { success: true, value: unitSelect.value, options: unitSelect.options.length };
        },
        args: [adminUnitId]
      });

      console.log("[Bulk Create] Set unit result:", setUnitResult?.[0]?.result);

      // If unit setting failed, wait and try again
      if (!setUnitResult?.[0]?.result?.success) {
        console.log("[Bulk Create] Unit set failed, waiting and retrying...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: (unitId) => {
            const unitSelect = document.querySelector('select[name="Question.UnitId"], select[name="UnitId"], #UnitId');
            if (unitSelect) {
              unitSelect.value = unitId;
              unitSelect.dispatchEvent(new Event("change", { bubbles: true }));
              console.log("[Bulk Create] Retry: Set unit to:", unitId);
            }
          },
          args: [adminUnitId]
        });
      }

      // ALSO: Set the term dropdown - use state.adminTermId OR read from form first time
      let termToUse = state.adminTermId;
      if (!termToUse && i === 0) {
        // First question: read term from form if user selected one
        const termResult = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: () => {
            const termSelect = document.querySelector('select[name="Question.TermId"], select[name="TermId"], #TermId');
            return termSelect?.value || "";
          }
        });
        termToUse = termResult?.[0]?.result || "";
        if (termToUse) {
          console.log("[Bulk Create] Got term from form:", termToUse);
          state.adminTermId = termToUse; // Save for subsequent questions
        }
      }

      if (termToUse) {
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: (termId) => {
            const termSelect = document.querySelector('select[name="Question.TermId"], select[name="TermId"], #TermId');
            if (termSelect) {
              termSelect.value = termId;
              termSelect.dispatchEvent(new Event("change", { bubbles: true }));
              console.log("[Bulk Create] Set termId to:", termId);
            }
          },
          args: [termToUse]
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // Log unit/term values before fill
      const beforeFill = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          const unitSelect = document.querySelector('select[name="Question.UnitId"]');
          const termSelect = document.querySelector('select[name="Question.TermId"]');
          return {
            unitValue: unitSelect?.value || "",
            termValue: termSelect?.value || ""
          };
        }
      });
      console.log("[Bulk Create] Before fill - unit:", beforeFill?.[0]?.result?.unitValue, "term:", beforeFill?.[0]?.result?.termValue);

      // THEN: Fill the form using background script
      // Log what we're sending
      console.log("[Bulk Create] Question data:", {
        id: q.id,
        difficulty: q.difficulty,
        difficulty_level: q.difficulty_level,
        unitNumber: q.unit_number || q.unitNumber
      });

      const fillResult = await chrome.runtime.sendMessage({
        type: "FILL_SPECIFIC_TAB",
        tabId: targetTab.id,
        payload: {
          questionId: q.id,
          questionText: q.questionText,
          options: q.options || [],
          correctAnswer: q.correctAnswer || "",
          // Use question's own unit number for auto-selection
          unitNumber: q.unit_number || q.unitNumber || undefined,
          unitId: q.unit_id || q.unitId || undefined,
          unitNameKu: q.unit_name_ku || q.unitNameKu || undefined,
          difficulty: q.difficulty || q.difficulty_level || undefined,
          termId: state.adminTermId || q.termId || undefined,
          questionImages: q.questionImages || [],
          choiceImages: q.choiceImages || {},
          bulkCreate: true // Flag to skip term auto-selection (unit uses question's unitNumber)
        }
      });

      console.log("[Bulk Create] Fill result:", fillResult);
      console.log("[Bulk Create] Fill OK?:", fillResult?.ok);
      console.log("[Bulk Create] Fields filled:", fillResult?.filled);

      // Log unit/term values after fill
      const afterFill = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          const unitSelect = document.querySelector('select[name="Question.UnitId"]');
          const termSelect = document.querySelector('select[name="Question.TermId"]');
          return {
            unitValue: unitSelect?.value || "",
            termValue: termSelect?.value || ""
          };
        }
      });
      console.log("[Bulk Create] After fill - unit:", afterFill?.[0]?.result?.unitValue, "term:", afterFill?.[0]?.result?.termValue);

      if (!fillResult?.ok) {
        console.error("[Bulk Create] Fill failed:", fillResult);
        failCount++;
        card?.classList.remove("bulk-processing");
        showToast(`❌ پرسیار ${i + 1}: ${fillResult?.error || "پڕنەبووەوە"}`, "error");
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      // Wait for form to be filled
      await new Promise(resolve => setTimeout(resolve, 800));

      // === Verify unit is set before submitting ===
      const unitCheck = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          const unitSelect = document.querySelector('select[name="Question.UnitId"], select[name="UnitId"], #UnitId');
          if (!unitSelect) return { ok: false, error: "Unit dropdown not found" };
          const currentValue = unitSelect.value;
          const selectedText = unitSelect.options[unitSelect.selectedIndex]?.text || "";
          return {
            ok: currentValue && currentValue !== "",
            currentValue,
            selectedText
          };
        }
      });

      console.log("[Bulk Create] Unit check:", unitCheck?.[0]?.result);
      if (!unitCheck?.[0]?.result?.ok) {
        console.error("[Bulk Create] Unit validation failed!");
        showToast(`❌ Unit not selected!`, "error");
        failCount++;
        card?.classList.remove("bulk-processing");
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      // === Verify term is set if adminTermId is selected ===
      if (state.adminTermId) {
        const termCheck = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: (expectedTerm) => {
            const termSelect = document.querySelector('select[name="Question.TermId"], select[name="TermId"], #TermId');
            if (!termSelect) return { ok: false, error: "Term dropdown not found" };
            const currentValue = termSelect.value;
            const isValid = currentValue && currentValue !== "";
            if (!isValid || currentValue !== expectedTerm) {
              // Try to set it again
              termSelect.value = expectedTerm;
              termSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return {
              ok: currentValue && currentValue !== "" && currentValue === expectedTerm,
              currentValue,
              expectedTerm
            };
          },
          args: [state.adminTermId]
        });

        console.log("[Bulk Create] Term check:", termCheck?.[0]?.result);
        if (!termCheck?.[0]?.result?.ok) {
          console.warn("[Bulk Create] Term validation failed, but continuing...");
        }
      }

      // Click the save button using injected script - try multiple methods
      console.log("[Bulk Create] Attempting to submit form...");

      // First, let's check what's in the form before submitting
      const formCheck = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          const form = document.querySelector('form');
          if (!form) return { error: "No form found" };

          // Get form action and method
          const action = form.action;
          const method = form.method;

          // Get some field values to verify they're filled
          const questionText = document.querySelector('textarea[name*="question"], textarea[name*="Question"]')?.value?.slice(0, 50) || "empty";
          const options = Array.from(document.querySelectorAll('textarea[name*="Choice"], textarea[name*="choice"]'))
            .map(t => t.value?.slice(0, 30) || "empty");

          return {
            action,
            method,
            questionText,
            options,
            formAction: action,
            hasCsrf: !!document.querySelector('input[name*="csrf"], input[name*="token"], meta[name="csrf-token"]')
          };
        }
      });

      console.log("[Bulk Create] Form check BEFORE submit:", formCheck);

      const saveClicked = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          console.log("[Submit] Looking for save button...");

          // Find all buttons
          const buttons = Array.from(document.querySelectorAll('button'));
          console.log("[Submit] All buttons:", buttons.map(b => ({text: b.textContent?.slice(0, 30), formaction: b.getAttribute('formaction')})));

          // Find the save button by text "پاشەکەوت"
          const saveBtn = buttons.find(b => b.textContent?.includes('پاشەکەوت'));

          if (!saveBtn) {
            console.error("[Submit] Save button not found!");
            return { ok: false, error: "Save button not found" };
          }

          console.log("[Submit] Found save button:", saveBtn.textContent, saveBtn.outerHTML.slice(0, 200));

          // Use a direct approach - focus then click
          saveBtn.focus();
          saveBtn.click();

          // Also try to dispatch click on the button
          setTimeout(() => {
            saveBtn.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            }));
          }, 100);

          return { ok: true, method: "button.focus+click", buttonText: saveBtn.textContent };
        }
      });

      console.log("[Bulk Create] Save click result:", saveClicked);

      if (saveClicked?.[0]?.result?.ok) {
        showToast(`✓ پرسیار ${i + 1} پڕکرایەوە - save دەکرێت...`, "success");

        // Wait for page navigation (URL change)
        const originalUrl = targetTab.url;
        let waited = 0;
        const maxWait = 10000; // 10 seconds max

        while (waited < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 500));
          waited += 500;

          const currentTab = await chrome.tabs.get(targetTab.id);
          if (currentTab.url !== originalUrl) {
            console.log("[Bulk Create] Page navigated to:", currentTab.url);
            successCount++;
            card?.classList.remove("bulk-processing");
            card?.classList.add("bulk-done");

            // Uncheck completed question
            state.selectedQuestions.delete(q.id);
            const checkbox = card?.querySelector(".q-checkbox");
            if (checkbox) checkbox.checked = false;

            // Navigate back to edit page for next question
            await new Promise(resolve => setTimeout(resolve, 1000));
            await chrome.tabs.update(targetTab.id, { url: editUrl });

            // Wait for the page to be ready - check if unit dropdown exists
            let pageReady = false;
            for (let attempts = 0; attempts < 20; attempts++) {
              await new Promise(resolve => setTimeout(resolve, 500));
              const readyCheck = await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                func: () => {
                  const unitSelect = document.querySelector('select[name="Question.UnitId"]');
                  const questionTextarea = document.querySelector('textarea[name="Question.Content"]');
                  return {
                    hasUnitSelect: !!unitSelect,
                    hasQuestionTextarea: !!questionTextarea,
                    unitOptions: unitSelect ? Array.from(unitSelect.options).length : 0
                  };
                }
              });
              const ready = readyCheck?.[0]?.result;
              if (ready?.hasUnitSelect && ready?.hasQuestionTextarea && ready?.unitOptions > 1) {
                console.log("[Bulk Create] Page is ready! unitOptions:", ready.unitOptions);
                pageReady = true;
                break;
              }
              console.log("[Bulk Create] Waiting for page... attempt", attempts + 1);
            }

            if (!pageReady) {
              console.warn("[Bulk Create] Page might not be fully ready, continuing anyway...");
            }

            break;
          }
        }

        if (waited >= maxWait) {
          console.log("[Bulk Create] Timeout waiting for navigation");
          failCount++;
          card?.classList.remove("bulk-processing");
        }
      } else {
        failCount++;
        card?.classList.remove("bulk-processing");
        showToast(`❌ Save button نەدۆزرایەوە`, "error");
      }

    } catch (e) {
      console.error("[Bulk Create] Error for question", q.id, e);
      failCount++;
      card?.classList.remove("bulk-processing");
      showToast(`❌ پرسیار ${i + 1}: ${e instanceof Error ? e.message : "هەڵە"}`, "error");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Hide progress, show result
  bulkProgress.style.display = "none";
  updateBulkUI();

  if (successCount === selectedQuestions.length) {
    showToast(`✅ تەواو بوو! ${successCount} پرسیار دروستکرا`, "success");
  } else if (successCount > 0) {
    showToast(`⚠️ ${successCount} سەرکەوتوو، ${failCount} سەرنەکەوتوو`, "success");
  } else {
    showToast(`❌ هەڵە! هیچ پرسیارێک نەدروستکرا`, "error");
  }

  bulkCreateInProgress = false;
  console.log("[Bulk Create] Finished. Success:", successCount, "Failed:", failCount);
}

async function loadSubjects() {
  const data = await apiFetch("/extension/subjects");
  return data.subjects || [];
}

async function loadUnitsFromForm() {
  try {
    const tabs = await chrome.tabs.query({});
    const adminTab = tabs.find(t =>
      t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd"))
    );

    if (adminTab) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: adminTab.id },
        func: () => {
          // Try multiple selectors to find the unit dropdown
          const unitSelect =
            document.querySelector('select[name="Question.UnitId"]') ||
            document.querySelector('select[name="UnitId"]') ||
            document.querySelector('#UnitId') ||
            document.querySelector('select[id*="unit" i]') ||
            document.querySelector('select[name*="unit" i]');

          if (!unitSelect) {
            console.log("[loadUnitsFromForm] Unit dropdown not found");
            return [];
          }

          console.log("[loadUnitsFromForm] Found unit dropdown:", unitSelect.name, unitSelect.id);

          return Array.from(unitSelect.options).map(opt => ({
            value: opt.value,
            label: opt.textContent?.trim() || opt.value || "Unknown"
          })).filter(u => u.value && u.value !== "" && parseInt(u.value) > 0);
        },
      });
      if (results && results[0] && results[0].result) {
        console.log("[loadUnitsFromForm] Loaded units:", results[0].result);
        return results[0].result;
      }
    }
  } catch (e) {
    console.log("Could not fetch units from form:", e);
  }
  return [];
}

/**
 * Load terms from the admin panel's TermId dropdown
 */
async function loadTermsFromForm() {
  try {
    const tabs = await chrome.tabs.query({});
    const adminTab = tabs.find(t =>
      t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd"))
    );

    if (adminTab) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: adminTab.id },
        func: () => {
          // Try multiple selectors for term dropdown
          const termSelect =
            document.querySelector('select[name="Question.TermId"]') ||
            document.querySelector('select[name="TermId"]') ||
            document.querySelector('#TermId') ||
            document.querySelector('select[id*="term" i]') ||
            document.querySelector('select[name*="term" i]');

          if (!termSelect) {
            console.log("[loadTermsFromForm] Term dropdown not found");
            return [];
          }

          console.log("[loadTermsFromForm] Found term dropdown:", termSelect.name, termSelect.id);

          return Array.from(termSelect.options).map(opt => ({
            value: opt.value,
            label: opt.textContent?.trim() || opt.value || "Unknown"
          })).filter(t => t.value && t.value !== "" && parseInt(t.value) > 0);
        },
      });
      if (results && results[0] && results[0].result) {
        console.log("[loadTermsFromForm] Loaded terms:", results[0].result);
        return results[0].result;
      }
    }
  } catch (e) {
    console.log("Could not fetch terms from form:", e);
  }
  return [];
}

/**
 * Assign random difficulty to questions
 * - Approximately 5 hard questions (0.7 or 1.0) per subject
 * - Rest are easy/medium (0.1, 0.3, or 0.5)
 */
function assignDifficultyToQuestions(questions) {
  const bySubject = {};
  questions.forEach(q => {
    const key = q.subjectId || "unknown";
    if (!bySubject[key]) bySubject[key] = [];
    bySubject[key].push(q);
  });

  const difficulties = [0.1, 0.3, 0.5, 0.7, 1.0];

  Object.keys(bySubject).forEach(subjectId => {
    const subjectQuestions = bySubject[subjectId];
    // Calculate hard count: min(5, 1/3 of questions)
    const hardCount = Math.min(5, Math.floor(subjectQuestions.length / 3));

    // Shuffle questions for random assignment
    const shuffled = [...subjectQuestions].sort(() => Math.random() - 0.5);

    // Assign hard difficulty to first batch
    shuffled.slice(0, hardCount).forEach(q => {
      q.difficulty = Math.random() > 0.5 ? 0.7 : 1.0;
      q.difficulty_level = q.difficulty; // Also set alternative field name
    });

    // Assign easy/medium to rest (0.1, 0.3, or 0.5)
    shuffled.slice(hardCount).forEach(q => {
      q.difficulty = difficulties[Math.floor(Math.random() * 3)];
      q.difficulty_level = q.difficulty; // Also set alternative field name
    });
  });

  console.log("[assignDifficultyToQuestions] Assigned difficulties:",
    questions.map(q => ({ id: q.id, difficulty: q.difficulty }))
  );
  return questions;
}

// Load units from API (our units)
async function loadUnitsFromApi(subjectId) {
  if (!subjectId) return [];

  const params = new URLSearchParams({ subjectId });
  const data = await apiFetch(`/rag/units?${params}`);
  return (data.units || []).map(u => ({
    value: u.id,
    label: `${u.unit_number} — ${u.name_ku || u.name}`
  }));
}

// Load terms from API (our terms)
async function loadQuestions() {
  const params = new URLSearchParams();
  if (state.examYear && state.examYear !== ALL) params.set("examYear", state.examYear);
  if (state.examPeriod && state.examPeriod !== ALL) params.set("examPeriod", state.examPeriod);
  const qs = params.toString();
  const path = `/extension/subjects/${state.subjectId}/questions${qs ? "?" + qs : ""}`;
  const data = await apiFetch(path);
  let questions = data.questions || [];

  // Client-side filter by our unitId
  if (state.unitId) {
    questions = questions.filter(q =>
      q.unitId === state.unitId || q.unitId2 === state.unitId ||
      q.unit_id === state.unitId
    );
  }

  // Assign random difficulty to questions if they don't have it
  questions = assignDifficultyToQuestions(questions);

  // Log questions with images
  const withImages = questions.filter(q => (q.questionImages?.length ?? 0) > 0);
  console.log('[LoadQuestions] Questions with images:', withImages.map(q => ({number: q.questionNumber, images: q.questionImages?.length})));

  return questions;
}

async function refreshQuestions() {
  if (!state.subjectId) {
    state.questions = [];
    renderQuestions();
    return;
  }
  try {
    state.questions = await loadQuestions();
    renderQuestions();
  } catch (e) {
    console.error("Failed to load questions:", e);
    state.questions = [];
    renderQuestions();
  }
}

async function init() {
  // Debug log - confirm init is running
  console.log('[INIT] Extension initializing at', new Date().toISOString());

  // Visual indicator - update count label to confirm
  const countLabel = document.getElementById("countLabel");
  if (countLabel) {
    countLabel.textContent = countLabel.textContent + " ✅";
  }

  // Setup settings link
  const tabs = await chrome.tabs.query({});
  const adminTab = tabs.find(t => t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd")));
  const hostname = adminTab ? new URL(adminTab.url).hostname : "admin.pepu.krd";
  const optsUrl = chrome.runtime.getURL("options.html") + (hostname ? `?host=${encodeURIComponent(hostname)}` : "");
  document.getElementById("optsLink").href = optsUrl;

  // AUTO-CONFIGURE SELECTORS for admin.pepu.krd
  if (hostname === "admin.pepu.krd" || hostname === "www.admin.pepu.krd") {
    const selectorConfig = {
      questionSelector: 'textarea[name="Question.Content"], #question-content',
      optionSelectors: [
        'textarea[name="Question.Choices[0].Content"]',
        'textarea[name="Question.Choices[1].Content"]',
        'textarea[name="Question.Choices[2].Content"]',
        'textarea[name="Question.Choices[3].Content"]'
      ],
      correctAnswerSelector: 'input[name="Question.CorrectAnswer"]',
      correctAnswerCheckboxSelectors: [
        'input[name="Question.Choices[0].IsCorrect"]',
        'input[name="Question.Choices[1].IsCorrect"]',
        'input[name="Question.Choices[2].IsCorrect"]',
        'input[name="Question.Choices[3].IsCorrect"]'
      ]
    };

    // Save to storage
    await chrome.storage.local.set({
      papuExt_mapping: {
        "admin.pepu.krd": selectorConfig,
        "www.admin.pepu.krd": selectorConfig
      }
    });
    console.log("[Init] Auto-configured selectors for admin.pepu.krd");
  }

  // Load subjects
  try {
    state.subjects = await loadSubjects();
    fillSelect(
      document.getElementById("filterSubject"),
      [{ value: "", label: "بابەت هەڵبژێرە" }, ...state.subjects.map((s) => ({ value: s.id, label: s.nameKu || s.name }))],
      false
    );
    fillSelect(document.getElementById("filterYear"), [ALL, ...getExamYears()], false);
    fillSelect(
      document.getElementById("filterPeriod"),
      [{ value: "", label: "هەموو" }, ...EXAM_PERIODS.filter((p) => p.value)],
      false
    );
    fillSelect(document.getElementById("filterUnit"), [{ value: "", label: "هەڵبژێرە بەند" }], false);
  } catch (e) {
    console.error("Failed to load subjects:", e);
  }

  // Load admin terms from form (for uploading)
  try {
    const adminTerms = await loadTermsFromForm();
    if (adminTerms.length > 0) {
      fillSelect(
        document.getElementById("filterAdminTerm"),
        [{ value: "", label: "هەڵبژێرە خول" }, ...adminTerms],
        false
      );
    }
  } catch (e) {
    console.log("Failed to load admin terms from form:", e);
  }
  // Always show admin term filter (like admin units)
  document.getElementById("adminTermFilterWrapper").style.display = "flex";

  // Initialize admin term filter (will be populated from admin panel form)
  fillSelect(
    document.getElementById("filterAdminTerm"),
    [{ value: "", label: "هەڵبژێرە خول" }],
    false
  );

  // Always show unit filters
  document.getElementById("unitFilterWrapper").style.display = "flex";

  // Event listeners
  document.getElementById("filterSubject").addEventListener("change", async (e) => {
    state.subjectId = e.target.value;
    state.unitId = "";
    // Load our units from API when subject changes
    const units = await loadUnitsFromApi(state.subjectId);
    fillSelect(
      document.getElementById("filterUnit"),
      [{ value: "", label: "هەڵبژێرە بەند" }, ...units],
      false
    );
    refreshQuestions();
  });

  document.getElementById("filterYear").addEventListener("change", (e) => {
    state.examYear = e.target.value;
    refreshQuestions();
  });

  document.getElementById("filterPeriod").addEventListener("change", (e) => {
    state.examPeriod = e.target.value;
    refreshQuestions();
  });

  document.getElementById("filterUnit").addEventListener("change", async (e) => {
    state.unitId = e.target.value;
    refreshQuestions();
  });

  // Admin term filter - for uploading (syncs to admin panel form)
  document.getElementById("filterAdminTerm").addEventListener("change", async (e) => {
    state.adminTermId = e.target.value;
    // Sync to admin.pepu.krd form
    if (e.target.value) {
      try {
        const tabs = await chrome.tabs.query({});
        const adminTab = tabs.find(t =>
          t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd"))
        );
        if (adminTab) {
          await chrome.scripting.executeScript({
            target: { tabId: adminTab.id },
            func: (termId) => {
              const termSelect = document.querySelector('select[name="Question.TermId"]');
              if (termSelect) {
                termSelect.value = termId;
                termSelect.dispatchEvent(new Event("change", { bubbles: true }));
              }
            },
            args: [e.target.value]
          });
        }
      } catch (err) {
        console.log("Failed to sync admin term:", err);
      }
    }
  });

  document.getElementById("searchInput").addEventListener("input", renderQuestions);

  // Bulk create button
  document.getElementById("bulkCreateBtn").addEventListener("click", bulkCreate);

  // Clear selection button
  document.getElementById("clearSelectionBtn").addEventListener("click", clearSelections);

  // Select all button
  document.getElementById("selectAllBtn").addEventListener("click", toggleSelectAll);

  // Test connection button
  document.getElementById("testConnBtn").addEventListener("click", async () => {
    const btn = document.getElementById("testConnBtn");
    const originalText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      const response = await chrome.runtime.sendMessage({ type: "PING" });
      if (response?.pong) {
        btn.textContent = "✓ Connected!";
        console.log("[TestConn] Background script is responding");
        showToast("✓ Background script connected", "success");
      } else {
        btn.textContent = "✗ No response";
        console.error("[TestConn] Background did not respond with pong");
        showToast("Background script not responding", "error");
      }
    } catch (e) {
      btn.textContent = "✗ Error";
      console.error("[TestConn] Connection error:", e);
      showToast("Connection error: " + e.message, "error");
    }
    setTimeout(() => { btn.textContent = originalText; }, 2000);
  });

  document.getElementById("refreshTermsBtn").addEventListener("click", async () => {
    const btn = document.getElementById("refreshTermsBtn");
    const originalText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      const terms = await loadTermsFromForm();
      fillSelect(
        document.getElementById("filterAdminTerm"),
        [{ value: "", label: "هەڵبژێرە خول" }, ...terms],
        false
      );
      btn.textContent = "✓ Done!";
      setTimeout(() => { btn.textContent = originalText; }, 1500);
    } catch (e) {
      btn.textContent = "Error!";
      setTimeout(() => { btn.textContent = originalText; }, 1500);
    }
  });
}

init();
