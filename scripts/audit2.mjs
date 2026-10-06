// Re-verifies the items fixed in this round, without loading Google 3D tiles more than once.
import puppeteer from 'puppeteer-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const base = join(homedir(), '.cache/puppeteer/chrome');
const ver = readdirSync(base)[0];
const exe = join(base, ver, 'chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const shots = process.argv[2];
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/429|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (sel) => page.$eval(sel, (el) => el.innerText.trim()).catch(() => null);
const log = (c, o) => console.log(`• ${c}\n    → ${o}`);
const cam = () => page.evaluate(() => { const v = window.__viewer; if (!v) return null; const c = v.camera.positionCartographic; return { h: Math.round(c.height), heading: Math.round(v.camera.heading * 180 / Math.PI) % 360, pitch: Math.round(v.camera.pitch * 180 / Math.PI) }; });
const clearInput = async () => { await page.focus('.search input'); await page.keyboard.down('Meta'); await page.keyboard.press('a'); await page.keyboard.up('Meta'); await page.keyboard.press('Backspace'); };

// Picker: stale-response race. Type a slow query, then quickly a different one; the first must not win.
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('.search input');
await page.type('.search input', 'preston hollow apt', { delay: 5 });
await wait(600);
await clearInput();
await page.type('.search input', '350 Fifth Avenue New York', { delay: 5 });
let seen = [];
for (let i = 0; i < 12; i++) { await wait(1000); const items = await page.$$eval('.results button', (els) => els.map((e) => e.textContent)); const spin = !!(await page.$('.picker-panel .spinner')); seen.push(`${i + 1}s:${spin ? 'spinner' : ''}${items.length ? items[0].slice(0, 30) : '-'}`); }
log('Search race + spinner', seen.join(' | '));
await page.mouse.click(900, 650); await wait(3500);
log('Map click reverse-geocoded', `card="${((await text('.picked')) || '').replace(/\n/g, ' | ')}"`);
await page.click('button.ghost'); await wait(1500);
log('Use my location (denied)', `message="${(await text('.picker-panel .warn')) || 'none'}"`);

// Viewer
await page.goto('http://localhost:5173/#40.74844,-73.98566,Empire%20State%20Building&d=2026-10-06&t=12:00', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('.cesium-viewer canvas', { timeout: 60000 });
await wait(12000);
log('3D load', `banner="${((await text('.cesium-status')) || 'none').slice(0, 90)}"`);
log('Date control', `panel date row="${(await page.$$eval('.panel section:first-of-type .row > *', (els) => els.map((e) => e.tagName + ':' + (e.value ?? e.textContent.trim())).join(' '))).slice(0, 160)}"; label="${await text('.panel .muted.small')}"`);
const setSlider = (v) => page.$eval('input[type=range]', (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
await setSlider(1300); await wait(500);
const ov = await page.$eval('.night-overlay', (el) => getComputedStyle(el).backgroundColor + ' / ' + el.style.background.slice(0, 120));
log('Night overlay at 21:40', ov);
await page.screenshot({ path: join(shots, 'audit2-night.png') });
await setSlider(600); await wait(500);
log('Overlay at 10:00', await page.$eval('.night-overlay', (el) => el.style.background.slice(0, 120)));

await page.click('button.primary'); await wait(1200); const tp1 = await text('.time-display'); await wait(1000); const tp2 = await text('.time-display'); await page.click('button.primary');
await setSlider(1380); await page.click('button.primary'); await wait(800); const tp3 = await text('.time-display'); await page.click('button.primary');
log('Playback daylight loop', `from 10:00 → ${tp1} → ${tp2}; from 23:00 → ${tp3} (should jump to ~07:00)`);

await setSlider(900); await wait(300);
await page.mouse.click(760, 520);
await page.waitForSelector('.window-section .hero-num', { timeout: 90000 }).catch(() => {});
await page.waitForSelector('.monthly', { timeout: 90000 }).catch(() => {});
await wait(500);
log('Click window → day + whole year automatically', `result="${((await text('.window-section')) || 'none').replace(/\n/g, ' | ').slice(0, 220)}"; monthly chart=${!!(await page.$('.monthly'))}`);
await page.click('button[aria-label="Next day"]'); await wait(150);
const during = await page.$eval('.window-section', (el) => ({ dimmed: !!el.querySelector('.dimmed'), hasNum: !!el.querySelector('.hero-num') }));
await page.waitForFunction(() => !document.querySelector('.window-section .dimmed'), { timeout: 60000 }).catch(() => {});
log('Change date while a result is shown', `during re-run: ${JSON.stringify(during)}; after: "${(await text('.window-section .hero-num'))}"`);
log('Past-years sunshine block', `"${((await page.$$eval('.panel section', (ss) => ss.map((x) => x.innerText).find((t) => /past years/.test(t)))) || 'not shown').replace(/\n/g, ' | ').slice(0, 260)}"`);
await page.screenshot({ path: join(shots, 'audit2-result.png') });

const c0 = await cam();
await page.mouse.move(700, 450); await page.mouse.down({ button: 'right' }); await page.mouse.move(900, 450, { steps: 10 }); await page.mouse.up({ button: 'right' }); await wait(500);
const c1 = await cam();
log('Right-drag rotates', `${JSON.stringify(c0)} → ${JSON.stringify(c1)}`);
await page.mouse.wheel({ deltaY: 40000 }); await wait(600);
log('Zoom-out cap', `camera h=${(await cam())?.h} (ground ≈1285, cap 700 above)`);

await page.evaluate(() => { location.hash = '#40.74844,-73.98566,Empire%20State%20Building&d=2026-06-21&t=08:00'; });
await wait(1200);
log('Hash change applies date/time', `date="${await text('.panel .muted.small')}" time="${await text('.time-display')}"`);
console.log('\nERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
