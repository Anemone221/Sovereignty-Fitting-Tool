export type CoreHandler = (...args: any[]) => unknown | Promise<unknown>;

const registry = new Map<string, CoreHandler>();

export function register(channel: string, handler: CoreHandler): void {
  if (registry.has(channel)) {
    throw new Error(`core: duplicate handler registered for "${channel}"`);
  }
  registry.set(channel, handler);
}

export function listHandlers(): ReadonlyMap<string, CoreHandler> {
  return registry;
}

export function clearHandlers(): void {
  registry.clear();
}
