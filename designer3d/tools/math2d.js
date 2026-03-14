function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function multiply(v, scalar) {
  return { x: v.x * scalar, y: v.y * scalar };
}

function length(v) {
  return Math.hypot(v.x, v.y);
}

function normalize(v) {
  const l = length(v);
  if (l === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / l, y: v.y / l };
}

function closestPointOnSegment(point, start, end) {
  const segment = sub(end, start);
  const segLenSq = dot(segment, segment);

  if (segLenSq === 0) {
    return { point: start, t: 0 };
  }

  const t = Math.max(0, Math.min(1, dot(sub(point, start), segment) / segLenSq));
  return {
    point: add(start, multiply(segment, t)),
    t,
  };
}

function polygonEdges(points) {
  const edges = [];
  for (let i = 0; i < points.length; i += 1) {
    const next = (i + 1) % points.length;
    edges.push({ start: points[i], end: points[next], index: i });
  }
  return edges;
}

module.exports = {
  distance,
  sub,
  add,
  dot,
  multiply,
  length,
  normalize,
  closestPointOnSegment,
  polygonEdges,
};
