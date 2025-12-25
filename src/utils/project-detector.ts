/**
 * Project name detection utility
 *
 * Extracts project detection logic from index.ts for reuse in:
 * - Migrations (sync version)
 * - Index.ts (async version with VCS support)
 * - Tests
 *
 * Detection Priority:
 * 1. config.toml [project] name (authoritative)
 * 2. Git remote URL (best-effort)
 * 3. Directory name (fallback)
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, sep } from 'path';
import { parse as parseTOML } from 'smol-toml';
import type { SqlewConfig } from '../config/types.js';
import { DEFAULT_CONFIG_PATH } from '../config/loader.js';
import { detectVCS } from './vcs-adapter.js';

/**
 * Detection result with source attribution
 */
export interface DetectedProject {
  name: string;
  source: 'config' | 'git' | 'directory';
}

/**
 * Detect project name (async version with VCS support)
 *
 * Use this in index.ts and other runtime code where async operations are available.
 *
 * @param projectRoot - Project root directory
 * @param configPath - Optional path to config.toml (defaults to .sqlew/config.toml)
 * @returns Project name and detection source
 */
export async function detectProjectName(
  projectRoot: string,
  configPath?: string
): Promise<DetectedProject> {
  // Priority 1: Check config.toml
  const fromConfig = detectFromConfig(projectRoot, configPath);
  if (fromConfig) {
    return fromConfig;
  }

  // Priority 2: Try VCS detection (async)
  const fromVCS = await detectFromVCS(projectRoot);
  if (fromVCS) {
    return fromVCS;
  }

  // Priority 3: Fallback to directory name
  return detectFromDirectory(projectRoot);
}

/**
 * Detect project name (sync version without VCS support)
 *
 * Use this in migrations where async operations are not available.
 * Detection order: config → directory (skips VCS)
 *
 * @param projectRoot - Project root directory
 * @param configPath - Optional path to config.toml (defaults to .sqlew/config.toml)
 * @returns Project name and detection source
 */
export function detectProjectNameSync(
  projectRoot: string,
  configPath?: string
): DetectedProject {
  // Priority 1: Check config.toml
  const fromConfig = detectFromConfig(projectRoot, configPath);
  if (fromConfig) {
    return fromConfig;
  }

  // Priority 2: Fallback to directory name (skip VCS in sync mode)
  return detectFromDirectory(projectRoot);
}

/**
 * Try to detect project name from config.toml
 *
 * @param projectRoot - Project root directory
 * @param configPath - Optional path to config.toml
 * @returns Project name or null if not found
 */
function detectFromConfig(
  projectRoot: string,
  configPath?: string
): DetectedProject | null {
  const finalPath = configPath || DEFAULT_CONFIG_PATH;
  const absolutePath = resolve(projectRoot, finalPath);

  if (!existsSync(absolutePath)) {
    return null;
  }

  try {
    const content = readFileSync(absolutePath, 'utf-8');
    const parsed = parseTOML(content) as SqlewConfig;

    if (parsed.project?.name && parsed.project.name.trim().length > 0) {
      return {
        name: parsed.project.name,
        source: 'config',
      };
    }
  } catch {
    // Parse error - skip config source
  }

  return null;
}

/**
 * Try to detect project name from VCS (async)
 *
 * @param projectRoot - Project root directory
 * @returns Project name or null if not found
 */
async function detectFromVCS(projectRoot: string): Promise<DetectedProject | null> {
  try {
    const vcsAdapter = await detectVCS(projectRoot);

    if (vcsAdapter) {
      const detectedName = await vcsAdapter.extractProjectName();

      if (detectedName) {
        return {
          name: detectedName,
          source: 'git',
        };
      }
    }
  } catch {
    // VCS detection failed - continue to fallback
  }

  return null;
}

/**
 * Detect project name from directory name (fallback)
 *
 * Skips hidden directories (starting with '.') like .sqlew, .git, etc.
 * This handles cases where --db-path points to ~/.sqlew/sqlew.db
 * and we want to use the parent directory name (e.g., 'kitayama').
 *
 * @param projectRoot - Project root directory
 * @returns Project name from directory
 */
function detectFromDirectory(projectRoot: string): DetectedProject {
  // Handle both Unix (/) and Windows (\) path separators
  // Normalize: replace backslashes with forward slashes for consistent cross-platform parsing
  const normalizedPath = projectRoot.replace(/\\/g, '/');
  const dirSegments = normalizedPath.split('/').filter(s => s.length > 0);

  // Find the first non-hidden directory name from the end
  // Skip directories starting with '.' (e.g., .sqlew, .git)
  for (let i = dirSegments.length - 1; i >= 0; i--) {
    const segment = dirSegments[i];
    if (segment && !segment.startsWith('.')) {
      return {
        name: segment,
        source: 'directory',
      };
    }
  }

  // Fallback to 'default' if all segments are hidden
  return {
    name: 'default',
    source: 'directory',
  };
}
