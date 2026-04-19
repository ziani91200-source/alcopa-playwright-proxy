import express from "express";

const app = express();
app.use(express.json());

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
const BASE_URL = "https://www.alcopa-auction.fr/recherche";

function scraperUrl(targetUrl) {
  return `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&render=false`;
}

// --- Parser HTML ---
function parseVehicles(html) {
  const results = [];
  const cardRegex = /<a[^>]+href="(\/lot\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const link = "https://www.alcopa-auction.fr" + match[1];
    const block = match[2];

    const titleMatch = block.match(/class="[^"]*lot-title[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : null;

    const priceMatch = block.match(/class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/);
    const price = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, "").trim() : null;

    const kmMatch = block.match(/(\d[\d\s]+)\s*km/i);
    const km = kmMatch ? kmMatch[1].trim() + " km" : null;

    const yearMatch = block.match(/\b(20\d{2}|19\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : null;

    const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);
    const img = imgMatch ? imgMatch[1] : null;

    if (title || price) {
      results.push({ title, price, km, year, img, link });
    }
  }

  return results;
}

// --- Scraper ---
async function scrapeAlcopa(pageNumber = 1) {
  if (!SCRAPER_API_KEY) throw new Error("SCRAPER_API_KEY manquante");

  const targetUrl = `${BASE_URL}?page=${pageNumber}`;
  const url = scraperUrl(targetUrl);

  console.log(`[scrape] Fetching page ${pageNumber} via ScraperAPI`);
  const response = await fetch(url);

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  console.log(`[scrape] HTML reçu: ${html.length} chars`);

  const data = parseVehicles(html);
  console.log(`[scrape] ${data.length} véhicules trouvés`);
  return data;
}

// --- GET /alcopa ---
app.get("/alcopa", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    if (isNaN(page) || page < 1) return res.status(400).json({ error: "Page invalide" });

    const result = await scrapeAlcopa(page);
    res.json({ page, count: result.length, items: result });

  } catch (err) {
    console.error("[/alcopa]", err);
    res.status(500).json({ error: err.toString() });
  }
});

// --- GET /debug ---
app.get("/debug", async (req, res) => {
  try {
    if (!SCRAPER_API_KEY) throw new Error("SCRAPER_API_KEY manquante");
    const pageNum = parseInt(req.query.page || "1", 10);
    const url = scraperUrl(`${BASE_URL}?page=${pageNum}`);
    const response = await fetch(url);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy démarré sur le port ${PORT}`));
