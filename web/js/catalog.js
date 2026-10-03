// Catalog: room types, openings, furniture/fixtures, finishes (wallpapers & floors) and kits.
// Dimensions are inches.

export const ROOM_TYPES = {
  living: { name: 'Living room', habitable: true, color: '#e8f0e2' },
  bedroom: { name: 'Bedroom', habitable: true, sleeping: true, color: '#e6e9f5' },
  kitchen: { name: 'Kitchen', habitable: true, wet: true, color: '#f6efd9' },
  dining: { name: 'Dining room', habitable: true, color: '#f3e6dc' },
  office: { name: 'Office', habitable: true, color: '#e3eef2' },
  bathroom: { name: 'Bathroom', wet: true, color: '#dff1f3' },
  laundry: { name: 'Laundry', wet: true, color: '#e9edf0' },
  hallway: { name: 'Hallway', circulation: true, color: '#efece6' },
  entry: { name: 'Entry', circulation: true, color: '#efe8e0' },
  closet: { name: 'Closet', storage: true, color: '#ece7e2' },
  stairs: { name: 'Stairs', stairs: true, color: '#e9e4dd' },
};

const win = (id, name, w, h, sill, style, extra = {}) => ({
  id,
  kind: 'window',
  name,
  w,
  h,
  sill,
  style,
  ...extra,
});
const door = (id, name, w, clear, extra = {}) => ({
  id,
  kind: 'door',
  name,
  w,
  h: 80,
  clear,
  sill: 0,
  ...extra,
});

export const OPENINGS = [
  door('door_interior_30', 'Interior door 30"', 30, 28),
  door('door_interior_32', 'Interior door 32"', 32, 30),
  door('door_pocket_32', 'Pocket door 32"', 32, 30, { pocket: true }),
  door('door_closet_24', 'Closet door 24"', 24, 22, { closet: true }),
  door('door_entry_36', 'Entry door 36"', 36, 32.5, { exterior: true }),
  door('door_entry_double', 'Double entry 60"', 60, 56, { exterior: true }),
  door('door_patio_slider', 'Patio slider 72"', 72, 34, { exterior: true, glass: true }),
  win('win_hung_36x60', 'Double-hung 36×60', 36, 60, 24, 'hung'),
  win('win_hung_30x48', 'Double-hung 30×48', 30, 48, 30, 'hung'),
  win('win_casement_30x48', 'Casement 30×48', 30, 48, 30, 'casement'),
  win('win_slider_60x36', 'Slider 60×36', 60, 36, 36, 'slider'),
  win('win_picture_48x48', 'Picture (fixed) 48×48', 48, 48, 30, 'fixed'),
  win('win_bath_slider_36x24', 'Bath slider 36×24', 36, 24, 60, 'slider'),
];
export const OPENING_BY_ID = Object.fromEntries(OPENINGS.map((o) => [o.id, o]));

/** Glazed area, operable clear area and clear dimensions of an opening definition (inches / sq in). */
export function openingMetrics(def) {
  if (def.kind === 'door') {
    const glaze = def.glass ? def.w * def.h * 0.8 : 0;
    const operable = def.glass ? (def.w / 2 - 2) * (def.h - 4) : 0;
    return { glaze, operable, clearW: def.glass ? def.w / 2 - 2 : def.clear, clearH: def.h - 2 };
  }
  const glaze = def.w * def.h;
  let clearW;
  let clearH;
  switch (def.style) {
    case 'hung':
      clearW = def.w - 3;
      clearH = def.h / 2 - 1.5;
      break;
    case 'casement':
      clearW = def.w - 4;
      clearH = def.h - 4;
      break;
    case 'slider':
      clearW = def.w / 2 - 2;
      clearH = def.h - 4;
      break;
    default:
      clearW = 0;
      clearH = 0;
  }
  return { glaze, operable: clearW * clearH, clearW, clearH };
}

// Furniture / fixtures. mount: floor | wall | ceiling. Item front faces +y at rot 0.
const f = (id, name, cat, w, d, h, color, shape, extra = {}) => ({
  id,
  name,
  cat,
  mount: 'floor',
  w,
  d,
  h,
  color,
  shape,
  ...extra,
});
const wallItem = (id, name, w, color, shape, extra = {}) => ({
  id,
  name,
  cat: 'electrical',
  mount: 'wall',
  w,
  d: 3,
  h: 4,
  color,
  shape,
  ...extra,
});
const ceil = (id, name, w, color, shape, extra = {}) => ({
  id,
  name,
  cat: 'electrical',
  mount: 'ceiling',
  w,
  d: w,
  h: 2,
  color,
  shape,
  ...extra,
});

export const ITEMS = [
  f('bed_twin', 'Twin bed', 'bedroom', 39, 75, 24, '#8fa3c7', 'bed'),
  f('bed_full', 'Full bed', 'bedroom', 54, 75, 24, '#8fa3c7', 'bed'),
  f('bed_queen', 'Queen bed', 'bedroom', 60, 80, 24, '#7f95bd', 'bed'),
  f('bed_king', 'King bed', 'bedroom', 76, 80, 24, '#7f95bd', 'bed'),
  f('nightstand', 'Nightstand', 'bedroom', 18, 16, 24, '#a8805a', 'box'),
  f('dresser', 'Dresser', 'bedroom', 60, 18, 32, '#a8805a', 'box'),
  f('wardrobe', 'Wardrobe', 'bedroom', 48, 24, 78, '#9a7650', 'box'),
  f('sofa', 'Sofa', 'living', 84, 36, 32, '#6f8f84', 'sofa'),
  f('loveseat', 'Loveseat', 'living', 58, 36, 32, '#6f8f84', 'sofa'),
  f('armchair', 'Armchair', 'living', 32, 34, 32, '#b06a5b', 'sofa'),
  f('coffee_table', 'Coffee table', 'living', 48, 24, 18, '#a8805a', 'box'),
  f('tv_stand', 'TV stand', 'living', 60, 18, 24, '#4b4b52', 'box'),
  f('bookshelf', 'Bookshelf', 'living', 36, 12, 72, '#8b6945', 'shelf'),
  f('rug_large', 'Area rug 8×5', 'decor', 96, 60, 1, '#c9a98f', 'rug', { flat: true }),
  f('plant', 'Plant', 'decor', 18, 18, 36, '#5f9b5f', 'plant'),
  f('dining_table', 'Dining table', 'dining', 60, 36, 30, '#a8805a', 'table'),
  f('dining_chair', 'Dining chair', 'dining', 18, 18, 18, '#8b6945', 'chair', { tucks: true }),
  f('desk', 'Desk', 'office', 48, 24, 30, '#a8805a', 'box'),
  f('office_chair', 'Office chair', 'office', 22, 22, 36, '#4b4b52', 'chair', { tucks: true }),
  f('fridge', 'Refrigerator', 'kitchen', 36, 30, 70, '#cfd6da', 'fridge'),
  f('range_gas', 'Gas range', 'kitchen', 30, 26, 36, '#9aa3a8', 'range', {
    fuel: true,
    cooking: true,
  }),
  f('range_electric', 'Electric range', 'kitchen', 30, 26, 36, '#9aa3a8', 'range', {
    cooking: true,
  }),
  f('sink_kitchen', 'Kitchen sink cabinet', 'kitchen', 36, 24, 36, '#b9c3c8', 'sink', {
    fixture: 'kitchen_sink',
  }),
  f('dishwasher', 'Dishwasher', 'kitchen', 24, 24, 34, '#b9c3c8', 'box'),
  f('counter_36', 'Counter 36"', 'kitchen', 36, 24, 36, '#d8cdb8', 'box'),
  f('counter_24', 'Counter 24"', 'kitchen', 24, 24, 36, '#d8cdb8', 'box'),
  f('toilet', 'Toilet', 'bath', 20, 28, 30, '#f2f4f5', 'toilet', {
    fixture: 'toilet',
    clearance: true,
  }),
  f('vanity', 'Lavatory vanity', 'bath', 30, 21, 34, '#e5e9ec', 'sink', {
    fixture: 'lavatory',
    clearance: true,
  }),
  f('tub', 'Bathtub 60×30', 'bath', 60, 30, 20, '#f2f4f5', 'tub', { fixture: 'tub' }),
  f('shower', 'Shower 36×36', 'bath', 36, 36, 80, '#dbeaf0', 'shower', { fixture: 'shower' }),
  f('washer', 'Washer', 'laundry', 27, 28, 38, '#dfe3e6', 'box'),
  f('dryer', 'Dryer', 'laundry', 27, 28, 38, '#dfe3e6', 'box'),
  f('water_heater_gas', 'Gas water heater', 'laundry', 22, 22, 60, '#c9ccd1', 'round', {
    fuel: true,
  }),
  wallItem('outlet', 'Outlet', 12, '#444', 'outlet'),
  wallItem('outlet_gfci', 'GFCI outlet', 12, '#2a7', 'outlet', { gfci: true }),
  wallItem('switch', 'Light switch', 12, '#444', 'switch'),
  ceil('light_ceiling', 'Ceiling light', 14, '#f2c94c', 'light', { func: ['light'] }),
  ceil('fan_exhaust', 'Exhaust fan', 14, '#9aa', 'fan', { func: ['fan'] }),
  ceil('smoke_alarm', 'Smoke alarm', 8, '#d94', 'alarm', { func: ['smoke'] }),
  ceil('co_alarm', 'CO alarm', 8, '#49d', 'alarm', { func: ['co'] }),
  ceil('smoke_co_alarm', 'Smoke + CO alarm', 8, '#a6c', 'alarm', { func: ['smoke', 'co'] }),
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const ITEM_CATEGORIES = [
  ['bedroom', 'Bedroom'],
  ['living', 'Living'],
  ['dining', 'Dining'],
  ['office', 'Office'],
  ['kitchen', 'Kitchen'],
  ['bath', 'Bath'],
  ['laundry', 'Laundry'],
  ['decor', 'Decor'],
  ['electrical', 'Safety & electrical'],
];

// Wallpapers & floors. `wet` = moisture-resistant (acceptable in bathrooms/laundry, IRC R702.4 / practice).
export const WALL_FINISHES = [
  { id: 'paint_white', name: 'White paint', pattern: 'solid', c1: '#f4f1ea', wet: true },
  { id: 'paint_beige', name: 'Warm beige', pattern: 'solid', c1: '#e4d3b8', wet: true },
  { id: 'paint_sage', name: 'Sage green', pattern: 'solid', c1: '#a9bba0', wet: true },
  { id: 'paint_navy', name: 'Navy', pattern: 'solid', c1: '#34486b', wet: true },
  { id: 'paint_blush', name: 'Blush pink', pattern: 'solid', c1: '#e8c4c0', wet: true },
  { id: 'paint_charcoal', name: 'Charcoal', pattern: 'solid', c1: '#43464b', wet: true },
  { id: 'wp_stripe_blue', name: 'Blue stripes', pattern: 'stripes', c1: '#dfe8f2', c2: '#9db6d3' },
  {
    id: 'wp_stripe_cream',
    name: 'Cream pinstripe',
    pattern: 'stripes',
    c1: '#f3ecdc',
    c2: '#d9c9a5',
  },
  { id: 'wp_floral', name: 'Floral', pattern: 'floral', c1: '#f4e3df', c2: '#c76f7b' },
  { id: 'wp_damask', name: 'Damask', pattern: 'damask', c1: '#e9e0c8', c2: '#b79c58' },
  { id: 'wp_geo', name: 'Geometric', pattern: 'geo', c1: '#e3ecea', c2: '#4f8f86' },
  { id: 'wp_dots', name: 'Polka dots', pattern: 'dots', c1: '#f6f0e6', c2: '#d2796b' },
  {
    id: 'wp_vinyl_leaf',
    name: 'Vinyl leaf (moisture-rated)',
    pattern: 'leaf',
    c1: '#e6efe6',
    c2: '#6a9a6a',
    wet: true,
  },
  { id: 'wall_brick', name: 'Exposed brick', pattern: 'brick', c1: '#b5604a', c2: '#d9c2b0' },
  { id: 'wall_wainscot', name: 'Wainscot', pattern: 'wainscot', c1: '#eee8dc', c2: '#cfc4ae' },
  {
    id: 'wall_tile_white',
    name: 'White subway tile',
    pattern: 'tile',
    c1: '#f3f6f7',
    c2: '#c9d3d6',
    wet: true,
  },
  {
    id: 'wall_tile_teal',
    name: 'Teal tile',
    pattern: 'tile',
    c1: '#6fb0b0',
    c2: '#4f8c8c',
    wet: true,
  },
];
export const WALL_BY_ID = Object.fromEntries(WALL_FINISHES.map((w) => [w.id, w]));

export const FLOOR_FINISHES = [
  { id: 'floor_oak', name: 'Oak plank', pattern: 'planks', c1: '#c79a62', c2: '#a97d49' },
  { id: 'floor_walnut', name: 'Walnut plank', pattern: 'planks', c1: '#7a5538', c2: '#5e4029' },
  {
    id: 'floor_herringbone',
    name: 'Herringbone',
    pattern: 'herring',
    c1: '#b98c5a',
    c2: '#8f6a3f',
  },
  { id: 'floor_carpet_gray', name: 'Gray carpet', pattern: 'carpet', c1: '#a9adb3', c2: '#9a9ea5' },
  {
    id: 'floor_carpet_cream',
    name: 'Cream carpet',
    pattern: 'carpet',
    c1: '#ece3d0',
    c2: '#ddd2ba',
  },
  {
    id: 'floor_tile_gray',
    name: 'Gray tile',
    pattern: 'tile',
    c1: '#c6c9cc',
    c2: '#a7abae',
    wet: true,
  },
  {
    id: 'floor_checker',
    name: 'Checker tile',
    pattern: 'checker',
    c1: '#f2f2f2',
    c2: '#2f3338',
    wet: true,
  },
  {
    id: 'floor_marble',
    name: 'Marble',
    pattern: 'marble',
    c1: '#eceff1',
    c2: '#b9c1c7',
    wet: true,
  },
  {
    id: 'floor_vinyl',
    name: 'Luxury vinyl',
    pattern: 'planks',
    c1: '#b7a58e',
    c2: '#9d8b75',
    wet: true,
  },
  { id: 'floor_concrete', name: 'Polished concrete', pattern: 'solid', c1: '#a8aaab', wet: true },
];
export const FLOOR_BY_ID = Object.fromEntries(FLOOR_FINISHES.map((w) => [w.id, w]));

// Kits. Room kits create a complete room; furniture kits furnish the selected room.
// Item placements: `wall` = against that wall; `along` = 'start'|'center'|'end' or inches from wall start; `gap` = inches from the wall's side.
// `pos:[fx,fy]` = fractional position in the room interior instead.
export const ROOM_KITS = [
  {
    id: 'kit_bedroom',
    name: 'Bedroom 12×12',
    type: 'bedroom',
    w: 144,
    h: 144,
    floor: 'floor_carpet_gray',
    wallFinish: 'wp_stripe_blue',
    openings: [
      { type: 'door_interior_32', wall: 'S', offset: 12 },
      { type: 'win_casement_30x48', wall: 'N', offset: 57 },
    ],
    items: [
      { type: 'bed_queen', wall: 'N', along: 'center', off: 0 },
      { type: 'nightstand', wall: 'N', along: 'center', off: -46 },
      { type: 'nightstand', wall: 'N', along: 'center', off: 46 },
      { type: 'dresser', wall: 'E', along: 'center', off: 0 },
      { type: 'rug_large', pos: [0.5, 0.6] },
    ],
  },
  {
    id: 'kit_bath',
    name: 'Full bath 5.5×10',
    type: 'bathroom',
    w: 66,
    h: 120,
    floor: 'floor_tile_gray',
    wallFinish: 'wall_tile_white',
    openings: [
      { type: 'door_interior_30', wall: 'W', offset: 40 },
      { type: 'win_bath_slider_36x24', wall: 'N', offset: 15 },
    ],
    items: [
      { type: 'tub', wall: 'N', along: 'start', off: 0 },
      { type: 'vanity', wall: 'E', along: 50, off: 0 },
      { type: 'toilet', wall: 'S', along: 10, off: 0 },
    ],
  },
  {
    id: 'kit_kitchen',
    name: 'Galley kitchen 10×12',
    type: 'kitchen',
    w: 120,
    h: 144,
    floor: 'floor_vinyl',
    wallFinish: 'paint_sage',
    openings: [
      { type: 'door_interior_32', wall: 'S', offset: 70 },
      { type: 'win_hung_36x60', wall: 'N', offset: 24 },
    ],
    items: [
      { type: 'fridge', wall: 'W', along: 0, off: 0 },
      { type: 'counter_36', wall: 'W', along: 36, off: 0 },
      { type: 'sink_kitchen', wall: 'W', along: 72, off: 0 },
      { type: 'dishwasher', wall: 'W', along: 108, off: 0 },
      { type: 'range_electric', wall: 'N', along: 'end', off: -4 },
      { type: 'counter_36', wall: 'E', along: 30, off: 0 },
      { type: 'counter_36', wall: 'E', along: 66, off: 0 },
    ],
  },
  {
    id: 'kit_living',
    name: 'Living room 16×14',
    type: 'living',
    w: 192,
    h: 168,
    floor: 'floor_oak',
    wallFinish: 'paint_beige',
    openings: [
      { type: 'door_interior_32', wall: 'E', offset: 12 },
      { type: 'win_hung_36x60', wall: 'N', offset: 24 },
      { type: 'win_hung_36x60', wall: 'N', offset: 120 },
    ],
    items: [
      { type: 'tv_stand', wall: 'S', along: 'center', off: 0 },
      { type: 'sofa', wall: 'N', along: 'center', off: 0 },
      { type: 'coffee_table', pos: [0.5, 0.5] },
      { type: 'armchair', wall: 'W', along: 'center', off: 20 },
      { type: 'rug_large', pos: [0.5, 0.5] },
      { type: 'bookshelf', wall: 'W', along: 'end', off: -4 },
    ],
  },
  {
    id: 'kit_office',
    name: 'Home office 10×10',
    type: 'office',
    w: 120,
    h: 120,
    floor: 'floor_walnut',
    wallFinish: 'paint_navy',
    openings: [
      { type: 'door_interior_32', wall: 'S', offset: 12 },
      { type: 'win_hung_36x60', wall: 'N', offset: 42 },
    ],
    items: [
      { type: 'desk', wall: 'N', along: 'center', off: 0 },
      { type: 'office_chair', pos: [0.5, 0.45] },
      { type: 'bookshelf', wall: 'E', along: 'center', off: 0 },
    ],
  },
  {
    id: 'kit_hall',
    name: 'Hallway 4×10',
    type: 'hallway',
    w: 48,
    h: 120,
    floor: 'floor_oak',
    wallFinish: 'paint_white',
    openings: [],
    items: [],
  },
  {
    id: 'kit_laundry',
    name: 'Laundry 6×7',
    type: 'laundry',
    w: 72,
    h: 84,
    floor: 'floor_vinyl',
    wallFinish: 'paint_white',
    openings: [{ type: 'door_interior_30', wall: 'S', offset: 12 }],
    items: [
      { type: 'washer', wall: 'N', along: 'start', off: 6 },
      { type: 'dryer', wall: 'N', along: 'start', off: 36 },
    ],
  },
  {
    id: 'kit_stairs',
    name: 'Straight stairs 3×12',
    type: 'stairs',
    w: 42,
    h: 144,
    floor: 'floor_oak',
    wallFinish: 'paint_white',
    openings: [],
    items: [],
  },
];
export const ROOM_KIT_BY_ID = Object.fromEntries(ROOM_KITS.map((k) => [k.id, k]));

export const FURNITURE_KITS = [
  {
    id: 'fk_bedroom',
    name: 'Bedroom set',
    items: [
      { type: 'bed_queen', wall: 'longest', along: 'center', off: 0 },
      { type: 'nightstand', wall: 'longest', along: 'center', off: -46 },
      { type: 'nightstand', wall: 'longest', along: 'center', off: 46 },
      { type: 'dresser', wall: 'opposite-longest', along: 'center', off: 0 },
    ],
  },
  {
    id: 'fk_living',
    name: 'Living set',
    items: [
      { type: 'sofa', wall: 'longest', along: 'center', off: 0 },
      { type: 'coffee_table', pos: [0.5, 0.5] },
      { type: 'tv_stand', wall: 'opposite-longest', along: 'center', off: 0 },
      { type: 'rug_large', pos: [0.5, 0.5] },
    ],
  },
  {
    id: 'fk_dining',
    name: 'Dining set',
    items: [
      { type: 'dining_table', pos: [0.5, 0.5] },
      { type: 'dining_chair', pos: [0.5, 0.5], dx: -22, dy: -26 },
      { type: 'dining_chair', pos: [0.5, 0.5], dx: 22, dy: -26 },
      { type: 'dining_chair', pos: [0.5, 0.5], dx: -22, dy: 26, rot: 180 },
      { type: 'dining_chair', pos: [0.5, 0.5], dx: 22, dy: 26, rot: 180 },
    ],
  },
];
