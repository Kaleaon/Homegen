// Interactive Vector Stamp & Watermark Engine for Canvas 2D preview and jsPDF vector export
import { getToken } from './kthemeTokens.js';

export const STAMP_SHAPES = [
  { id: 'circle', name: 'Circular Seal' },
  { id: 'rectangle', name: 'Rectangle Frame' },
  { id: 'double-rectangle', name: 'Double Rectangle' },
  { id: 'rounded-rectangle', name: 'Rounded Rectangle' },
  { id: 'badge', name: 'Octagonal Badge' },
];

export const BORDER_STYLES = [
  { id: 'solid', name: 'Solid' },
  { id: 'dashed', name: 'Dashed' },
  { id: 'double', name: 'Double Line' },
  { id: 'bold', name: 'Bold Thick' },
];

/**
 * Renders an approval stamp onto an HTML5 Canvas 2D context.
 */
export function renderStampCanvas(canvas, stampConfig = {}, _options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  if (stampConfig.enabled === false) {
    ctx.save();
    ctx.font = `12px ${getToken('--font-family-sans', 'system-ui, sans-serif')}`;
    ctx.fillStyle = getToken('--ktheme-text-muted', '#888888');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Stamp Disabled', width / 2, height / 2);
    ctx.restore();
    return;
  }

  const shape = stampConfig.shape || 'circle';
  const borderStyle = stampConfig.borderStyle || 'solid';
  const borderColor = stampConfig.borderColor || getToken('--ktheme-accent', '#d32f2f');
  const textColor = stampConfig.textColor || getToken('--ktheme-text', '#d32f2f');
  const opacity = stampConfig.opacity ?? 0.9;

  const titleText = (stampConfig.titleText ?? 'APPROVED').toUpperCase();
  const subtitleText = stampConfig.subtitleText ?? 'ARCHITECTURAL PLAN';
  const licenseText = stampConfig.licenseText ?? '';
  const dateText = stampConfig.dateText || new Date().toISOString().slice(0, 10);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = borderColor;
  ctx.fillStyle = textColor;

  // Set line style
  ctx.lineWidth = borderStyle === 'bold' ? 4 : 2;
  if (borderStyle === 'dashed') {
    ctx.setLineDash([6, 4]);
  } else {
    ctx.setLineDash([]);
  }

  const cx = width / 2;
  const cy = height / 2;
  const pad = 12;

  if (shape === 'circle') {
    const r = Math.min(width, height) / 2 - pad;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    if (borderStyle === 'double') {
      ctx.beginPath();
      ctx.arc(cx, cy, r - 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Outer inner ring for text separation
    ctx.beginPath();
    ctx.arc(cx, cy, r - 12, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const sansFont = getToken('--font-family-sans', 'sans-serif');
    const monoFont = getToken('--font-family-mono', 'monospace');

    ctx.font = `bold 15px ${sansFont}`;
    ctx.fillText(titleText, cx, cy - r * 0.35);

    ctx.font = `10px ${sansFont}`;
    ctx.fillText(subtitleText, cx, cy);

    if (licenseText) {
      ctx.font = `9px ${monoFont}`;
      ctx.fillText(licenseText, cx, cy + r * 0.32);
    }

    ctx.font = `8px ${sansFont}`;
    ctx.fillText(dateText, cx, cy + r * 0.55);
  } else if (
    shape === 'rectangle' ||
    shape === 'double-rectangle' ||
    shape === 'rounded-rectangle'
  ) {
    const rx = pad;
    const ry = pad;
    const rw = width - pad * 2;
    const rh = height - pad * 2;

    const drawRectPath = (x, y, w, h) => {
      ctx.beginPath();
      if (shape === 'rounded-rectangle') {
        ctx.roundRect(x, y, w, h, 10);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.stroke();
    };

    drawRectPath(rx, ry, rw, rh);

    if (shape === 'double-rectangle' || borderStyle === 'double') {
      drawRectPath(rx + 4, ry + 4, rw - 8, rh - 8);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const sansFont = getToken('--font-family-sans', 'sans-serif');
    const monoFont = getToken('--font-family-mono', 'monospace');

    ctx.font = `bold 16px ${sansFont}`;
    ctx.fillText(titleText, cx, cy - 16);

    ctx.font = `11px ${sansFont}`;
    ctx.fillText(subtitleText, cx, cy + 4);

    if (licenseText) {
      ctx.font = `10px ${monoFont}`;
      ctx.fillText(licenseText, cx, cy + 20);
    }

    if (dateText) {
      ctx.font = `9px ${sansFont}`;
      ctx.fillText(dateText, cx, cy + 34);
    }
  } else if (shape === 'badge') {
    const rx = pad;
    const ry = pad;
    const rw = width - pad * 2;
    const rh = height - pad * 2;

    const drawOctagon = (x, y, w, h, chamfer) => {
      ctx.beginPath();
      ctx.moveTo(x + chamfer, y);
      ctx.lineTo(x + w - chamfer, y);
      ctx.lineTo(x + w, y + chamfer);
      ctx.lineTo(x + w, y + h - chamfer);
      ctx.lineTo(x + w - chamfer, y + h);
      ctx.lineTo(x + chamfer, y + h);
      ctx.lineTo(x, y + h - chamfer);
      ctx.lineTo(x, y + chamfer);
      ctx.closePath();
      ctx.stroke();
    };

    drawOctagon(rx, ry, rw, rh, 14);

    if (borderStyle === 'double') {
      drawOctagon(rx + 4, ry + 4, rw - 8, rh - 8, 12);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const sansFont = getToken('--font-family-sans', 'sans-serif');
    const monoFont = getToken('--font-family-mono', 'monospace');

    ctx.font = `bold 15px ${sansFont}`;
    ctx.fillText(titleText, cx, cy - 14);

    ctx.font = `11px ${sansFont}`;
    ctx.fillText(subtitleText, cx, cy + 5);

    if (licenseText) {
      ctx.font = `9px ${monoFont}`;
      ctx.fillText(licenseText, cx, cy + 20);
    }

    if (dateText) {
      ctx.font = `8px ${sansFont}`;
      ctx.fillText(dateText, cx, cy + 33);
    }
  }

  ctx.restore();
}

/**
 * Draws a pure vector approval stamp onto a jsPDF document page.
 */
export function drawStampPDF(pdf, stampConfig, x, y, width, height) {
  if (!pdf || !stampConfig || stampConfig.enabled === false) return;

  const shape = stampConfig.shape || 'circle';
  const borderStyle = stampConfig.borderStyle || 'solid';
  const borderColor = stampConfig.borderColor || getToken('--ktheme-accent', '#d32f2f');
  const textColor = stampConfig.textColor || getToken('--ktheme-text', '#d32f2f');
  const opacity = stampConfig.opacity ?? 0.9;

  const titleText = (stampConfig.titleText ?? 'APPROVED').toUpperCase();
  const subtitleText = stampConfig.subtitleText ?? 'ARCHITECTURAL PLAN';
  const licenseText = stampConfig.licenseText ?? '';
  const dateText = stampConfig.dateText || new Date().toISOString().slice(0, 10);

  pdf.saveGraphicsState();

  try {
    if (typeof pdf.GState === 'function') {
      pdf.setGState(new pdf.GState({ opacity, 'fill-opacity': opacity }));
    }
  } catch (_e) {
    // Ignore GState fallback
  }

  pdf.setDrawColor(borderColor);
  pdf.setTextColor(textColor);

  const lineWidth = borderStyle === 'bold' ? 2.5 : 1.2;
  pdf.setLineWidth(lineWidth);

  if (borderStyle === 'dashed') {
    pdf.setLineDashPattern([4, 2], 0);
  } else {
    pdf.setLineDashPattern([], 0);
  }

  const cx = x + width / 2;
  const cy = y + height / 2;

  if (shape === 'circle') {
    const r = Math.min(width, height) / 2 - 4;
    pdf.circle(cx, cy, r, 'S');

    if (borderStyle === 'double') {
      pdf.circle(cx, cy, r - 3, 'S');
    }

    pdf.setLineWidth(0.5);
    pdf.circle(cx, cy, r - 7, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(Math.max(7, r * 0.35));
    pdf.text(titleText, cx, cy - r * 0.32, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(Math.max(5.5, r * 0.22));
    pdf.text(subtitleText, cx, cy, { align: 'center' });

    if (licenseText) {
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(Math.max(5, r * 0.18));
      pdf.text(licenseText, cx, cy + r * 0.3, { align: 'center' });
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(Math.max(4.5, r * 0.16));
    pdf.text(dateText, cx, cy + r * 0.52, { align: 'center' });
  } else if (
    shape === 'rectangle' ||
    shape === 'double-rectangle' ||
    shape === 'rounded-rectangle'
  ) {
    pdf.rect(x, y, width, height, 'S');

    if (shape === 'double-rectangle' || borderStyle === 'double') {
      pdf.rect(x + 2, y + 2, width - 4, height - 4, 'S');
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.text(titleText, cx, cy - 10, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.text(subtitleText, cx, cy + 2, { align: 'center' });

    if (licenseText) {
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(5.5);
      pdf.text(licenseText, cx, cy + 12, { align: 'center' });
    }

    if (dateText) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5);
      pdf.text(dateText, cx, cy + 20, { align: 'center' });
    }
  } else if (shape === 'badge') {
    const chamfer = 8;
    const drawOctagon = (ox, oy, ow, oh, ch) => {
      pdf.line(ox + ch, oy, ox + ow - ch, oy);
      pdf.line(ox + ow - ch, oy, ox + ow, oy + ch);
      pdf.line(ox + ow, oy + ch, ox + ow, oy + oh - ch);
      pdf.line(ox + ow, oy + oh - ch, ox + ow - ch, oy + oh);
      pdf.line(ox + ow - ch, oy + oh, ox + ch, oy + oh);
      pdf.line(ox + ch, oy + oh, ox, oy + oh - ch);
      pdf.line(ox, oy + oh - ch, ox, oy + ch);
      pdf.line(ox, oy + ch, ox + ch, oy);
    };

    drawOctagon(x, y, width, height, chamfer);

    if (borderStyle === 'double') {
      drawOctagon(x + 2, y + 2, width - 4, height - 4, chamfer - 1);
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(titleText, cx, cy - 8, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    pdf.text(subtitleText, cx, cy + 3, { align: 'center' });

    if (licenseText) {
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(5.5);
      pdf.text(licenseText, cx, cy + 12, { align: 'center' });
    }

    if (dateText) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5);
      pdf.text(dateText, cx, cy + 19, { align: 'center' });
    }
  }

  pdf.restoreGraphicsState();
}

/**
 * Draws a semi-transparent diagonal vector watermark text overlay across a rectangle on jsPDF.
 */
export function drawWatermarkPDF(pdf, watermarkConfig, rect) {
  if (!pdf || !watermarkConfig || watermarkConfig.enabled === false) return;
  const text = (watermarkConfig.text || '').trim();
  if (!text) return;

  const color = watermarkConfig.color || '#9e9e9e';
  const opacity = watermarkConfig.opacity ?? 0.2;
  const fontSize = watermarkConfig.fontSize || 32;
  const angle = watermarkConfig.angle ?? -35;

  pdf.saveGraphicsState();

  try {
    if (typeof pdf.GState === 'function') {
      pdf.setGState(new pdf.GState({ opacity, 'fill-opacity': opacity }));
    }
  } catch (_e) {
    // Ignore GState fallback
  }

  pdf.setTextColor(color);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(fontSize);

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  pdf.text(text.toUpperCase(), cx, cy, {
    angle: angle,
    align: 'center',
    baseline: 'middle',
  });

  pdf.restoreGraphicsState();
}
