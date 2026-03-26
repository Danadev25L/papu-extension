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
  unitId: ""
};

// Track filled question temporarily (for green flash effect)
let filledQuestionId = null;

async function apiFetch(path) {
  const fullUrl = `${API_URL}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(fullUrl, { credentials: "omit" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
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

    const res = await chrome.runtime.sendMessage({
      type: "FILL_SPECIFIC_TAB",
      tabId: targetTab.id,
      payload
    });

    if (res?.ok) {
      showToast("✓ پڕکرایەوە!", "success");
      // Show green temporarily
      if (cardElement) {
        cardElement.classList.add("filled");
        setTimeout(() => {
          cardElement.classList.remove("filled");
        }, 1500);
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
    const card = document.createElement("div");
    card.className = "q-card";

    const unitLabel = q.unitNameKu || (q.unitNumber ? `بەند ${q.unitNumber}` : "");
    const yearLabel = q.examYear || "";

    card.innerHTML = `
      <div class="q-header">
        <span class="q-number">#${q.questionNumber}</span>
        <div class="q-meta">
          ${unitLabel ? `<span class="q-unit">${escapeHtml(unitLabel)}</span>` : ""}
          ${yearLabel ? `<span class="q-year">${yearLabel}</span>` : ""}
        </div>
      </div>
      <p class="q-text">${escapeHtml((q.questionText || "").slice(0, 200))}${(q.questionText || "").length > 200 ? "..." : ""}</p>
      ${(q.options || []).length > 0 ? `
        <div class="q-options">
          ${(q.options || []).slice(0, 4).map(opt => `<span class="q-opt">${escapeHtml(opt).slice(0, 40)}${opt.length > 40 ? "..." : ""}</span>`).join("")}
        </div>
      ` : ""}
    `;

    // Click to fill (shows green temporarily, then back to normal)
    card.addEventListener("click", async () => {
      await fillActive({
        questionId: q.id,
        questionText: q.questionText,
        options: q.options || [],
        correctAnswer: q.correctAnswer || "",
      }, card);
    });

    container.appendChild(card);
  });
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

  // Load units from form
  try {
    const units = await loadUnitsFromForm();
    if (units.length > 0) {
      fillSelect(
        document.getElementById("filterUnit"),
        [{ value: "", label: "هەڵبژێرە بەند" }, ...units],
        false
      );
    } else {
      document.getElementById("unitFilterWrapper").style.display = "none";
    }
  } catch (e) {
    console.log("Failed to load units:", e);
    document.getElementById("unitFilterWrapper").style.display = "none";
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
      if (units.length > 0) {
        document.getElementById("unitFilterWrapper").style.display = "flex";
      }
      btn.textContent = "✓ Done!";
      setTimeout(() => { btn.textContent = originalText; }, 1500);
    } catch (e) {
      btn.textContent = "Error!";
      setTimeout(() => { btn.textContent = originalText; }, 1500);
    }
  });
}

init();
