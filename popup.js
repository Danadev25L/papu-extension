/** Papu extension — fetches questions from API, fills admin.pepu.krd on click */

const PROD_API_URL = "https://pepumangment-backend.danabestun.dev/api";
const LOCAL_API_URL = "http://localhost:3001/api";
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

let state = { subjects: [], questions: [], subjectId: "", examYear: "", examPeriod: "", unitId: "" };
let selectedIndex = -1;

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
      console.log(`[API Popup] Using: ${baseUrl === PROD_API_URL ? "PROD" : "LOCAL"}`);
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

async function getActiveHostname() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  try {
    return { hostname: new URL(url).hostname, tab };
  } catch {
    return { hostname: "", tab };
  }
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

function filteredQuestions() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!q) return state.questions;
  return state.questions.filter((item) =>
    (item.questionText || "").toLowerCase().includes(q)
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderList() {
  const ul = document.getElementById("qList");
  const empty = document.getElementById("emptyHint");
  const fillNextBtn = document.getElementById("fillNextBtn");
  ul.innerHTML = "";
  const items = filteredQuestions();
  if (items.length === 0) {
    empty.hidden = false;
    empty.textContent = state.questions.length === 0
      ? "هیچ پرسیارێک نەدۆزرایەوە. بابەت و ساڵ بپشکنە."
      : "هیچ پرسیارێک بەم گەڕانە نەگەیشت.";
    if (fillNextBtn) fillNextBtn.disabled = true;
    return;
  }
  empty.hidden = true;
  if (selectedIndex >= items.length) selectedIndex = 0;
  if (fillNextBtn) fillNextBtn.disabled = false;
  items.forEach((q, idx) => {
    const li = document.createElement("li");
    li.className = "q-item" + (idx === selectedIndex ? " selected" : "");
    li.dataset.index = String(idx);
    li.dataset.payload = JSON.stringify({
      questionText: q.questionText,
      options: q.options || [],
      correctAnswer: q.correctAnswer || "",
      unitId: q.unitId || q.unitId2 || undefined,
      unitNumber: q.unitNumber || q.unitNumber2 || undefined,
      unitNameKu: q.unitNameKu || undefined,
    });
    li.innerHTML = `<span>#${q.questionNumber}</span> — ${escapeHtml((q.questionText || "").slice(0, 120))}${(q.questionText || "").length > 120 ? "…" : ""}<small>${(q.options || []).length} هەڵبژاردن</small>`;
    li.addEventListener("click", () => {
      selectedIndex = idx;
      renderList();
      fillActive(JSON.parse(li.dataset.payload));
    });
    ul.appendChild(li);
  });
}

async function fillActive(payload) {
  const status = document.getElementById("status");
  status.textContent = "";
  status.style.color = "#86efac";
  try {
    const res = await chrome.runtime.sendMessage({ type: "FILL_ACTIVE_TAB", payload });
    if (res?.ok) status.textContent = "پڕکرایەوە.";
    else status.textContent = res?.error || "هەڵە";
    if (!res?.ok) status.style.color = "#fca5a5";
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : String(e);
    status.style.color = "#fca5a5";
  }
}

async function loadSubjects() {
  const data = await apiFetch("/extension/subjects");
  return data.subjects || [];
}

async function loadUnits(subjectId) {
  if (!subjectId) return [];

  // First, try to fetch units from the admin.pepu.krd form dropdown
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
          if (!unitSelect) return { error: "No dropdown found" };
          const options = Array.from(unitSelect.options).map(opt => ({
            value: opt.value,
            label: opt.textContent || opt.value || "Unknown"
          }));
          return { options, count: options.length };
        },
      });
      if (results && results[0] && results[0].result && results[0].result.options) {
        return results[0].result.options.filter(u => u.value && u.value !== "");
      }
    }
  } catch (e) {
    console.log("Could not fetch units from form:", e);
  }

  // Fallback: fetch from API
  const params = new URLSearchParams({ subjectId });
  const data = await apiFetch(`/rag/units?${params}`);
  return (data.units || []).map(u => ({
    value: u.id,
    label: `${u.unit_number} — ${u.name_ku || u.name}`
  }));
}

async function loadQuestions() {
  const params = new URLSearchParams();
  if (state.examYear && state.examYear !== ALL) params.set("examYear", state.examYear);
  if (state.examPeriod && state.examPeriod !== ALL) params.set("examPeriod", state.examPeriod);
  if (state.unitId) params.set("unitId", state.unitId);
  const qs = params.toString();
  const path = `/extension/subjects/${state.subjectId}/questions${qs ? "?" + qs : ""}`;
  const data = await apiFetch(path);
  return data.questions || [];
}

async function refreshQuestions() {
  const loadErr = document.getElementById("loadErr");
  loadErr.style.display = "none";
  if (!state.subjectId) {
    state.questions = [];
    renderList();
    return;
  }
  try {
    state.questions = await loadQuestions();
    selectedIndex = 0;
    renderList();
  } catch (e) {
    loadErr.textContent = e instanceof Error ? e.message : String(e);
    loadErr.style.display = "block";
    state.questions = [];
    renderList();
  }
}

async function init() {
  const { hostname } = await getActiveHostname();
  document.getElementById("hostLabel").textContent = hostname || "(تابی چالاک نەدۆزرایەوە)";

  const optsUrl = chrome.runtime.getURL("options.html") + (hostname ? `?host=${encodeURIComponent(hostname)}` : "");
  document.getElementById("optsLink").href = optsUrl;
  const configLink = document.getElementById("optsLinkConfig");
  if (configLink) configLink.href = optsUrl;

  const filtersSection = document.getElementById("filtersSection");
  const periodSection = document.getElementById("periodSection");
  const unitSection = document.getElementById("unitSection");
  const apiSection = document.getElementById("apiConfigSection");
  if (apiSection) apiSection.style.display = "none";
  filtersSection.style.display = "grid";
  periodSection.style.display = "grid";
  unitSection.style.display = "none";

  // Subject dropdown
  try {
    state.subjects = await loadSubjects();
    if (state.subjects.length === 0) {
      document.getElementById("loadErr").textContent = "هیچ بابەتێک نییە. داتابەیس بپشکنە.";
      document.getElementById("loadErr").style.display = "block";
      filtersSection.querySelector(".field:last-of-type")?.parentElement?.classList.add("hide");
    } else {
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
    }
  } catch (e) {
    let err = e instanceof Error ? e.message : String(e);
    if (err === "Failed to fetch") err = "Failed to fetch — use Test connection in Options.";
    document.getElementById("loadErr").textContent = err;
    document.getElementById("loadErr").style.display = "block";
    periodSection.style.display = "none";
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
    document.getElementById("unitSection").style.display = units.length ? "grid" : "none";
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

  document.getElementById("filterUnit").addEventListener("change", (e) => {
    state.unitId = e.target.value;
    refreshQuestions();
  });

  document.getElementById("openBrowserBtn").addEventListener("click", async () => {
    const url = chrome.runtime.getURL("browser.html");
    await chrome.tabs.create({ url });
  });

  document.getElementById("searchInput").addEventListener("input", renderList);

  // Listen for sync messages from browser tab
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "BROWSER_FILTERS_APPLIED") {
      const { subjectId, examYear, examPeriod, unitId } = message.filters;
      // Update popup state and filters
      state.subjectId = subjectId;
      state.examYear = examYear;
      state.examPeriod = examPeriod;
      state.unitId = unitId || "";
      // Update dropdown values
      document.getElementById("filterSubject").value = subjectId;
      document.getElementById("filterYear").value = examYear;
      document.getElementById("filterPeriod").value = examPeriod;
      if (unitId) {
        document.getElementById("filterUnit").value = unitId;
      }
      refreshQuestions();
    }
  });

  document.getElementById("fillNextBtn").addEventListener("click", async () => {
    const items = filteredQuestions();
    if (items.length === 0) return;
    const nextIdx = selectedIndex + 1;
    if (nextIdx >= items.length) {
      document.getElementById("status").textContent = "کۆتایی لیستە.";
      return;
    }
    selectedIndex = nextIdx;
    renderList();
    const nextLi = document.querySelector(`#qList .q-item[data-index="${nextIdx}"]`);
    if (nextLi) nextLi.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const q = items[nextIdx];
    await fillActive({
      questionText: q.questionText,
      options: q.options || [],
      correctAnswer: q.correctAnswer || "",
      unitId: q.unitId || q.unitId2 || undefined,
      unitNumber: q.unitNumber || q.unitNumber2 || undefined,
      unitNameKu: q.unitNameKu || undefined,
    });
  });

  // Pre-select first subject if only one
  if (state.subjects.length === 1) {
    state.subjectId = state.subjects[0].id;
    document.getElementById("filterSubject").value = state.subjectId;
    refreshQuestions();
  }

  // Check for filters from browser tab
  const stored = await chrome.storage.local.get(["papu_browser_filters"]);
  if (stored.papu_browser_filters && stored.papu_browser_filters.subjectId) {
    const f = stored.papu_browser_filters;
    // Load units for this subject first
    const units = await loadUnits(f.subjectId);
    fillSelect(
      document.getElementById("filterUnit"),
      [{ value: "", label: "هەموو بەندەکان" }, ...units.map(u => ({
        value: u.id,
        label: `${u.unit_number} — ${u.name_ku || u.name}`
      }))],
      false
    );
    // Apply filters
    state.subjectId = f.subjectId;
    state.examYear = f.examYear || "";
    state.examPeriod = f.examPeriod || "";
    state.unitId = f.unitId || "";
    document.getElementById("filterSubject").value = f.subjectId;
    document.getElementById("filterYear").value = f.examYear || "";
    document.getElementById("filterPeriod").value = f.examPeriod || "";
    if (f.unitId) {
      document.getElementById("filterUnit").value = f.unitId;
    }
    document.getElementById("unitSection").style.display = units.length && f.unitId ? "grid" : "none";
    await refreshQuestions();
    // Clear stored filters after applying
    await chrome.storage.local.remove(["papu_browser_filters"]);
  }
}

init();
