import express from "express";

const app = express();
app.use(express.json());

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
const BASE_URL = "https://www.alcopa-auction.fr/recherche";

function scraperUrl(targetUrl) {
  return `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&render=false`;
  }
// --- Parser HTML avec les vrais sélecteurs ---
function parseVehicles(html) {
  const results = [];

  // Chaque carte véhicule
  const cardRegex = /<div class="card h-100">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const block = match[1];

    // Lien + titre depuis card-title
    const linkMatch = block.match(/href="(\/voiture-occasion\/[^"]+)"\s+class="text-white[^"]*"[^>]*>[\s\S]*?<\/i>\s*([\s\S]*?)<\/a>/);
    const link = linkMatch ? "https://www.alcopa-auction.fr" + linkMatch[1] : null;
    const title = linkMatch ? linkMatch[2].trim() : null;

    // Modèle (p.mb-2)
    const modelMatch = block.match(/<p class="mb-2">\s*([\s\S]*?)\s*<\/p>/);
    const model = modelMatch ? modelMatch[1].replace(/<[^>]+>/g, "").trim() : null;

    // Énergie, année, km, boîte (p.mb-1)
    const detailMatch = block.match(/<p class="mb-1">([\s\S]*?)<\/p>/);
    let energy = null, year = null, km = null, gearbox = null;
    if (detailMatch) {
      const detail = detailMatch[1].replace(/<br\s*\/?>/gi, "|");
      const parts = detail.split("|").map(p => p.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
      energy = parts[0] || null;
      const yearMatch = detail.match(/1ère mise\s*:\s*(\d{4})/);
      year = yearMatch ? yearMatch[1] : null;
      const kmMatch = detail.match(/([\d\s]+)\s*km/);
      km = kmMatch ? kmMatch[1].trim() + " km" : null;
      const gearMatch = detail.match(/Boîte\s+([\w]+)/);
      gearbox = gearMatch ? gearMatch[1] : null;
    }

    // Prix (Mise à prix)
    const priceMatch = block.match(/Mise à prix\s*:[\s\S]*?<strong>([\s\S]*?)<\/strong>/);
    const price = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, "").trim() : null;

    // Lieu
    const lieuMatch = block.match(/fa-location-crosshairs[^>]*><\/i>\s*([\w\s]+)<\/strong>/);
    const lieu = lieuMatch ? lieuMatch[1].trim() : null;

    // Numéro de lot
    const lotMatch = block.match(/Lot n°<strong>(\d+)<\/strong>/);
    const lot = lotMatch ? lotMatch[1] : null;

    // Date de vente
    const dateMatch = block.match(/fa-calendar[^>]*><\/i>\s*([\d\/]+)/);
    const date = dateMatch ? dateMatch[1].trim() : null;

    // Image
    const imgMatch = block.match(/src="(https:\/\/photos\.static\.alcopa-auction\.net[^"]+)"/);
    const img = imgMatch ? imgMatch[1] : null;

    if (title) {
      results.push({ title, model, energy, year, km, gearbox, price, lieu, lot, date, img, link });
    }
  }

  return results;
}

// --- Scraper ---
async function scrapeAlcopa(pageNumber = 1) {
  if (!SCRAPER_API_KEY) throw new Error("SCRAPER_API_KEY manquante");

  const targetUrl = `${BASE_URL}?page=${pageNumber}`;
  console.log(`[scrape] Fetching page ${pageNumber}`);

  const response = await fetch(scraperUrl(targetUrl));
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
    const response = await fetch(scraperUrl(`${BASE_URL}?page=${pageNum}`));
    const html = await response.text();
    res.send(`<p>Status: ${response.status} | ${html.length} chars</p><pre style="font-size:11px">${html.replace(/</g, "&lt;")}</pre>`);
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
