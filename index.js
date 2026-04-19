import express from "express";

const app = express();
app.use(express.json());

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
const BASE_URL = "https://www.alcopa-auction.fr/recherche";
const ITEMS_PER_PAGE = 20;

function scraperUrl(targetUrl) {
  return `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&render=false`;
}

// --- Mots-clés SUV 7 places ---
const SUV_7_KEYWORDS = [
  "7PL", "7 PL", "7 PLACE", "7PLACE",
  "ALLSPACE", "GRAND C4", "GRAND SCENIC", "GRAND ESPACE",
  "KOLEOS", "TIGUAN ALLSPACE", "TOUAREG", "Q7",
  "5008", "TARRACO", "KODIAQ", "LAND ROVER",
  "DISCOVERY", "OUTLANDER", "SORENTO", "SANTA FE",
  "GALAXY", "S-MAX", "TOURAN", "BERLINGO", "RIFTER",
  "TRAFIC", "VITO", "ZAFIRA", "DS7"
];

function isSuv7(title, model) {
  const text = ((title || "") + " " + (model || "")).toUpperCase();
  return SUV_7_KEYWORDS.some(kw => text.includes(kw.toUpperCase()));
}

// --- Parser HTML ---
function parseVehicles(html) {
  const results = [];
  const cardRegex = /<div class="card h-100">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const block = match[1];

    const linkMatch = block.match(/href="(\/voiture-occasion\/[^"]+)"\s+class="text-white[^"]*"[^>]*>[\s\S]*?<\/i>\s*([\s\S]*?)<\/a>/);
    const link  = linkMatch ? "https://www.alcopa-auction.fr" + linkMatch[1] : null;
    const title = linkMatch ? linkMatch[2].trim() : null;

    const modelMatch = block.match(/<p class="mb-2">\s*([\s\S]*?)\s*<\/p>/);
    const model = modelMatch ? modelMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim() : null;

    const detailMatch = block.match(/<p class="mb-1">([\s\S]*?)<\/p>/);
    let energy = null, year = null, km = null, gearbox = null;
    if (detailMatch) {
      const detail = detailMatch[1].replace(/<br\s*\/?>/gi, "|");
      energy = detail.split("|")[0].replace(/<[^>]+>/g, "").trim() || null;
      const yearM = detail.match(/1ère mise\s*:\s*(\d{4})/);
      year = yearM ? yearM[1] : null;
      const kmM = detail.match(/([\d\s]+)\s*km/);
      km = kmM ? kmM[1].trim() + " km" : null;
      const gearM = detail.match(/Boîte\s+([\wé]+)/);
      gearbox = gearM ? gearM[1] : null;
    }

    const priceMatch = block.match(/Mise à prix\s*:[\s\S]*?<strong>\s*([\s\S]*?)\s*<\/strong>/);
    const priceRaw = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, "").trim() : null;
    const price = priceRaw === "--" ? null : priceRaw;

    const lieuMatch = block.match(/fa-location-crosshairs"><\/i>\s*([^<]+)<\/strong>/);
    const lieu = lieuMatch ? lieuMatch[1].trim() : null;

    const lotMatch = block.match(/Lot n°<strong>(\d+)<\/strong>/);
    const lot = lotMatch ? lotMatch[1] : null;

    const dateMatch = block.match(/fa-calendar"><\/i>\s*([\d\/]+)/);
    const date = dateMatch ? dateMatch[1].trim() : null;

    const imgMatch = block.match(/src="(https:\/\/photos\.static\.alcopa-auction\.net[^"]+)"/);
    const img = imgMatch ? imgMatch[1] : null;

    const garantie = /fa-circle-check/.test(block) ? "Oui" : "Non";

    if (title) {
      results.push({ lot, title, model, energy, year, km, gearbox, price, lieu, date, img, garantie, link });
    }
  }

  return results;
}

// --- Lire le total de résultats depuis le HTML ---
function parseTotalItems(html) {
  const m = html.match(/<b class="nb_items">(\d+)<\/b>/);
  return m ? parseInt(m[1]) : null;
}

// --- Construire l'URL de recherche ---
function buildUrl(page, params = {}) {
  let url = `${BASE_URL}?page=${page}`;
  if (params.category) url += `&categories[]=${params.category}`;
  if (params.brand)    url += `&brands[]=${encodeURIComponent(params.brand)}`;
  return url;
}

// --- Scraper une page ---
async function scrapePage(page, params = {}) {
  const targetUrl = buildUrl(page, params);
  const response  = await fetch(scraperUrl(targetUrl));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html  = await response.text();
  const items = parseVehicles(html);
  const total = parseTotalItems(html);
  return { items, total, html };
}

// ============================================================
// GET /alcopa?page=1&category=VP&suv7=1&brand=PEUGEOT
// ============================================================
app.get("/alcopa", async (req, res) => {
  try {
    const page     = parseInt(req.query.page || "1", 10);
    const category = req.query.category || null;
    const brand    = req.query.brand    || null;
    const suv7     = req.query.suv7 === "1";

    if (isNaN(page) || page < 1) return res.status(400).json({ error: "Page invalide" });

    const { items, total } = await scrapePage(page, { category, brand });
    const filtered = suv7 ? items.filter(v => isSuv7(v.title, v.model)) : items;
    const totalPages = total ? Math.ceil(total / ITEMS_PER_PAGE) : null;

    res.json({ page, total_items: total, total_pages: totalPages, count: filtered.length, items: filtered });

  } catch (err) {
    console.error("[/alcopa]", err);
    res.status(500).json({ error: err.toString() });
  }
});

// ============================================================
// GET /alcopa/all?category=VP&suv7=1
// Scrape TOUTES les pages automatiquement
// ============================================================
app.get("/alcopa/all", async (req, res) => {
  try {
    if (!SCRAPER_API_KEY) throw new Error("SCRAPER_API_KEY manquante");

    const category = req.query.category || null;
    const brand    = req.query.brand    || null;
    const suv7     = req.query.suv7 === "1";

    // Page 1 pour connaître le total
    console.log("[all] Lecture page 1 pour détecter le total...");
    const { items: firstItems, total, html: firstHtml } = await scrapePage(1, { category, brand });

    if (!total) throw new Error("Impossible de lire le nombre total de résultats");

    const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
    console.log(`[all] ${total} résultats → ${totalPages} pages à scraper`);

    const filtered1 = suv7 ? firstItems.filter(v => isSuv7(v.title, v.model)) : firstItems;
    const allItems  = [...filtered1];

    // Pages suivantes
    for (let p = 2; p <= totalPages; p++) {
      try {
        await new Promise(r => setTimeout(r, 1200));
        const { items } = await scrapePage(p, { category, brand });
        const filtered = suv7 ? items.filter(v => isSuv7(v.title, v.model)) : items;
        allItems.push(...filtered);
        console.log(`[all] Page ${p}/${totalPages}: ${filtered.length} items (total: ${allItems.length})`);
        if (items.length === 0) break;
      } catch (e) {
        console.error(`[all] Erreur page ${p}:`, e.message);
      }
    }

    res.json({
      total_site:    total,
      total_pages:   totalPages,
      total_scraped: allItems.length,
      items:         allItems
    });

  } catch (err) {
    console.error("[/alcopa/all]", err);
    res.status(500).json({ error: err.toString() });
  }
});

// ============================================================
// GET /info?category=VP — infos sans scraper tout
// ============================================================
app.get("/info", async (req, res) => {
  try {
    if (!SCRAPER_API_KEY) throw new Error("SCRAPER_API_KEY manquante");
    const category = req.query.category || null;
    const { total } = await scrapePage(1, { category });
    const totalPages = total ? Math.ceil(total / ITEMS_PER_PAGE) : null;
    res.json({ total_items: total, total_pages: totalPages, items_per_page: ITEMS_PER_PAGE });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// GET /debug
app.get("/debug", async (req, res) => {
  try {
    if (!SCRAPER_API_KEY) throw new Error("SCRAPER_API_KEY manquante");
    const page     = parseInt(req.query.page || "1", 10);
    const category = req.query.category || null;
    const { html, total } = await scrapePage(page, { category });
    res.send(`<p>Total: ${total} | Pages: ${Math.ceil(total/ITEMS_PER_PAGE)}</p><pre style="font-size:11px">${html.replace(/</g, "&lt;")}</pre>`);
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// GET /health
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy démarré sur le port ${PORT}`));
