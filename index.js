import express from "express";
import { chromium } from "playwright-chromium";

const app = express();
app.use(express.json());

// --- Launch helper (shared config) ---
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

    // Block images/fonts to speed up loading
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

    // Wait for vehicle cards to appear
    await page.waitForSelector(".vehicle-card", { timeout: 15000 }).catch(() => {
      console.warn("[scrape] .vehicle-card not found — selectors may need updating");
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

    console.log(`[scrape] Found ${data.length} items on page ${pageNumber}`);
    return data;

  } finally {
    await browser.close();
  }
}

// --- /alcopa — Main endpoint ---
app.get("/alcopa", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);

    if (isNaN(page) || page < 1) {
      return res.status(400).json({ error: "Invalid page number" });
    }

    const result = await scrapeAlcopa(page);

    res.json({
      page,
      count: result.length,
      items: result
    });

  } catch (err) {
    console.error("[/alcopa] Error:", err);
    res.status(500).json({ error: err.toString() });
  }
});

// --- /debug — Returns raw HTML to identify real CSS selectors ---
app.get("/debug", async (req, res) => {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    const pageNum = parseInt(req.query.page || "1", 10);

    await page.goto(`https://www.alcopa-auction.fr/vehicules?page=${pageNum}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    // Short wait to let JS render content
    await page.waitForTimeout(3000);

    const html = await page.content();
    res.send(`<pre style="font-size:12px">${html.replace(/</g, "&lt;")}</pre>`);

  } catch (err) {
    res.status(500).json({ error: err.toString() });
  } finally {
    await browser.close();
  }
});

// --- /health — Quick status check ---
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Playwright proxy running on port ${PORT}`);
});
