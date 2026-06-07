import type { EveSovApi } from '@shared/index';
import { makeElectronBackend } from './electronBackend';
import { makeStubBackend } from './stubBackend';

/**
 * A Backend is anything that implements the EveSovApi contract — the same surface
 * the preload exposes on `window.evesov`. The contract is the abstraction; we do
 * not wrap it in a DI container or async layer.
 */
export type Backend = EveSovApi;

/**
 * Pick a backend based on what the host injected. Inside the Electron wrapper,
 * `window.evesov` is set by the preload and we use it directly. In the standalone
 * web build there is no preload yet, so we hand back a stub that throws a clearly
 * typed error from every method — the shell still renders, and the failure is
 * visible in the console rather than crashing the bundle.
 */
export function selectBackend(): Backend {
  if (typeof window !== 'undefined' && (window as { evesov?: EveSovApi }).evesov) {
    return makeElectronBackend();
  }
  return makeStubBackend();
}
