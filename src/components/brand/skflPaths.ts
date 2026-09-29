/**
 * SKFL monogram (Shree Karni Fabcom Ltd), redrawn as vector strokes so it is
 * sharp at any size. The same data drives the app logo and the generated icons
 * (scripts/generate-brand-assets.mjs).
 */
export const SKFL_VIEWBOX = { width: 446, height: 150 };
export const SKFL_STROKE = 24;

export const SKFL_LETTERS = [
  // S: top bar, left bowl, diagonal spine, right bowl, bottom bar
  { key: 'S', d: 'M118 30 H62 C42 30 30 41 30 56 C30 70 40 76 51 81 L95 102 C108 108 116 114 116 124 C116 127 112 128 100 128 H22', length: 360 },
  // K: stem, upper arm, lower leg
  { key: 'K', d: 'M152 18 V140 M152 94 L230 20 M197 51 L238 138', length: 360 },
  // F: stem with top bar, middle bar
  { key: 'F', d: 'M274 140 V30 H346 M274 82 H332', length: 280 },
  // L: stem and foot
  { key: 'L', d: 'M372 18 V128 H432', length: 200 },
] as const;

export const GOLD_STOPS = [
  { offset: 0, color: '#FBE7A1' },
  { offset: 0.35, color: '#E7B94A' },
  { offset: 0.65, color: '#C99326' },
  { offset: 1, color: '#F2D27A' },
] as const;

export const COMPANY = {
  short: 'SKFL',
  name: 'Shree Karni Fabcom Ltd',
  product: 'Employee Management',
};
