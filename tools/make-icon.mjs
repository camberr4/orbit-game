// Renders the app icon (the O of the logo, in a square), its Android layers and the splash.
// Usage: node tools/make-icon.mjs   (needs the playwright package)
import { chromium } from 'playwright';
import fs from 'node:fs';
const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a7a"/><stop offset=".55" stop-color="#0b1244"/><stop offset="1" stop-color="#04061c"/></linearGradient>
  <radialGradient id="b1" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7a5cff" stop-opacity=".55"/><stop offset="1" stop-color="#7a5cff" stop-opacity="0"/></radialGradient>
  <radialGradient id="b2" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#3fe0ff" stop-opacity=".4"/><stop offset="1" stop-color="#3fe0ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="ring" gradientUnits="userSpaceOnUse" x1="-60" y1="-60" x2="60" y2="60"><stop offset="0" stop-color="#eaf8ff"/><stop offset=".5" stop-color="#dbe8ff"/><stop offset="1" stop-color="#d9b8ff"/></linearGradient>
  <linearGradient id="gl" gradientUnits="userSpaceOnUse" x1="0" y1="-30" x2="0" y2="30"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#6aa0ff" stop-opacity=".35"/></linearGradient>
  <linearGradient id="orb" gradientUnits="userSpaceOnUse" x1="-74" y1="0" x2="74" y2="0"><stop offset="0" stop-color="#4fe8ff"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#ff6fd8"/></linearGradient>
  <radialGradient id="pl" cx=".38" cy=".32" r=".85"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#f1f6ff"/><stop offset="1" stop-color="#c9d4f5"/></radialGradient>
  <filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="bl2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter></defs>`;
// the O: a heavy ring with a small planet in it and a tilted orbit ring around it (back half behind the O, front half over it)
const O = `<g>
  <g transform="rotate(-24)"><path d="M-74 0A74 23 0 0 1 74 0" fill="none" stroke="url(#orb)" stroke-width="4" opacity=".7"/></g>
  <circle r="40" fill="none" stroke="#4d7dff" stroke-width="20" opacity=".5" filter="url(#bl)"/>
  <circle r="40" cy="3.5" fill="none" stroke="#5f86f0" stroke-width="20"/>
  <circle r="40" fill="none" stroke="url(#ring)" stroke-width="20"/>
  <circle r="40" fill="none" stroke="url(#gl)" stroke-width="20"/>
  <circle r="19" fill="#fff" opacity=".45" filter="url(#bl2)"/><circle r="14" fill="url(#pl)"/><circle cx="-4.5" cy="-5" r="3.6" fill="#fff" opacity=".85"/>
  <g transform="rotate(-24)"><path d="M-74 0A74 23 0 0 0 74 0" fill="none" stroke="url(#orb)" stroke-width="11" opacity=".5" filter="url(#bl2)"/><path d="M-74 0A74 23 0 0 0 74 0" fill="none" stroke="url(#orb)" stroke-width="4.4"/><path d="M-52 15.6A74 23 0 0 0 52 15.6" fill="none" stroke="#fff" stroke-width="2" opacity=".9"/></g></g>`;
const stars = (() => { let s = 7, o = ''; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 40; i++) o += `<circle cx="${(r() * 200 - 100).toFixed(1)}" cy="${(r() * 200 - 100).toFixed(1)}" r="${(0.25 + r() * 0.7).toFixed(2)}" fill="#fff" opacity="${(0.25 + r() * 0.6).toFixed(2)}"/>`; return o; })();
const bgSvg = `<rect x="-100" y="-100" width="200" height="200" fill="url(#bg)"/><circle cx="60" cy="-70" r="90" fill="url(#b1)"/><circle cx="-70" cy="80" r="90" fill="url(#b2)"/>${stars}`;
const page = s => `<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-100 -100 200 200">${defs}${s}</svg></body></html>`;
const b = await chromium.launch({ args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1024, height: 1024 } });
const shot = async (svg, file, transparent) => { await pg.setContent(page(svg)); await pg.screenshot({ path: file, omitBackground: !!transparent }); };
await shot(bgSvg + `<g transform="scale(1.25)">${O}</g>`, 'assets/icon-only.png');
await shot(`<g transform="scale(1.0)">${O}</g>`, 'assets/icon-foreground.png', true);   // (adaptive icons crop to the middle: the O stays inside the safe circle)
await shot(bgSvg, 'assets/icon-background.png');
await shot(bgSvg + `<g transform="scale(1.2)">${O}</g>`, 'store/icon-512.png');
await b.close();
console.log('icon written');
