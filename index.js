// ============================================================
// ⚙️ CONFIGURATION
// ============================================================
const CONFIG = {
  PROXY_URL:  "https://alcopa-playwright-proxy.onrender.com",
  SHEET_NAME: "SUV_7_PLACES",

  CATEGORY: "VP",
  BRAND: "",

  // Pause minimale ScraperAPI
  PAUSE_MS: 800,

  // 🔥 Limite stricte pour rester dans ton quota
  MAX_PAGES: 3,

  // Active le filtrage SUV7 côté Apps Script
  SUV7_ONLY: true
};

// ============================================================
// 🧠 IA : Filtrage SUV 7 places (élargi)
// ============================================================
function isSUV7_AI(v) {
  const t = ((v.title || "") + " " + (v.model || "")).toUpperCase();

  const keywords = [
    "7PL", "7 PL", "7 PLACE", "7PLACES",
    "ALLSPACE", "GRAND C4", "GRAND SCENIC", "GRAND ESPACE",
    "TIGUAN", "ALLSPACE", "TOUAREG", "Q7",
    "5008", "TARRACO", "KODIAQ",
    "DISCOVERY", "OUTLANDER", "SORENTO", "SANTA FE",
    "GALAXY", "S-MAX", "TOURAN",
    "BERLINGO", "RIFTER",
    "TRAFIC", "VITO", "ZAFIRA", "DS7",
    "TOURNEO", "ESPACE", "SHARAN", "ALHAMBRA"
  ];

  return keywords.some(k => t.includes(k));
}

// ============================================================
// 🚀 FONCTION PRINCIPALE
// ============================================================
function scrapeAlcopa() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return alert("❌ Onglet introuvable");

  const info = fetchInfo();
  let totalPages = Math.min(info.total_pages || CONFIG.MAX_PAGES, CONFIG.MAX_PAGES);

  const allItems = [];

  // Scraper les pages limitées
  for (let page = 1; page <= totalPages; page++) {
    try {
      const data = fetchPage(page);
      if (data?.items?.length) allItems.push(...data.items);
      Utilities.sleep(CONFIG.PAUSE_MS);
    } catch (e) {}
  }

  if (!allItems.length) return alert("⚠️ Aucun véhicule trouvé");

  // ============================================================
  // 🧠 FILTRAGE SUV7 CÔTÉ CLIENT (IA élargie)
  // ============================================================
  let filtered = CONFIG.SUV7_ONLY
    ? allItems.filter(v => isSUV7_AI(v))
    : allItems;

  // ============================================================
  // 📄 ÉCRITURE DANS LE SHEET
  // ============================================================
  const headers = [
    "Lot n°", "Marque | Modèle", "Modèle détaillé", "Énergie",
    "Année", "KM", "Boîte", "Prix (€)", "Lieu", "Date vente",
    "Garantie", "Image", "Lien"
  ];

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length)
       .setValues([headers])
       .setFontWeight("bold");

  const rows = filtered.map(v => [
    v.lot || "", v.title || "", v.model || "", v.energy || "",
    v.year || "", v.km || "", v.gearbox || "", v.price || "",
    v.lieu || "", v.date || "", v.garantie || "", v.img || "", v.link || ""
  ]);

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.autoResizeColumns(1, headers.length);

  alert(
    "✅ Import terminé !\n\n" +
    "📄 Pages scrapées : " + totalPages + "\n" +
    "🚗 Véhicules SUV7 importés : " + filtered.length
  );
}

// ============================================================
// 🔍 LIRE LE TOTAL
// ============================================================
function fetchInfo() {
  let url = CONFIG.PROXY_URL + "/info";
  if (CONFIG.CATEGORY) url += "?category=" + CONFIG.CATEGORY;

  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  return JSON.parse(r.getContentText());
}

// ============================================================
// 📄 SCRAPER UNE PAGE
// ============================================================
function fetchPage(page) {
  let url = CONFIG.PROXY_URL + "/alcopa?page=" + page;
  if (CONFIG.CATEGORY) url += "&category=" + CONFIG.CATEGORY;
  if (CONFIG.BRAND)    url += "&brand=" + encodeURIComponent(CONFIG.BRAND);

  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  return JSON.parse(r.getContentText());
}

// ============================================================
// 🧰 MENU
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🚗 Alcopa")
    .addItem("▶ Importer véhicules", "scrapeAlcopa")
    .addToUi();
}

// ============================================================
// 🛎️ ALERT
// ============================================================
function alert(msg) {
  SpreadsheetApp.getUi().alert(msg);
}
