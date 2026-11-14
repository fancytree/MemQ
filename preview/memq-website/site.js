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

// The character is rigged the way Today's is (components/mascot/state.ts,
// `todayIdle`), rather than animated as one picture: the body leans and breathes on
// two clocks that never line up, the tail keeps its own and arrives late, the horns
// trail the lean, and the sparks are attached to nothing. Those live in CSS. What
// needs a timer or a pointer lives here.
const mascot = document.querySelector('.mascot');
if (mascot && !reduceMotion.matches) {
  // The app aims the gaze at a wandering point; on a page there is something better
  // to look at. The travel is still the app's: the eye moves one distance and the
  // pupil inside it another (GAZE_EYE 7/4, GAZE_PUPIL 11/10 in MascotCharacter),
  // which is the difference between a look and a pair of sliding dots.
  const EYE = { x: 7, y: 4 }, PUPIL = { x: 11, y: 10 };
  // Where it looks when there is no pointer: Today's own MASCOT_LOOK.
  const RESTING = { x: -0.667, y: 0.086 };
  // How far the pointer has to be from it to pull the gaze all the way over.
  const REACH = 420;

  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const aim = (x, y) => {
    mascot.style.setProperty('--eye-x', (x * EYE.x).toFixed(2) + 'px');
    mascot.style.setProperty('--eye-y', (y * EYE.y).toFixed(2) + 'px');
    mascot.style.setProperty('--pupil-x', (x * PUPIL.x).toFixed(2) + 'px');
    mascot.style.setProperty('--pupil-y', (y * PUPIL.y).toFixed(2) + 'px');
  };

  let idle = 0;
  const follow = (event) => {
    const art = mascot.getBoundingClientRect();
    // the eyes sit a little above the middle of the drawing, so aim from there
    const from = { x: art.left + art.width / 2, y: art.top + art.height * 0.49 };
    aim(clamp((event.clientX - from.x) / REACH), clamp((event.clientY - from.y) / REACH));
    window.clearTimeout(idle);
    // a pointer that has stopped moving is not worth staring at
    idle = window.setTimeout(() => aim(RESTING.x, RESTING.y), 2600);
  };
  window.addEventListener('pointermove', follow, { passive: true });
  window.addEventListener('pointerleave', () => aim(RESTING.x, RESTING.y));

  // The lid shuts at about 60ms and is back up by 320 — BLINK_KEYS.
  const between = (a, b) => a + Math.random() * (b - a);
  const blink = () => {
    mascot.classList.add('is-blinking');
    window.setTimeout(() => mascot.classList.remove('is-blinking'), 170);
    window.setTimeout(blink, between(2800, 6200));    // todayIdle blink
  };
  window.setTimeout(blink, between(2800, 6200));

  // Today wears neutral three times for every happy, and swaps behind the blink.
  const faces = ['neutral', 'neutral', 'neutral', 'happy'];
  let at = 0;
  const nextFace = () => {
    mascot.classList.add('is-blinking');
    at = (at + 1) % faces.length;
    window.setTimeout(() => {
      mascot.classList.toggle('is-smiling', faces[at] === 'happy');
    }, 110);                                          // SWAP_AT
    window.setTimeout(() => mascot.classList.remove('is-blinking'), 170);
    window.setTimeout(nextFace, between(4000, 8000)); // todayIdle frameHold
  };
  window.setTimeout(nextFace, between(4000, 8000));
}
