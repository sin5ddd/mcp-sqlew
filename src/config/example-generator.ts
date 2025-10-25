/**
 * Config Template Initializer
 * Copies config.toml.example to .sqlew/ on first launch
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get path to the template file in assets/
 */
function getTemplatePath(): string {
  // Template is in assets/config.example.toml (relative to project root)
  const projectRoot = path.resolve(__dirname, '..', '..');
  return path.join(projectRoot, 'assets', 'config.example.toml');
}

/**
 * Ensure .sqlew directory exists and copy config.example.toml if needed
 * @param projectRoot - Project root directory
 * @returns true if this was the first launch (directory was created)
 */
export function ensureSqlewDirectory(projectRoot: string = process.cwd()): boolean {
  const sqlewDir = path.join(projectRoot, '.sqlew');
  const configExamplePath = path.join(sqlewDir, 'config.example.toml');

  let isFirstLaunch = false;

  // Check if .sqlew directory exists
  if (!fs.existsSync(sqlewDir)) {
    // First launch - create directory
    fs.mkdirSync(sqlewDir, { recursive: true });
    isFirstLaunch = true;
    console.error('✓ Created .sqlew directory (first launch)');
  }

  // Copy config.example.toml if it doesn't exist
  if (!fs.existsSync(configExamplePath)) {
    const templatePath = getTemplatePath();

    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, configExamplePath);
      console.error('✓ Copied config.example.toml to .sqlew/');
    } else {
      console.error('⚠ Warning: Template file not found at', templatePath);
    }
  }

  return isFirstLaunch;
}
