// 3D tab wiring + the photoreal dialog.
import { HDRI_ENVS, FREE_RESOURCES } from './resources.js';
import { STYLES, NEGATIVE, buildPrompt, pollinationsUrl, hordeRender, hordeWidth, toWebpDataUrl } from './photoreal.js';

const $ = (s) => document.querySelector(s);
const KEY = 'homegen.horde.key';

export function initView3D({ getDoc, getLevel, getSelectedRoomId, toast, setLevel }) {
  let api = null; let mode = '2d'; let abort = null;
  const plan = $('#plan'); const v3 = $('#view3d');

  async function ensure() {
    if (api) return api;
    const { createScene3D } = await import('./scene3d.js');
    api = createScene3D(v3, getDoc, getLevel, {
      onError: (msg) => toast(msg, true),
      onEnvChange: (env) => { const el = $('#o-env'); if (el) el.value = env; },
      onHDChange: (hd) => { const el = $('#o-hd'); if (el) el.checked = hd; },
    }); window.__scene3d = api;
    return api;
  }

  async function setView(next) {
    if (next === mode) return;
    if (next === '3d') {
      try { await ensure(); } catch (e) { console.error(e); toast(`3D view unavailable: ${e.message}`, true); return; }
    }
    mode = next;
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === next));
    plan.hidden = next === '3d'; v3.hidden = next !== '3d'; $('#bar3d').hidden = next !== '3d';
    document.querySelectorAll('#toolbar [data-tool]').forEach((b) => { b.disabled = next === '3d'; });
    if (next === '3d') api.show(); else api?.hide();
  }
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  $('#o-env').innerHTML = HDRI_ENVS.map((e) => `<option value="${e.id}">${e.name}</option>`).join('');
  $('#o-walls').addEventListener('change', (e) => api.setOption('walls', e.target.value));
  $('#o-levels').addEventListener('change', (e) => api.setOption('levels', e.target.value));
  $('#o-ceil').addEventListener('change', (e) => api.setOption('ceilings', e.target.checked));
  $('#o-hd').addEventListener('change', (e) => { api.setOption('hd', e.target.checked); if (e.target.checked) toast('Streaming free CC0 textures from Poly Haven…', false, 2500); });
  $('#o-env').addEventListener('change', (e) => api.setEnv(e.target.value));
  $('#o-sun').addEventListener('input', (e) => api.setOption('sun', Number(e.target.value)));
  $('#o-reset').addEventListener('click', () => api.resetCamera());
  $('#o-eye').addEventListener('click', () => { if (!api.eyeLevel(getSelectedRoomId())) toast('Add a room first.', true); });
  $('#o-photo').addEventListener('click', openPhoto);

  // ------------------------------------------------------------ photoreal dialog
  const dlg = $('#photo'); let guides = { beauty: '', depth: '' };
  $('#p-style').innerHTML = Object.entries(STYLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#p-key').value = (() => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } })();
  $('#p-resources').innerHTML = FREE_RESOURCES.map((r) => `<li><a href="${r.url}" target="_blank" rel="noopener">${r.name}</a>${r.license ? ` · <b>${r.license}</b>` : ''}<small>${r.group} — ${r.note}</small></li>`).join('');

  const rooms = () => getDoc().rooms;
  const selectedRoom = () => rooms().find((r) => r.id === $('#p-room').value) || rooms()[0];
  const refreshPrompt = () => { const r = selectedRoom(); if (r) $('#p-prompt').value = buildPrompt(r, $('#p-style').value); };

  function capture() {
    guides = { beauty: api.capture('beauty', 1024), depth: api.capture('depth', 1024) };
    $('#p-beauty').src = guides.beauty; $('#p-depth').src = guides.depth;
  }

  function openPhoto() {
    if (!rooms().length) return toast('Add a room first.', true);
    const sel = getSelectedRoomId();
    $('#p-room').innerHTML = rooms().map((r) => `<option value="${r.id}">${r.name} (floor ${(r.level || 0) + 1})</option>`).join('');
    const pick = rooms().find((r) => r.id === sel) || rooms().find((r) => (r.level || 0) === getLevel()) || rooms()[0];
    $('#p-room').value = pick.id; refreshPrompt();
    if (!api.eyeLevelUsed) { /* keep the user's current camera; they can press Eye level first */ }
    capture(); $('#p-status').textContent = 'Tip: press “Eye level” in the room you want, then re-capture, for a photo-like angle.';
    $('#p-result').hidden = true; dlg.showModal();
  }
  $('#p-room').addEventListener('change', () => { const r = selectedRoom(); setLevel(r.level || 0); refreshPrompt(); });
  $('#p-style').addEventListener('change', refreshPrompt);
  $('#p-capture').addEventListener('click', capture);
  $('#p-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(`${$('#p-prompt').value}\n\nNegative prompt: ${NEGATIVE}`); toast('Prompt copied.', false, 1800); } catch { toast('Copy failed — select the text manually.', true); } });
  $('#p-dl').addEventListener('click', () => {
    const save = (name, href) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
    save('homegen-beauty.png', guides.beauty); save('homegen-depth.png', guides.depth);
    save('homegen-prompt.txt', `data:text/plain;charset=utf-8,${encodeURIComponent(`${$('#p-prompt').value}\n\nNegative prompt: ${NEGATIVE}\n\nUse homegen-depth.png as a ControlNet "depth" input (near = white).`)}`);
  });

  const result = (url) => { const img = $('#p-result'); img.hidden = false; img.src = url; };
  $('#p-poll').addEventListener('click', () => {
    $('#p-status').textContent = 'Asking Pollinations… (prompt only; it cannot see your layout)';
    const img = $('#p-result'); img.hidden = false; img.onload = () => { $('#p-status').textContent = 'Done.'; }; img.onerror = () => { $('#p-status').textContent = 'Pollinations did not return an image (rate limit or service change). Try again shortly or use AI Horde.'; };
    img.src = pollinationsUrl($('#p-prompt').value, { seed: Math.floor(Math.random() * 1e6) });
  });
  $('#p-horde').addEventListener('click', async () => {
    if (abort) { abort.abort(); abort = null; return; }
    const btn = $('#p-horde'); const key = $('#p-key').value.trim() || '0000000000';
    try { localStorage.setItem(KEY, $('#p-key').value.trim()); } catch { /* ignore */ }
    abort = new AbortController(); btn.textContent = 'Cancel AI Horde job';
    try {
      const webp = await toWebpDataUrl(guides.depth, hordeWidth(key));
      const img = new Image(); await new Promise((r) => { img.onload = r; img.src = webp; });
      const out = await hordeRender({ prompt: $('#p-prompt').value, depthWebp: { url: webp, size: [Math.round(img.width / 64) * 64, Math.round(img.height / 64) * 64] }, apikey: key, signal: abort.signal, onStatus: (t) => { $('#p-status').textContent = t; } });
      result(out.url); $('#p-status').textContent = out.censored ? 'The service censored this image; try different wording.' : 'Done. Generated by AI Horde workers using a depth ControlNet from your 3D layout.';
    } catch (e) { $('#p-status').textContent = e.name === 'AbortError' ? 'Cancelled.' : `AI Horde: ${e.message}`; }
    abort = null; btn.textContent = 'AI Horde (follows your 3D layout, queued)';
  });

  return { setView, isThree: () => mode === '3d' };
}
