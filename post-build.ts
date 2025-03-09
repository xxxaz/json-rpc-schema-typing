#!/usr/bin/env -S node --no-warnings=ExperimentalWarning --loader=ts-node/esm

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

writeFileSync(
    resolve(__dirname, 'cjs', 'package.json'),
    JSON.stringify({ type: 'commonjs' })
);

writeFileSync(
    resolve(__dirname, 'esm', 'package.json'),
    JSON.stringify({ type: 'module' })
);