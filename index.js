import express from "express";

const app = express();
app.use(express.json());

const BASE_URL = "https://www.alcopa-auction.fr/recherche";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
  "Referer": "https://www.google.fr/",
  "Cache-Control": "no-cache"
};

// --- Parser HTML brut ---
function parseVehicles(html) {
  const results = [];

  // Extraire chaque bloc véhicule
  const cardRegex = /<a[^>]+href="(\/lot\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const link = "https://www.alcopa-auction.fr" + match[1];
    const block = match[2];

    // Titre (marque | modèle)
    const titleMatch = block.match(/class="[^"]*lot-title[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : null;

    // Prix
    const priceMatch = block.match(/class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/);
    const price = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, "").trim() : null;

    // Kilométrage
    const kmMatch = block.match(/(\d[\d\s]+)\s*km/i);
    const km = kmMatch ? kmMatch[1].trim() + " km" : null;

    // Année
    const yearMatch = block.match(/\b(20\d{2}|19\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : null;

    // Image
    const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);
    const img = imgMatch ? imgMatch[1] : null;

    if (title || price) {
      results.push({ title, price, km, year, img, link });
    }
  }

  return results;
}

// --- Scraper principal ---
async function scrapeAlcopa(pageNumber = 1) {
  const url = `${BASE_URL}?page=${pageNumber}`;
  console.log(`[scrape] Fetching: ${url}`);

  const response = await fetch(url, { headers: HEADERS });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} pour ${url}`);
  }

  const html = await response.text();
  console.log(`[scrape] HTML reçu: ${html.length} caractères`);

  const data = parseVehicles(html);
  console.log(`[scrape] ${data.length} véhicules parsés`);

  return data;
}

// --- GET /alcopa ---
app.get("/alcopa", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);

    if (isNaN(page) || page < 1) {
      return res.status(400).json({ error: "Numéro de page invalide" });
    }

    const result = await scrapeAlcopa(page);
    res.json({ page, count: result.length, items: result });

  } catch (err) {
    console.error("[/alcopa] Erreur:", err);
    res.status(500).json({ error: err.toString() });
  }
});

// --- GET /debug — HTML brut ---
app.get("/debug", async (req, res) => {
  try {
    const pageNum = parseInt(req.query.page || "1", 10);
    const url = `${BASE_URL}?page=${pageNum}`;

    const response = await fetch(url, { headers: HEADERS });
    const html = await response.text();

    res.send(`<pre style="font-size:11px">${html.replace(/</g, "&lt;")}</pre>`);

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// --- GET /health ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Démarrage ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy démarré sur le port ${PORT}`);
});
