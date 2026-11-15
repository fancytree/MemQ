// A single gentle reveal as each section enters; content remains visible without JS.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !reduceMotion.matches) {
  const items = document.querySelectorAll('.intro-copy, .product-copy, .product-scene, .feature-lead, .feature-card, .steps-head, .step-grid article, .closing-grid > div');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });
  items.forEach((item) => { item.classList.add('reveal'); observer.observe(item); });
}

// A lipped button presses flat on :active, and iOS only reports :active to a page
// that listens for touches at all.
document.addEventListener('touchstart', () => {}, { passive: true });

// Parallax, for the parts of the page that are layers rather than content. Each
// names how far it drifts per pixel scrolled (`data-parallax`); positive hangs
// back, negative runs ahead. What is on screen when the page opens drifts from
// where it was laid out; everything further down passes through where it was laid
// out as its section crosses the middle of the window, so nothing is ever out of
// place when it is the thing being looked at.
function startParallax() {
  const layers = Array.from(document.querySelectorAll('[data-parallax]'), (el) => ({
    el, speed: Number(el.dataset.parallax), host: el.closest('section') || el, top: 0, height: 0, opening: false,
  }));
  if (!layers.length || reduceMotion.matches) return () => {};
  // On a phone the layers are packed close together and the page is one column, so
  // they are given less room to drift into each other.
  let scale = 1;
  const measure = () => {
    scale = window.innerWidth < 760 ? 0.4 : 1;
    for (const layer of layers) {
      const box = layer.host.getBoundingClientRect();
      layer.top = box.top + window.scrollY;
      layer.height = box.height;
      layer.opening = layer.top < window.innerHeight * 0.5;
    }
  };
  let queued = 0;
  const place = () => {
    queued = 0;
    const y = window.scrollY, h = window.innerHeight;
    for (const layer of layers) {
      // Nothing to move for a section nowhere near the window.
      if (layer.top > y + h * 1.5 || layer.top + layer.height < y - h * 0.5) continue;
      // Held to one window's worth either way, so a tall section cannot carry a
      // layer out of its own frame before it has even arrived.
      const travelled = layer.opening ? y : Math.max(-h, Math.min(h, y + h / 2 - (layer.top + layer.height / 2)));
      layer.el.style.translate = `0 ${(travelled * layer.speed * scale).toFixed(1)}px`;
    }
  };
  const onScroll = () => { if (!queued) queued = window.requestAnimationFrame(place); };
  const onResize = () => { measure(); onScroll(); };
  measure(); place();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  return () => {
    window.cancelAnimationFrame(queued);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    for (const layer of layers) layer.el.style.translate = '';
  };
}
let stopParallax = startParallax();

// The character is the app's own rig: mascot-rig.js is the solver the app runs,
// compiled for a browser, and the drawing in the page is what it drives (both are
// written by scripts/build-website-mascot.cjs — see the README). Every frame the
// solver says where each part is and this hands those numbers to the element that
// asked for them. Nothing about how the character moves is decided here.
const mascotArt = document.querySelector('.mascot-art[data-mascot]');
function startMascot() {
  const rig = window.MemQMascot;
  if (!mascotArt || !rig) return () => {};
  const mood = mascotArt.dataset.mascot;
  // The marks the page has asked this character to wear, on top of its mood.
  const tweak = new Array(rig.CHANNEL_COUNT).fill(0);
  for (const mark of (mascotArt.dataset.marks || '').split(' ').filter(Boolean)) tweak[rig.CH[mark]] = 1;

  // How this page has the character standing — on what, and with which corrections
  // — and where it looks when nothing is leading its eyes. Both are the build's.
  const pose = JSON.parse(mascotArt.dataset.pose || '{}');
  const [restX = 0, restY = 0] = (mascotArt.dataset.look || '').split(' ').filter(Boolean).map(Number);

  // Each element names the number it listens to.
  const pick = (attr) => Array.from(mascotArt.querySelectorAll(`[data-${attr}]`), (el) => [el, el.dataset[attr]]);
  const placed = pick('m'), faded = pick('o'), drawn = pick('d'), wide = pick('rx'), tall = pick('ry');
  const short = (n) => Math.round(n * 1000) / 1000;
  const paint = (frame) => {
    for (const [el, key] of placed) el.setAttribute('transform', `matrix(${frame[key].map(short).join(' ')})`);
    for (const [el, key] of faded) el.setAttribute('opacity', short(frame[key]));
    for (const [el, key] of drawn) el.setAttribute('d', frame[key]);
    for (const [el, key] of wide) el.setAttribute('rx', short(frame[key]));
    for (const [el, key] of tall) el.setAttribute('ry', short(frame[key]));
  };

  // The app aims the gaze at a wandering point; on a page there is something better
  // to look at, so the eyes follow the pointer. With no pointer, or once it has sat
  // still for a while, the gaze goes back to wandering about its resting place.
  const REACH = 420;                 // how far away the pointer pulls the gaze all the way over
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const look = { x: restX, y: restY, following: false };
  let idle = 0;
  const rest = () => { look.x = restX; look.y = restY; look.following = false; };
  const follow = (event) => {
    const art = mascotArt.getBoundingClientRect();
    // the eyes sit a little above the body's middle, so aim from there
    const from = {
      x: art.left + art.width * rig.RIG_ORIGIN.x / rig.RIG_VIEW,
      y: art.top + art.height * (rig.RIG_ORIGIN.y - 8) / rig.RIG_VIEW,
    };
    look.x = clamp((event.clientX - from.x) / REACH);
    look.y = clamp((event.clientY - from.y) / REACH);
    look.following = true;
    window.clearTimeout(idle);
    // a pointer that has stopped moving is not worth staring at
    idle = window.setTimeout(rest, 2600);
  };
  const state = rig.createRigState(mood);
  const solve = (elapsed, still) => rig.solveRig(state, {
    mood, still, linked: true, drift: true, tweak, dragX: 0, dragY: 0,
    lookX: look.x, lookY: look.y, wander: look.following ? 0 : 1,
    blink: 0, wink: 0, beat: 0, poke: 0, pokePart: -1, debug: false, ...pose,
  }, elapsed);

  // With motion reduced the character is drawn once, at rest, and left alone.
  if (reduceMotion.matches) {
    paint(solve(0, true));
    return () => {};
  }

  window.addEventListener('pointermove', follow, { passive: true });
  document.documentElement.addEventListener('pointerleave', rest);

  // It only runs while it can be seen: off screen, or in a tab nobody is looking
  // at, there is nothing to draw for.
  let frame = 0, last = 0, inViewport = true;
  const tick = (now) => {
    frame = 0;
    if (!inViewport || document.hidden) return;
    const elapsed = last ? (now - last) / 1000 : 0;
    last = now;
    paint(solve(elapsed, false));
    frame = window.requestAnimationFrame(tick);
  };
  const updateVisibility = () => {
    if (!inViewport || document.hidden) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame) {
      last = 0;
      frame = window.requestAnimationFrame(tick);
    }
  };
  const watcher = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
    inViewport = entry.isIntersecting;
    updateVisibility();
  }) : null;
  if (watcher) watcher.observe(mascotArt);
  document.addEventListener('visibilitychange', updateVisibility);
  updateVisibility();

  return () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(idle);
    if (watcher) watcher.disconnect();
    document.removeEventListener('visibilitychange', updateVisibility);
    window.removeEventListener('pointermove', follow);
    document.documentElement.removeEventListener('pointerleave', rest);
  };
}
let stopMascot = startMascot();
reduceMotion.addEventListener('change', () => {
  stopMascot();
  stopMascot = startMascot();
  stopParallax();
  stopParallax = startParallax();
});
