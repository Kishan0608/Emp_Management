/**
 * SKFL logo (Shree Karni Fabcom Ltd), vectorised from the official logo image
 * (extra/Screenshot 2026-09-29 111758.png): traced, straightened and checked by
 * overlay (~98.6% pixel match; the rest is JPEG edge noise in the source).
 * The same data drives the in-app logo and the generated icons
 * (scripts/generate-brand-assets.mjs).
 */
export const SKFL_VIEWBOX = { width: 331, height: 139 };

/** Filled shapes, ordered left to right (used for the staggered reveal). */
export const SKFL_SHAPES = [
  // S swash, continuing into the K diagonal
  'M153.4 6.4L184 6.4L186.6 9.6L92.1 111.6C88 116.5 81 123.5 72 128.2C64 132 56 133 48 132.9C36 132.8 22 128.8 5.9 118.9Q3.7 116.8 5.4 114.1L19.2 98C29 103 37 105.8 45.5 105.6C55 105.4 63 101.5 70.2 95.4L150.6 7.7Q151.8 6.4 153.4 6.4Z',
  // S upper bowl
  'M58 6.8L75.5 6.8Q77.7 6.8 77.7 9L77.7 32Q77.7 34.8 75 34.4C71 33 66 31.6 60 31.6C53 31.6 47.5 33.5 44.5 36.8C41.5 40 40.8 44.5 43.5 48.8C46.5 53.5 53 57 62.5 60.3C68 62 74 62.8 77 63.6Q80.2 64.8 79.3 67.3L69.5 78.6Q65 81.8 59.5 82C51 82 42 79.5 33 74.5C24 69.5 18 62 16 53C14.3 45 15.2 37 18.5 29C22 21 28 15 36 11.2C43 8 50 6.8 58 6.8Z',
  // K upper stem
  'M94 6.4L117.4 6.4Q119.3 6.4 119.3 8.4L119.6 23.4L97.6 48.6Q95.2 50.8 93.2 49.8Q91.7 48.9 91.7 47L91.7 8.8Q91.7 6.4 94 6.4Z',
  // K lower leg
  'M129.2 89.5L143.2 73Q145 71.4 147.6 72.1Q149.6 72.9 150.8 75.5L177.6 115.5Q178.9 118 177.5 120Q175.8 122.3 172.8 122.3L150.8 122.3Q149.4 122.3 148.4 121L130.8 95Q128.7 92.3 129.2 89.5Z',
  // F top
  'M194 6.5L271 6.5L274.2 9.5L253.4 32.7L218.5 32.7L200.4 53Q197.6 57.8 194.4 58.6Q191.3 58.9 191.3 55.6L191.3 9Q191.3 6.5 194 6.5Z',
  // F lower
  'M220 54.2L246.8 54.2Q248.7 54.2 248.7 56L248.7 79.8Q248.7 81.7 246.8 81.7L218.7 81.7L218.7 119.5Q218.7 122.6 215.5 122.6L194 122.6Q190.6 122.6 190.6 119.3L190.6 81Q190.8 78.2 193.6 76.8L214.6 56Q216.8 54.2 220 54.2Z',
  // L
  'M260.2 38.5L279.6 16.8Q281 15.8 283 16.2Q286.8 17.2 286.8 22L286.8 94.7L322.6 94.7Q326.1 94.7 326.1 98.4L326.1 118.5Q326.1 121.6 323 121.6L263 121.6Q260.2 121.6 260.2 118.8Z',
] as const;

/** Champagne gold sampled from the logo. */
export const GOLD_STOPS = [
  { offset: 0, color: '#D1C174' },
  { offset: 0.38, color: '#E2DEA2' },
  { offset: 0.55, color: '#E5E3AC' },
  { offset: 0.8, color: '#D8CE89' },
  { offset: 1, color: '#DCD28B' },
] as const;

/** Brushed charcoal background sampled from the logo (dark edges, light diagonal sheen). */
export const CHARCOAL_STOPS = ['#34332F', '#4A4845', '#605B57', '#4A4845', '#2F2E2B'] as const;

export const COMPANY = {
  short: 'SKFL',
  name: 'Shree Karni Fabcom Ltd',
};
