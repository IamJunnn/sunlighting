// Dev helper: clicks a spot in the Cesium view, runs the window analysis, screenshots the result.
import puppeteer from 'puppeteer-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [url, out] = process.argv.slice(2);
const base = join(homedir(), '.cache/puppeteer/chrome');
const ver = readdirSync(base)[0];
const exe = join(base, ver, 'chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1440,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('console', (m) => { if (['error', 'warn'].includes(m.type())) console.log(`[console.${m.type()}]`, m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForSelector('.cesium-viewer canvas', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 8000));
await page.mouse.click(720, 520);
await new Promise((r) => setTimeout(r, 1500));
const t0 = Date.now();
try { await page.waitForSelector('.window-section .hero-num', { timeout: 60000 }); console.log('analysis done in', Date.now() - t0, 'ms'); } catch { console.log('analysis did not finish'); }
const text = await page.$eval('.window-section', (el) => el.innerText.replace(/\s+/g, ' ').slice(0, 300)).catch(() => '(no results section)');
console.log('panel:', text);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
