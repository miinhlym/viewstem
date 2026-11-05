// Motion enhances visible state changes; it never schedules the state change itself.
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
const active = new Map<Element, Animation>();

export function playMotion(element: Element, frames: Keyframe[], options: KeyframeAnimationOptions = {}) {
  active.get(element)?.cancel();
  if (preference.matches || document.hidden || typeof element.animate !== 'function') return;
  const rect = element.getBoundingClientRect();
  if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.width === 0 || rect.height === 0) return;

  const animation = element.animate(frames, {
    duration: 240,
    easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    ...options,
  });
  active.set(element, animation);
  const release = () => { if (active.get(element) === animation) active.delete(element); };
  animation.onfinish = release;
  animation.oncancel = release;
}

export function emphasize(element: Element, delay = 0) {
  active.get(element)?.cancel();
  const style = getComputedStyle(element);
  playMotion(element, [
    { color: style.getPropertyValue('--viewstem-primary').trim(), offset: 0 },
    { color: style.getPropertyValue('--viewstem-primary').trim(), offset: 0.35 },
    { color: style.color },
  ], { duration: 420, delay });
}

const cancelAll = () => {
  for (const animation of active.values()) animation.cancel();
  active.clear();
};
preference.addEventListener('change', () => { if (preference.matches) cancelAll(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll(); });

// Content remains visible without JS, before observation, and with reduced motion.
// Only the home introduction and two demonstration panels opt into one-time entry.
const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer?.unobserve(entry.target);
    // Jump links and keyboard focus should expose their destination immediately.
    if (location.hash || entry.target.contains(document.activeElement)) continue;
    playMotion(entry.target, [{ opacity: 0.65, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 360 });
  }
}, { threshold: 0.12 });
document.querySelectorAll('[data-motion-enter]').forEach(element => observer?.observe(element));
window.addEventListener('pagehide', () => { cancelAll(); observer?.disconnect(); });
