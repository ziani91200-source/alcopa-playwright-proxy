import express from "express";
import { chromium } from "playwright-chromium";

const app = express();
app.use(express.json());

// --- Launch helper ---
async function launchBrowser() {
  return await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });
}

// --- Scraper Alcopa ---
async function scrapeAlcopa(pageNumber = 1) {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();

    // Bloquer images/fonts pour accélérer le scraping
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "font", "media"].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const url = `https://www.alcopa-auction.fr/vehicules?page=${pageNumber}`;
    console.log(`[scrape] Fetching page ${pageNumber}: ${url}`);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    await page.waitForSelector(".vehicle-card", { timeout: 15000 }).catch(() => {
      console.warn("[scrape] .vehicle-card not found — vérifier les sélecteurs CSS");
    });

    const data = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".vehicle-card")];
      return items.map(item => ({
        title: item.querySelector(".vehicle-title")?.innerText?.trim() || null,
        price: item.querySelector(".vehicle-price")?.innerText?.trim() || null,
        km:    item.querySelector(".vehicle-mileage")?.innerText?.trim() || null,
        year:  item.querySelector(".vehicle-year")?.innerText?.trim() || null,
        img:   item.querySelector("img")?.src || null,
        link:  item.querySelector("a")?.href || null
      }));
    });

    console.log(`[scrape] ${data.length} véhicules trouvés (page ${pageNumber})`);
    return data;

  } finally {
    await browser.close();
  }
}

// --- GET /alcopa — Endpoint principal ---
app.get("/alcopa", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);

    if (isNaN(page) || page < 1) {
      return res.status(400).json({ error: "Numéro de page invalide" });
    }

    const result = await scrapeAlcopa(page);

    res.json({
      page,
      count: result.length,
      items: result
    });

  } catch (err) {
    console.error("[/alcopa] Erreur:", err);
    res.status(500).json({ error: err.toString() });
  }
});

// --- GET /debug — HTML brut pour identifier les vrais sélecteurs CSS ---
app.get("/debug", async (req, res) => {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    const pageNum = parseInt(req.query.page || "1", 10);

    await page.goto(`https://www.alcopa-auction.fr/vehicules?page=${pageNum}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    await page.waitForTimeout(3000);

    const html = await page.content();
    res.send(`<pre style="font-size:12px">${html.replace(/</g, "&lt;")}</pre>`);

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  } finally {
    await browser.close();
  }
});

// --- GET /health — Vérification que le service tourne ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Démarrage serveur ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Playwright proxy démarré sur le port ${PORT}`);
});
