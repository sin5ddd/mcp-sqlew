/**
 * Plugin Loader
 *
 * Loads and manages backend plugins from .sqlew/plugins/ directory.
 * Plugins are distributed via `sqlew --install-saas` command.
 *
 * ESM-compatible: Uses dynamic import() instead of require()
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import type { ToolBackend, PluginModule } from './types.js';

/**
 * Plugin search paths (in priority order)
 */
const PLUGIN_SEARCH_PATHS = [
  // Project-local plugins (installed via --install-saas)
  '.sqlew/plugins',
  // npm packages (for enterprise users)
  'node_modules/@sqlew',
];

/**
 * Known plugin names
 */
export const KNOWN_PLUGINS = {
  SAAS_CONNECTOR: 'saas-connector',
} as const;

/**
 * Plugin load result
 */
export interface PluginLoadResult {
  success: boolean;
  backend?: ToolBackend;
  error?: string;
  pluginPath?: string;
  version?: string;
}

/**
 * Load a plugin by name
 *
 * @param pluginName - Plugin name (e.g., 'saas-connector')
 * @param projectRoot - Project root directory
 * @param config - Plugin configuration
 * @returns Plugin load result
 */
export async function loadPlugin(
  pluginName: string,
  projectRoot: string,
  config: unknown
): Promise<PluginLoadResult> {
  // Search for plugin in known paths
  for (const searchPath of PLUGIN_SEARCH_PATHS) {
    const pluginPath = path.join(projectRoot, searchPath, pluginName);

    if (fs.existsSync(pluginPath)) {
      try {
        return await loadPluginFromPath(pluginPath, config);
      } catch (error) {
        return {
          success: false,
          error: `Failed to load plugin from ${pluginPath}: ${error instanceof Error ? error.message : String(error)}`,
          pluginPath,
        };
      }
    }
  }

  // Also try as npm package
  try {
    const npmPath = `@sqlew/${pluginName}`;
    // Dynamic import for ESM compatibility
    const pluginModule = await importPluginModule(npmPath);
    const backend = pluginModule.createBackend(config);
    return {
      success: true,
      backend,
      version: pluginModule.version,
      pluginPath: npmPath,
    };
  } catch {
    // npm package not found, continue
  }

  return {
    success: false,
    error: `Plugin '${pluginName}' not found. Run: sqlew --install-saas`,
  };
}

/**
 * Load plugin from a specific path
 */
async function loadPluginFromPath(pluginPath: string, config: unknown): Promise<PluginLoadResult> {
  const indexPath = path.join(pluginPath, 'index.js');

  if (!fs.existsSync(indexPath)) {
    return {
      success: false,
      error: `Plugin index.js not found at ${pluginPath}`,
      pluginPath,
    };
  }

  // Dynamic import for ESM compatibility (use file:// URL for absolute paths)
  const pluginModule = await importPluginModule(pathToFileURL(indexPath).href);

  // Validate plugin module
  if (typeof pluginModule.createBackend !== 'function') {
    return {
      success: false,
      error: `Plugin does not export createBackend function`,
      pluginPath,
    };
  }

  const backend = pluginModule.createBackend(config);
  return {
    success: true,
    backend,
    version: pluginModule.version,
    pluginPath,
  };
}

/**
 * Import a plugin module with CommonJS interop
 * CommonJS modules are available as .default when imported via ESM
 */
async function importPluginModule(modulePath: string): Promise<PluginModule> {
  const imported = await import(modulePath);
  // Handle CommonJS interop: CommonJS exports are in .default
  return (imported.default ?? imported) as PluginModule;
}

/**
 * Check if a plugin is installed
 *
 * @param pluginName - Plugin name
 * @param projectRoot - Project root directory
 * @returns true if plugin is installed
 */
export function isPluginInstalled(pluginName: string, projectRoot: string): boolean {
  for (const searchPath of PLUGIN_SEARCH_PATHS) {
    const pluginPath = path.join(projectRoot, searchPath, pluginName);
    const indexPath = path.join(pluginPath, 'index.js');
    if (fs.existsSync(indexPath)) {
      return true;
    }
  }

  // Check npm package using createRequire (ESM-compatible way to use require.resolve)
  try {
    const require = createRequire(import.meta.url);
    require.resolve(`@sqlew/${pluginName}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get plugin info without loading
 *
 * @param pluginName - Plugin name
 * @param projectRoot - Project root directory
 * @returns Plugin info or null if not found
 */
export function getPluginInfo(
  pluginName: string,
  projectRoot: string
): { path: string; version?: string } | null {
  for (const searchPath of PLUGIN_SEARCH_PATHS) {
    const pluginPath = path.join(projectRoot, searchPath, pluginName);
    const packageJsonPath = path.join(pluginPath, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return {
          path: pluginPath,
          version: packageJson.version,
        };
      } catch {
        return { path: pluginPath };
      }
    }
  }

  return null;
}

/**
 * List all installed plugins
 *
 * @param projectRoot - Project root directory
 * @returns Array of installed plugin names
 */
export function listInstalledPlugins(projectRoot: string): string[] {
  const plugins: string[] = [];

  for (const searchPath of PLUGIN_SEARCH_PATHS) {
    const fullPath = path.join(projectRoot, searchPath);
    if (fs.existsSync(fullPath)) {
      try {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const indexPath = path.join(fullPath, entry.name, 'index.js');
            if (fs.existsSync(indexPath)) {
              plugins.push(entry.name);
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return [...new Set(plugins)]; // Remove duplicates
}
