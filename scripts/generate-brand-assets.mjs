// Generates every SKFL brand image from the official logo (vector, in src/components/brand/skflPaths.ts).
// Run: npm run brand:assets   (needs the sharp dev dependency)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { CHARCOAL_STOPS, GOLD_STOPS, SKFL_SHAPES, SKFL_VIEWBOX } from '../src/components/brand/skflPaths.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => join(root, 'assets', p);
const VB = SKFL_VIEWBOX;

const defs = `
  <linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${VB.width}" y2="${VB.height}">
    ${GOLD_STOPS.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('')}
  </linearGradient>
  <linearGradient id="charcoal" x1="0" y1="1" x2="1" y2="0">
    ${CHARCOAL_STOPS.map((c, i) => `<stop offset="${i / (CHARCOAL_STOPS.length - 1)}" stop-color="${c}"/>`).join('')}
  </linearGradient>`;

/** The logo scaled to `width`, centred at (cx, cy). */
function logo(width, cx, cy, fill = 'url(#gold)') {
  const s = width / VB.width;
  const x = cx - width / 2;
  const y = cy - (VB.height * s) / 2;
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}">${SKFL_SHAPES.map((d) => `<path d="${d}"/>`).join('')}</g>`;
}

const bg = (w, h) => `<rect width="${w}" height="${h}" fill="url(#charcoal)"/>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;

async function png(file, markup) {
  mkdirSync(dirname(out(file)), { recursive: true });
  await sharp(Buffer.from(markup)).png().toFile(out(file));
  console.log('✓', file);
}

// App icon: exactly the logo artwork (charcoal + champagne gold), square.
await png('images/icon.png', svg(1024, 1024, `${bg(1024, 1024)}${logo(820, 512, 512)}`));

// Android adaptive icon layers (logo inside the 66% safe zone).
await png('images/android-icon-background.png', svg(1024, 1024, bg(1024, 1024)));
await png('images/android-icon-foreground.png', svg(1024, 1024, logo(600, 512, 512)));
await png('images/android-icon-monochrome.png', svg(1024, 1024, logo(600, 512, 512, '#FFFFFF')));

// Native splash image (shown for a moment before the animated loading screen).
await png('images/splash-icon.png', svg(1200, 520, logo(1120, 600, 260)));

// Web favicon.
await png('images/favicon.png', svg(96, 96, `${bg(96, 96)}${logo(84, 48, 48)}`));

// Full HD logo files (same composition as the original: gold mark on brushed charcoal).
await png('brand/skfl-logo-fullhd.png', svg(1920, 1080, `${bg(1920, 1080)}${logo(1600, 960, 540)}`));
await png('brand/skfl-logo-transparent.png', svg(1920, 806, logo(1920, 960, 403)));

writeFileSync(out('brand/skfl-logo.svg'), svg(VB.width, VB.height, `${bg(VB.width, VB.height)}${logo(VB.width, VB.width / 2, VB.height / 2)}`));
console.log('✓ brand/skfl-logo.svg');
