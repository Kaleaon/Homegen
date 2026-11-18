// Centralized architectural fractional dimension formatting utility.

/**
 * Computes the greatest common divisor of two non-negative integers.
 *
 * @param {number} a First integer.
 * @param {number} b Second integer.
 * @returns {number} Greatest common divisor.
 */
function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Converts a length in inches into standard architectural feet, whole inches,
 * and simplified vulgar fractions down to 1/16" precision (e.g. `12' 6 1/2"`).
 *
 * @param {number} inches Raw length in inches.
 * @param {Object} [options={}] Formatting options.
 * @param {boolean} [options.includeZeroInches=false] Include explicit `0"` when inches are zero (e.g. `12' 0"`).
 * @returns {string} Formatted architectural dimension string.
 */
export function formatFractionalInches(inches, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const { includeZeroInches = false } = opts;

  if (
    inches == null ||
    typeof inches === 'boolean' ||
    typeof inches === 'object' ||
    (typeof inches === 'string' && inches.trim() === '')
  ) {
    return includeZeroInches ? '0\' 0"' : '0"';
  }

  const num = typeof inches === 'number' ? inches : Number(inches);
  if (!Number.isFinite(num)) {
    return includeZeroInches ? '0\' 0"' : '0"';
  }

  const totalSixteenths = Math.round(Math.abs(num) * 16);
  if (totalSixteenths === 0) {
    return includeZeroInches ? '0\' 0"' : '0"';
  }

  const sign = num < 0 ? '-' : '';
  const totalInches = Math.floor(totalSixteenths / 16);
  const remUnits = totalSixteenths % 16;
  const feet = Math.floor(totalInches / 12);
  const wholeInches = totalInches % 12;

  let fractionStr = '';
  if (remUnits > 0) {
    const divisor = gcd(remUnits, 16);
    fractionStr = `${remUnits / divisor}/${16 / divisor}`;
  }

  let inchPart = '';
  if (wholeInches > 0 && fractionStr) {
    inchPart = `${wholeInches} ${fractionStr}"`;
  } else if (wholeInches > 0) {
    inchPart = `${wholeInches}"`;
  } else if (fractionStr) {
    inchPart = `${fractionStr}"`;
  } else if (includeZeroInches) {
    inchPart = '0"';
  }

  if (feet > 0) {
    return inchPart ? `${sign}${feet}' ${inchPart}` : `${sign}${feet}'`;
  }

  return `${sign}${inchPart}`;
}
