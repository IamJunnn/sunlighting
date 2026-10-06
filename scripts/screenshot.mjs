// Dev helper: node scripts/screenshot.mjs <url> <out.png> [waitSelector] [extraWaitMs]
import puppeteer from 'puppeteer-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [url, out, waitSel = 'body', extraWait = '3000'] = process.argv.slice(2);
const base = join(homedir(), '.cache/puppeteer/chrome');
const ver = readdirSync(base)[0];
const exe = join(base, ver, 'chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1440,900'],
});
const page = await browser.newPage();
const [vw, vh] = (process.env.VIEWPORT ?? '1440x900').split('x').map(Number);
await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1, isMobile: vw < 800, hasTouch: vw < 800 });
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warn' || t === 'debug') console.log(`[console.${t}]`, m.text().slice(0, 400));
});
page.on('response', (r) => { if (r.status() >= 400) console.log('[http', r.status() + ']', r.url().slice(0, 120)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('requestfailed', (r) => console.log('[requestfailed]', r.url().slice(0, 120), r.failure()?.errorText));
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
try {
  await page.waitForSelector(waitSel, { timeout: 90000 });
} catch (e) {
  console.log('[wait]', e.message);
}
await new Promise((r) => setTimeout(r, +extraWait));
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
