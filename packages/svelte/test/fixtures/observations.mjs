export const observations = { mounted: [], destroyed: [], events: [], callbacks: new Map(), emitters: new Map() };
export function resetObservations() {
  observations.mounted.length = 0;
  observations.destroyed.length = 0;
  observations.events.length = 0;
  observations.callbacks.clear();
  observations.emitters.clear();
}
