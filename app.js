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
  photoMap: {},
  filteredTags: new Set(),
  regionFilter: "",
  mode: "browse",
  deck: [],
  deckIndex: 0,
  flipped: false,
  accessLevel: null
};

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
  if (f["Entry Type"] === "Organization") {
    return normalize(f["Organization/Employer"]);
  }
  let base = (f["Last 1"] || "") + "_" + (f["First 1"] || "");
  if (f["First 2"]) base += "_" + f["First 2"];
  return normalize(base);
}

async function loadSheetData() {
  const range = encodeURIComponent(`${CONFIG.SHEET_TAB}!A1:ZZ2000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${range}?key=${CONFIG.API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load the Sheet. Check sharing settings and API key.");
  const data = await res.json();
  const rows = data.values || [];
  if (rows.length < 2) return { records: [],
