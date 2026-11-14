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
// needs a timer lives here — where it looks, when it blinks, and which face it wears.
const mascot = document.querySelector('.mascot');
if (mascot && !reduceMotion.matches) {
  // Today's own gaze: it looks left and a little down, and wanders around that.
  // The eye travels one distance and the pupil inside it another — GAZE_EYE and
  // GAZE_PUPIL in MascotCharacter — which is what makes it a look and not a slide.
  const LOOK = { x: -0.667, y: 0.086 };
  const WANDER = { x: 0.5, y: 0.35 };
  const EYE = { x: 7, y: 4 }, PUPIL = { x: 11, y: 10 };
  const between = (a, b) => a + Math.random() * (b - a);
  const clamp = (v) => Math.max(-1, Math.min(1, v));

  const lookAt = () => {
    const x = clamp(LOOK.x + between(-WANDER.x, WANDER.x) * 0.5);
    const y = clamp(LOOK.y + between(-WANDER.y, WANDER.y) * 0.5);
    mascot.style.setProperty('--eye-x', (x * EYE.x).toFixed(2) + 'px');
    mascot.style.setProperty('--eye-y', (y * EYE.y).toFixed(2) + 'px');
    mascot.style.setProperty('--pupil-x', (x * PUPIL.x).toFixed(2) + 'px');
    mascot.style.setProperty('--pupil-y', (y * PUPIL.y).toFixed(2) + 'px');
    window.setTimeout(lookAt, between(1800, 4000));   // todayIdle gaze.hold
  };
  window.setTimeout(lookAt, between(1800, 4000));

  // The lid shuts at about 60ms and is back up by 320 — BLINK_KEYS.
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
