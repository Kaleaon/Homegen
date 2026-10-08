export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

export function multiply(v, scalar) {
  return { x: v.x * scalar, y: v.y * scalar };
}

export function length(v) {
  return Math.hypot(v.x, v.y);
}

export function normalize(v) {
  const l = length(v);
  if (l === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / l, y: v.y / l };
}

export function closestPointOnSegment(point, start, end) {
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

export function polygonEdges(points) {
  const edges = [];
  for (let i = 0; i < points.length; i += 1) {
    const next = (i + 1) % points.length;
    const bulge = points[i] && typeof points[i].bulge === 'number' ? points[i].bulge : 0;
    edges.push({ start: points[i], end: points[next], bulge, index: i });
  }
  return edges;
}

export function arcPolygonEdges(points, bulges = []) {
  const edges = [];
  for (let i = 0; i < points.length; i += 1) {
    const next = (i + 1) % points.length;
    let bulge = 0;
    if (Array.isArray(bulges) && typeof bulges[i] === 'number') {
      bulge = bulges[i];
    } else if (points[i] && typeof points[i].bulge === 'number') {
      bulge = points[i].bulge;
    }
    edges.push({ start: points[i], end: points[next], bulge, index: i });
  }
  return edges;
}

export function getArcParameters(start, end, bulge = 0) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const chordLen = Math.hypot(dx, dy);

  if (!bulge || Math.abs(bulge) < 1e-12 || chordLen < 1e-12) {
    return {
      isLinear: true,
      chordLen,
      arcLength: chordLen,
      center: null,
      radius: 0,
      startAngle: 0,
      sweepAngle: 0,
      bulge: 0,
    };
  }

  const absB = Math.abs(bulge);
  const sagitta = (bulge * chordLen) / 2;
  const radius = (chordLen * (1 + bulge * bulge)) / (4 * absB);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Left normal vector N = (-dy/chordLen, dx/chordLen)
  const nx = -dy / chordLen;
  const ny = dx / chordLen;

  // Distance from chord center to arc center
  const m = (chordLen * (1 - bulge * bulge)) / (4 * bulge);
  const centerX = midX - m * nx;
  const centerY = midY - m * ny;
  const center = { x: centerX, y: centerY };

  const startAngle = Math.atan2(start.y - centerY, start.x - centerX);
  const sweepAngle = -4 * Math.atan(bulge);
  const arcLength = radius * Math.abs(4 * Math.atan(bulge));

  return {
    isLinear: false,
    chordLen,
    arcLength,
    center,
    radius,
    startAngle,
    sweepAngle,
    sagitta,
    bulge,
  };
}

export function pointOnArc(start, end, bulge = 0, t = 0) {
  const arc = getArcParameters(start, end, bulge);
  if (arc.isLinear) {
    return {
      x: start.x + t * (end.x - start.x),
      y: start.y + t * (end.y - start.y),
    };
  }

  const angle = arc.startAngle + t * arc.sweepAngle;
  return {
    x: arc.center.x + arc.radius * Math.cos(angle),
    y: arc.center.y + arc.radius * Math.sin(angle),
  };
}

export function closestPointOnArc(point, start, end, bulge = 0) {
  if (!bulge || Math.abs(bulge) < 1e-12) {
    const res = closestPointOnSegment(point, start, end);
    return {
      ...res,
      distance: distance(point, res.point),
    };
  }

  const arc = getArcParameters(start, end, bulge);
  if (arc.isLinear) {
    const res = closestPointOnSegment(point, start, end);
    return {
      ...res,
      distance: distance(point, res.point),
    };
  }

  const angleToPoint = Math.atan2(point.y - arc.center.y, point.x - arc.center.x);
  let delta = angleToPoint - arc.startAngle;

  if (arc.sweepAngle > 0) {
    while (delta < 0) delta += 2 * Math.PI;
    while (delta >= 2 * Math.PI) delta -= 2 * Math.PI;
  } else {
    while (delta > 0) delta -= 2 * Math.PI;
    while (delta <= -2 * Math.PI) delta += 2 * Math.PI;
  }

  const t = delta / arc.sweepAngle;

  if (t >= 0 && t <= 1) {
    const projectedPoint = {
      x: arc.center.x + arc.radius * Math.cos(angleToPoint),
      y: arc.center.y + arc.radius * Math.sin(angleToPoint),
    };
    return {
      point: projectedPoint,
      t,
      distance: distance(point, projectedPoint),
    };
  }

  const distStart = distance(point, start);
  const distEnd = distance(point, end);

  if (distStart <= distEnd) {
    return { point: start, t: 0, distance: distStart };
  }
  return { point: end, t: 1, distance: distEnd };
}

export function tessellateArc(start, end, bulge = 0, numSegments = 16) {
  const count = Math.max(1, numSegments);
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    points.push(pointOnArc(start, end, bulge, t));
  }
  return points;
}
