// Model inches -> paper points. Shared by sheet exporters; no rendering dependencies.
export function resolvePlanScale(bounds, drawingArea, scaleOption) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  // Reserve paper space for wall strokes and annotations on every side.
  const availableW = drawingArea.w - 40;
  const availableH = drawingArea.h - 40;
  if (![width, height, availableW, availableH].every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error('Cannot export PDF: invalid plan bounds or printable area.');
  }
  const fitScale = Math.min(availableW / width, availableH / height);
  const scalePt = scaleOption.fit ? fitScale : scaleOption.ptPerInch;
  if (!Number.isFinite(scalePt) || scalePt <= 0) {
    throw new Error('Cannot export PDF: invalid drawing scale.');
  }
  if (scalePt > fitScale + 1e-9) {
    throw new Error(
      'Plan does not fit at the selected scale. Choose a larger sheet, a smaller scale, or Fit to Page.'
    );
  }
  // A model inch occupies scalePt / 72 paper inches: denominator = 72 / scalePt.
  const denominator = 72 / scalePt;
  return {
    scalePt,
    denominator,
    label: scaleOption.fit
      ? `Fit to Page (1:${denominator.toFixed(2)} approx.)`
      : scaleOption.ratioStr,
  };
}
