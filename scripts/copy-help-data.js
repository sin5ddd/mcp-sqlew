/**
 * Copy help-data TOML files to dist directory
 * Used in build process since tsc doesn't copy non-TS files
 */

import { cpSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const src = join(projectRoot, 'src', 'help-data');
const dest = join(projectRoot, 'dist', 'help-data');

cpSync(src, dest, { recursive: true });

console.log('✅ Copied help-data to dist/');
