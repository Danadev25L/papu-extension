/** @typedef {{ questionSelector: string; optionSelectors: string[]; correctAnswerSelector?: string | null; correctAnswerCheckboxSelectors?: string[] }} HostMapping */

const STORAGE_KEY = "papuExt_mapping";
const API_URL = "https://pepumangment-backend.danabestun.dev/api";

function $(id) {
  return document.getElementById(id);
}

async function getMapping() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  return data[STORAGE_KEY] && typeof data[STORAGE_KEY] === "object" ? data[STORAGE_KEY] : {};
}

async function setMapping(obj) {
  await chrome.storage.local.set({ [STORAGE_KEY]: obj });
}

function validateEntry(entry) {
  if (!entry || typeof entry !== "object") return "Invalid entry";
  const qs = String(entry.questionSelector || "").trim();
  const opts = entry.optionSelectors;
  if (!qs) return "questionSelector is required";
  if (!Array.isArray(opts) || opts.length === 0) return "optionSelectors must be a non-empty array";
  for (let i = 0; i < opts.length; i++) {
    if (!String(opts[i]).trim()) return `optionSelectors[${i}] is empty`;
  }
  return null;
}

let currentHost = "";

$("testApiBtn").addEventListener("click", async () => {
  const msg = $("apiMsg");
  msg.textContent = "Testing…";
  msg.classList.remove("err");
  const fullUrl = `${API_URL}/extension/subjects`;
  try {
    const res = await fetch(fullUrl, { credentials: "omit" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const n = data?.subjects?.length ?? 0;
      msg.textContent = `Connected. ${n} subject(s) found.`;
    } else {
      msg.textContent = data?.error || `HTTP ${res.status}`;
      msg.classList.add("err");
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    msg.textContent = err === "Failed to fetch"
      ? "Failed to fetch. Check: (1) Server running? (2) Correct URL (ends with /api)? (3) CORS on prod — deploy latest server."
      : err;
    msg.classList.add("err");
  }
});

function renderHostSelect(mapping, preferred) {
  const sel = $("hostSelect");
  sel.innerHTML = "";
  const hosts = Object.keys(mapping).sort();
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = hosts.length ? "Choose saved host…" : "No hosts yet — type below";
  sel.appendChild(opt0);
  for (const h of hosts) {
    const o = document.createElement("option");
    o.value = h;
    o.textContent = h;
    sel.appendChild(o);
  }
  const pref = preferred ? preferred.toLowerCase() : "";
  if (pref && mapping[pref]) {
    sel.value = pref;
    currentHost = pref;
  } else if (hosts.length) {
    currentHost = hosts[0];
    sel.value = currentHost;
  } else {
    currentHost = pref || "";
  }
  $("hostInput").value = currentHost || pref || "";
  $("hostDisplay").textContent = currentHost || pref || "—";
  loadFormForHost(mapping, currentHost || pref);
}

function loadFormForHost(mapping, host) {
  const entry = mapping[host];
  $("questionSelector").value = entry?.questionSelector || "";
  $("optionSelectors").value = Array.isArray(entry?.optionSelectors) ? entry.optionSelectors.join("\n") : "";
  $("correctAnswerSelector").value = entry?.correctAnswerSelector || "";
  $("correctCheckboxSelectors").value = Array.isArray(entry?.correctAnswerCheckboxSelectors) ? entry.correctAnswerCheckboxSelectors.join("\n") : "";
}

async function refresh(preferredHost) {
  const mapping = await getMapping();
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("host") || "";
  const pref = preferredHost ?? fromQuery;
  renderHostSelect(mapping, pref || currentHost);
}

$("hostSelect").addEventListener("change", async () => {
  const mapping = await getMapping();
  currentHost = $("hostSelect").value;
  $("hostInput").value = currentHost;
  $("hostDisplay").textContent = currentHost || "—";
  loadFormForHost(mapping, currentHost);
});

const ADMIN_PEPU_PRESET = {
  questionSelector: "#question-content, textarea[name='Question.Content']",
  optionSelectors: [
    "#choices-list li:nth-child(1) textarea, textarea[name='Question.Choices[0].Content']",
    "#choices-list li:nth-child(2) textarea, textarea[name='Question.Choices[1].Content']",
    "#choices-list li:nth-child(3) textarea, textarea[name='Question.Choices[2].Content']",
    "#choices-list li:nth-child(4) textarea, textarea[name='Question.Choices[3].Content']",
  ],
  correctAnswerSelector: null,
  correctAnswerCheckboxSelectors: [
    "#Question_Choices_0__IsCorrect, input[name='Question.Choices[0].IsCorrect']",
    "#Question_Choices_1__IsCorrect, input[name='Question.Choices[1].IsCorrect']",
    "#Question_Choices_2__IsCorrect, input[name='Question.Choices[2].IsCorrect']",
    "#Question_Choices_3__IsCorrect, input[name='Question.Choices[3].IsCorrect']",
  ],
};

const GENERIC_PRESET = {
  questionSelector: "form textarea, textarea, [contenteditable='true']",
  optionSelectors: [
    "form input:not([type=hidden]):nth-of-type(1), input[type=text]:nth-of-type(1)",
    "form input:not([type=hidden]):nth-of-type(2), input[type=text]:nth-of-type(2)",
    "form input:not([type=hidden]):nth-of-type(3), input[type=text]:nth-of-type(3)",
    "form input:not([type=hidden]):nth-of-type(4), input[type=text]:nth-of-type(4)",
  ],
  correctAnswerSelector: "form select, select",
};

$("presetGenericBtn").addEventListener("click", () => {
  $("hostInput").value = $("hostInput").value.trim() || currentHost || "admin.pepu.krd";
  currentHost = $("hostInput").value.toLowerCase();
  $("hostDisplay").textContent = currentHost || "—";
  $("questionSelector").value = GENERIC_PRESET.questionSelector;
  $("optionSelectors").value = GENERIC_PRESET.optionSelectors.join("\n");
  $("correctAnswerSelector").value = GENERIC_PRESET.correctAnswerSelector;
  $("correctCheckboxSelectors").value = "";
});

$("debugBtn").addEventListener("click", async () => {
  const host = $("hostInput").value.trim() || currentHost || "admin.pepu.krd";
  $("detectMsg").textContent = "Listing fields…";
  $("debugOutput").style.display = "none";
  try {
    const res = await chrome.runtime.sendMessage({ type: "DEBUG_FIELDS", hostname: host });
    const pre = $("debugOutput");
    const copyBtn = $("copyDebugBtn");
    if (res?.ok) {
      pre.textContent = res.fields;
      pre.style.display = "block";
      if (copyBtn) copyBtn.style.display = "inline-block";
      $("detectMsg").textContent = "Fields above. Click Copy output, then paste here so we can fix selectors.";
    } else {
      $("detectMsg").textContent = res?.error || "Failed";
      $("detectMsg").classList.add("err");
    }
  } catch (e) {
    $("detectMsg").textContent = e?.message || "Error";
    $("detectMsg").classList.add("err");
  }
});

$("copyDebugBtn").addEventListener("click", () => {
  const text = $("debugOutput").textContent;
  if (text && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      $("detectMsg").textContent = "Copied. Paste it in chat.";
      $("detectMsg").classList.remove("err");
    }).catch(() => {
      $("detectMsg").textContent = "Select the text above and copy manually.";
    });
  } else {
    $("detectMsg").textContent = "Select the text above and copy manually (Ctrl+C).";
  }
});

$("presetPepuBtn").addEventListener("click", () => {
  $("hostInput").value = "admin.pepu.krd";
  currentHost = "admin.pepu.krd";
  $("hostDisplay").textContent = "admin.pepu.krd";
  $("questionSelector").value = ADMIN_PEPU_PRESET.questionSelector;
  $("optionSelectors").value = ADMIN_PEPU_PRESET.optionSelectors.join("\n");
  $("correctAnswerSelector").value = ADMIN_PEPU_PRESET.correctAnswerSelector || "";
  $("correctCheckboxSelectors").value = Array.isArray(ADMIN_PEPU_PRESET.correctAnswerCheckboxSelectors) ? ADMIN_PEPU_PRESET.correctAnswerCheckboxSelectors.join("\n") : "";
  $("detectMsg").textContent = "Preset loaded. Save, then try Fill.";
  $("detectMsg").classList.remove("err");
});

$("detectBtn").addEventListener("click", async () => {
  const host = $("hostInput").value.trim() || currentHost;
  if (!host) {
    $("detectMsg").textContent = "Enter hostname first (e.g. admin.pepu.krd)";
    $("detectMsg").classList.add("err");
    return;
  }
  $("detectMsg").textContent = "Detecting…";
  $("detectMsg").classList.remove("err");
  try {
    const res = await chrome.runtime.sendMessage({ type: "DETECT_SELECTORS", hostname: host });
    if (res?.ok && res.mapping) {
      $("questionSelector").value = res.mapping.questionSelector || "";
      $("optionSelectors").value = Array.isArray(res.mapping.optionSelectors) ? res.mapping.optionSelectors.join("\n") : "";
      $("correctAnswerSelector").value = res.mapping.correctAnswerSelector || "";
      $("detectMsg").textContent = "Detected. Review and Save.";
    } else {
      $("detectMsg").textContent = res?.error || "Detection failed";
      $("detectMsg").classList.add("err");
    }
  } catch (e) {
    $("detectMsg").textContent = e instanceof Error ? e.message : "Error";
    $("detectMsg").classList.add("err");
  }
});

$("useInputBtn").addEventListener("click", async () => {
  const h = $("hostInput").value.trim().toLowerCase();
  if (!h) return;
  currentHost = h;
  $("hostDisplay").textContent = currentHost;
  const mapping = await getMapping();
  loadFormForHost(mapping, currentHost);
  $("saveMsg").textContent = "";
  $("saveMsg").classList.remove("err");
});

$("saveBtn").addEventListener("click", async () => {
  const host = ($("hostInput").value.trim() || currentHost).toLowerCase();
  const questionSelector = $("questionSelector").value.trim();
  const optionSelectors = $("optionSelectors").value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const correctRaw = $("correctAnswerSelector").value.trim();
  const correctAnswerSelector = correctRaw || null;
  const correctAnswerCheckboxSelectors = $("correctCheckboxSelectors")
    .value.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const entry = {
    questionSelector,
    optionSelectors,
    correctAnswerSelector,
    ...(correctAnswerCheckboxSelectors.length ? { correctAnswerCheckboxSelectors } : {}),
  };
  const err = validateEntry(entry);
  const msg = $("saveMsg");
  if (err) {
    msg.textContent = err;
    msg.classList.add("err");
    return;
  }

  const mapping = await getMapping();
  mapping[host] = entry;
  await setMapping(mapping);
  currentHost = host;
  msg.textContent = `Saved mapping for ${host}`;
  msg.classList.remove("err");
  await refresh(host);
});

$("deleteBtn").addEventListener("click", async () => {
  const host = ($("hostInput").value.trim() || currentHost).toLowerCase();
  if (!host || !confirm(`Remove mapping for ${host}?`)) return;
  const mapping = await getMapping();
  delete mapping[host];
  await setMapping(mapping);
  currentHost = "";
  $("saveMsg").textContent = `Removed ${host}`;
  $("saveMsg").classList.remove("err");
  await refresh("");
});

$("exportBtn").addEventListener("click", async () => {
  const mapping = await getMapping();
  $("mappingJson").value = JSON.stringify(mapping, null, 2);
  $("importMsg").textContent = "Exported.";
  $("importMsg").classList.remove("err");
});

$("importBtn").addEventListener("click", async () => {
  const msg = $("importMsg");
  try {
    const raw = $("mappingJson").value.trim();
    if (!raw) {
      msg.textContent = "Paste JSON first.";
      msg.classList.add("err");
      return;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      msg.textContent = "Root must be an object keyed by hostname.";
      msg.classList.add("err");
      return;
    }
    const existing = await getMapping();
    const merged = { ...existing };
    for (const [host, entry] of Object.entries(parsed)) {
      const err = validateEntry(entry);
      if (err) {
        msg.textContent = `${host}: ${err}`;
        msg.classList.add("err");
        return;
      }
      const cb = entry.correctAnswerCheckboxSelectors;
      merged[host.toLowerCase()] = {
        questionSelector: String(entry.questionSelector).trim(),
        optionSelectors: entry.optionSelectors.map((s) => String(s).trim()),
        correctAnswerSelector: entry.correctAnswerSelector ? String(entry.correctAnswerSelector).trim() : null,
        ...(Array.isArray(cb) && cb.length ? { correctAnswerCheckboxSelectors: cb.map((s) => String(s).trim()) } : {}),
      };
    }
    await setMapping(merged);
    msg.textContent = `Merged ${Object.keys(parsed).length} host(s).`;
    msg.classList.remove("err");
    await refresh(Object.keys(parsed)[0]);
  } catch (e) {
    msg.textContent = e instanceof Error ? e.message : String(e);
    msg.classList.add("err");
  }
});

const params = new URLSearchParams(window.location.search);
const hostFromUrl = params.get("host") || "";
if (hostFromUrl) {
  $("hostInput").value = hostFromUrl;
  currentHost = hostFromUrl.toLowerCase();
}
refresh(hostFromUrl);
