/** Papu extension — Full question browser tab */

const API_URL = "https://pepumangment-backend.danabestun.dev/api";
const ALL = "__all__";

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

let state = {
  subjects: [],
  questions: [],
  subjectId: "",
  examYear: "",
  examPeriod: "",
  unitId: "",
  selectedQuestions: new Set(), // Track selected question IDs for bulk create
  questionImages: [], // Store uploaded question image URLs
  choiceImages: {} // Store uploaded choice image URLs: {0: url, 1: url, ...}
};

// Track filled question temporarily (for green flash effect)
let filledQuestionId = null;

// Track bulk create state
let bulkCreateInProgress = false;

async function apiFetch(path) {
  const fullUrl = `${API_URL}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(fullUrl, { credentials: "omit" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/**
 * Upload an image file to the server and return the URL
 */
async function uploadImage(file) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      const base64 = reader.result;
      try {
        const res = await fetch(`${API_URL}/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: base64 }),
        });
        const data = await res.json();
        if (data.url) {
          resolve(data.url);
        } else {
          reject(new Error(data.error || "Upload failed"));
        }
      } catch (e) {
        reject(e);
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
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!q) return state.questions;
  return state.questions.filter((item) =>
    (item.questionText || "").toLowerCase().includes(q)
  );
}

async function fillActive(payload, cardElement) {
  try {
    const tabs = await chrome.tabs.query({});
    const targetTab = tabs.find(t =>
      t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd"))
    );

    if (!targetTab) {
      showToast("admin.pepu.krd تاب نەدۆزرایەوە", "error");
      return { ok: false, error: "Tab not found" };
    }

    // Include current state's question images and choice images
    const enrichedPayload = {
      ...payload,
      questionImages: state.questionImages,
      choiceImages: state.choiceImages
    };

    const res = await chrome.runtime.sendMessage({
      type: "FILL_SPECIFIC_TAB",
      tabId: targetTab.id,
      payload: enrichedPayload
    });

    if (res?.ok) {
      showToast("✓ پڕکرایەوە!", "success");
      // Toggle green - if green, remove it; if not green, add it
      if (cardElement) {
        cardElement.classList.toggle("filled");
      }
    } else {
      showToast(res?.error || "هەڵە", "error");
    }
    return res;
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

  if (items.length === 0) {
    container.innerHTML = `<p class="empty">هیچ پرسیارێک نەدۆزرایەوە.</p>`;
    return;
  }

  items.forEach((q) => {
    // Debug: log choice images from backend
    console.log('[Browser] Question', q.id, 'choiceImages:', q.choiceImages, 'keys:', Object.keys(q.choiceImages || {}));

    const card = document.createElement("div");
    card.className = "q-card";
    if (state.selectedQuestions.has(q.id)) {
      card.classList.add("selected");
    }

    const unitLabel = q.unitNameKu || (q.unitNumber ? `بەند ${q.unitNumber}` : "");
    const yearLabel = q.examYear || "";
    const isSelected = state.selectedQuestions.has(q.id);
    const hasQuestionImages = (q.questionImages?.length ?? 0) > 0;
    const hasChoiceImages = Object.keys(q.choiceImages ?? {}).length > 0;

    card.innerHTML = `
      <input type="checkbox" class="q-checkbox" data-id="${q.id}" ${isSelected ? "checked" : ""}>
      <div class="q-header">
        <span class="q-number">#${q.questionNumber}</span>
        <div class="q-meta">
          ${unitLabel ? `<span class="q-unit">${escapeHtml(unitLabel)}</span>` : ""}
          ${yearLabel ? `<span class="q-year">${yearLabel}</span>` : ""}
          ${hasQuestionImages ? `<span class="q-images">🖼️ ${q.questionImages?.length || 0}</span>` : ""}
          ${hasChoiceImages ? `<span class="q-images">🖼️ ${Object.keys(q.choiceImages || {}).length}</span>` : ""}
        </div>
      </div>
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
      await fillActive({
        questionId: q.id,
        questionText: q.questionText,
        options: q.options || [],
        correctAnswer: q.correctAnswer || "",
        unitId: state.unitId || undefined,  // Include selected unit
        choiceImages: q.choiceImages  // Include choice images
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

// Bulk create questions
async function bulkCreate() {
  if (state.selectedQuestions.size === 0 || bulkCreateInProgress) return;

  bulkCreateInProgress = true;
  const selectedIds = Array.from(state.selectedQuestions);
  const selectedQuestions = state.questions.filter(q => state.selectedQuestions.has(q.id));

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

  // Find target tab once
  const tabs = await chrome.tabs.query({});
  const targetTab = tabs.find(t =>
    t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd"))
  );

  if (!targetTab) {
    showToast("❌ admin.pepu.kرد تاب نەدۆزرایەوە", "error");
    bulkProgress.style.display = "none";
    bulkCreateInProgress = false;
    return;
  }

  console.log("[Bulk Create] Target tab:", targetTab.url);

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

      // FIRST: Set the unit dropdown (if a unit is selected)
      if (state.unitId) {
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: (unitId) => {
            const unitSelect = document.querySelector('select[name="Question.UnitId"], select[name="UnitId"], #UnitId');
            if (unitSelect) {
              unitSelect.value = unitId;
              unitSelect.dispatchEvent(new Event("change", { bubbles: true }));
              console.log("[Bulk Create] Set unit to:", unitId);
            }
          },
          args: [state.unitId]
        });
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // THEN: Fill the form using background script
      const fillResult = await chrome.runtime.sendMessage({
        type: "FILL_SPECIFIC_TAB",
        tabId: targetTab.id,
        payload: {
          questionId: q.id,
          questionText: q.questionText,
          options: q.options || [],
          correctAnswer: q.correctAnswer || "",
          unitId: state.unitId || undefined,  // Include selected unit
          choiceImages: q.choiceImages  // Include choice images
        }
      });

      console.log("[Bulk Create] Fill result:", fillResult);
      console.log("[Bulk Create] Fill OK?:", fillResult?.ok);
      console.log("[Bulk Create] Fields filled:", fillResult?.filled);

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
            await chrome.tabs.update(targetTab.id, {
              url: `https://admin.pepu.krd/Courses/Questions/Edit?courseId=16`
            });
            await new Promise(resolve => setTimeout(resolve, 2000));

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
          const unitSelect = document.querySelector('select[name="Question.UnitId"]');
          if (!unitSelect) return [];
          return Array.from(unitSelect.options).map(opt => ({
            value: opt.value,
            label: opt.textContent || opt.value || "Unknown"
          })).filter(u => u.value && u.value !== "");
        },
      });
      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
    }
  } catch (e) {
    console.log("Could not fetch units from form:", e);
  }
  return [];
}

async function loadQuestions() {
  const params = new URLSearchParams();
  if (state.examYear && state.examYear !== ALL) params.set("examYear", state.examYear);
  if (state.examPeriod && state.examPeriod !== ALL) params.set("examPeriod", state.examPeriod);
  const qs = params.toString();
  const path = `/extension/subjects/${state.subjectId}/questions${qs ? "?" + qs : ""}`;
  const data = await apiFetch(path);
  return data.questions || [];
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

  // Load units from form (optional, don't hide if fails)
  try {
    const units = await loadUnitsFromForm();
    if (units.length > 0) {
      fillSelect(
        document.getElementById("filterUnit"),
        [{ value: "", label: "هەڵبژێرە بەند" }, ...units],
        false
      );
    }
    // Always show unit filter - don't hide it
    document.getElementById("unitFilterWrapper").style.display = "flex";
  } catch (e) {
    console.log("Failed to load units from form:", e);
    // Still show unit filter even if form load fails
    document.getElementById("unitFilterWrapper").style.display = "flex";
  }

  // Event listeners
  document.getElementById("filterSubject").addEventListener("change", async (e) => {
    state.subjectId = e.target.value;
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
            func: (unitId) => {
              const unitSelect = document.querySelector('select[name="Question.UnitId"]');
              if (unitSelect) {
                unitSelect.value = unitId;
                unitSelect.dispatchEvent(new Event("change", { bubbles: true }));
              }
            },
            args: [e.target.value]
          });
        }
      } catch (err) {
        console.log("Failed to sync unit:", err);
      }
    }
  });

  document.getElementById("searchInput").addEventListener("input", renderQuestions);

  // Bulk create button
  document.getElementById("bulkCreateBtn").addEventListener("click", bulkCreate);

  // Clear selection button
  document.getElementById("clearSelectionBtn").addEventListener("click", clearSelections);

  document.getElementById("refreshUnitsBtn").addEventListener("click", async () => {
    const btn = document.getElementById("refreshUnitsBtn");
    const originalText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      const units = await loadUnitsFromForm();
      fillSelect(
        document.getElementById("filterUnit"),
        [{ value: "", label: "هەڵبژێرە بەند" }, ...units],
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
