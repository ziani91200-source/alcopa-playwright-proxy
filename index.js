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
  const cardRegex = /<div class="card h-100">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const block = match[1];

    // Lien + titre
    const linkMatch = block.match(/href="(\/voiture-occasion\/[^"]+)"\s+class="text-white[^"]*"[^>]*>[\s\S]*?<\/i>\s*([\s\S]*?)<\/a>/);
    const link = linkMatch ? "https://www.alcopa-auction.fr" + linkMatch[1] : null;
    const title = linkMatch ? linkMatch[2].trim() : null;

    // Modèle détaillé
    const modelMatch = block.match(/<p class="mb-2">\s*([\s\S]*?)\s*<\/p>/);
    const model = modelMatch ? modelMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim() : null;

    // Énergie, année, km, boîte
    const detailMatch = block.match(/<p class="mb-1">([\s\S]*?)<\/p>/);
    let energy = null, year = null, km = null, gearbox = null;
    if (detailMatch) {
      const detail = detailMatch[1].replace(/<br\s*\/?>/gi, "|");
      energy = detail.split("|")[0].replace(/<[^>]+>/g, "").trim() || null;
      const yearMatch = detail.match(/1ère mise\s*:\s*(\d{4})/);
      year = yearMatch ? yearMatch[1] : null;
      const kmMatch = detail.match(/([\d\s]+)\s*km/);
      km = kmMatch ? kmMatch[1].trim() + " km" : null;
      const gearMatch = detail.match(/Boîte\s+([\wé]+)/);
      gearbox = gearMatch ? gearMatch[1] : null;
    }

    // Prix
    const priceMatch = block.match(/Mise à prix\s*:[\s\S]*?<strong>\s*([\s\S]*?)\s*<\/strong>/);
    const priceRaw = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, "").trim() : null;
    const price = priceRaw === "--" ? null : priceRaw;

    // Lieu
    const lieuMatch = block.match(/fa-location-crosshairs"><\/i>\s*([^<]+)<\/strong>/);
    const lieu = lieuMatch ? lieuMatch[1].trim() : null;

    // Numéro de lot
    const lotMatch = block.match(/Lot n°<strong>(\d+)<\/strong>/);
    const lot = lotMatch ? lotMatch[1] : null;

    // Date de vente
    const dateMatch = block.match(/fa-calendar"><\/i>\s*([\d\/]+)/);
    const date = dateMatch ? dateMatch[1].trim() : null;

    // Image
    const imgMatch = block.match(/src="(https:\/\/photos\.static\.alcopa-auction\.net[^"]+)"/);
    const img = imgMatch ? imgMatch[1] : null;

    // Garantie
    const garantie = /fa-circle-check/.test(block) ? "Oui" : "Non";

    if (title) {
      results.push({ lot, title, model, energy, year, km, gearbox, price, lieu, date, img, garantie, link });
    }
  }

  return results;
}

// --- Scraper multi-pages ---
async function scrapeAlcopa(pageNumber = 1) {
  if (!SCRAPER_API_KEY) throw new Error("SCRAPER_API_KEY manquante");

  const targetUrl = `${BASE_URL}?page=${pageNumber}`;
  console.log(`[scrape] Fetching page ${pageNumber}`);

  const response = await fetch(scraperUrl(targetUrl));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  console.log(`[scrape] HTML: ${html.length} chars`);

  const data = parseVehicles(html);
  console.log(`[scrape] ${data.length} véhicules trouvés`);
  return data;
}

// --- GET /alcopa?page=1 ---
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

// --- GET /alcopa/all?pages=5 — toutes les pages ---
app.get("/alcopa/all", async (req, res) => {
  try {
    const totalPages = parseInt(req.query.pages || "3", 10);
    const allItems = [];

    for (let p = 1; p <= totalPages; p++) {
      const result = await scrapeAlcopa(p);
      allItems.push(...result);
      if (result.length === 0) break;
      await new Promise(r => setTimeout(r, 1000)); // pause 1s entre pages
    }

    res.json({ total: allItems.length, items: allItems });
  } catch (err) {
    console.error("[/alcopa/all]", err);
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
