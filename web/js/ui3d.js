// 3D tab wiring + the photoreal dialog.
import { HDRI_ENVS, FREE_RESOURCES } from './resources.js';
import {
  STYLES,
  NEGATIVE,
  buildPrompt,
  pollinationsUrl,
  hordeRender,
  hordeWidth,
  toWebpDataUrl,
} from './photoreal.js';

const $ = (s) => document.querySelector(s);
const KEY = 'homegen.horde.key';

export function initView3D({ getDoc, getLevel, getSelectedRoomId, toast, setLevel }) {
  let api = null;
  let mode = '2d';
  let abort = null;
  const plan = $('#plan');
  const v3 = $('#view3d');

  async function ensure() {
    if (api) return api;
    const { createScene3D } = await import('./scene3d.js');
    api = createScene3D(v3, getDoc, getLevel, {
      onError: (msg) => toast(msg, true),
      onEnvChange: (env) => {
        const el = $('#o-env');
        if (el) el.value = env;
      },
      onHDChange: (hd) => {
        const el = $('#o-hd');
        if (el) el.checked = hd;
      },
      onCameraModeChange: (camMode) => {
        updateModeUI(camMode);
      },
    });
    window.__scene3d = api;
    return api;
  }

  function updateModeUI(camMode) {
    const walkBtn = $('#o-walk');
    const hud = $('#walkthrough-hud');
    if (walkBtn) {
      walkBtn.classList.toggle('on', camMode === 'walk');
      walkBtn.innerHTML =
        camMode === 'walk'
          ? '<span aria-hidden="true">🌐</span> Orbit mode'
          : '<span aria-hidden="true">🚶</span> Walkthrough';
    }
    if (hud) {
      hud.hidden = camMode !== 'walk' || mode !== '3d';
    }
  }

  async function setView(next) {
    if (next === mode) return;
    if (next === '3d') {
      try {
        await ensure();
      } catch (e) {
        console.error(e);
        toast(`3D view unavailable: ${e.message}`, true);
        return;
      }
    }
    mode = next;
    document
      .querySelectorAll('[data-view]')
      .forEach((b) => b.classList.toggle('on', b.dataset.view === next));
    plan.hidden = next === '3d';
    v3.hidden = next !== '3d';
    $('#bar3d').hidden = next !== '3d';
    const hud = $('#walkthrough-hud');
    if (hud) hud.hidden = next !== '3d' || api?.getCameraMode() !== 'walk';

    document.querySelectorAll('#toolbar [data-tool]').forEach((b) => {
      b.disabled = next === '3d';
    });
    if (next === '3d') api.show();
    else api?.hide();
  }
  document
    .querySelectorAll('[data-view]')
    .forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  $('#o-env').innerHTML = HDRI_ENVS.map((e) => `<option value="${e.id}">${e.name}</option>`).join(
    ''
  );
  $('#o-walls').addEventListener('change', (e) => api.setOption('walls', e.target.value));
  $('#o-levels').addEventListener('change', (e) => api.setOption('levels', e.target.value));
  $('#o-ceil').addEventListener('change', (e) => api.setOption('ceilings', e.target.checked));
  $('#o-hd').addEventListener('change', (e) => {
    api.setOption('hd', e.target.checked);
    if (e.target.checked) toast('Streaming free CC0 textures from Poly Haven…', false, 2500);
  });
  $('#o-env').addEventListener('change', (e) => api.setEnv(e.target.value));
  $('#o-sun').addEventListener('input', (e) => api.setOption('sun', Number(e.target.value)));
  $('#o-reset').addEventListener('click', () => {
    api?.resetCamera();
    toast('Reset 3D camera view', false, 2000);
  });
  $('#o-eye').addEventListener('click', () => {
    if (api?.eyeLevel(getSelectedRoomId())) toast('Entered eye-level view', false, 2000);
    else toast('Add a room first.', true);
  });
  const oWalk = $('#o-walk');
  if (oWalk) {
    oWalk.addEventListener('click', () => {
      if (!api) return;
      api.toggleCameraMode();
      const current = api.getCameraMode();
      if (current === 'walk') {
        toast('Entered Walkthrough mode (WASD / Arrows to walk, drag mouse to look)', false, 2500);
      } else {
        toast('Switched to Orbit mode', false, 2000);
      }
    });
  }
  const walkExitBtn = $('#walk-exit-btn');
  if (walkExitBtn) {
    walkExitBtn.addEventListener('click', () => {
      if (!api) return;
      api.setCameraMode('orbit');
      toast('Switched to Orbit mode', false, 2000);
    });
  }
  $('#o-photo').addEventListener('click', openPhoto);

  let isDraggingMouse = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  v3.addEventListener('mousedown', (e) => {
    if (!api || mode !== '3d' || api.getCameraMode() !== 'walk') return;
    if (e.button !== 0) return;
    isDraggingMouse = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingMouse || !api || mode !== '3d' || api.getCameraMode() !== 'walk') return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    api.lookWalkBy(dx, dy);
  });

  window.addEventListener('mouseup', () => {
    isDraggingMouse = false;
  });

  v3.addEventListener('keydown', (e) => {
    if (!api || mode !== '3d') return;
    const camMode = api.getCameraMode();
    const k = e.key;

    if (camMode === 'walk') {
      const lower = k.toLowerCase();
      if (lower === 'w' || k === 'ArrowUp') {
        e.preventDefault();
        api.walkKeys.forward = true;
      } else if (lower === 's' || k === 'ArrowDown') {
        e.preventDefault();
        api.walkKeys.backward = true;
      } else if (lower === 'a' || k === 'ArrowLeft') {
        e.preventDefault();
        api.walkKeys.left = true;
      } else if (lower === 'd' || k === 'ArrowRight') {
        e.preventDefault();
        api.walkKeys.right = true;
      } else if (k === 'Shift') {
        api.walkKeys.sprint = true;
      } else if (k === 'Escape' || lower === 'r') {
        e.preventDefault();
        api.setCameraMode('orbit');
        toast('Switched to Orbit mode', false, 2000);
      } else if (lower === 'e') {
        e.preventDefault();
        if (api.eyeLevel(getSelectedRoomId())) toast('Entered eye-level view', false, 2000);
        else toast('Add a room first.', true);
      }
      return;
    }

    if (k === 'ArrowLeft') {
      e.preventDefault();
      if (e.shiftKey) {
        api.panBy(-1, 0);
        toast('Panned 3D camera left', false, 1500);
      } else {
        api.orbitBy(-0.1, 0);
        toast('Orbited 3D camera left', false, 1500);
      }
    } else if (k === 'ArrowRight') {
      e.preventDefault();
      if (e.shiftKey) {
        api.panBy(1, 0);
        toast('Panned 3D camera right', false, 1500);
      } else {
        api.orbitBy(0.1, 0);
        toast('Orbited 3D camera right', false, 1500);
      }
    } else if (k === 'ArrowUp') {
      e.preventDefault();
      if (e.shiftKey) {
        api.panBy(0, 1);
        toast('Panned 3D camera up', false, 1500);
      } else {
        api.orbitBy(0, -0.08);
        toast('Orbited 3D camera up', false, 1500);
      }
    } else if (k === 'ArrowDown') {
      e.preventDefault();
      if (e.shiftKey) {
        api.panBy(0, -1);
        toast('Panned 3D camera down', false, 1500);
      } else {
        api.orbitBy(0, 0.08);
        toast('Orbited 3D camera down', false, 1500);
      }
    } else if (k === '+' || k === '=' || k === 'NumpadAdd') {
      e.preventDefault();
      api.zoomBy(0.88);
      toast('Zoomed in 3D view', false, 1500);
    } else if (k === '-' || k === '_' || k === 'NumpadSubtract') {
      e.preventDefault();
      api.zoomBy(1.14);
      toast('Zoomed out 3D view', false, 1500);
    } else if (k.toLowerCase() === 'e' || k === 'Enter') {
      e.preventDefault();
      if (api.eyeLevel(getSelectedRoomId())) toast('Entered eye-level view', false, 2000);
      else toast('Add a room first.', true, 2000);
    } else if (k.toLowerCase() === 'r' || k === 'Home') {
      e.preventDefault();
      api.resetCamera();
      toast('Reset 3D camera view', false, 2000);
    }
  });

  v3.addEventListener('keyup', (e) => {
    if (!api || mode !== '3d') return;
    const k = e.key;
    const lower = k.toLowerCase();
    if (lower === 'w' || k === 'ArrowUp') api.walkKeys.forward = false;
    if (lower === 's' || k === 'ArrowDown') api.walkKeys.backward = false;
    if (lower === 'a' || k === 'ArrowLeft') api.walkKeys.left = false;
    if (lower === 'd' || k === 'ArrowRight') api.walkKeys.right = false;
    if (k === 'Shift') api.walkKeys.sprint = false;
  });

  // ------------------------------------------------------------ photoreal dialog
  const dlg = $('#photo');
  let guides = { beauty: '', depth: '' };
  let triggerEl = null;
  let overrideResolution = null;
  $('#p-style').innerHTML = Object.entries(STYLES)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join('');
  $('#p-key').value = (() => {
    try {
      return localStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  })();
  $('#p-resources').innerHTML = FREE_RESOURCES.map(
    (r) =>
      `<li><a href="${r.url}" target="_blank" rel="noopener">${r.name}</a>${r.license ? ` · <b>${r.license}</b>` : ''}<small>${r.group} — ${r.note}</small></li>`
  ).join('');

  const rooms = () => getDoc().rooms;
  const selectedRoom = () => rooms().find((r) => r.id === $('#p-room').value) || rooms()[0];
  const refreshPrompt = () => {
    const r = selectedRoom();
    if (r) $('#p-prompt').value = buildPrompt(r, $('#p-style').value);
  };

  function capture() {
    guides = { beauty: api.capture('beauty', 1024), depth: api.capture('depth', 1024) };
    $('#p-beauty').src = guides.beauty;
    $('#p-depth').src = guides.depth;
  }

  function clearPhotorealError() {
    $('#p-key').classList.remove('invalid', 'error');
    const errBox = $('#p-error');
    if (errBox) errBox.hidden = true;
    const msg = $('#p-error-msg');
    if (msg) msg.textContent = '';
    $('#p-retry').hidden = true;
    $('#p-use-anon').hidden = true;
    $('#p-lower-res').hidden = true;
  }

  function showPhotorealError(e) {
    const errBox = $('#p-error');
    const msg = $('#p-error-msg');
    if (!errBox || !msg) return;

    errBox.hidden = false;
    msg.textContent = e.message || 'An error occurred during render.';

    const isAuth = e.type === 'auth' || e.status === 401 || e.status === 403;
    const isFault = e.type === 'fault';
    const isTimeout = e.type === 'timeout';

    if (isAuth) {
      $('#p-key').classList.add('invalid');
    }

    $('#p-retry').hidden = false;
    if (isAuth || $('#p-key').value.trim() !== '0000000000') {
      $('#p-use-anon').hidden = false;
    }
    if (isFault || isTimeout || overrideResolution === null) {
      $('#p-lower-res').hidden = false;
    }
  }

  function openPhoto(e) {
    if (!rooms().length) return toast('Add a room first.', true);
    triggerEl = (e && e.currentTarget) || $('#o-photo');
    const sel = getSelectedRoomId();
    $('#p-room').innerHTML = rooms()
      .map((r) => `<option value="${r.id}">${r.name} (floor ${(r.level || 0) + 1})</option>`)
      .join('');
    const pick =
      rooms().find((r) => r.id === sel) ||
      rooms().find((r) => (r.level || 0) === getLevel()) ||
      rooms()[0];
    $('#p-room').value = pick.id;
    refreshPrompt();
    if (!api.eyeLevelUsed) {
      /* keep the user's current camera; they can press Eye level first */
    }
    capture();
    clearPhotorealError();
    overrideResolution = null;
    $('#p-status').textContent =
      'Tip: press “Eye level” in the room you want, then re-capture, for a photo-like angle.';
    $('#p-result').hidden = true;
    dlg.showModal();
    const pRoom = $('#p-room');
    if (pRoom && typeof pRoom.focus === 'function') {
      pRoom.focus();
    }
  }

  dlg.addEventListener('close', () => {
    if (abort) {
      abort.abort();
      abort = null;
    }
    $('#p-horde').textContent = 'AI Horde (follows your 3D layout, queued)';
    clearPhotorealError();
    const trigger = triggerEl || $('#o-photo');
    if (trigger && typeof trigger.focus === 'function' && !trigger.disabled) {
      trigger.focus();
    }
  });

  $('#p-key').addEventListener('input', () => $('#p-key').classList.remove('invalid', 'error'));
  $('#p-room').addEventListener('change', () => {
    const r = selectedRoom();
    setLevel(r.level || 0);
    refreshPrompt();
  });
  $('#p-style').addEventListener('change', refreshPrompt);
  $('#p-capture').addEventListener('click', capture);
  $('#p-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(
        `${$('#p-prompt').value}\n\nNegative prompt: ${NEGATIVE}`
      );
      toast('Prompt copied.', false, 1800);
    } catch {
      toast('Copy failed — select the text manually.', true);
    }
  });
  $('#p-dl').addEventListener('click', () => {
    const save = (name, href) => {
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      a.click();
    };
    save('homegen-beauty.png', guides.beauty);
    save('homegen-depth.png', guides.depth);
    save(
      'homegen-prompt.txt',
      `data:text/plain;charset=utf-8,${encodeURIComponent(`${$('#p-prompt').value}\n\nNegative prompt: ${NEGATIVE}\n\nUse homegen-depth.png as a ControlNet "depth" input (near = white).`)}`
    );
  });

  const result = (url) => {
    const img = $('#p-result');
    img.hidden = false;
    img.src = url;
  };
  $('#p-poll').addEventListener('click', () => {
    $('#p-status').textContent = 'Asking Pollinations… (prompt only; it cannot see your layout)';
    const img = $('#p-result');
    img.hidden = false;
    img.onload = () => {
      $('#p-status').textContent = 'Done.';
    };
    img.onerror = () => {
      $('#p-status').textContent =
        'Pollinations did not return an image (rate limit or service change). Try again shortly or use AI Horde.';
    };
    img.src = pollinationsUrl($('#p-prompt').value, { seed: Math.floor(Math.random() * 1e6) });
  });

  async function runHordeRender() {
    if (abort) {
      abort.abort();
      abort = null;
      $('#p-horde').textContent = 'AI Horde (follows your 3D layout, queued)';
      $('#p-status').textContent = 'Cancelled.';
      return;
    }
    clearPhotorealError();
    const btn = $('#p-horde');
    const rawKey = $('#p-key').value.trim();
    const key = rawKey || '0000000000';
    try {
      localStorage.setItem(KEY, rawKey);
    } catch {
      /* ignore */
    }
    const width = overrideResolution ?? hordeWidth(key);
    abort = new AbortController();
    btn.textContent = 'Cancel AI Horde job';
    try {
      const webp = await toWebpDataUrl(guides.depth, width);
      const img = new Image();
      await new Promise((r) => {
        img.onload = r;
        img.src = webp;
      });
      const depthWebp = {
        url: webp,
        size: [Math.round(img.width / 64) * 64, Math.round(img.height / 64) * 64],
      };
      const out = await hordeRender({
        prompt: $('#p-prompt').value,
        depthWebp,
        apikey: key,
        signal: abort.signal,
        onStatus: (t) => {
          $('#p-status').textContent = t;
        },
      });
      result(out.url);
      $('#p-status').textContent = out.censored
        ? 'The service censored this image; try different wording.'
        : 'Done. Generated by AI Horde workers using a depth ControlNet from your 3D layout.';
    } catch (e) {
      if (e.name === 'AbortError') {
        $('#p-status').textContent = 'Cancelled.';
      } else {
        $('#p-status').textContent = `AI Horde: ${e.message}`;
        showPhotorealError(e);
      }
    } finally {
      abort = null;
      btn.textContent = 'AI Horde (follows your 3D layout, queued)';
    }
  }

  $('#p-horde').addEventListener('click', runHordeRender);
  $('#p-retry').addEventListener('click', () => {
    clearPhotorealError();
    runHordeRender();
  });
  $('#p-use-anon').addEventListener('click', () => {
    $('#p-key').value = '0000000000';
    try {
      localStorage.setItem(KEY, '0000000000');
    } catch {
      /* ignore */
    }
    clearPhotorealError();
    runHordeRender();
  });
  $('#p-lower-res').addEventListener('click', () => {
    overrideResolution = 576;
    clearPhotorealError();
    runHordeRender();
  });

  return { setView, isThree: () => mode === '3d' };
}
