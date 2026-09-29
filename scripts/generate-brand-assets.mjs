// Generates every SKFL brand image from the vector monogram.
// Run: npm run brand:assets   (needs the sharp dev dependency)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { GOLD_STOPS, SKFL_LETTERS, SKFL_STROKE, SKFL_VIEWBOX } from '../src/components/brand/skflPaths.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => join(root, 'assets', p);

const goldDefs = `
  <linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${SKFL_VIEWBOX.width}" y2="${SKFL_VIEWBOX.height}">
    ${GOLD_STOPS.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('')}
  </linearGradient>`;

/** The monogram as an SVG <g>, scaled to `width` and centred at (cx, cy). */
function monogram(width, cx, cy, fill = 'url(#gold)') {
  const scale = width / SKFL_VIEWBOX.width;
  const x = cx - width / 2;
  const y = cy - (SKFL_VIEWBOX.height * scale) / 2;
  const paths = SKFL_LETTERS.map((l) => `<path d="${l.d}"/>`).join('');
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${fill}" stroke-width="${SKFL_STROKE}" stroke-linecap="butt" stroke-linejoin="miter">${paths}</g>`;
}

const darkBg = (size) => `
  <radialGradient id="glow" cx="50%" cy="46%" r="60%">
    <stop offset="0" stop-color="#3A2E14"/>
    <stop offset="0.55" stop-color="#17161A"/>
    <stop offset="1" stop-color="#0B0B0D"/>
  </radialGradient>
  <rect width="${size}" height="${size}" fill="url(#glow)"/>`;

const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${goldDefs}${defs}</defs>${body}</svg>`;

async function png(file, markup) {
  mkdirSync(dirname(out(file)), { recursive: true });
  await sharp(Buffer.from(markup)).png().toFile(out(file));
  console.log('✓', file);
}

// App icon (iOS + fallback): dark glow, gold monogram, fine gold frame.
await png(
  'images/icon.png',
  svg(1024, 1024, `${darkBg(1024)}<rect x="44" y="44" width="936" height="936" rx="190" fill="none" stroke="url(#gold)" stroke-opacity="0.55" stroke-width="4"/>${monogram(700, 512, 512)}`),
);

// Android adaptive icon layers (content kept inside the 66% safe zone).
await png('images/android-icon-background.png', svg(1024, 1024, darkBg(1024)));
await png('images/android-icon-foreground.png', svg(1024, 1024, monogram(560, 512, 512)));
await png('images/android-icon-monochrome.png', svg(1024, 1024, monogram(560, 512, 512, '#FFFFFF')));

// Native splash image (shown for a moment before the animated loading screen).
await png('images/splash-icon.png', svg(1200, 420, monogram(1100, 600, 210)));

// Web favicon.
await png('images/favicon.png', svg(96, 96, `${darkBg(96)}${monogram(80, 48, 48)}`));

// Full HD logo files for documents, email signatures and the web.
await png('brand/skfl-logo-fullhd.png', svg(1920, 1080, `${darkBg(1920).replace('height="1920"', 'height="1080"')}${monogram(1400, 960, 470)}
  <text x="960" y="860" text-anchor="middle" fill="url(#gold)" font-family="Georgia, 'Times New Roman', serif" font-size="92" letter-spacing="10">SHREE KARNI FABCOM LTD</text>
  <rect x="560" y="910" width="800" height="3" fill="url(#gold)" opacity="0.7"/>`));
await png('brand/skfl-logo-transparent.png', svg(1920, 660, monogram(1840, 960, 330)));

writeFileSync(out('brand/skfl-logo.svg'), svg(SKFL_VIEWBOX.width, SKFL_VIEWBOX.height, monogram(SKFL_VIEWBOX.width, SKFL_VIEWBOX.width / 2, SKFL_VIEWBOX.height / 2)));
console.log('✓ brand/skfl-logo.svg');
