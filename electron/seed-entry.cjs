'use strict';

// Point tsx's CJS hook at the node tsconfig so the `@core/*` and `@shared/*`
// path aliases in seed.ts resolve at require time. tsx reads this env var when
// the `tsx/cjs` hook is loaded.
process.env.TSX_TSCONFIG_PATH = require('node:path').join(__dirname, '..', 'tsconfig.node.json');

require('tsx/cjs');
require('./db/seed.ts');
