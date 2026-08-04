import { logger } from "../../lib/logger.js";

// Facebook actively blocks scraping. Playwright with stealth plugin is needed
// for higher volume. This stub loads playwright dynamically so the server
// starts even when playwright is not installed.

export async function runFacebookEventsScraper(): Promise<number> {
  try {
    // @ts-ignore — playwright is optional; dynamic import prevents startup crash
    const { chromium } = await import("playwright");

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      viewport: { width: 1280, height: 720 },
      locale: "en-GB",
    });

    let total = 0;
    const searchUrls = [
      "https://www.facebook.com/events/search/?q=Lagos&filters=",
      "https://www.facebook.com/events/search/?q=London+event&filters=",
      "https://www.facebook.com/events/search/?q=Manchester+event&filters=",
    ];

    for (const url of searchUrls) {
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

        for (let i = 0; i < 5; i++) {
          // @ts-ignore
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(1500);
        }

        // @ts-ignore
        const events: Array<{ title: string; date: string; location: string; url: string }> =
          await page.evaluate(() => {
            // @ts-ignore
            const cards = document.querySelectorAll('[data-testid="event_card"], [role="article"]');
            // @ts-ignore
            return Array.from(cards).map((card: Element) => ({
              // @ts-ignore
              title: card.querySelector("h2, h3, strong")?.textContent?.trim() ?? "",
              // @ts-ignore
              date: card.querySelector('[data-key="event_time"], time')?.textContent?.trim() ?? "",
              // @ts-ignore
              location: card.querySelector('[data-key="event_venue"]')?.textContent?.trim() ?? "",
              // @ts-ignore
              url: (card.querySelector("a") as HTMLAnchorElement | null)?.href ?? "",
            // @ts-ignore
            })).filter((e: { title: string }) => e.title);
          });

        total += events.length;
        await page.close();
      } catch (err) {
        logger.warn({ err }, "Facebook scrape error for URL");
      }
      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));
    }

    await browser.close();
    return total;
  } catch {
    logger.warn(
      "Playwright not available — Facebook scraper skipped. Install with: npx playwright install chromium",
    );
    return 0;
  }
}
