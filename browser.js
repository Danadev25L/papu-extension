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

async function apiFetch(path) {
  const fullUrl = `${API_URL}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(fullUrl, { credentials: "omit" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function fillSelect(sel, options, includeAll = false) {
  sel.innerHTML = "";
  if (includeAll) {
    const o = document.createElement("option");
    o.value = ALL;
    o.textContent = "هەموو";
    sel.appendChild(o);
  }
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

let lastFilledQuestionId = null;

async function fillActive(payload) {
  try {
    // Find the admin.pepu.krd tab (not this browser page)
    const tabs = await chrome.tabs.query({});
    console.log("All tabs:", tabs.map(t => ({ id: t.id, url: t.url })));
    const targetTab = tabs.find(t =>
      t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd"))
    );

    if (!targetTab) {
      console.error("admin.pepu.krd tab not found");
      return { ok: false, error: "admin.pepu.krd تاب نەدۆزرایەوە. تکایە پەڕەکە بکەرەوە." };
    }

    console.log("Target tab:", targetTab.id, targetTab.url);
    // Send message directly with the target tab ID
    const res = await chrome.runtime.sendMessage({
      type: "FILL_SPECIFIC_TAB",
      tabId: targetTab.id,
      payload
    });
    console.log("Fill result:", res);
    return res;
  } catch (e) {
    console.error("Fill error:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function renderQuestions() {
  const container = document.getElementById("questionsList");
  const countLabel = document.getElementById("countLabel");
  container.innerHTML = "";
  const items = filteredQuestions();
  countLabel.textContent = `${items.length} / ${state.questions.length}`;
  countLabel.title = `${items.length} پرسیاری لیتر (لە کۆی ${state.questions.length})`;

  if (items.length === 0) {
    container.innerHTML = `<p class="empty">هیچ پرسیارێک نەدۆزرایەوە.</p>`;
    return;
  }

  items.forEach((q) => {
    const card = document.createElement("div");
    card.className = "q-card clickable";
    const isLastFilled = lastFilledQuestionId === q.id;
    if (isLastFilled) card.classList.add("last-filled");

    card.innerHTML = `
      <div class="q-content">
        <div class="q-header">
          <span class="q-number">#${q.questionNumber}</span>
          ${q.unitNameKu ? `<span class="q-unit">${escapeHtml(q.unitNameKu)}</span>` : ""}
          ${isLastFilled ? `<span class="q-filled-badge">✓ پڕکرا</span>` : ""}
        </div>
        <p class="q-text">${escapeHtml(q.questionText || "")}</p>
        ${(q.options || []).length > 0 ? `
          <div class="q-options">
            ${(q.options || []).slice(0, 4).map(opt => `<span class="q-opt">${escapeHtml(opt).slice(0, 50)}${opt.length > 50 ? "..." : ""}</span>`).join("")}
          </div>
        ` : ""}
        <button class="fill-btn">پڕکردنەوە</button>
      </div>
    `;

    // Fill button click
    const fillBtn = card.querySelector('.fill-btn');
    fillBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      lastFilledQuestionId = q.id;
      const res = await fillActive({
        questionText: q.questionText,
        options: q.options || [],
        correctAnswer: q.correctAnswer || "",
        unitId: q.unitId || q.unitId2 || undefined,
        unitNumber: q.unitNumber || q.unitNumber2 || undefined,
        unitNameKu: q.unitNameKu || undefined,
      });
      if (res?.ok) {
        fillBtn.textContent = "✓ پڕکرا";
        setTimeout(() => { fillBtn.textContent = "پڕکردنەوە"; }, 1500);
      } else {
        fillBtn.textContent = "هەڵە";
        setTimeout(() => { fillBtn.textContent = "پڕکردنەوە"; }, 2000);
      }
      renderQuestions();
    });

    // Card click also fills
    card.addEventListener("click", async (e) => {
      if (e.target !== fillBtn) {
        lastFilledQuestionId = q.id;
        const res = await fillActive({
          questionText: q.questionText,
          options: q.options || [],
          correctAnswer: q.correctAnswer || "",
          unitId: q.unitId || q.unitId2 || undefined,
          unitNumber: q.unitNumber || q.unitNumber2 || undefined,
          unitNameKu: q.unitNameKu || undefined,
        });
        renderQuestions();
      }
    });

    container.appendChild(card);
  });
}

async function loadSubjects() {
  const data = await apiFetch("/extension/subjects");
  return data.subjects || [];
}

async function loadUnitsFromForm() {
  // Fetch units from the admin.pepu.krd form dropdown
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

async function loadUnits(subjectId) {
  if (!subjectId) return [];
  // Load units from the form dropdown
  return await loadUnitsFromForm();
}

async function loadQuestions() {
  const params = new URLSearchParams();
  if (state.examYear && state.examYear !== ALL) params.set("examYear", state.examYear);
  if (state.examPeriod && state.examPeriod !== ALL) params.set("examPeriod", state.examPeriod);
  if (state.unitId) params.set("unitId", state.unitId);
  const qs = params.toString();
  const path = `/extension/subjects/${state.subjectId}/questions${qs ? "?" + qs : ""}`;
  console.log("Loading questions:", path);
  const data = await apiFetch(path);
  console.log("Loaded questions count:", data.questions?.length || 0);
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

  // Load units from form
  try {
    const units = await loadUnitsFromForm();
    fillSelect(
      document.getElementById("filterUnit"),
      [{ value: "", label: "هەڵبژێرە بەند" }, ...units],
      false
    );
    if (units.length === 0) {
      document.getElementById("unitFilterWrapper").style.display = "none";
    }
  } catch (e) {
    console.log("Failed to load units:", e);
  }

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
    fillSelect(document.getElementById("filterUnit"), [{ value: "", label: "هەموو بەندەکان" }], false);
  } catch (e) {
    console.error("Failed to load subjects:", e);
  }

  document.getElementById("filterSubject").addEventListener("change", async (e) => {
    state.subjectId = e.target.value;
    state.unitId = "";
    // Load and populate units
    const units = await loadUnits(state.subjectId);
    fillSelect(
      document.getElementById("filterUnit"),
      [{ value: "", label: "هەموو بەندەکان" }, ...units.map(u => ({
        value: u.id,
        label: `${u.unit_number} — ${u.name_ku || u.name}`
      }))],
      false
    );
    // Show/hide unit filter based on whether units exist
    document.getElementById("unitFilterWrapper").style.display = units.length ? "block" : "none";
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
    const selectedValue = e.target.value;
    console.log("Unit selected in UI:", selectedValue);

    // Sync to admin.pepu.krd form
    if (selectedValue) {
      try {
        const tabs = await chrome.tabs.query({});
        console.log("All tabs:", tabs.map(t => ({ id: t.id, url: t.url })));
        const adminTab = tabs.find(t =>
          t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd"))
        );
        console.log("Admin tab:", adminTab);
        if (adminTab) {
          const result = await chrome.scripting.executeScript({
            target: { tabId: adminTab.id },
            func: (unitId) => {
              const unitSelect = document.querySelector('select[name="Question.UnitId"]');
              console.log("Unit select found:", unitSelect);
              if (unitSelect) {
                console.log("Setting to:", unitId);
                unitSelect.value = unitId;
                unitSelect.dispatchEvent(new Event("change", { bubbles: true }));
                console.log("New value:", unitSelect.value);
                return { success: true, newValue: unitSelect.value };
              }
              return { success: false, error: "No select found" };
            },
            args: [selectedValue]
          });
          console.log("Sync result:", result);
        } else {
          console.log("No admin tab found");
        }
      } catch (err) {
        console.log("Failed to sync unit:", err);
      }
    }
  });

  // Refresh units from form button
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
        document.getElementById("unitFilterWrapper").style.display = "block";
      }
      btn.textContent = "✓ Done!";
      setTimeout(() => { btn.textContent = originalText; }, 1500);
    } catch (e) {
      btn.textContent = "Error!";
      setTimeout(() => { btn.textContent = originalText; }, 1500);
    }
  });

  document.getElementById("searchInput").addEventListener("input", renderQuestions);
}

init();
