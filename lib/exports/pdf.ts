// HTML → PDF via headless Chromium (playwright-core, using the pre-installed
// browser). If Chromium can't be launched (e.g. a host without it), callers
// fall back to serving the HTML directly — the flow never hard-fails.
import { existsSync } from "node:fs";
import { glob } from "node:fs/promises";

async function resolveChromium(): Promise<string | undefined> {
  // Common fixed paths first (fast path in this environment).
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  ].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;

  // Otherwise glob for any chromium build under the browsers path.
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    for await (const entry of glob(`${base}/chromium-*/chrome-linux/chrome`)) {
      if (existsSync(entry)) return entry;
    }
  } catch {
    /* glob unavailable — fall through */
  }
  return undefined;
}

export async function htmlToPdf(html: string): Promise<Buffer | null> {
  let browser: import("playwright-core").Browser | null = null;
  try {
    const { chromium } = await import("playwright-core");
    const executablePath = await resolveChromium();
    browser = await chromium.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
    return Buffer.from(pdf);
  } catch {
    // Chromium unavailable — signal caller to fall back to HTML.
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
