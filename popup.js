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
let selectedIndices = new Set();

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

  const selectAllBtn = document.getElementById("selectAllBtn");
  const fillSelectedBtn = document.getElementById("fillSelectedBtn");
  if (selectAllBtn) selectAllBtn.textContent = selectedIndices.size === items.length ? "پەچەکردن" : "هەڵبژاردنی هەموو";
  if (fillSelectedBtn) {
    fillSelectedBtn.disabled = selectedIndices.size === 0;
    fillSelectedBtn.textContent = selectedIndices.size > 0
      ? `بارکردنی ${selectedIndices.size} پرسیار`
      : "بارکردنی هەڵبژێردراو";
  }
  const clearSelectionBtn = document.getElementById("clearSelectionBtn");
  if (selectAllBtn) selectAllBtn.textContent = selectedIndices.size === items.length ? "پەچەکردن" : "هەڵبژاردنی هەموو";

  items.forEach((q, idx) => {
    const li = document.createElement("li");
    const isSelected = selectedIndices.has(idx) || idx === selectedIndex;
    li.className = "q-item" + (isSelected ? " selected" : "");
    li.dataset.index = String(idx);
    li.dataset.payload = JSON.stringify({
      questionText: q.questionText,
      options: q.options || [],
      correctAnswer: q.correctAnswer || "",
      unitId: q.unitId || q.unitId2 || undefined,
      unitNumber: q.unitNumber || q.unitNumber2 || undefined,
      unitNameKu: q.unitNameKu || undefined,
      adminUnitId: q.adminUnitId || undefined,
      adminUnitName: q.adminUnitName || undefined,
    });
    const checkbox = `<input type="checkbox" class="q-checkbox" ${selectedIndices.has(idx) ? "checked" : ""}>`;
    li.innerHTML = `${checkbox}<span>#${q.questionNumber}</span> — ${escapeHtml((q.questionText || "").slice(0, 120))}${(q.questionText || "").length > 120 ? "…" : ""}<small>${(q.options || []).length} هەڵبژاردن</small>`;
    li.addEventListener("click", (e) => {
      if (e.target.classList.contains("q-checkbox")) {
        if (selectedIndices.has(idx)) {
          selectedIndices.delete(idx);
        } else {
          selectedIndices.add(idx);
        }
      } else {
        selectedIndex = idx;
        fillActive(JSON.parse(li.dataset.payload));
      }
      renderList();
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

// Load units from API (our units)
async function loadUnits(subjectId) {
  if (!subjectId) return [];

  const params = new URLSearchParams({ subjectId });
  const data = await apiFetch(`/rag/units?${params}`);
  return (data.units || []).map(u => ({
    id: u.id,
    value: u.id,
    label: `${u.unit_number} — ${u.name_ku || u.name}`
  }));
}

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

  return questions;
}

async function refreshQuestions() {
  const loadErr = document.getElementById("loadErr");
  loadErr.style.display = "none";
  if (!state.subjectId) {
    state.questions = [];
    selectedIndices.clear();
    renderList();
    return;
  }
  try {
    state.questions = await loadQuestions();
    selectedIndex = 0;
    selectedIndices.clear();
    renderList();
  } catch (e) {
    loadErr.textContent = e instanceof Error ? e.message : String(e);
    loadErr.style.display = "block";
    state.questions = [];
    selectedIndices.clear();
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

    // Load and populate our units (API)
    const units = await loadUnits(state.subjectId);
    fillSelect(
      document.getElementById("filterUnit"),
      [{ value: "", label: "هەموو بەندەکان" }, ...units.map(u => ({
        value: u.id,
        label: u.label
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

  document.getElementById("selectAllBtn").addEventListener("click", () => {
    const items = filteredQuestions();
    if (selectedIndices.size === items.length) {
      // Unselect all if all are selected
      selectedIndices.clear();
    } else {
      // Select all
      for (let i = 0; i < items.length; i++) {
        selectedIndices.add(i);
      }
    }
    renderList();
  });

  document.getElementById("clearSelectionBtn").addEventListener("click", () => {
    selectedIndices.clear();
    renderList();
  });

  document.getElementById("fillSelectedBtn").addEventListener("click", async () => {
    const items = filteredQuestions();
    if (selectedIndices.size === 0) {
      document.getElementById("status").textContent = "هیچ پرسیارێک هەڵنەبژێراوە.";
      document.getElementById("status").style.color = "#fca5a5";
      return;
    }

    const status = document.getElementById("status");
    const indices = Array.from(selectedIndices).sort((a, b) => a - b);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const q = items[idx];
      status.textContent = `بارکردن... ${i + 1}/${indices.length}`;
      status.style.color = "#fbbf24";

      try {
        await fillActive({
          questionText: q.questionText,
          options: q.options || [],
          correctAnswer: q.correctAnswer || "",
          unitId: q.unitId || q.unitId2 || undefined,
          unitNumber: q.unitNumber || q.unitNumber2 || undefined,
          unitNameKu: q.unitNameKu || undefined,
          adminUnitId: q.adminUnitId || undefined,
          adminUnitName: q.adminUnitName || undefined,
        });
        successCount++;

        // Wait between fills to avoid overwhelming the page
        if (i < indices.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (e) {
        failCount++;
        console.error(`Failed to fill question #${q.questionNumber}:`, e);
      }
    }

    status.textContent = `تەواو! ${successCount} سەرکەوتوو، ${failCount} سەرنەکەوتوو`;
    status.style.color = failCount > 0 ? "#fbbf24" : "#86efac";

    // Clear selection after filling
    selectedIndices.clear();
    renderList();
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
      adminUnitId: q.adminUnitId || undefined,
      adminUnitName: q.adminUnitName || undefined,
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
        label: u.label
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
    document.getElementById("unitSection").style.display = units.length ? "grid" : "none";
    await refreshQuestions();
    // Clear stored filters after applying
    await chrome.storage.local.remove(["papu_browser_filters"]);
  }
}

init();
