/* ═══════════════════════════════════════════════════════════════════════
   LUMEN — Volumetric Frame Archive
   Cinematic 3D photo gallery · vanilla JavaScript · no dependencies

   ───────────────────────────────────────────────────────────────────────
   00 · Utilities
   01 · Constants & seed data
   02 · DOM references
   03 · State
   04 · Card construction
   05 · Metrics (responsive geometry)
   06 · THE 3D TRANSFORM MATH
   07 · Render loop (spring + parallax + layout)
   08 · Chrome sync (read-out, rail, accent grade)
   09 · Navigation: drag / wheel / keys / rail
   10 · Inspect mode (cinematic push-in, FLIP, copy reveal)
   11 · CRUD — add / delete (dissolve + shatter)
   12 · Add-frame panel
   13 · Misc UI (toast, empty state, reset, local import)
   14 · Boot
   ═══════════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ══ 00 · UTILITIES ════════════════════════════════════════════════════ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp  = (a, b, t) => a + (b - a) * t;
const RAD   = Math.PI / 180;
const pad2  = n => String(n).padStart(2, '0');
const uid   = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc   = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Cheap deterministic 0→1 hash, used for per-card organic variation. */
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/* ══ 01 · CONSTANTS & SEED DATA ════════════════════════════════════════ */

/** Accent grades. Every photo carries one; the active photo re-grades the UI. */
const THEMES = {
  cyber:  { label: 'Cyberpunk',  c1: '#6ff2ff', c2: '#ff2e88' },
  scifi:  { label: 'Sci-Fi',     c1: '#a58bff', c2: '#2a1b52' },
  noir:   { label: 'Neo-Noir',   c1: '#9fb6d6', c2: '#161f2e' },
  nature: { label: 'Nature',     c1: '#8ff0b8', c2: '#0f2c25' },
};

/** Opening reel. Every frame carries a deterministic fallback so the
 *  gallery never shows a broken image when Unsplash is unreachable. */
const DEFAULTS = [
  { theme:'cyber', title:'Neon Requiem',
    desc:'Rain-slick asphalt. A city that only remembers light while it is burning out.',
    url:'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1100&q=80',
    fb:'https://picsum.photos/seed/lumen-neon/1100/1467' },
  { theme:'scifi', title:'Quiet Orbit',
    desc:'Sixteen sunrises a day and not one of them for us. The station keeps its own time.',
    url:'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1100&q=80',
    fb:'https://picsum.photos/seed/lumen-orbit/1100/1467' },
  { theme:'noir', title:'Last Signal',
    desc:'Static, then a voice. Every transmission ends the same way — mid-sentence.',
    url:'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1100&q=80',
    fb:'https://picsum.photos/seed/lumen-signal/1100/1467' },
  { theme:'nature', title:'Blue Hour Drift',
    desc:'The valley exhales. Fog takes the pines along with it and never gives them back.',
    url:'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1100&q=80',
    fb:'https://picsum.photos/seed/lumen-drift/1100/1467' },
  { theme:'scifi', title:'Deep Field',
    desc:'Ten thousand suns inside one frame. Small enough, and far enough, to be quiet.',
    url:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1100&q=80',
    fb:'https://picsum.photos/seed/lumen-field/1100/1467' },
  { theme:'noir', title:'Glass District',
    desc:'Nobody lives above the twelfth floor. Everybody watches from it.',
    url:'https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?auto=format&fit=crop&w=1100&q=80',
    fb:'https://picsum.photos/seed/lumen-glass/1100/1467' },
];

/* ══ 02 · DOM REFERENCES ════════════════════════════════════════════════ */
const body      = document.body;
const stage     = $('#stage');
const camera    = $('#camera');
const world     = $('#world');
const ring      = $('#ring');
const veil      = $('#veil');
const spot      = $('#spotlight');
const inspector = $('#inspector');
const inspFrame = $('#inspFrame');
const inspImg   = $('#inspImg');
const inspTitle = $('#inspTitle');
const inspDesc  = $('#inspDesc');
const inspTheme = $('#inspTheme');
const inspNum   = $('#inspNum');
const rail      = $('#rail');
const emptyEl   = $('#empty');
const readIndex = $('#readIndex');
const readTotal = $('#readTotal');
const readTheme = $('#readTheme');
const readDot   = $('#readDot');
const toastEl   = $('#toast');
const panel     = $('#panel');
const scrim     = $('#scrim');
const form      = $('#form');
const fileInput = $('#fileInput');
const fileDropZone = $('#uploadDropZone');
const uploadStatus = $('#uploadStatus');
const preview   = $('#preview');
const previewImg= $('#fPreviewImg');
const previewTxt= $('#previewText');
const swatches  = $('#swatches');
const panelCount= $('#panelCount');

/* ══ 03 · STATE ════════════════════════════════════════════════════════ */
const state = {
  photos: [],            // [{ id, url, fb, title, desc, theme }]
  cards: [],             // [{ el, photo, index, w, t, filter, sheen, hero, culled }]
  uploadUrls: new Set(),  // object URLs retained for current local-upload frames
  pos: 0,                // continuous scroll position, in "index units"
  target: 0,             // where the spring is heading
  vel: 0,                // index units per frame (also the flick momentum)
  dragging: false,
  open: null,            // id of the photo currently inspected
  active: -1,            // rounded index of the frame in focus
  pointer: { x: .5, y: .5, tx: .5, ty: .5 },
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  snapArmed: false,      // may we round `target` to the nearest frame?
  wheelActive: false,    // suppress rounding while the wheel is still moving
};

/** Responsive geometry, recomputed on resize (see measure()). */
let M = { R: 620, CW: 260, CH: 347, step: 46, pitch: 26, drag: 260, focus: 5.5, depth: 8.6 };

let drag = null;         // active pointer-drag session
let wheelTimer = 0;      // wheel settle debounce
let inspectToken = 0;    // guards async FLIP transitions

/* ══ 04 · CARD CONSTRUCTION ═════════════════════════════════════════════ */

/** Build one <article class="card"> and wire its image + delete affordance. */
function buildCard(photo, index) {
  const el = document.createElement('article');
  el.className = 'card';
  el.dataset.id = photo.id;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${photo.title} — ${THEMES[photo.theme].label}`);
  el.style.setProperty('--accent', THEMES[photo.theme].c1);

  const n = pad2(index + 1);
  el.innerHTML =
    '<div class="card__body">' +
      '<div class="card__media">' +
        '<img alt="' + esc(photo.title) + '" decoding="async" loading="lazy" />' +
      '</div>' +
      '<i class="card__sheen' + (photo.theme === 'cyber' ? ' card__sheen--warm' : '') + '"></i>' +
      '<i class="card__mat"></i>' +
      '<i class="card__glass"></i>' +
      '<div class="card__hud">' +
        '<b>' + esc(photo.title) + '<span>' + esc(THEMES[photo.theme].label) + '</span></b>' +
        '<i>' + n + '</i>' +
      '</div>' +
      '<button class="card__del" type="button" tabindex="-1" aria-label="Delete ' + esc(photo.title) + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round">' +
          '<path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" />' +
        '</svg>' +
      '</button>' +
    '</div>';

  const img = $('img', el);
  // Progressive load: fade in on success, swap to the deterministic fallback on failure.
  img.addEventListener('load', () => img.classList.add('is-loaded'));
  img.addEventListener('error', () => {
    if (photo.fb && !img.dataset.fellBack) { img.dataset.fellBack = '1'; img.src = photo.fb; }
    else img.classList.add('is-loaded');
  });
  img.src = photo.url;

  // Staggered image fade-in.
  img.style.setProperty('--load', (index * 0.07).toFixed(2) + 's');

  // Hover class (works for touch + keyboard focus, unlike a bare :hover).
  el.addEventListener('pointerenter', () => el.classList.add('is-hovered'));
  el.addEventListener('pointerleave', () => el.classList.remove('is-hovered'));
  el.addEventListener('focus', () => el.classList.add('is-hovered'));
  el.addEventListener('blur',  () => el.classList.remove('is-hovered'));

  // Low-profile delete trigger.
  const del = $('.card__del', el);
  del.addEventListener('click', ev => { ev.stopPropagation(); deletePhoto(photo.id); });

  ring.appendChild(el);
  return { el, photo, index, w: '', t: '', filter: '', sheen: '', hero: false, culled: false };
}

/** Re-number every card after an insert/remove. */
function reindex() {
  state.cards.forEach((c, i) => { c.index = i; c.el.dataset.index = i; });
}

/* ══ 05 · METRICS ══════════════════════════════════════════════════════ */
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const probe = state.cards[0] && state.cards[0].el;

  M.CW = probe ? probe.offsetWidth  : 260;
  M.CH = probe ? probe.offsetHeight : Math.round(M.CW * 4 / 3);

  // Narrow viewports get a tighter cylinder so the flanking frames stay on screen.
  const narrow = vw < 760;
  M.R    = clamp(vw * (narrow ? 0.30 : vw < 1200 ? 0.40 : 0.455), 200, 780);
  M.step = narrow ? 36 : vw < 1200 ? 41 : 46;   // degrees of Y-rotation per index
  M.pitch= narrow ? 16 : M.CH * 0.072;           // vertical helix rise per index
  M.drag = Math.max(110, M.CW * 1.05);           // px of pointer travel per frame
  M.focus= narrow ? 4.2 : 5.5;                  // index distance where DoF maxes out
  M.depth= narrow ? 6.0 : 8.6;                  // index distance where cards are culled
}

/* ══ 06 · THE 3D TRANSFORM MATH ════════════════════════════════════════ */
/*
   Every card rides the surface of an infinite *helical* cylinder whose axis is
   the Y axis of the stage. Nothing is precomputed and nothing wraps around a
   fixed ring — the position is a pure function of one continuous number:

        rel = card.index − state.pos          (signed distance to the focus)

   Because the layout is derived from `rel` rather than from the card's own
   index, the frame in focus is *always* parked dead centre at z = 0, no matter
   how many photos exist. That makes the gallery infinite: adding or deleting
   never invalidates the geometry.

        a  = rel · STEP · RAD                  angle of travel around the cylinder
        x  = sin(a) · r                       horizontal offset  (cylindrical)
        z  = cos(a) · r − r                   depth: rel = 0 ⇒ z = 0 (front & centre)
        y  = −rel · PITCH                      the helix climb (a soft staircase)

   `r` carries a tiny per-card variation so the cylinder reads as an organic
   installation rather than a machine part.
*/
function placeCard(c) {
  const rel = c.index - state.pos;                 // signed, continuous
  if (Math.abs(rel) > M.depth) {                   // outside the focal window
    if (!c.culled) { c.el.classList.add('is-culled'); c.culled = true; }
    return;
  }
  if (c.culled) { c.el.classList.remove('is-culled'); c.culled = false; }

  /* — geometry ——————————————————————————————————————————————— */
  const a = rel * M.step * RAD;
  const r = M.R * (1 + (c.vary - 0.5) * 0.055);    // ±2.75 % organic variation
  const x = Math.sin(a) * r;
  const z = Math.cos(a) * r - r;                   // 0 at the focal plane
  const y = -rel * M.pitch + (c.vary2 - 0.5) * M.CH * 0.09;

  /* — hero promotion: a smooth ramp so a frame "lands" into focus ——— */
  const near = Math.abs(rel);
  const hero = clamp(1 - near, 0, 1);
  const pop  = hero * hero;                         // ease-in so the push is gentle
  const zPop = pop * M.CH * 0.5;                    // pull the hero toward the lens

  /* — depth of field: sharpen at centre, blur + desaturate away from it —— */
  const d      = clamp(near / M.focus, 0, 1);
  const dSharp = Math.pow(d, 1.35);
  const blur   = dSharp * 8;
  const sat    = 1 - dSharp * 0.52;
  const bright = 1 - dSharp * 0.44 + pop * 0.10;

  /* — billboard blend: full tangent = a, 0 = flat to camera.
       A pure cylinder turns the flanking frames edge-on; blending to ~0.8
       keeps them readable while still selling the rotation. ————— */
  const ry = a / RAD * 0.80 + (state.pointer.x - 0.5) * 3.0;
  const rx = clamp(y / M.CH * 7, -9, 9) - (state.pointer.y - 0.5) * 3.0;
  const s  = 0.78 + (1 - d) * 0.22 + pop * 0.10;

  /* — mouse parallax: nearer cards travel further ——————————————— */
  const px = (state.pointer.x - 0.5);
  const py = (state.pointer.y - 0.5);
  const depthPush = px * 44 * (1 - d * 0.7) + py * 16 * (1 - d * 0.5);

  /* — compose ———————————————————————————————————————————————— */
  const tr = 'translate3d(' + (x + px * 22).toFixed(2) + 'px,' +
             y.toFixed(2) + 'px,' +
             (z + zPop + depthPush).toFixed(2) + 'px) ' +
             'rotateY(' + ry.toFixed(2) + 'deg) ' +
             'rotateX(' + rx.toFixed(2) + 'deg) ' +
             'scale(' + s.toFixed(3) + ')';

  if (tr !== c.t) { c.el.style.transform = tr; c.t = tr; }

  const filter = 'blur(' + blur.toFixed(2) + 'px) saturate(' + sat.toFixed(3) + ') brightness(' + bright.toFixed(3) + ')';
  if (filter !== c.filter) {
    c.el.firstElementChild.firstElementChild.style.filter = filter;   // .card__media
    c.filter = filter;
  }

  // Specular rake that sweeps the plate as the frame rotates past the key light.
  const sheen = ((Math.cos(a) * 0.5 + 0.5) * 100).toFixed(1) + '%';
  if (sheen !== c.sheen) { c.el.style.setProperty('--sheen', sheen); c.sheen = sheen; }

  const isHero = near < 0.5;
  if (isHero !== c.hero) { c.el.classList.toggle('is-hero', isHero); c.hero = isHero; }
}

/* ══ 07 · RENDER LOOP ═══════════════════════════════════════════════════ */
let lastT = performance.now();

/**
 * Spring integration toward `state.target`.
 * A damped spring (rather than a tween) means interruptions stay fluid: a new
 * drag simply changes the target and the motion bends into it.
 */
function spring(dt) {
  if (state.dragging) {
    // 1:1 with the pointer — bypass the spring entirely while dragging.
    state.pos = state.target;
    state.vel = 0;
    return;
  }
  const f = clamp(dt * 60, 0.25, 2.4);          // frame-rate normalisation
  state.vel += (state.target - state.pos) * 0.115 * f;
  state.vel *= Math.pow(0.76, f);
  state.pos  += state.vel * f;

  // Magnetic settle: once momentum dies, lock onto the nearest frame.
  if (state.snapArmed && !state.wheelActive && Math.abs(state.vel) < 0.08) {
    state.target = Math.round(state.target);
    state.snapArmed = false;
  }
  if (Math.abs(state.target - state.pos) < 0.0008 && Math.abs(state.vel) < 0.0008) {
    state.pos = state.target;
    state.vel = 0;
  }
}

/** Eased pointer tracking for the tilt-shift parallax. */
function parallax(dt) {
  const p = state.pointer, k = state.reduced ? 1 : 0.085 * clamp(dt * 60, 0.3, 2);
  p.x = lerp(p.x, p.tx, k);
  p.y = lerp(p.y, p.ty, k);
  if (state.reduced) { p.x = p.tx; p.y = p.ty; }

  // The whole installation tilts toward the cursor — the sense of weight.
  const tiltX = (p.y - 0.5) * -6.5;
  const tiltY = (p.x - 0.5) * 8.5;
  world.style.transform =
    'rotateX(' + tiltX.toFixed(3) + 'deg) rotateY(' + tiltY.toFixed(3) + 'deg)';

  spot.style.setProperty('--mx', (p.x * 100).toFixed(2) + '%');
  spot.style.setProperty('--my', (p.y * 100).toFixed(2) + '%');
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000) || 0.016;
  lastT = now;

  spring(dt);
  parallax(dt);

  if (state.photos.length) {
    for (let i = 0; i < state.cards.length; i++) placeCard(state.cards[i]);
  }

  // Read-out + accent grade follow the rounded focus index.
  const a = state.photos.length ? clamp(Math.round(state.pos), 0, state.photos.length - 1) : -1;
  if (a !== state.active) syncChrome(a);

  requestAnimationFrame(frame);
}

/* ══ 08 · CHROME SYNC ═══════════════════════════════════════════════════ */
let railTicks = [];

function buildRail() {
  rail.innerHTML = '';
  railTicks = state.photos.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rail__tick';
    b.setAttribute('aria-label', 'Frame ' + (i + 1) + ': ' + p.title);
    b.style.setProperty('--tick', THEMES[p.theme].c1);
    b.innerHTML = '<i></i>';
    b.addEventListener('click', () => {
      if (state.open) closeInspector();
      state.target = i; state.snapArmed = true;
    });
    rail.appendChild(b);
    return b;
  });
}

function syncChrome(i) {
  state.active = i;
  const p = state.photos[i];
  railTicks.forEach((t, n) => t.classList.toggle('is-on', n === i));
  if (!p) return;
  const th = THEMES[p.theme];
  readIndex.textContent = pad2(i + 1);
  readTotal.textContent = pad2(state.photos.length);
  readTheme.textContent = th.label;
  // Re-grade the whole interface to the active frame's palette.
  body.style.setProperty('--accent', th.c1);
  if (state.open === p.id) paintInspector(p);
}

/** Refresh the inspector copy for the currently inspected photo. */
function paintInspector(p) {
  const th = THEMES[p.theme];
  inspTitle.textContent = p.title;
  inspDesc.textContent = p.desc;
  inspTheme.textContent = th.label;
  inspNum.textContent = '/ ' + pad2(state.active + 1);
  inspector.style.setProperty('--accent', th.c1);
}

/* ══ 09 · NAVIGATION ═══════════════════════════════════════════════════ */

function step(dir) {
  const last = state.photos.length - 1;
  const next = clamp(Math.round(state.target) + dir, 0, last);
  if (next === Math.round(state.target) && !state.photos.length) return;
  state.target = next;
  state.snapArmed = true;
}

/* — drag / swipe ————————————————————————————————————————————— */
stage.addEventListener('pointerdown', e => {
  if (state.open) return;                                       // inspect mode owns input
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('.card__del')) return;                   // let delete through

  drag = {
    id: e.pointerId,
    x: e.clientX,
    startPos: state.target,
    lastPos: state.target,
    lastT: performance.now(),
    v: 0,
    moved: false,
  };
  state.dragging = true;
  stage.classList.add('is-dragging');
  try { stage.setPointerCapture(e.pointerId); } catch (_) {}
});

window.addEventListener('pointermove', e => {
  state.pointer.tx = e.clientX / window.innerWidth;
  state.pointer.ty = e.clientY / window.innerHeight;

  if (!drag || e.pointerId !== drag.id) return;

  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) > 4) drag.moved = true;

  // Drag distance → index units. A whole card width per frame feels direct.
  state.target = drag.startPos - dx / M.drag;

  // Track instantaneous velocity in index-units-per-frame for the release flick.
  const now = performance.now();
  const dt = Math.max(1, now - drag.lastT);
  drag.v = lerp(drag.v, ((state.target - drag.lastPos) / dt) * 16, 0.35);
  drag.lastPos = state.target;
  drag.lastT = now;
});

window.addEventListener('pointerup', onDragEnd);
window.addEventListener('pointercancel', onDragEnd);

function onDragEnd(e) {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const d = drag;
  drag = null;
  state.dragging = false;
  stage.classList.remove('is-dragging');

  if (!d.moved) {
    // A tap, not a drag → inspect the frame under the pointer.
    const el = e && e.target && e.target.closest ? e.target.closest('.card') : null;
    if (el && el.dataset.id) openInspector(el.dataset.id);
    return;
  }
  // Flick: keep the momentum in the spring and let it coast to rest.
  state.vel = clamp(d.v, -1.7, 1.7);
  state.snapArmed = true;
}

/* — scroll wheel / trackpad ————————————————————————————————————— */
stage.addEventListener('wheel', e => {
  if (state.open) return;
  e.preventDefault();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  state.target += d * 0.0026;
  state.vel = 0;
  state.snapArmed = true;
  state.wheelActive = true;
  clearTimeout(wheelTimer);
  // Only snap to a whole frame once the wheel has actually stopped.
  wheelTimer = setTimeout(() => { state.wheelActive = false; }, 140);
}, { passive: false });

/* — keyboard ——————————————————————————————————————————————— */
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
  if (typing && e.key !== 'Escape') return;

  if (state.open) {
    if (e.key === 'Escape')      { e.preventDefault(); closeInspector(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); step(-1); }
    return;
  }

  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': e.preventDefault(); step(1);  break;
    case 'ArrowLeft':  case 'ArrowUp':   e.preventDefault(); step(-1);  break;
    case 'Escape':     if (!panel.hidden) closePanel(); break;
    case 'a': case 'A': openPanel(); break;
    case 'Enter':
      if (state.active >= 0 && document.activeElement === document.body) {
        e.preventDefault();
        openInspector(state.photos[state.active].id);
      }
      break;
  }
});

/* ══ 10 · INSPECT MODE ══════════════════════════════════════════════════ */

/** Copy-reveal stagger delays. */
function stageCopy() {
  $$('.copy-in', inspector).forEach((n, i) => n.style.setProperty('--cd', (300 + i * 110) + 'ms'));
}

function openInspector(id) {
  const photo = state.photos.find(p => p.id === id);
  if (!photo) return;
  const card = state.cards.find(c => c.photo.id === id);
  const token = ++inspectToken;

  state.open = id;
  paintInspector(photo);
  stageCopy();

  // Preload before the push-in so the frame never fades in empty.
  const begin = () => { if (token === inspectToken) flipIn(card); };
  inspImg.onload = begin;
  inspImg.onerror = begin;
  if (inspImg.getAttribute('src') !== photo.url) inspImg.src = photo.url;
  if (inspImg.complete && inspImg.naturalWidth) begin();

  stage.classList.add('is-inspecting');
  body.classList.add('is-inspecting');
  inspector.setAttribute('aria-hidden', 'false');
}

/**
 * FLIP: the big frame is first placed exactly on top of its source card,
 * then released into its resting position — a true "camera push" rather than
 * a cross-fade between two unrelated images.
 */
function flipIn(card) {
  if (!state.open) return;
  const frame = inspFrame;
  frame.style.transition = 'none';
  frame.style.opacity = '0';
  frame.style.transform = 'none';

  const to = frame.getBoundingClientRect();
  const from = card && !card.culled ? card.el.getBoundingClientRect() : null;

  if (from && from.width > 0) {
    frame.style.transformOrigin = '50% 50%';
    frame.style.transform =
      'translate3d(' +
      ((from.left + from.width / 2) - (to.left + to.width / 2)).toFixed(1) + 'px,' +
      ((from.top + from.height / 2) - (to.top + to.height / 2)).toFixed(1) + 'px,0) ' +
      'scale(' + (from.width / to.width).toFixed(4) + ')';
  }
  void frame.offsetWidth;                                  // commit the start pose
  frame.style.transition = 'transform 1.05s cubic-bezier(.16,1,.3,1), opacity .5s ease';
  frame.style.transform = 'none';
  frame.style.opacity = '1';
}

function closeInspector(instant) {
  if (!state.open) return;
  const card = state.cards.find(c => c.photo.id === state.open);
  const frame = inspFrame;

  const finish = () => {
    stage.classList.remove('is-inspecting');
    body.classList.remove('is-inspecting');
    inspector.setAttribute('aria-hidden', 'true');
    frame.style.transition = '';
    frame.style.transform = '';
    frame.style.opacity = '';
    inspImg.removeAttribute('src');
  };

  if (instant || !card || card.culled) { state.open = null; finish(); return; }

  // Reverse FLIP — the frame flies home into its slot on the cylinder.
  const to = card.el.getBoundingClientRect();
  const from = frame.getBoundingClientRect();
  frame.style.transition = 'transform .78s cubic-bezier(.5,0,.3,1), opacity .5s ease .18s';
  frame.style.transform =
    'translate3d(' +
    ((to.left + to.width / 2) - (from.left + from.width / 2)).toFixed(1) + 'px,' +
    ((to.top + to.height / 2) - (from.top + from.height / 2)).toFixed(1) + 'px,0) ' +
    'scale(' + (to.width / from.width).toFixed(4) + ')';
  frame.style.opacity = '0';

  state.open = null;
  setTimeout(finish, 620);
}

$('#btnClose').addEventListener('click', () => closeInspector());
inspector.addEventListener('click', e => {
  if (!e.target.closest('.inspector__inner')) closeInspector();
});
veil.addEventListener('click', () => closeInspector());

/* ══ 11 · CRUD — ADD / DELETE ═══════════════════════════════════════════ */

/* — ADD ————————————————————————————————————————————————— */
function addPhoto(data, opts) {
  opts = opts || {};
  const photo = {
    id: uid(),
    url: data.url,
    objectUrl: data.objectUrl || '',
    fb: data.fb || '',
    title: data.title || 'Untitled frame',
    desc: data.desc || '',
    theme: THEMES[data.theme] ? data.theme : 'noir',
  };
  state.photos.push(photo);

  const card = buildCard(photo, state.photos.length - 1);
  card.vary  = hash01(photo.id);
  card.vary2 = hash01(photo.id + '~');
  state.cards.push(card);
  reindex();
  measure();

  // Entrance animation, then release the class so hover/DoF can take over.
  if (opts.animate !== false) {
    card.el.classList.add('is-entering');
    card.el.addEventListener('animationend', () => card.el.classList.remove('is-entering'), { once: true });
  }

  buildRail();
  panelCount.textContent = state.photos.length + ' frame' + (state.photos.length === 1 ? '' : 's') + ' in archive';

  if (!state.open) {
    state.target = state.photos.length - 1;   // travel to the new frame
    state.snapArmed = true;
  }
  if (state.active >= 0) syncChrome(clamp(Math.round(state.pos), 0, state.photos.length - 1));
  emptyEl.hidden = true;
  return photo;
}

/* — DELETE ——————————————————————————————————————————————— */
function releaseUploadUrl(photo) {
  if (photo && photo.objectUrl && state.uploadUrls.delete(photo.objectUrl)) {
    URL.revokeObjectURL(photo.objectUrl);
  }
}

function deletePhoto(id) {
  const at = state.photos.findIndex(p => p.id === id);
  if (at < 0) return;
  const photo = state.photos[at];
  const cIdx = state.cards.findIndex(c => c.photo.id === id);
  const card = state.cards[cIdx];

  if (state.open === id) closeInspector(true);

  // Dissolve + shatter.
  shatter(card.el);

  // Remove from the data array immediately, take the card out of the DOM once
  // the animation has played, then close the gap in the scroll position.
  state.photos.splice(at, 1);
  state.cards.splice(cIdx, 1);
  if (cIdx < state.pos) { state.pos -= 1; state.target -= 1; }

  // Let the dissolve shards finish using the image before releasing its URL.
  setTimeout(() => {
    card.el.remove();
    releaseUploadUrl(photo);
  }, 1450);

  reindex();
  buildRail();
  measure();
  panelCount.textContent = state.photos.length + ' frame' + (state.photos.length === 1 ? '' : 's') + ' in archive';

  if (!state.photos.length) {
    state.pos = state.target = 0;
    state.active = -1;
    emptyEl.hidden = false;
    readIndex.textContent = '00';
    readTotal.textContent = '00';
    readTheme.textContent = 'EMPTY';
    toast('archive emptied');
  } else {
    syncChrome(clamp(Math.round(state.pos), 0, state.photos.length - 1));
    toast('frame dissolved · ' + photo.title);
  }
}

/**
 * Shatter: the card's frame is tiled with a jittered lattice and each triangle
 * is clipped out as a real shard that samples the same photograph, then thrown
 * outward in the card's own 3D space.
 */
function shatter(el) {
  const body = el.querySelector('.card__body');
  const img  = el.querySelector('img');
  const url  = img ? (img.currentSrc || img.src) : '';
  const rect = el.getBoundingClientRect();

  el.classList.add('is-shattering');

  const shock = document.createElement('i');
  shock.className = 'shock';
  body.appendChild(shock);
  setTimeout(() => shock.remove(), 700);

  if (!url || !rect.width) return;

  const COLS = 3, ROWS = 4;
  const cw = 100 / COLS, chh = 100 / ROWS;
  const jitX = () => (Math.random() - 0.5) * cw * 0.55;
  const jitY = () => (Math.random() - 0.5) * chh * 0.55;

  // Shared, jittered lattice → adjacent shards share vertices, so the plate
  // reads as cracked glass rather than a shuffled grid.
  const lat = [];
  for (let r = 0; r <= ROWS; r++) {
    lat[r] = [];
    for (let c = 0; c <= COLS; c++) {
      const x = clamp(c * cw + (c === 0 ? 0 : c === COLS ? 0 : jitX()), 0, 100);
      const y = clamp(r * chh + (r === 0 ? 0 : r === ROWS ? 0 : jitY()), 0, 100);
      lat[r][c] = x.toFixed(2) + '% ' + y.toFixed(2) + '%';
    }
  }

  const frag = document.createDocumentFragment();
  const shoot = (poly, cx, cy) => {
    const s = document.createElement('i');
    s.className = 'shard';
    s.style.clipPath = 'polygon(' + poly + ')';
    s.style.backgroundImage = 'url("' + url + '")';
    s.style.backgroundSize = rect.width.toFixed(1) + 'px ' + rect.height.toFixed(1) + 'px';
    // Throw it away from the plate's centre, with gravity and tumble.
    const dx = (cx - 50) / 50, dy = (cy - 50) / 50;
    s.style.setProperty('--dx', (dx * 190 + (Math.random() - 0.5) * 110).toFixed(0) + 'px');
    s.style.setProperty('--dy', (dy * 140 + 70 + (Math.random() - 0.5) * 80).toFixed(0) + 'px');
    s.style.setProperty('--dz', (-150 + Math.random() * 260).toFixed(0) + 'px');
    s.style.setProperty('--rot', ((Math.random() - 0.5) * 170).toFixed(0) + 'deg');
    s.style.setProperty('--delay', (Math.random() * 70).toFixed(0) + 'ms');
    frag.appendChild(s);
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const A = lat[r][c], B = lat[r][c + 1], C = lat[r + 1][c + 1], D = lat[r + 1][c];
      shoot(A + ', ' + B + ', ' + C, (c + 0.5) * cw, (r + 0.5) * chh);
      shoot(A + ', ' + C + ', ' + D, (c + 0.5) * cw, (r + 0.5) * chh);
    }
  }
  body.appendChild(frag);
  setTimeout(() => $$('.shard', el).forEach(n => n.remove()), 1400);
}

/* ══ 12 · ADD-FRAME PANEL ═══════════════════════════════════════════════ */
let panelTheme = 'cyber';
let previewSeq = 0, previewTimer = 0;
let uploadEpoch = 0;

function buildSwatches() {
  swatches.innerHTML = '';
  Object.keys(THEMES).forEach(k => {
    const t = THEMES[k];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(k === panelTheme));
    b.setAttribute('aria-label', t.label);
    b.dataset.theme = k;
    b.style.setProperty('--c1', t.c1);
    b.style.setProperty('--c2', t.c2);
    b.addEventListener('click', () => {
      panelTheme = k;
      $$('.swatch', swatches).forEach(s => s.setAttribute('aria-checked', String(s.dataset.theme === k)));
    });
    swatches.appendChild(b);
  });
}

function openPanel() {
  if (!panel.hidden) return;
  panel.hidden = false; scrim.hidden = false;
  requestAnimationFrame(() => { $('#fUrl').focus(); });
}

function closePanel() {
  if (panel.hidden) return;
  panel.hidden = true; scrim.hidden = true;
}

$('#btnAdd').addEventListener('click', openPanel);
$('#btnPanelClose').addEventListener('click', closePanel);
scrim.addEventListener('click', closePanel);
$$('[data-add]').forEach(b => b.addEventListener('click', () => { openPanel(); }));

/* — local image upload / drag-and-drop ——————————————————————————— */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp']);
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/x-png',
  'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/x-ms-bmp',
]);

function isSupportedImageFile(file) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const mime = String(file.type || '').toLowerCase();
  if (mime && mime !== 'application/octet-stream' && !IMAGE_MIME_TYPES.has(mime)) return false;
  return IMAGE_EXTENSIONS.has(ext) || IMAGE_MIME_TYPES.has(mime);
}

/** Decode before adding so renamed documents/non-images are reported, not framed. */
async function verifiedObjectUrl(file) {
  if (typeof window.createImageBitmap === 'function') {
    try {
      const bitmap = await window.createImageBitmap(file);
      bitmap.close();
      return URL.createObjectURL(file);
    } catch (_) {
      return '';
    }
  }
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    image.src = url;
  });
}

function localUploadTitle(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Local frame';
}

async function importLocalFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const epoch = uploadEpoch;
  const candidates = files.filter(isSupportedImageFile);
  let skipped = files.length - candidates.length;
  uploadStatus.textContent = 'Checking local image files…';

  const checked = [];
  for (const file of candidates) {
    const url = await verifiedObjectUrl(file);
    if (url) checked.push({ file, url });
    else skipped += 1;
  }

  if (epoch !== uploadEpoch) {
    checked.forEach(item => URL.revokeObjectURL(item.url));
    return;
  }

  if (checked.length) {
    if (state.open) closeInspector(true);
    checked.forEach(({ file, url }, index) => {
      state.uploadUrls.add(url);
      addPhoto({
        url,
        objectUrl: url,
        title: localUploadTitle(file.name),
        desc: 'Local upload · held in this browser session.',
        theme: panelTheme,
      }, { animate: index === 0 });
    });
  }

  if (checked.length && skipped) {
    uploadStatus.textContent = checked.length + ' added; ' + skipped + ' skipped. Only supported, readable image files can be added.';
    toast(checked.length + ' added · ' + skipped + ' skipped');
  } else if (checked.length) {
    uploadStatus.textContent = checked.length + ' local image' + (checked.length === 1 ? '' : 's') + ' added to this session.';
    toast(checked.length + ' local frame' + (checked.length === 1 ? '' : 's') + ' added');
  } else if (skipped) {
    uploadStatus.textContent = skipped + ' file' + (skipped === 1 ? '' : 's') + ' skipped. Choose a supported, readable image file.';
    toast(skipped + ' unsupported or unreadable file' + (skipped === 1 ? '' : 's'));
  }
}

$('#btnChooseFiles').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  fileInput.value = '';
  importLocalFiles(files);
});

function carriesFiles(event) {
  return !!(event.dataTransfer && Array.from(event.dataTransfer.types || [])
    .some(type => String(type).toLowerCase() === 'files'));
}

function clearFileDropState() {
  body.classList.remove('is-file-dragging');
  fileDropZone.classList.remove('is-drop-active');
}

document.addEventListener('dragenter', event => {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  body.classList.add('is-file-dragging');
  if (fileDropZone.contains(event.target)) fileDropZone.classList.add('is-drop-active');
});
document.addEventListener('dragover', event => {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  body.classList.add('is-file-dragging');
  fileDropZone.classList.toggle('is-drop-active', fileDropZone.contains(event.target));
});
document.addEventListener('dragleave', event => {
  if (!carriesFiles(event)) return;
  if (!event.relatedTarget) clearFileDropState();
  else if (fileDropZone.contains(event.target) && !fileDropZone.contains(event.relatedTarget)) {
    fileDropZone.classList.remove('is-drop-active');
  }
});
document.addEventListener('drop', event => {
  if (!carriesFiles(event)) return;
  event.preventDefault();
  const files = event.dataTransfer.files;
  clearFileDropState();
  importLocalFiles(files);
});
window.addEventListener('dragend', clearFileDropState);

/* — live preview with debounce ——————————————————————————————— */
const fUrl = $('#fUrl'), fTitle = $('#fTitle'), fDesc = $('#fDesc');

fUrl.addEventListener('input', () => {
  clearTimeout(previewTimer);
  const v = fUrl.value.trim();
  const seq = ++previewSeq;
  if (!v) { preview.dataset.state = 'empty'; previewTxt.textContent = 'no signal'; return; }
  preview.dataset.state = 'loading';
  previewTimer = setTimeout(() => {
    const probe = new Image();
    probe.onload = () => {
      if (seq !== previewSeq) return;
      preview.dataset.state = 'ok';
      previewImg.src = v;
    };
    probe.onerror = () => {
      if (seq !== previewSeq) return;
      preview.dataset.state = 'bad';
      previewTxt.textContent = 'cannot load';
    };
    probe.src = v;
  }, 340);
});

/* — submit ———————————————————————————————————————————————— */
function fieldError(input, errEl, msg) {
  const field = input.closest('.field');
  field.classList.toggle('is-bad', !!msg);
  errEl.textContent = msg || '';
  return !msg;
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const url = fUrl.value.trim();
  const title = fTitle.value.trim();

  let ok = fieldError(fUrl, $('#errUrl'),
    !url ? 'a source is required'
         : !/^https?:\/\/.+\..+/.test(url) ? 'must be an http(s) address' : '');
  ok = fieldError(fTitle, $('#errTitle'), !title ? 'a title is required' : '') && ok;
  if (!ok) return;

  addPhoto({ url, title, desc: fDesc.value.trim(), theme: panelTheme });

  // Reset the form for the next injection.
  form.reset();
  preview.dataset.state = 'empty';
  previewImg.removeAttribute('src');
  previewTxt.textContent = 'no signal';
  $$('.field', form).forEach(f => f.classList.remove('is-bad'));
  closePanel();
  toast('frame injected · ' + title);
});

/* ══ 13 · MISC UI ══════════════════════════════════════════════════════ */

let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
}

const OPENING_COUNT = 6;

function localImageList() {
  const list = window.__LOCAL_IMAGES__;
  return Array.isArray(list) ? list.filter(name => typeof name === 'string' && name.trim()) : [];
}

/** Create a fresh photo state for the local-first opening reel and Reset. */
function openingPhotos() {
  const local = localImageList();
  if (local.length) {
    const themes = Object.keys(THEMES);
    return local.slice(0, OPENING_COUNT).map((filename, i) => {
      const { title, meta } = titleFromFilename(filename);
      return {
        id: uid(),
        url: 'images/' + filename,
        fb: '',
        title,
        desc: meta,
        theme: themes[i % themes.length],
      };
    });
  }
  return DEFAULTS.map(d => ({ id: uid(), url: d.url, fb: d.fb, title: d.title, desc: d.desc, theme: d.theme }));
}

/** Normalize URLs for local-manifest duplicate checks. */
function localImageKey(url) {
  const path = String(url || '').replace(/\\/g, '/').replace(/^\.?\//, '');
  const match = path.match(/^images\/([^?#]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

/* — reset to the opening reel ——————————————————————————————— */
$('#btnReset').addEventListener('click', () => {
  uploadEpoch += 1;
  uploadStatus.textContent = '';
  closeInspector(true);
  ring.innerHTML = '';
  inspImg.removeAttribute('src');
  state.uploadUrls.forEach(url => URL.revokeObjectURL(url));
  state.uploadUrls.clear();
  state.cards.length = 0;
  state.photos = openingPhotos();
  state.cards = state.photos.map((p, i) => buildCard(p, i));
  state.cards.forEach(c => { c.vary = hash01(c.photo.id); c.vary2 = hash01(c.photo.id + '~'); });
  state.pos = state.target = 0; state.vel = 0; state.active = -1;
  measure(); buildRail();
  emptyEl.hidden = true;
  panelCount.textContent = state.photos.length + ' frames in archive';
  syncChrome(0);
  toast('reel restored');
});

/* — import the local ./images archive —————————————————————————————
   Filenames carry their own metadata (WhatsApp date stamps), so each file
   becomes a titled frame rather than "image1".                            */
function titleFromFilename(name) {
  const base = name.replace(/\.[^.]+$/, '');
  let year, month, day;
  if (/^\d{13}$/.test(base)) {
    const stamp = new Date(Number(base));
    if (!Number.isNaN(stamp.getTime())) {
      year = stamp.getUTCFullYear();
      month = stamp.getUTCMonth() + 1;
      day = stamp.getUTCDate();
    }
  } else {
    const d = base.match(/(?:^|[^0-9])(20\d{2})(\d{2})(\d{2})(?=[^0-9]|$)/);
    if (d) { year = Number(d[1]); month = Number(d[2]); day = Number(d[3]); }
  }
  const validDate = year && month >= 1 && month <= 12 &&
    day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!validDate) {
    return {
      title: base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled frame',
      meta: 'local archive ./images',
    };
  }
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const title = pad2(day) + ' ' + months[month - 1] + ' ' + year;
  const t = base.match(/(?:^|[_-])(\d{2})(\d{2})(\d{2})(?:[_-]\d+)?$/);
  const meta = t ? 'Local archive ./images · ' + t[1] + ':' + t[2] : 'Local archive ./images';
  return { title, meta };
}

$('#btnImport').addEventListener('click', () => {
  const list = localImageList();
  if (!list || !list.length) { toast('no local manifest found'); return; }
  const present = new Set(state.photos.map(photo => localImageKey(photo.url)).filter(Boolean));
  const remaining = list.filter(filename => !present.has(localImageKey('images/' + filename)));
  if (!remaining.length) { toast('all local frames already in archive'); return; }
  if (state.open) closeInspector(true);

  const themes = Object.keys(THEMES);
  remaining.forEach((f, i) => {
    const { title, meta } = titleFromFilename(f);
    addPhoto({
      url: 'images/' + f,
      title,
      desc: meta,
      theme: themes[i % themes.length],
    }, { animate: i === 0 });   // one entrance, the rest materialise in place
  });
  toast(remaining.length + ' remaining frame' + (remaining.length === 1 ? '' : 's') + ' imported from ./images');
});

/* ══ 14 · BOOT ═════════════════════════════════════════════════════════ */

function mount() {
  state.photos = openingPhotos();
  state.cards  = state.photos.map((p, i) => buildCard(p, i));
  // Deterministic per-card variation for the helix (computed once, never animated).
  state.cards.forEach(c => { c.vary = hash01(c.photo.id); c.vary2 = hash01(c.photo.id + '~'); });

  buildSwatches();
  measure();
  buildRail();
  panelCount.textContent = state.photos.length + ' frames in archive';

  // Opening reveal: cards fly out of the dark on a stagger.
  state.cards.forEach((c, i) => {
    setTimeout(() => {
      c.el.classList.add('is-entering');
      c.el.addEventListener('animationend', () => c.el.classList.remove('is-entering'), { once: true });
    }, 420 + i * 95);
  });

  syncChrome(0);
  requestAnimationFrame(frame);

  setTimeout(() => {
    body.classList.remove('is-booting');
    document.querySelector('#btnAdd').focus({ preventScroll: true });
  }, 1250);
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(measure, 120);
});

// Keep the spotlight alive when the pointer leaves the window entirely.
window.addEventListener('pointerout', e => {
  if (!e.relatedTarget) { state.pointer.tx = 0.5; state.pointer.ty = 0.46; }
});

mount();

})();