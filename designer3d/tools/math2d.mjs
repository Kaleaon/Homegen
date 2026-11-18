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
      sagitta: 0,
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

function cleanCoordinate(value) {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-9) {
    return rounded === 0 ? 0 : rounded;
  }
  const fixed = Number(value.toFixed(6));
  return fixed === 0 ? 0 : fixed;
}

/**
 * Parse an explicit numeric or architectural length into positive inches.
 * Supports positive numbers (inches) and strings like `174`, `174"`, `14'6"`, `14' 6"`, `14ft`, `14'`.
 * Returns `null` for invalid, zero, negative, or non-numeric inputs.
 */
export function parseExplicitLengthInches(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? input : null;
  }
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed || trimmed.startsWith('-')) {
    return null;
  }

  const feetInchesMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*(?:'|′|ft|feet)(?:\s*-?\s*(\d+(?:\.\d+)?)\s*(?:"|″|in|inch|inches)?)?$/i
  );
  if (feetInchesMatch) {
    const feet = Number.parseFloat(feetInchesMatch[1]);
    const inches = feetInchesMatch[2] !== undefined ? Number.parseFloat(feetInchesMatch[2]) : 0;
    const total = feet * 12 + inches;
    return Number.isFinite(total) && total > 0 ? total : null;
  }

  const inchesMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:"|″|in|inch|inches)$/i);
  if (inchesMatch) {
    const inches = Number.parseFloat(inchesMatch[1]);
    return Number.isFinite(inches) && inches > 0 ? inches : null;
  }

  if (/^(\d+(?:\.\d+)?)$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  return null;
}

/**
 * Compute vector direction angle in radians from `anchor` toward `targetPoint`.
 */
export function computeVectorAngle(anchor, targetPoint) {
  if (!anchor || !targetPoint) {
    return 0;
  }
  const dx = targetPoint.x - anchor.x;
  const dy = targetPoint.y - anchor.y;
  if (Math.hypot(dx, dy) < 1e-9) {
    return 0;
  }
  return Math.atan2(dy, dx);
}

/**
 * Compute a 2D vertex coordinate at `lengthInches` from `anchor` along `angleRadians`.
 */
export function computeVertexFromAngle(anchor, angleRadians, lengthInches) {
  if (!anchor || typeof anchor.x !== 'number' || typeof anchor.y !== 'number') {
    throw new Error('computeVertexFromAngle: anchor point {x, y} is required');
  }
  if (typeof angleRadians !== 'number' || !Number.isFinite(angleRadians)) {
    throw new Error('computeVertexFromAngle: finite angleRadians is required');
  }
  const parsedLen = parseExplicitLengthInches(lengthInches);
  if (parsedLen === null) {
    throw new Error('computeVertexFromAngle: positive lengthInches is required');
  }
  return {
    x: cleanCoordinate(anchor.x + Math.cos(angleRadians) * parsedLen),
    y: cleanCoordinate(anchor.y + Math.sin(angleRadians) * parsedLen),
  };
}

const LINEAR_EPS = 1e-12;
const MAX_FINITE_ARC_RADIUS = 1e9;
const CHORD_RADIUS_TOLERANCE = 1e-7;

export function sagittaFromBulge(chordLen, bulge = 0) {
  if (
    !Number.isFinite(chordLen) ||
    chordLen <= LINEAR_EPS ||
    !bulge ||
    Math.abs(bulge) < LINEAR_EPS
  ) {
    return 0;
  }
  return (bulge * chordLen) / 2;
}

export function bulgeFromSagitta(chordLen, sagitta = 0) {
  if (
    !Number.isFinite(chordLen) ||
    chordLen <= LINEAR_EPS ||
    !Number.isFinite(sagitta) ||
    Math.abs(sagitta) < LINEAR_EPS
  ) {
    return 0;
  }
  return (2 * sagitta) / chordLen;
}

export function radiusFromBulge(chordLen, bulge = 0) {
  if (
    !Number.isFinite(chordLen) ||
    chordLen <= LINEAR_EPS ||
    !bulge ||
    Math.abs(bulge) < LINEAR_EPS
  ) {
    return Infinity;
  }
  const absB = Math.abs(bulge);
  return (chordLen * (1 + bulge * bulge)) / (4 * absB);
}

export function bulgeFromRadius(chordLen, radius, options = {}) {
  if (
    radius === Infinity ||
    radius === -Infinity ||
    (typeof radius === 'string' &&
      /^(?:[+-]?\s*(?:inf(?:inity)?|∞)|linear|none)$/i.test(radius.trim()))
  ) {
    return {
      ok: true,
      isValid: true,
      bulge: 0,
      radius: Infinity,
      sagitta: 0,
      isLinear: true,
      error: null,
    };
  }

  if (
    radius === null ||
    radius === undefined ||
    typeof radius === 'boolean' ||
    (typeof radius === 'string' && radius.trim() === '')
  ) {
    return {
      ok: false,
      isValid: false,
      bulge: null,
      radius: NaN,
      sagitta: null,
      isLinear: false,
      error: 'Arc radius must be a valid number.',
    };
  }

  const numR = typeof radius === 'number' ? radius : Number(radius);
  if (Number.isNaN(numR)) {
    return {
      ok: false,
      isValid: false,
      bulge: null,
      radius: NaN,
      sagitta: null,
      isLinear: false,
      error: 'Arc radius must be a valid number.',
    };
  }

  if (
    !Number.isFinite(chordLen) ||
    chordLen <= LINEAR_EPS ||
    !Number.isFinite(numR) ||
    Math.abs(numR) >= MAX_FINITE_ARC_RADIUS
  ) {
    return {
      ok: true,
      isValid: true,
      bulge: 0,
      radius: Infinity,
      sagitta: 0,
      isLinear: true,
      error: null,
    };
  }

  const absR = Math.abs(numR);
  if (chordLen - 2 * absR > CHORD_RADIUS_TOLERANCE) {
    return {
      ok: false,
      isValid: false,
      bulge: null,
      radius: absR,
      sagitta: null,
      isLinear: false,
      error: `Chord length (${chordLen.toFixed(1)}") exceeds twice the entered arc radius (${(2 * absR).toFixed(1)}").`,
    };
  }

  const disc = Math.max(0, 4 * absR * absR - chordLen * chordLen);
  const sqrtDisc = Math.sqrt(disc);
  const absBulge = options.majorArc
    ? (2 * absR + sqrtDisc) / chordLen
    : chordLen / (2 * absR + sqrtDisc);

  if (!Number.isFinite(absBulge) || absBulge < 1e-9) {
    return {
      ok: true,
      isValid: true,
      bulge: 0,
      radius: Infinity,
      sagitta: 0,
      isLinear: true,
      error: null,
    };
  }

  let sign = 1;
  if (numR < 0) {
    sign = -1;
  } else if (typeof options.sign === 'number' && options.sign !== 0) {
    sign = options.sign < 0 ? -1 : 1;
  } else if (typeof options.currentBulge === 'number' && options.currentBulge < 0) {
    sign = -1;
  }

  const bulge = sign * absBulge;
  return {
    ok: true,
    isValid: true,
    bulge,
    radius: absR,
    sagitta: sagittaFromBulge(chordLen, bulge),
    isLinear: false,
    error: null,
  };
}

function parseLengthValueInches(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return NaN;
  const s = raw.trim();
  if (!s) return NaN;
  const ftInMatch = s.match(
    /^([+-]?\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/i
  );
  if (ftInMatch) {
    const ft = parseFloat(ftInMatch[1]);
    const inch = ftInMatch[2] ? parseFloat(ftInMatch[2]) : 0;
    const sign = ft < 0 || s.startsWith('-') ? -1 : 1;
    return sign * (Math.abs(ft) * 12 + inch);
  }
  const inMatch = s.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:"|in|inches)$/i);
  if (inMatch) {
    return parseFloat(inMatch[1]);
  }
  return Number(s);
}

export function parseCurveHudInput(field, rawValue, chordLen, currentBulge = 0) {
  const str = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

  if (field === 'radius') {
    if (
      str === '' ||
      str === null ||
      str === undefined ||
      str === Infinity ||
      str === -Infinity ||
      (typeof str === 'string' && /^(?:[+-]?\s*(?:inf(?:inity)?|∞)|linear|none)$/i.test(str))
    ) {
      return {
        ok: true,
        isValid: true,
        bulge: 0,
        radius: Infinity,
        sagitta: 0,
        isLinear: true,
        error: null,
      };
    }
    const parsedR = parseLengthValueInches(str);
    return bulgeFromRadius(chordLen, parsedR, { currentBulge });
  }

  if (field === 'sagitta') {
    if (str === '' || str === null || str === undefined) {
      return {
        ok: true,
        isValid: true,
        bulge: 0,
        radius: Infinity,
        sagitta: 0,
        isLinear: true,
        error: null,
      };
    }
    const parsedS = parseLengthValueInches(str);
    if (Number.isNaN(parsedS) || !Number.isFinite(parsedS)) {
      return {
        ok: false,
        isValid: false,
        bulge: null,
        radius: NaN,
        sagitta: NaN,
        isLinear: false,
        error: 'Sagitta must be a finite number.',
      };
    }
    const bulge = bulgeFromSagitta(chordLen, parsedS);
    const isLinear = Math.abs(bulge) < LINEAR_EPS;
    return {
      ok: true,
      isValid: true,
      bulge: isLinear ? 0 : bulge,
      radius: isLinear ? Infinity : radiusFromBulge(chordLen, bulge),
      sagitta: isLinear ? 0 : sagittaFromBulge(chordLen, bulge),
      isLinear,
      error: null,
    };
  }

  if (field === 'bulge') {
    if (str === '' || str === null || str === undefined) {
      return {
        ok: true,
        isValid: true,
        bulge: 0,
        radius: Infinity,
        sagitta: 0,
        isLinear: true,
        error: null,
      };
    }
    const parsedB = typeof str === 'number' ? str : Number(str);
    if (Number.isNaN(parsedB) || !Number.isFinite(parsedB)) {
      return {
        ok: false,
        isValid: false,
        bulge: null,
        radius: NaN,
        sagitta: NaN,
        isLinear: false,
        error: 'Bulge factor must be a finite number.',
      };
    }
    const isLinear = Math.abs(parsedB) < 1e-9;
    const bulge = isLinear ? 0 : parsedB;
    return {
      ok: true,
      isValid: true,
      bulge,
      radius: isLinear ? Infinity : radiusFromBulge(chordLen, bulge),
      sagitta: isLinear ? 0 : sagittaFromBulge(chordLen, bulge),
      isLinear,
      error: null,
    };
  }

  return {
    ok: false,
    isValid: false,
    bulge: null,
    radius: NaN,
    sagitta: NaN,
    isLinear: false,
    error: `Unsupported curve parameter "${field}".`,
  };
}
