import express from "express";
import { chromium } from "playwright-chromium";

const app = express();
app.use(express.json());

// --- Scraper Alcopa ---
async function scrapeAlcopa(pageNumber = 1) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  const url = `https://www.alcopa-auction.fr/vehicules?page=${pageNumber}`;
  await page.goto(url, { waitUntil: "networkidle" });

  const data = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".vehicle-card")];
    return items.map(item => ({
      title: item.querySelector(".vehicle-title")?.innerText || null,
      price: item.querySelector(".vehicle-price")?.innerText || null,
      km: item.querySelector(".vehicle-mileage")?.innerText || null,
      year: item.querySelector(".vehicle-year")?.innerText || null,
      img: item.querySelector("img")?.src || null
    }));
  });

  await browser.close();
  return data;
}

// --- API Endpoint ---
app.get("/alcopa", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const result = await scrapeAlcopa(page);

    res.json({
      page,
      count: result.length,
      items: result
    });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// --- Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Playwright proxy running on port", PORT);
});
