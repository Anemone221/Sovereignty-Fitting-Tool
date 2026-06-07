import type { EveSovApi } from '@shared/index';

export class BackendUnavailableError extends Error {
  constructor(channel?: string) {
    super(
      channel
        ? `Web backend not yet implemented — refused call to "${channel}".`
        : 'Web backend not yet implemented.',
    );
    this.name = 'BackendUnavailableError';
  }
}

/**
 * Stub backend used when no host has injected `window.evesov` (e.g. the standalone
 * web build that ships before a real web backend exists).
 *
 * Every method rejects with a BackendUnavailableError so failures are loud and
 * typed. `events.on` returns a no-op unsubscribe so renderer code that subscribes
 * at startup does not crash. Nothing here fakes data — the shell renders empty.
 */
export function makeStubBackend(): EveSovApi {
  const unavailable = (channel: string) => () => {
    throw new BackendUnavailableError(channel);
  };

  // Build a proxy that returns a namespaced stub for each top-level property.
  // For namespace objects (prefs, data, plans, etc.) every method on the
  // namespace throws when invoked. `events.on` is special-cased to a no-op so
  // the renderer can register listeners without blowing up.
  const stub = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      const ns = String(prop);
      if (ns === 'ping') return () => Promise.reject(new BackendUnavailableError('ping'));
      if (ns === 'events') {
        return {
          on: (_channel: string, _listener: (...args: unknown[]) => void) => () => {
            /* no-op unsubscribe */
          },
        };
      }
      // Any other namespace access returns a proxy whose methods all throw.
      return new Proxy({} as Record<string, unknown>, {
        get(_innerTarget, method) {
          return unavailable(`${ns}.${String(method)}`);
        },
      });
    },
  });

  return stub as unknown as EveSovApi;
}
