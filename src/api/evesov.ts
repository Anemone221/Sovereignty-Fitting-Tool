import type { Backend } from './backend';
import { selectBackend } from './backend';

export const evesov: Backend = selectBackend();
