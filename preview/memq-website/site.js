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
