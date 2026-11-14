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

// The character changes expression, the way it does in the app: it holds a face for
// 2600-5200ms and then swaps (components/mascot/state.ts, `happy.frameHold`). There
// the swap is hidden inside a blink; here the two drawings *are* the blink, because
// the happy face's eyes are already closed — so the swap itself is the eyes opening.
// It is a cut, not a crossfade: fading one face into the other morphs it, which is
// the thing the app's blink exists to avoid.
//
// The second face is `hidden` in the markup and only brought in once the rule that
// stacks it is actually here. A stale stylesheet against new markup would otherwise
// lay the two drawings out one above the other down the whole hero, which is exactly
// what a cached site.css did — better to show one face and no swap than that.
const mascot = document.querySelector('.mascot');
const openFace = mascot && mascot.querySelector('.mascot-face-open');
if (openFace && !reduceMotion.matches && getComputedStyle(openFace).position === 'absolute') {
  openFace.hidden = false;
  const hold = () => 2600 + Math.random() * 2600;
  const swap = () => { mascot.classList.toggle('is-open'); window.setTimeout(swap, hold()); };
  window.setTimeout(swap, hold());
}
