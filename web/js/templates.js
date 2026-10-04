// Starter Templates & Floorplan Preset Gallery Definitions

import * as M from './model.js';
import { commit } from './codes.js';
import { ROOM_TYPES } from './catalog.js';

export function buildBlank() {
  const s = M.newState();
  s.name = 'Blank Canvas';
  return s;
}

export function buildStudio() {
  let s = M.newState();
  s.name = 'Studio Apartment';
  s.levels = 1;
  const plan = [
    ['kit_living', 0, 0, 0],
    ['kit_hall', 192, 0, 0],
    ['kit_bath', 240, 0, 0],
    ['kit_kitchen', 0, 168, 0],
  ];
  for (const [k, x, y, l] of plan) {
    const r = commit(s, (n) => M.placeRoomKit(n, k, x, y, l));
    if (r.ok) s = r.state;
  }
  return s;
}

export function build2BR() {
  let s = M.newState();
  s.name = '2-Bedroom Home';
  s.levels = 1;
  const plan = [
    ['kit_living', 0, 0, 0],
    ['kit_hall', 192, 0, 0],
    ['kit_bedroom', 240, 0, 0],
    ['kit_bath', 240, 144, 0],
    ['kit_kitchen', 0, 168, 0],
    ['kit_laundry', 144, 168, 0],
  ];
  for (const [k, x, y, l] of plan) {
    const r = commit(s, (n) => M.placeRoomKit(n, k, x, y, l));
    if (r.ok) s = r.state;
  }
  return s;
}

export function buildMultiLevel() {
  let s = M.newState();
  s.name = 'Multi-Level Home';
  s.levels = 2;
  const plan = [
    ['kit_living', 0, 0, 0],
    ['kit_hall', 192, 0, 0],
    ['kit_bedroom', 240, 0, 0],
    ['kit_bath', 240, 144, 0],
    ['kit_kitchen', 0, 168, 0],
    ['kit_laundry', 240, 264, 0],
    ['kit_stairs', 192, 120, 0],
    ['kit_hall', 192, 0, 1],
    ['kit_bedroom', 240, 0, 1],
    ['kit_bedroom', 48, 0, 1],
    ['kit_bath', 234, 144, 1],
  ];
  for (const [k, x, y, l] of plan) {
    const r = commit(s, (n) => M.placeRoomKit(n, k, x, y, l));
    if (r.ok) s = r.state;
  }
  return s;
}

export const TEMPLATES = [
  {
    id: 'blank',
    title: 'Blank Canvas',
    dimensions: 'Custom',
    summary: 'Start with a clean slate to draw your floor plan from scratch.',
    createState: buildBlank,
  },
  {
    id: 'studio',
    title: 'Studio Apartment',
    dimensions: "25' × 26'",
    summary: 'Compact open-concept studio with living area, galley kitchen, hallway, and full bath.',
    createState: buildStudio,
  },
  {
    id: 'family_2br',
    title: '2-Bedroom Home',
    dimensions: "36' × 28'",
    summary: 'Spacious single-level home with 2 bedrooms, kitchen, living room, laundry, and bath.',
    createState: build2BR,
  },
  {
    id: 'multilevel',
    title: 'Multi-Level Home',
    dimensions: "36' × 28' (2 Floors)",
    summary: 'Two-story layout with connected stairs, main floor living areas, and upstairs bedrooms.',
    createState: buildMultiLevel,
  },
];

export function TEMPLATE_BY_ID(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

export function renderTemplatePreviewSVG(state) {
  const rooms = (state.rooms || []).filter((r) => (r.level || 0) === 0);
  if (!rooms.length) {
    // Blank Canvas SVG illustration
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" width="100%" height="100%">
      <rect width="240" height="160" fill="#f8f9fa" rx="6" />
      <path d="M0 20 H240 M0 40 H240 M0 60 H240 M0 80 H240 M0 100 H240 M0 120 H240 M0 140 H240" stroke="#e9ecef" stroke-width="1" />
      <path d="M30 0 V160 M60 0 V160 M90 0 V160 M120 0 V160 M150 0 V160 M180 0 V160 M210 0 V160" stroke="#e9ecef" stroke-width="1" />
      <rect x="70" y="45" width="100" height="70" fill="none" stroke="#2f6f5e" stroke-width="2" stroke-dasharray="4 4" rx="4" />
      <text x="120" y="85" font-family="sans-serif" font-size="12" font-weight="600" fill="#2f6f5e" text-anchor="middle">+ Blank Canvas</text>
    </svg>`;
  }

  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.w));
  const maxY = Math.max(...rooms.map((r) => r.y + r.h));

  const pad = 24;
  const bboxW = Math.max(1, maxX - minX);
  const bboxH = Math.max(1, maxY - minY);
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = bboxW + pad * 2;
  const vbH = bboxH + pad * 2;

  let rectsHtml = '';
  for (const r of rooms) {
    const typeDef = ROOM_TYPES[r.type] || { color: '#e2e8f0', name: r.name };
    const fill = typeDef.color || '#e2e8f0';
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const fontSize = Math.max(10, Math.min(16, Math.min(r.w, r.h) / 8));
    rectsHtml += `<g>
      <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="#2d3748" stroke-width="2" rx="1" />
      <text x="${cx}" y="${cy}" font-family="sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="600" fill="#1a202c" text-anchor="middle" dominant-baseline="central">${r.name}</text>
    </g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="100%" height="100%">
    <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#faf8f5" rx="6" />
    ${rectsHtml}
  </svg>`;
}
