import type { EveSovApi } from '@shared/index';

/**
 * Returns the preload-injected EveSovApi as-is. This is a named seam (rather than
 * a direct `window.evesov` reference) so that a future logging / error layer
 * has a home without changing every call site.
 */
export function makeElectronBackend(): EveSovApi {
  return window.evesov;
}
