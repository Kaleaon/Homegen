// Procedural wallpaper / floor tiles. Each tile is drawn at 4 px per inch and covers 24" x 24".
const N = 96;
const cache = new Map();

function noise(g, c, count, size) {
  g.fillStyle = c;
  for (let i = 0; i < count; i++) g.fillRect(((i * 7919) % N), ((i * 104729) % N), size, size);
}

function draw(g, f) {
  g.fillStyle = f.c1; g.fillRect(0, 0, N, N);
  g.strokeStyle = f.c2 || f.c1; g.fillStyle = f.c2 || f.c1; g.lineWidth = 2;
  switch (f.pattern) {
    case 'stripes': for (let x = 0; x < N; x += 24) g.fillRect(x, 0, 12, N); break;
    case 'floral':
      for (const [x, y] of [[24, 24], [72, 72], [72, 24 - 24 + 0], [24, 72]]) {
        for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.257) * 7, y + Math.sin(k * 1.257) * 7, 5, 0, 7); g.fill(); }
        g.fillStyle = f.c1; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.fillStyle = f.c2;
      }
      break;
    case 'damask':
      for (const [x, y] of [[48, 24], [24, 72], [72, 72]]) { g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + 12, y); g.lineTo(x, y + 18); g.lineTo(x - 12, y); g.closePath(); g.fill(); }
      break;
    case 'geo': for (let y = 0; y < N; y += 32) for (let x = 0; x < N; x += 32) { g.beginPath(); g.moveTo(x, y + 32); g.lineTo(x + 16, y); g.lineTo(x + 32, y + 32); g.closePath(); g.stroke(); } break;
    case 'dots': for (let y = 12; y < N; y += 24) for (let x = (y / 24) % 2 ? 24 : 12; x < N + 12; x += 24) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } break;
    case 'leaf': for (const [x, y] of [[24, 24], [72, 24], [48, 72]]) { g.beginPath(); g.ellipse(x, y, 5, 13, 0.6, 0, 7); g.fill(); } break;
    case 'brick':
      g.fillStyle = f.c2; g.fillRect(0, 0, N, N); g.fillStyle = f.c1;
      for (let r = 0; r < 8; r++) for (let x = (r % 2) * -24; x < N; x += 48) g.fillRect(x + 2, r * 12 + 2, 44, 8);
      break;
    case 'wainscot':
      g.fillRect(0, 56, N, 40); g.fillStyle = f.c1; for (let x = 4; x < N; x += 48) g.fillRect(x, 60, 40, 32);
      g.strokeRect(0, 56, N, 1); break;
    case 'tile': g.strokeStyle = f.c2; g.lineWidth = 2; for (let k = 0; k <= N; k += 24) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, N); g.moveTo(0, k); g.lineTo(N, k); g.stroke(); } break;
    case 'checker': for (let y = 0; y < N; y += 24) for (let x = 0; x < N; x += 24) if ((x + y) / 24 % 2 === 0) g.fillRect(x, y, 24, 24); break;
    case 'planks':
      for (let r = 0; r < 4; r++) { g.fillStyle = r % 2 ? f.c2 : f.c1; g.fillRect(0, r * 24, N, 24); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, r * 24, N, 1.5); g.fillRect(((r * 37) % N), r * 24, 1.5, 24); }
      break;
    case 'herring':
      for (let y = 0; y < N; y += 24) for (let x = 0; x < N; x += 24) { g.fillStyle = ((x + y) / 24) % 2 ? f.c1 : f.c2; g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x + 12, y); g.lineTo(x + 24, y + 12); g.lineTo(x + 12, y + 24); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,.2)'; g.stroke(); }
      break;
    case 'carpet': noise(g, f.c2, 380, 2); break;
    case 'marble': g.strokeStyle = f.c2; g.lineWidth = 1.5; for (const y of [18, 54, 80]) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(30, y - 18, 60, y + 20, N, y - 6); g.stroke(); } break;
    default: break;
  }
}

/** CanvasPattern for a finish, scaled so one tile = 24 world inches. */
export function patternFor(ctx, finish) {
  let tile = cache.get(finish.id);
  if (!tile) {
    tile = document.createElement('canvas'); tile.width = tile.height = N;
    draw(tile.getContext('2d'), finish);
    cache.set(finish.id, tile);
  }
  const p = ctx.createPattern(tile, 'repeat');
  if (p.setTransform) p.setTransform(new DOMMatrix().scale(24 / N));
  return p;
}
