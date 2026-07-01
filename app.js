// ============================================================
// PWAC PEOPLE DATABASE — APP LOGIC
// ============================================================
// Reads live data from the Google Sheet + Photos folder defined
// in config.js. Nothing about people/photos/tags is hardcoded here —
// it's all read dynamically so the Sheet remains the single source
// of truth.
// ============================================================

const KNOWN_FIELDS = [
  "Entry Type","Prefix","First 1","First 2","Last 1","Last 2","Suffix",
  "Goes By","Pronunciation","Pronouns","Organization/Employer","Title",
  "PWAC Role","Region","City/Location","Connection","Background/About",
  "Relationships","Talk to them about","Good to know","Flag",
  "Search Terms","Photo Filename"
];

let state = {
  records: [],
  tagColumns: [],
  photoMap: {},          // normalized filename -> drive file id
  filteredTags: new Set(),
  regionFilter: "",
  mode: "browse",         // 'photo-first' | 'info-first' | 'browse'
  deck: [],
  deckIndex: 0,
  flipped: false,
  accessLevel: null       // 'admin' | 'user'
};

// ---------- Utility ----------
function normalize(str) {
  return (str || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function displayName(rec) {
  const f = rec.fields;
  if (f["Entry Type"] === "Organization") {
    return f["Organization/Employer"] || f["Search Terms"] || "Unnamed Organization";
  }
  let name = "";
  if (f["Prefix"]) name += f["Prefix"] + " ";
  name += f["First 1"] || "";
  if (f["First 2"]) name += " & " + f["First 2"];
  if (f["Last 1"]) name += " " + f["Last 1"];
  if (f["Last 2"]) name += " " + f["Last 2"];
  if (f["Suffix"]) name += " " + f["Suffix"];
  return name.trim() || "Unnamed Entry";
}

function photoKeyForRecord(rec) {
  const f = rec.fields;
  if (f["Photo Filename"]) return normalize(f["Photo Filename"]);
  // Auto-construct: Lastname_First1_First2 or OrgName
  if (f["Entry Type"] === "Organization") {
    return normalize(f["Organization/Employer"]);
  }
  let base = (f["Last 1"] || "") + "_" + (f["First 1"] || "");
  if (f["First 2"]) base += "_" + f["First 2"];
  return normalize(base);
}

// ---------- Data loading ----------
async function loadSheetData() {
  const range = encodeURIComponent(`${CONFIG.SHEET_TAB}!A1:ZZ2000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${range}?key=${CONFIG.API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load the Sheet. Check sharing settings and API key.");
  const data = await res.json();
  const rows = data.values || [];
  if (rows.length < 2) return { records: [], tagColumns: [] };

  const headers = rows[0];
  const fieldIndex = {};
  const tagColumns = [];
  headers.forEach((h, i) => {
    const trimmed = (h || "").trim();
    if (!trimmed) return;
    if (KNOWN_FIELDS.includes(trimmed)) {
      fieldIndex[trimmed] = i;
    } else {
      tagColumns.push({ name: trimmed, index: i });
    }
  });

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => !c)) continue;
    const fields = {};
    KNOWN_FIELDS.forEach(name => {
      const idx = fieldIndex[name];
      fields[name] = idx !== undefined ? (row[idx] || "").trim() : "";
    });
    if (!fields["First 1"] && !fields["Organization/Employer"] && !fields["Last 1"]) continue;
    const activeTags = tagColumns
      .filter(tc => (row[tc.index] || "").trim().toUpperCase() === "X")
      .map(tc => tc.name);
    records.push({ fields, tags: activeTags, rowIndex: r });
  }

  return { records, tagColumns: tagColumns.map(t => t.name) };
}

async function loadPhotoMap() {
  const q = encodeURIComponent(`'${CONFIG.PHOTOS_FOLDER_ID}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1000&key=${CONFIG.API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load the Photos folder. Check sharing settings and API key.");
  const data = await res.json();
  const map = {};
  (data.files || []).forEach(file => {
    const baseName = file.name.replace(/\.[^/.]+$/, ""); // strip extension
    map[normalize(baseName)] = file.id;
  });
  return map;
}

function photoUrlFor(rec) {
  const key = photoKeyForRecord(rec);
  const fileId = state.photoMap[key];
  if (!fileId) return null;
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
}

// ---------- Search ----------
function searchRecords(query) {
  const words = normalize(query).length ? query.toLowerCase().split(/\s+/).filter(Boolean) : [];
  if (words.length === 0) return state.records;
  return state.records.filter(rec => {
    const haystack = [
      rec.fields["Prefix"], rec.fields["First 1"], rec.fields["First 2"],
      rec.fields["Last 1"], rec.fields["Last 2"], rec.fields["Suffix"],
      rec.fields["Goes By"], rec.fields["Organization/Employer"],
      rec.fields["Title"], rec.fields["City/Location"], rec.fields["Region"],
      rec.fields["Search Terms"]
    ].join(" ").toLowerCase();
    return words.every(w => haystack.includes(w));
  });
}

// ---------- Filtering ----------
function applyFilters(records) {
  return records.filter(rec => {
    if (state.filteredTags.size > 0) {
      const hasTag = [...state.filteredTags].every(t => rec.tags.includes(t));
      if (!hasTag) return false;
    }
    if (state.regionFilter && rec.fields["Region"] !== state.regionFilter) return false;
    return true;
  });
}

// ---------- Deck building ----------
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(mode) {
  let pool = applyFilters(state.records);
  if (mode === "photo-first") {
    pool = pool.filter(rec => rec.fields["Entry Type"] !== "Organization" && photoUrlFor(rec));
  }
  state.deck = shuffle(pool);
  state.deckIndex = 0;
  state.flipped = false;
}

// ---------- Rendering ----------
function fieldRow(label, value) {
  if (!value) return "";
  return `<div class="field-row"><span class="field-label">${label}</span><span class="field-value">${escapeHtml(value)}</span></div>`;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function cardInfoHtml(rec) {
  const f = rec.fields;
  let html = `<div class="card-name">${escapeHtml(displayName(rec))}</div>`;
  if (f["Goes By"]) html += `<div class="card-goesby">Goes by: ${escapeHtml(f["Goes By"])}</div>`;
  if (f["Pronunciation"]) html += `<div class="card-pronounce">🗣 ${escapeHtml(f["Pronunciation"])}</div>`;
  if (f["Pronouns"]) html += `<div class="card-pronouns">${escapeHtml(f["Pronouns"])}</div>`;
  html += `<div class="card-fields">`;
  html += fieldRow("Organization", f["Organization/Employer"]);
  html += fieldRow("Title", f["Title"]);
  html += fieldRow("PWAC Role", f["PWAC Role"]);
  html += fieldRow("Location", f["City/Location"]);
  html += fieldRow("Connection", f["Connection"]);
  html += fieldRow("Background", f["Background/About"]);
  html += fieldRow("Relationships", f["Relationships"]);
  html += fieldRow("Talk to them about", f["Talk to them about"]);
  html += fieldRow("Good to know", f["Good to know"]);
  html += `</div>`;
  return html;
}

function flagClass(rec) {
  const flag = (rec.fields["Flag"] || "").toLowerCase();
  if (flag === "yellow") return "flag-yellow";
  if (flag === "red") return "flag-red";
  return "";
}

function renderStudyCard() {
  const container = document.getElementById("study-card-container");
  if (state.deck.length === 0) {
    container.innerHTML = `<div class="empty-state">No cards match your current filters.</div>`;
    document.getElementById("deck-counter").textContent = "";
    return;
  }
  const rec = state.deck[state.deckIndex];
  const photoUrl = photoUrlFor(rec);
  const photoFront = state.mode === "photo-first";

  let frontHtml, backHtml;
  if (photoFront) {
    frontHtml = photoUrl
      ? `<img class="card-photo" src="${photoUrl}" alt="Photo">`
      : `<div class="photo-placeholder">No photo</div>`;
    backHtml = cardInfoHtml(rec);
  } else {
    frontHtml = cardInfoHtml(rec);
    backHtml = photoUrl
      ? `<img class="card-photo" src="${photoUrl}" alt="Photo">`
      : `<div class="photo-placeholder">${escapeHtml(displayName(rec))}</div>`;
  }

  container.innerHTML = `
    <div class="flashcard ${flagClass(rec)} ${state.flipped ? 'flipped' : ''}" id="flashcard">
      <div class="flashcard-inner">
        <div class="flashcard-face flashcard-front">${frontHtml}</div>
        <div class="flashcard-face flashcard-back">${backHtml}</div>
      </div>
    </div>
  `;
  document.getElementById("deck-counter").textContent = `${state.deckIndex + 1} / ${state.deck.length}`;
  document.getElementById("flashcard").addEventListener("click", () => {
    state.flipped = !state.flipped;
    document.getElementById("flashcard").classList.toggle("flipped");
  });
}

function renderSearchResults(records) {
  const container = document.getElementById("search-results");
  if (records.length === 0) {
    container.innerHTML = `<div class="empty-state">No matches found.</div>`;
    return;
  }
  container.innerHTML = records.map(rec => {
    const photoUrl = photoUrlFor(rec);
    return `
      <div class="result-card ${flagClass(rec)}">
        <div class="result-photo">${photoUrl ? `<img src="${photoUrl}" alt="">` : `<div class="photo-placeholder small">No photo</div>`}</div>
        <div class="result-info">${cardInfoHtml(rec)}</div>
      </div>
    `;
  }).join("");
}

function renderFilterPanel() {
  const container = document.getElementById("filter-panel-body");
  const regions = ["Summerville","Tri-County","South Carolina Outside Tri-County","United States Outside SC","International"];
  let html = `<div class="filter-section"><h4>Region</h4><select id="region-select"><option value="">All Regions</option>`;
  regions.forEach(r => {
    html += `<option value="${r}" ${state.regionFilter === r ? "selected" : ""}>${r}</option>`;
  });
  html += `</select></div>`;

  html += `<div class="filter-section"><h4>Tags / Events</h4>`;
  state.tagColumns.forEach(tag => {
    const checked = state.filteredTags.has(tag) ? "checked" : "";
    html += `<label class="tag-checkbox"><input type="checkbox" value="${escapeHtml(tag)}" ${checked}> ${escapeHtml(tag)}</label>`;
  });
  html += `</div>`;
  container.innerHTML = html;

  document.getElementById("region-select").addEventListener("change", e => {
    state.regionFilter = e.target.value;
  });
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", e => {
      if (e.target.checked) state.filteredTags.add(e.target.value);
      else state.filteredTags.delete(e.target.value);
    });
  });
}

// ---------- Text to speech ----------
function speakCard() {
  if (state.deck.length === 0) return;
  const rec = state.deck[state.deckIndex];
  const f = rec.fields;
  const parts = [displayName(rec)];
  if (f["Goes By"]) parts.push(`Goes by ${f["Goes By"]}`);
  if (f["Organization/Employer"]) parts.push(f["Organization/Employer"]);
  if (f["Title"]) parts.push(f["Title"]);
  if (f["Connection"]) parts.push(f["Connection"]);
  if (f["Background/About"]) parts.push(f["Background/About"]);
  if (f["Talk to them about"]) parts.push(`Talk to them about: ${f["Talk to them about"]}`);
  if (f["Good to know"]) parts.push(`Good to know: ${f["Good to know"]}`);
  const utterance = new SpeechSynthesisUtterance(parts.join(". "));
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

// ---------- Print view ----------
function openPrintView() {
  const records = applyFilters(state.records);
  const win = window.open("", "_blank");
  const cardsHtml = records.map(rec => {
    const photoUrl = photoUrlFor(rec);
    return `
      <div class="print-card">
        <div class="print-card-front">
          ${photoUrl ? `<img src="${photoUrl}">` : `<div class="print-photo-placeholder">No Photo</div>`}
          <div class="print-name">${escapeHtml(displayName(rec))}</div>
        </div>
        <div class="print-card-back">
          ${cardInfoHtml(rec)}
        </div>
      </div>
    `;
  }).join("");
  win.document.write(`
    <html><head><title>PWAC People — Print</title>
    <style>
      body { font-family: 'Montserrat', Arial, sans-serif; margin: 20px; }
      .print-card { border: 1px solid #ccc; border-radius: 10px; padding: 16px; margin-bottom: 20px; page-break-inside: avoid; display: flex; gap: 20px; }
      .print-card-front { width: 180px; text-align: center; }
      .print-card-front img { width: 160px; height: 160px; object-fit: cover; border-radius: 8px; }
      .print-photo-placeholder { width: 160px; height: 160px; background: #eee; display:flex; align-items:center; justify-content:center; border-radius:8px; color:#999; }
      .print-name { font-weight: bold; margin-top: 8px; }
      .card-name { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
      .field-row { margin-bottom: 6px; font-size: 13px; }
      .field-label { font-weight: bold; display: block; color: #555; }
      @media print { body { margin: 0; } }
    </style>
    </head><body>${cardsHtml}</body></html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ---------- Navigation ----------
function nextCard() {
  if (state.deck.length === 0) return;
  state.deckIndex = (state.deckIndex + 1) % state.deck.length;
  state.flipped = false;
  renderStudyCard();
}
function prevCard() {
  if (state.deck.length === 0) return;
  state.deckIndex = (state.deckIndex - 1 + state.deck.length) % state.deck.length;
  state.flipped = false;
  renderStudyCard();
}

// ---------- Screen management ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ---------- Access control ----------
function checkPasscode(code) {
  if (code === CONFIG.ADMIN_CODE) return "admin";
  if (code === CONFIG.USER_CODE) return "user";
  return null;
}

function initLogin() {
  const saved = sessionStorage.getItem("pwac_access");
  if (saved === "admin" || saved === "user") {
    state.accessLevel = saved;
    startApp();
    return;
  }
  showScreen("screen-login");
  document.getElementById("login-form").addEventListener("submit", e => {
    e.preventDefault();
    const code = document.getElementById("passcode-input").value.trim();
    const level = checkPasscode(code);
    if (level) {
      state.accessLevel = level;
      sessionStorage.setItem("pwac_access", level);
      startApp();
    } else {
      document.getElementById("login-error").textContent = "Incorrect passcode. Please try again.";
    }
  });
}

// ---------- App startup ----------
async function startApp() {
  showScreen("screen-loading");
  try {
    const [sheetData, photoMap] = await Promise.all([loadSheetData(), loadPhotoMap()]);
    state.records = sheetData.records;
    state.tagColumns = sheetData.tagColumns;
    state.photoMap = photoMap;
    showScreen("screen-home");
    renderFilterPanel();
    wireUpHomeScreen();
  } catch (err) {
    document.getElementById("loading-error").textContent = err.message;
    showScreen("screen-loading");
  }
}

function wireUpHomeScreen() {
  document.getElementById("btn-photo-first").addEventListener("click", () => {
    state.mode = "photo-first";
    buildDeck("photo-first");
    showScreen("screen-study");
    renderStudyCard();
  });
  document.getElementById("btn-info-first").addEventListener("click", () => {
    state.mode = "info-first";
    buildDeck("info-first");
    showScreen("screen-study");
    renderStudyCard();
  });
  document.getElementById("btn-search").addEventListener("click", () => {
    showScreen("screen-search");
    document.getElementById("search-input").value = "";
    renderSearchResults(applyFilters(state.records));
    document.getElementById("search-input").focus();
  });
  document.getElementById("btn-filters").addEventListener("click", () => {
    document.getElementById("filter-drawer").classList.toggle("open");
  });
  document.getElementById("btn-print").addEventListener("click", openPrintView);

  document.getElementById("search-input").addEventListener("input", e => {
    const results = applyFilters(searchRecords(e.target.value));
    renderSearchResults(results);
  });

  document.querySelectorAll(".btn-back-home").forEach(btn => {
    btn.addEventListener("click", () => showScreen("screen-home"));
  });

  document.getElementById("btn-next-card").addEventListener("click", nextCard);
  document.getElementById("btn-prev-card").addEventListener("click", prevCard);
  document.getElementById("btn-speak-card").addEventListener("click", speakCard);

  document.getElementById("btn-refresh").addEventListener("click", startApp);
}

document.addEventListener("DOMContentLoaded", initLogin);
