// Turns the current 3D design into a prompt + guide images and sends them to free image generators.
import { ROOM_TYPES, ITEM_BY_ID, WALL_BY_ID, FLOOR_BY_ID } from './catalog.js';
import { interior, floorAreaSqFt } from './geometry.js';

export const STYLES = {
  modern: 'modern contemporary',
  scandi: 'Scandinavian minimalist',
  farmhouse: 'modern farmhouse',
  industrial: 'industrial loft',
  traditional: 'warm traditional',
  boho: 'bohemian eclectic',
};

export const NEGATIVE =
  'cartoon, illustration, 3d render, cgi, low quality, blurry, distorted perspective, warped furniture, text, watermark, people';

const ft = (inches) => Math.round(inches / 12);
const count = (arr) => arr.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());

/** Plain-language prompt describing one room as built (finishes, furniture, windows). */
export function buildPrompt(room, style = 'modern') {
  const ir = interior(room);
  const floor = FLOOR_BY_ID[room.floor]?.name.toLowerCase() || 'wood';
  const walls = [...count(Object.values(room.walls)).entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => WALL_BY_ID[id]?.name.toLowerCase())
    .filter(Boolean);
  const wallDesc =
    walls.length > 1
      ? `${walls[0]} walls with ${walls[1]} accent`
      : `${walls[0] || 'painted'} walls`;
  const furniture = [
    ...count(
      room.items
        .map((i) => ITEM_BY_ID[i.type])
        .filter((d) => d.mount === 'floor' && !d.flat && (d.cat !== 'decor' || d.shape === 'plant'))
        .map((d) => d.name.toLowerCase())
    ).entries(),
  ]
    .slice(0, 8)
    .map(([n, c]) => (c > 1 ? `${c} ${n}s` : `a ${n}`));
  const windows = room.openings.filter((o) => o.kind === 'window').length;
  const rug = room.items.some((i) => ITEM_BY_ID[i.type].shape === 'rug') ? ', an area rug' : '';
  return [
    `Photorealistic interior photograph of a ${STYLES[style] || style} ${ROOM_TYPES[room.type].name.toLowerCase()}`,
    `about ${ft(ir.w)} by ${ft(ir.h)} feet (${floorAreaSqFt(room).toFixed(0)} sq ft) with a ${ft(room.ceiling)} foot ceiling`,
    `${floor} flooring, ${wallDesc}`,
    furniture.length ? `furnished with ${furniture.join(', ')}${rug}` : 'unfurnished',
    windows
      ? `${windows} window${windows > 1 ? 's' : ''} letting in soft natural daylight`
      : 'soft artificial lighting',
    'shot at eye level, 24mm lens, professional architectural photography, realistic materials and shadows, high detail',
  ].join(', ');
}

export const pollinationsUrl = (prompt, { width = 1024, height = 768, seed = 1 } = {}) =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

const HORDE = 'https://aihorde.net/api/v2';
const CLIENT = 'homegen-web:0.2:github.com/Kaleaon/Homegen';

/** Strip a data URL to raw base64 (the Horde wants the bare string). */
export const rawBase64 = (dataUrl) => dataUrl.slice(dataUrl.indexOf(',') + 1);

export async function toWebpDataUrl(pngDataUrl, width = 768) {
  let tempUrl = null;
  try {
    let src = pngDataUrl;
    if (typeof Blob !== 'undefined' && pngDataUrl instanceof Blob) {
      tempUrl = URL.createObjectURL(pngDataUrl);
      src = tempUrl;
    }
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });

    const height = Math.round((img.height * width) / img.width);
    let blob;

    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        const offscreen = new OffscreenCanvas(width, height);
        const ctx = offscreen.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        blob = await offscreen.convertToBlob({ type: 'image/webp', quality: 0.92 });
      } catch {
        // Fallback to canvas.toBlob() if OffscreenCanvas fails
      }
    }

    if (!blob) {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      blob = await new Promise((res, rej) => {
        c.toBlob(
          (b) => {
            if (b) res(b);
            else rej(new Error('Canvas toBlob encoding failed'));
          },
          'image/webp',
          0.92
        );
      });
    }

    return await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
  } finally {
    if (tempUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      URL.revokeObjectURL(tempUrl);
    }
  }
}

/** Anonymous Horde users are capped at 576x576 total work; registered keys can go larger (checked with the service's dry_run). */
export const hordeWidth = (apikey) => (apikey === '0000000000' ? 576 : 768);

export class HordeError extends Error {
  constructor(message, type, status = null) {
    super(message);
    this.name = 'HordeError';
    this.type = type;
    this.status = status;
  }
}

function sleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchWithRetry(
  url,
  options,
  fetchImpl,
  signal,
  retries = 3,
  retryDelays = [1000, 2000, 4000]
) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Cancelled', 'AbortError');
    }
    try {
      const res = await fetchImpl(url, { ...options, signal });
      return res;
    } catch (err) {
      if (err.name === 'AbortError' || signal?.aborted) {
        throw err;
      }
      lastErr = err;
      if (attempt < retries) {
        const delay = retryDelays[attempt] ?? 4000;
        await sleep(delay, signal);
      }
    }
  }
  const netErr = new HordeError(
    `Network error while reaching AI Horde: ${lastErr?.message || 'Failed to fetch'}`,
    'network'
  );
  netErr.cause = lastErr;
  throw netErr;
}

function classifyResponseError(status, message) {
  if (status === 401 || status === 403) {
    return new HordeError(message || `AI Horde authorization failed (${status})`, 'auth', status);
  }
  if (status === 429) {
    return new HordeError(
      message || `AI Horde rate limit exceeded (${status})`,
      'rate_limit',
      status
    );
  }
  if (status >= 500) {
    return new HordeError(message || `AI Horde worker/server error (${status})`, 'fault', status);
  }
  return new HordeError(message || `AI Horde request failed (${status})`, 'generic', status);
}

/**
 * Photoreal render via AI Horde with a depth ControlNet so the result follows the 3D layout.
 * `depthDataUrl` must be the app's depth guide (near = white). Resolves to an image URL.
 */
export async function hordeRender({
  prompt,
  depthWebp,
  apikey = '0000000000',
  strength = 1,
  dryRun = false,
  onStatus = () => {},
  signal,
  fetchImpl = fetch,
  pollIntervalMs = 4000,
  retryDelays = [1000, 2000, 4000],
  maxDurationMs = 15 * 60 * 1000,
}) {
  const [w, h] = depthWebp.size || [768, 576];
  const body = {
    prompt: `${prompt} ### ${NEGATIVE}`,
    params: {
      sampler_name: 'k_euler_a',
      cfg_scale: 7,
      steps: apikey === '0000000000' ? 20 : 28,
      n: 1,
      width: w,
      height: h,
      karras: true,
      control_type: 'depth',
      image_is_control: true,
      control_strength: strength,
    },
    nsfw: false,
    censor_nsfw: true,
    r2: true,
    shared: false,
    slow_workers: true,
    replacement_filter: true,
    dry_run: dryRun,
    source_image: rawBase64(depthWebp.url),
    source_processing: 'img2img',
  };
  const headers = { 'Content-Type': 'application/json', apikey, 'Client-Agent': CLIENT };

  const res = await fetchWithRetry(
    `${HORDE}/generate/async`,
    { method: 'POST', headers, body: JSON.stringify(body) },
    fetchImpl,
    signal,
    3,
    retryDelays
  );
  const job = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw classifyResponseError(res.status, job.message);
  }
  if (dryRun) return { dryRun: true, kudos: job.kudos };
  if (!job.id) throw new HordeError('AI Horde did not return a valid job ID.', 'generic');

  onStatus(`Queued (job ${job.id.slice(0, 8)})…`);
  const startTime = Date.now();

  for (;;) {
    try {
      await sleep(pollIntervalMs, signal);
      if (signal?.aborted) {
        throw new DOMException('Cancelled', 'AbortError');
      }
      if (Date.now() - startTime > maxDurationMs) {
        fetchImpl(`${HORDE}/generate/status/${job.id}`, { method: 'DELETE' }).catch(() => {});
        throw new HordeError('AI Horde render job timed out after 15 minutes.', 'timeout');
      }

      const checkRes = await fetchWithRetry(
        `${HORDE}/generate/check/${job.id}`,
        { headers: { 'Client-Agent': CLIENT } },
        fetchImpl,
        signal,
        3,
        retryDelays
      );
      if (!checkRes.ok) {
        const checkErrData = await checkRes.json().catch(() => ({}));
        throw classifyResponseError(checkRes.status, checkErrData.message);
      }

      const c = await checkRes.json();
      if (c.faulted) {
        throw new HordeError('AI Horde job failed. Try again or lower the size.', 'fault');
      }
      onStatus(
        c.done
          ? 'Finishing…'
          : `Queue position ${c.queue_position ?? '?'} · ~${c.wait_time ?? '?'}s${apikey === '0000000000' ? ' (anonymous; a free key is faster)' : ''}`
      );
      if (c.done) break;
    } catch (err) {
      if (err.name === 'AbortError' || signal?.aborted) {
        fetchImpl(`${HORDE}/generate/status/${job.id}`, { method: 'DELETE' }).catch(() => {});
        throw err;
      }
      throw err;
    }
  }

  const stRes = await fetchWithRetry(
    `${HORDE}/generate/status/${job.id}`,
    { headers: { 'Client-Agent': CLIENT } },
    fetchImpl,
    signal,
    3,
    retryDelays
  );
  if (!stRes.ok) {
    const stErrData = await stRes.json().catch(() => ({}));
    throw classifyResponseError(stRes.status, stErrData.message);
  }
  const st = await stRes.json();
  const gen = st.generations?.[0];
  if (!gen) throw new HordeError('AI Horde returned no image.', 'fault');

  return { url: gen.img, censored: gen.censored };
}
