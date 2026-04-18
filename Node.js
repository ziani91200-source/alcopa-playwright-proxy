import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/alcopa", async (req, res) => {
  const pageNumber = req.query.page || 1;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
    });

    const url =
      `https://www.alcopa-auction.fr/recherche?sort=relevance&categories[]=VP&years[]=2020-2100&energy_families[]=GO&page=${pageNumber}`;

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("article.vehicle-card", { timeout: 15000 });

    const vehicles = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("article.vehicle-card")];

      return cards.map(card => {
        const url = card.querySelector("a")?.href || "";
        const title = card.querySelector("h2")?.innerText || "";
        const subtitle = card.querySelector("p")?.innerText || "";

        return { url, title, subtitle };
      });
    });

    res.json({
      page: Number(pageNumber),
      count: vehicles.length,
      items: vehicles
    });

  } catch (err) {
    console.error("Playwright error:", err);
    res.status(500).json({ error: err.toString() });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log("Playwright proxy running on port " + PORT);
});
