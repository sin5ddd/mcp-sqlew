/**
 * Install SaaS Connector Plugin
 *
 * Downloads and installs the saas-connector plugin from api.sqlew.io.
 * Requires a valid SQLEW_API_KEY.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { CLOUD_ENV_VARS } from '../config/types.js';
import { loadCloudConfig } from '../backend/backend-factory.js';
import { KNOWN_PLUGINS, getPluginInfo } from '../backend/plugin-loader.js';

/**
 * Download endpoint (hardcoded for security - no endpoint info in config)
 */
const DOWNLOAD_ENDPOINT = 'https://api.sqlew.io/v1/connector/download';

/**
 * Install the SaaS connector plugin
 */
export async function installSaasCommand(args: string[]): Promise<void> {
  const projectRoot = process.cwd();

  console.log('[install-saas] Installing SaaS connector plugin...');
  console.log('');

  // Check for existing installation
  const existingPlugin = getPluginInfo(KNOWN_PLUGINS.SAAS_CONNECTOR, projectRoot);
  if (existingPlugin) {
    console.log(`[install-saas] Existing installation found at: ${existingPlugin.path}`);
    if (existingPlugin.version) {
      console.log(`[install-saas] Current version: ${existingPlugin.version}`);
    }

    // Check for --force flag
    if (!args.includes('--force')) {
      console.log('');
      console.log('[install-saas] Use --force to reinstall.');
      return;
    }
    console.log('[install-saas] --force specified, reinstalling...');
    console.log('');
  }

  // Load cloud config to get API key
  const cloudConfig = loadCloudConfig(projectRoot);
  if (!cloudConfig?.apiKey) {
    console.error(`[install-saas] Error: ${CLOUD_ENV_VARS.API_KEY} not found.`);
    console.error('');
    console.error('Please set your API key in .sqlew/.env:');
    console.error(`  ${CLOUD_ENV_VARS.API_KEY}=your-api-key`);
    console.error('');
    console.error('Or set it as an environment variable:');
    console.error(`  export ${CLOUD_ENV_VARS.API_KEY}=your-api-key`);
    process.exit(1);
  }

  console.log('[install-saas] Downloading plugin...');

  try {
    // Create plugins directory
    const pluginsDir = path.join(projectRoot, '.sqlew', 'plugins');
    const pluginDir = path.join(pluginsDir, KNOWN_PLUGINS.SAAS_CONNECTOR);

    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
    }

    // Download plugin
    const tarballPath = path.join(pluginsDir, 'connector.tgz');
    await downloadPlugin(DOWNLOAD_ENDPOINT, cloudConfig.apiKey, tarballPath);

    console.log('[install-saas] Download complete, extracting...');

    // Extract tarball
    await extractTarball(tarballPath, pluginDir);

    // Cleanup tarball
    fs.unlinkSync(tarballPath);

    // Verify installation
    const indexPath = path.join(pluginDir, 'index.js');
    if (!fs.existsSync(indexPath)) {
      throw new Error('Plugin extraction failed: index.js not found');
    }

    // Read version from package.json if exists
    const packageJsonPath = path.join(pluginDir, 'package.json');
    let version = 'unknown';
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        version = packageJson.version || 'unknown';
      } catch {
        // Ignore parse errors
      }
    }

    console.log('');
    console.log(`[install-saas] ✓ Successfully installed saas-connector v${version}`);
    console.log(`[install-saas] Location: ${pluginDir}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Set database type to "cloud" in .sqlew/config.toml:');
    console.log('     [database]');
    console.log('     type = "cloud"');
    console.log('');
    console.log('  2. Restart your MCP server');
  } catch (error) {
    console.error('');
    console.error(`[install-saas] Error: ${error instanceof Error ? error.message : String(error)}`);

    if (error instanceof Error && error.message.includes('401')) {
      console.error('');
      console.error('Invalid or expired API key. Please check your SQLEW_API_KEY.');
    } else if (error instanceof Error && error.message.includes('403')) {
      console.error('');
      console.error('Access denied. Your subscription may not include SaaS features.');
    }

    process.exit(1);
  }
}

/**
 * Download plugin from endpoint
 */
async function downloadPlugin(endpoint: string, apiKey: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const client = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/gzip',
        'User-Agent': 'sqlew-cli',
      },
    };

    const req = client.request(options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Handle redirect
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          downloadPlugin(redirectUrl, apiKey, outputPath).then(resolve).catch(reject);
          return;
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      const fileStream = fs.createWriteStream(outputPath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlinkSync(outputPath);
        reject(err);
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Extract tarball to directory
 * Simple extraction for .tgz files (gzip + tar)
 */
async function extractTarball(tarballPath: string, outputDir: string): Promise<void> {
  // For simplicity, use node:zlib to decompress and a simple tar parser
  // In production, you might want to use a proper tar library

  // Create output directory
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // Read and decompress
  const compressed = fs.readFileSync(tarballPath);
  const decompressed = zlib.gunzipSync(compressed);

  // Simple tar extraction (512-byte blocks)
  let offset = 0;
  while (offset < decompressed.length) {
    // Read header (512 bytes)
    const header = decompressed.subarray(offset, offset + 512);

    // Check for end of archive (two zero blocks)
    if (header.every(b => b === 0)) {
      break;
    }

    // Parse filename (first 100 bytes, null-terminated)
    let filename = '';
    for (let i = 0; i < 100 && header[i] !== 0; i++) {
      filename += String.fromCharCode(header[i]);
    }

    // Parse file size (124-135, octal)
    const sizeStr = header.subarray(124, 135).toString('ascii').trim();
    const fileSize = parseInt(sizeStr, 8) || 0;

    // Parse file type (156)
    const fileType = String.fromCharCode(header[156]);

    offset += 512; // Move past header

    if (filename && fileSize > 0) {
      // Remove 'package/' prefix if present (npm tarball format)
      const cleanFilename = filename.replace(/^package\//, '');
      const filePath = path.join(outputDir, cleanFilename);

      // Create directory structure
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      // Extract file content
      if (fileType === '0' || fileType === '\0') {
        const content = decompressed.subarray(offset, offset + fileSize);
        fs.writeFileSync(filePath, content);
      }
    }

    // Move to next block (512-byte aligned)
    const blocks = Math.ceil(fileSize / 512);
    offset += blocks * 512;
  }
}

/**
 * Show help for install-saas command
 */
export function showInstallSaasHelp(): void {
  console.log(`
sqlew --install-saas - Install SaaS connector plugin

USAGE:
  sqlew --install-saas [options]

OPTIONS:
  --force    Reinstall even if already installed

DESCRIPTION:
  Downloads and installs the SaaS connector plugin from api.sqlew.io.
  Requires a valid SQLEW_API_KEY to be set.

SETUP:
  1. Create .sqlew/.env file with your API key:
     SQLEW_API_KEY=your-api-key

  2. Run the install command:
     sqlew --install-saas

  3. Set database type in .sqlew/config.toml:
     [database]
     type = "cloud"

  4. Restart your MCP server

EXAMPLES:
  # Install plugin
  sqlew --install-saas

  # Force reinstall
  sqlew --install-saas --force
`);
}
