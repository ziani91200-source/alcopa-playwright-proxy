// ============================================================
// CONFIGURATION
// ============================================================
const PROXY_URL = "https://alcopa-playwright-proxy.onrender.com";
const SHEET_NAME = "SUV_7_PLACES"; // Nom de l'onglet Google Sheets
const TOTAL_PAGES = 3;             // Nombre de pages à scraper (20 véhicules/page)

// ============================================================
// FONCTION PRINCIPALE — à lancer manuellement ou par déclencheur
// ============================================================
function scrapeAlcopa() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    SpreadsheetApp.getUi().alert("Onglet '" + SHEET_NAME + "' introuvable !");
    return;
  }

  // En-têtes
  const headers = [
    "Lot n°", "Marque | Modèle", "Modèle détaillé", "Énergie",
    "Année", "KM", "Boîte", "Prix (€)", "Lieu", "Date vente",
    "Garantie", "Image", "Lien"
  ];

  // Récupérer toutes les pages
  const allItems = [];

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    try {
      const data = fetchFromProxy(page);
      if (data && data.items && data.items.length > 0) {
        allItems.push(...data.items);
        Logger.log("Page " + page + " : " + data.items.length + " véhicules");
      } else {
        Logger.log("Page " + page + " : aucun véhicule, arrêt.");
        break;
      }
      Utilities.sleep(1500); // pause entre les pages
    } catch (e) {
      Logger.log("Erreur page " + page + " : " + e.toString());
    }
  }

  if (allItems.length === 0) {
    SpreadsheetApp.getUi().alert("Aucun véhicule récupéré !");
    return;
  }

  // Écrire dans le sheet
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");

  const rows = allItems.map(v => [
    v.lot || "",
    v.title || "",
    v.model || "",
    v.energy || "",
    v.year || "",
    v.km || "",
    v.gearbox || "",
    v.price || "",
    v.lieu || "",
    v.date || "",
    v.garantie || "",
    v.img || "",
    v.link || ""
  ]);

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  Logger.log("✅ " + allItems.length + " véhicules écrits dans '" + SHEET_NAME + "'");
  SpreadsheetApp.getUi().alert("✅ " + allItems.length + " véhicules importés !");
}

// ============================================================
// APPEL API PROXY
// ============================================================
function fetchFromProxy(page) {
  const url = PROXY_URL + "/alcopa?page=" + page;
  const options = {
    method: "GET",
    muteHttpExceptions: true,
    timeout: 60
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code !== 200) {
    throw new Error("HTTP " + code + " : " + response.getContentText().substring(0, 200));
  }

  return JSON.parse(response.getContentText());
}

// ============================================================
// DÉCLENCHEUR AUTOMATIQUE — installe un trigger quotidien
// ============================================================
function installerDeclencheur() {
  // Supprimer les anciens déclencheurs
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Créer un nouveau déclencheur quotidien à 7h du matin
  ScriptApp.newTrigger("scrapeAlcopa")
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();

  SpreadsheetApp.getUi().alert("✅ Déclencheur quotidien installé (7h00)");
}

// ============================================================
// MENU PERSONNALISÉ
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🚗 Alcopa")
    .addItem("Importer les véhicules", "scrapeAlcopa")
    .addSeparator()
    .addItem("Installer déclencheur quotidien (7h)", "installerDeclencheur")
    .addToUi();
}
