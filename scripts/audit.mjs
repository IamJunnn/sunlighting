// Exhaustive UI audit: presses every control and records the observed result.
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
const results = [];
const log = (control, observed) => { results.push([control, observed]); console.log(`• ${control}\n    → ${observed}`); };
const text = (sel) => page.$eval(sel, (el) => el.innerText.trim()).catch(() => null);
const cam = () => page.evaluate(() => { const v = window.__viewer; if (!v) return null; const c = v.camera.positionCartographic; return { lat: +(c.latitude * 180 / Math.PI).toFixed(5), lon: +(c.longitude * 180 / Math.PI).toFixed(5), h: Math.round(c.height), heading: Math.round(v.camera.heading * 180 / Math.PI) % 360, pitch: Math.round(v.camera.pitch * 180 / Math.PI) }; });
const shot = (name) => page.screenshot({ path: join(shots, name + '.png') });

// ---------- PICKER ----------
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('.search input');
await wait(2500);
log('Picker: initial map', `map centre lon/lat from canvas present=${!!(await page.$('.maplibregl-canvas'))}, panel text="${(await text('.picker-panel')).replace(/\n/g, ' | ')}"`);

await page.type('.search input', 'preston hollow apt', { delay: 10 });
await wait(7000);
let items = await page.$$eval('.results button', (els) => els.map((e) => e.textContent));
log('Search (live, complex name "preston hollow apt")', items.length ? `suggestions: ${items.join(' / ')}` : `no suggestions; message="${(await text('.picker-panel')).includes('Not in the map') ? 'Not in the map database…' : 'none'}"`);

await page.click('.search input', { clickCount: 3 }); await page.keyboard.press('Backspace');
await page.type('.search input', '350 Fifth Avenue, New York, NY 10118', { delay: 10 });
await wait(7000);
items = await page.$$eval('.results button', (els) => els.map((e) => e.textContent));
log('Search (live, street address)', items.length ? `suggestions: ${items.join(' / ')}` : 'no suggestions');

await page.click('.search button[type=submit]');
await wait(4000);
items = await page.$$eval('.results button', (els) => els.map((e) => e.textContent));
const picked = await text('.picked');
log('Search button (submit)', `results after submit: ${items.length}; picked card="${picked ? picked.replace(/\n/g, ' | ') : 'none'}"`);

if (!picked) { const [b] = await page.$$('.results button'); if (b) { await b.click(); await wait(2500); } }
log('Choose a result', `picked card="${((await text('.picked')) || 'none').replace(/\n/g, ' | ')}"; marker on map=${!!(await page.$('.maplibregl-marker'))}`);

await page.click('button.ghost'); await wait(1500);
log('"Use my location" button', `picked card="${((await text('.picked')) || 'none').replace(/\n/g, ' | ')}" (headless denies geolocation; no visible feedback expected)`);

await page.mouse.click(900, 600); await wait(1500);
log('Click on the map', `picked card="${((await text('.picked')) || 'none').replace(/\n/g, ' | ')}"`);
const zoomIn = await page.$('.maplibregl-ctrl-zoom-in'); if (zoomIn) { await zoomIn.click(); await wait(800); }
log('Map + / − / compass controls', `present=${!!zoomIn}`);
await shot('audit-picker');

// go to the real address for the viewer tests
await page.click('.search input', { clickCount: 3 }); await page.keyboard.press('Backspace');
await page.type('.search input', '350 Fifth Avenue, New York, NY 10118', { delay: 5 }); await wait(6000);
const [res] = await page.$$('.results button'); if (res) await res.click(); await wait(1500);
await page.click('.picked button.primary');
await wait(1500);
log('"Analyze sunlight →" button', `url=${page.url()}; viewer header="${await text('.topbar .loc')}"`);

// ---------- VIEWER ----------
await page.waitForSelector('.cesium-viewer canvas', { timeout: 60000 });
await wait(12000);
log('3D view load', `status banner="${(await text('.cesium-status')) || 'none'}"; hint="${(await text('.cesium-hint')) || 'none'}"; camera=${JSON.stringify(await cam())}`);
await shot('audit-viewer-start');

const dateBefore = await text('.panel .muted.small');
await page.click('button[aria-label="Previous day"]'); await wait(500);
const datePrev = await text('.panel .muted.small');
await page.click('button[aria-label="Next day"]'); await page.click('button[aria-label="Next day"]'); await wait(500);
const dateNext = await text('.panel .muted.small');
log('Date ‹ / › buttons', `${dateBefore} → ‹ ${datePrev} → ›› ${dateNext}; url=${page.url().split('#')[1]}`);
await page.$eval('input[type=date]', (el) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, '2026-12-31'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
await wait(500);
log('Date input (typed 2026-12-31)', `label="${await text('.panel .muted.small')}"; shows year=${/2026/.test(await text('.panel .muted.small'))}`);

const setSlider = (v) => page.$eval('input[type=range]', (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
await setSlider(540); await wait(400);
const t9 = await text('.time-display'); const alt9 = await text('.stats');
await setSlider(1300); await wait(400);
const t2140 = await text('.time-display'); const alt2140 = await text('.stats');
log('Time slider', `540→"${t9}" (${alt9.replace(/\n/g, ' ')}); 1300→"${t2140}" (${alt2140.replace(/\n/g, ' ')}); night darkening overlay present=${!!(await page.$('.night-overlay'))}`);
await shot('audit-night');

await page.click('button.primary'); await wait(1500);
const tPlay1 = await text('.time-display'); await wait(1000); const tPlay2 = await text('.time-display');
const playLabel = await text('button.primary');
await page.click('button.primary'); await wait(300);
log('Play day / Pause', `label while playing="${playLabel}"; time ${tPlay1} → ${tPlay2} over 1 s; after pause label="${await text('button.primary')}"`);
const speeds = await page.$$eval('select option', (os) => os.map((o) => o.textContent));
log('Speed select', `options: ${speeds.join(', ')}`);

// window click + analysis
await setSlider(900); await wait(300);
await page.mouse.click(760, 520); await wait(1000);
const busy = await text('.window-section');
await page.waitForSelector('.window-section .hero-num', { timeout: 60000 }).catch(() => {});
await wait(500);
log('Click a window in 3D', `immediately: "${(busy || '').replace(/\n/g, ' ').slice(0, 80)}"; result: "${((await text('.window-section')) || 'none').replace(/\n/g, ' | ')}"`);
await shot('audit-window');

const box = await page.$eval('.timeline svg', (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await page.mouse.click(box.x + box.w * 0.25, box.y + box.h / 2); await wait(400);
log('Click on the day timeline', `time display → "${await text('.time-display')}" (expected ~06:00)`);

const [wy] = await page.$$('xpath/.//button[contains(., "Whole year")]');
if (wy) { await wy.click(); await page.waitForSelector('.monthly', { timeout: 120000 }).catch(() => {}); await wait(500); }
log('"Whole year" button', `monthly chart present=${!!(await page.$('.monthly'))}; legend="${(await text('.monthly + .legend, .chart .legend')) || ''}"`);
const months = await page.$$('.monthly .month');
if (months[5]) { await months[5].click(); await wait(600); }
log('Click a month in the chart', `date label → "${await text('.panel .muted.small')}"; window result → "${((await text('.window-section .hero-num')) || 'none')}"`);
await shot('audit-year');

const c0 = await cam();
await page.click('button[aria-label="Rotate view right"]'); await wait(600);
const c1 = await cam();
await page.click('button[aria-label="Rotate view left"]'); await page.click('button[aria-label="Rotate view left"]'); await wait(600);
const c2 = await cam();
await page.click('button[aria-label="Face north"]'); await wait(600);
const c3 = await cam();
log('Rotate ⟳ / ⟲ / N up', `start ${JSON.stringify(c0)} → ⟳ ${JSON.stringify(c1)} → ⟲⟲ ${JSON.stringify(c2)} → N ${JSON.stringify(c3)}`);
// drag the camera away then press back
await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(300, 200, { steps: 10 }); await page.mouse.up(); await wait(500);
const cDrag = await cam();
await page.click('.recenter'); await wait(600);
const cHome = await cam();
log('Drag map, then "◎ location" button', `after drag ${JSON.stringify(cDrag)} → after button ${JSON.stringify(cHome)}`);
await page.mouse.move(700, 450); await page.mouse.down({ button: 'right' }); await page.mouse.move(900, 450, { steps: 10 }); await page.mouse.up({ button: 'right' }); await wait(500);
log('Right-drag (rotate/tilt)', `camera ${JSON.stringify(await cam())}`);
await page.mouse.move(700, 450); await page.mouse.wheel({ deltaY: -2000 }); await wait(500); const cZin = await cam();
await page.mouse.wheel({ deltaY: 30000 }); await wait(500); const cZout = await cam();
log('Scroll zoom in / out (limits)', `zoom-in h=${cZin?.h} → zoom-out h=${cZout?.h}`);
await shot('audit-after-nav');

const labels = await page.evaluate(() => window.__viewer.entities.values.filter((e) => e.label && !e.billboard && !e.point).length);
log('Street / house-number labels', `${labels} OSM labels loaded`);
const retry = await page.$('.cesium-status button');
log('Status banner / Retry', `banner="${(await text('.cesium-status')) || 'none'}"; retry button=${!!retry}`);

// URL hash navigation
await page.evaluate(() => { location.hash = '#40.74844,-73.98566,Empire%20State%20Building&d=2026-06-21&t=08:00'; });
await wait(1500);
log('Hash change (date/time in URL)', `header="${await text('.topbar .loc strong')}"; date="${await text('.panel .muted.small')}"; time="${await text('.time-display')}"`);

await page.click('.topbar .back'); await wait(1500);
log('"‹ Change location" button', `url=${page.url()}; picker visible=${!!(await page.$('.picker-panel'))}`);

await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto('http://localhost:5173/#40.74844,-73.98566,Empire%20State%20Building&d=2026-12-31&t=15:00', { waitUntil: 'networkidle2', timeout: 60000 });
await wait(9000);
const overlap = await page.evaluate(() => { const p = document.querySelector('.panel.controls')?.getBoundingClientRect(); const b = document.querySelector('.view-buttons')?.getBoundingClientRect(); return p && b ? { panelBottom: Math.round(p.bottom), buttonsTop: Math.round(b.top), panelHeight: Math.round(p.height) } : null; });
log('Phone layout (390×844)', `panel/buttons geometry=${JSON.stringify(overlap)}`);
await shot('audit-mobile');

console.log('\nERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
