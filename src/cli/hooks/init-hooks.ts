/**
 * Init Hooks Command
 *
 * Initializes Claude Code Hooks configuration for sqlew.
 * Creates/updates .claude/settings.local.json with hook settings.
 * Optionally installs Git hooks (post-merge, post-rewrite).
 *
 * Usage:
 *   sqlew init --hooks              # Initialize all hooks
 *   sqlew init --hooks --no-git     # Skip Git hooks
 *
 * Auto-initialization:
 *   Called automatically on MCP server startup (first time only).
 *   Silent mode - no console output unless errors occur.
 *
 * @since v4.1.0
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync } from 'fs';
import { join } from 'path';
import { determineProjectRoot } from '../../utils/project-root.js';
import { isGitHooksEnabled } from '../../config/global-config.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Required hooks structure for CLAUDE_HOOKS constant
 */
interface RequiredHooks {
  PreToolUse: HookConfig[];
  PostToolUse: HookConfig[];
}

/**
 * Claude Code settings.json structure (partial)
 */
interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookConfig[];
    PostToolUse?: HookConfig[];
  };
  [key: string]: unknown;
}

/**
 * Hook configuration
 */
interface HookConfig {
  matcher: string;
  hooks: HookCommand[];
}

/**
 * Hook command
 */
interface HookCommand {
  type: 'command';
  command: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Claude Code hooks to install */
const CLAUDE_HOOKS: RequiredHooks = {
  PreToolUse: [
    {
      matcher: 'Task',
      hooks: [{ type: 'command', command: 'sqlew suggest' }],
    },
    {
      matcher: 'Write',
      hooks: [{ type: 'command', command: 'sqlew track-plan' }],
    },
  ],
  PostToolUse: [
    {
      matcher: 'Edit|Write',
      hooks: [{ type: 'command', command: 'sqlew save' }],
    },
    {
      matcher: 'TodoWrite',
      hooks: [{ type: 'command', command: 'sqlew check-completion' }],
    },
  ],
};

/** Git post-merge hook content */
const POST_MERGE_HOOK = `#!/bin/bash
# sqlew: Mark plan decisions as implemented after merge
sqlew mark-done --auto
`;

/** Git post-rewrite hook content */
const POST_REWRITE_HOOK = `#!/bin/bash
# sqlew: Mark plan decisions as implemented after rebase
if [ "$1" = "rebase" ]; then
  sqlew mark-done --auto
fi
`;

// ============================================================================
// Settings Management
// ============================================================================

/**
 * Get path to Claude settings file
 *
 * Uses settings.local.json (gitignored) for local development hooks.
 *
 * @param projectPath - Project root path
 * @returns Path to .claude/settings.local.json
 */
function getSettingsPath(projectPath: string): string {
  return join(projectPath, '.claude', 'settings.local.json');
}

/**
 * Load existing Claude settings
 *
 * @param settingsPath - Path to settings file
 * @returns Existing settings or empty object
 */
function loadSettings(settingsPath: string): ClaudeSettings {
  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8');
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * Save Claude settings
 *
 * @param settingsPath - Path to settings file
 * @param settings - Settings to save
 */
function saveSettings(settingsPath: string, settings: ClaudeSettings): void {
  const dir = join(settingsPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = JSON.stringify(settings, null, 2);
  writeFileSync(settingsPath, content, 'utf-8');
}

/**
 * Merge hook configurations
 *
 * Adds new hooks without duplicating existing ones.
 *
 * @param existing - Existing hook configs
 * @param newHooks - New hooks to add
 * @returns Merged hook configs
 */
function mergeHooks(existing: HookConfig[] | undefined, newHooks: HookConfig[]): HookConfig[] {
  const result = [...(existing || [])];

  for (const newHook of newHooks) {
    // Check if a hook with same matcher already exists
    const existingIndex = result.findIndex(h => h.matcher === newHook.matcher);

    if (existingIndex >= 0) {
      // Merge commands
      const existingHook = result[existingIndex];
      for (const cmd of newHook.hooks) {
        const cmdExists = existingHook.hooks.some(
          h => h.type === cmd.type && h.command === cmd.command
        );
        if (!cmdExists) {
          existingHook.hooks.push(cmd);
        }
      }
    } else {
      // Add new hook
      result.push(newHook);
    }
  }

  return result;
}

// ============================================================================
// Git Hooks
// ============================================================================

/**
 * Install Git hooks
 *
 * @param projectPath - Project root path
 * @returns true if hooks were installed
 */
function installGitHooks(projectPath: string): boolean {
  const gitDir = join(projectPath, '.git');

  // Check if .git exists (might be worktree with .git file)
  if (!existsSync(gitDir)) {
    console.log('[sqlew init] No .git directory found - skipping Git hooks');
    return false;
  }

  // Determine hooks directory
  let hooksDir: string;
  const gitPath = join(projectPath, '.git');

  if (existsSync(gitPath)) {
    const stat = statSync(gitPath);
    if (stat.isFile()) {
      // Worktree - read gitdir from .git file
      const content = readFileSync(gitPath, 'utf-8').trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      if (match) {
        hooksDir = join(match[1], 'hooks');
      } else {
        console.log('[sqlew init] Invalid .git file format - skipping Git hooks');
        return false;
      }
    } else {
      // Regular repo
      hooksDir = join(gitPath, 'hooks');
    }
  } else {
    return false;
  }

  // Create hooks directory if needed
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // Install post-merge hook
  const postMergePath = join(hooksDir, 'post-merge');
  installHookFile(postMergePath, POST_MERGE_HOOK, 'post-merge');

  // Install post-rewrite hook
  const postRewritePath = join(hooksDir, 'post-rewrite');
  installHookFile(postRewritePath, POST_REWRITE_HOOK, 'post-rewrite');

  return true;
}

/**
 * Install a single hook file
 *
 * @param hookPath - Path to hook file
 * @param content - Hook content
 * @param name - Hook name for logging
 */
function installHookFile(hookPath: string, content: string, name: string): void {
  if (existsSync(hookPath)) {
    // Check if our hook is already installed
    const existing = readFileSync(hookPath, 'utf-8');
    if (existing.includes('sqlew mark-done')) {
      console.log(`[sqlew init] Git hook ${name} already has sqlew integration`);
      return;
    }

    // Append to existing hook
    const newContent = existing.trim() + '\n\n' + content;
    writeFileSync(hookPath, newContent, 'utf-8');
    console.log(`[sqlew init] Updated Git hook: ${name}`);
  } else {
    // Create new hook
    writeFileSync(hookPath, content, 'utf-8');
    console.log(`[sqlew init] Created Git hook: ${name}`);
  }

  // Make executable (Unix only)
  if (process.platform !== 'win32') {
    try {
      chmodSync(hookPath, 0o755);
    } catch {
      // Ignore chmod errors on Windows
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Parse command line arguments for init --hooks
 *
 * @param args - Command line arguments
 * @returns Parsed options
 */
function parseInitArgs(args: string[]): { noGit: boolean } {
  return {
    noGit: args.includes('--no-git'),
  };
}

/**
 * Main init hooks command entry point
 *
 * @param args - Command line arguments
 */
export async function initHooksCommand(args: string[] = []): Promise<void> {
  try {
    const options = parseInitArgs(args);

    // Determine project root
    const projectPath = determineProjectRoot();
    console.log(`[sqlew init] Project root: ${projectPath}`);

    // Update Claude settings
    const settingsPath = getSettingsPath(projectPath);
    const settings = loadSettings(settingsPath);

    // Merge hooks
    settings.hooks = settings.hooks || {};
    settings.hooks.PreToolUse = mergeHooks(settings.hooks.PreToolUse, CLAUDE_HOOKS.PreToolUse);
    settings.hooks.PostToolUse = mergeHooks(settings.hooks.PostToolUse, CLAUDE_HOOKS.PostToolUse);

    // Save settings
    saveSettings(settingsPath, settings);
    console.log(`[sqlew init] Updated Claude settings: ${settingsPath}`);

    // Install Git hooks if enabled
    if (!options.noGit && isGitHooksEnabled()) {
      const installed = installGitHooks(projectPath);
      if (installed) {
        console.log('[sqlew init] Git hooks installed successfully');
      }
    } else if (options.noGit) {
      console.log('[sqlew init] Skipping Git hooks (--no-git specified)');
    } else {
      console.log('[sqlew init] Git hooks disabled in global config');
    }

    console.log('\n[sqlew init] Hooks initialization complete!');
    console.log('Restart Claude Code for changes to take effect.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sqlew init] Error: ${message}`);
    process.exit(1);
  }
}

// ============================================================================
// Auto-Initialization (Server Startup)
// ============================================================================

/**
 * Check if sqlew hooks are already configured
 *
 * @param projectPath - Project root path
 * @returns true if hooks are already set up
 */
function hasHooksConfigured(projectPath: string): boolean {
  const settingsPath = getSettingsPath(projectPath);

  if (!existsSync(settingsPath)) {
    return false;
  }

  try {
    const settings = loadSettings(settingsPath);

    // Check if sqlew hooks exist
    const hasPreToolUse = settings.hooks?.PreToolUse?.some(
      h => h.hooks?.some(cmd => cmd.command?.startsWith('sqlew '))
    );
    const hasPostToolUse = settings.hooks?.PostToolUse?.some(
      h => h.hooks?.some(cmd => cmd.command?.startsWith('sqlew '))
    );

    return !!(hasPreToolUse || hasPostToolUse);
  } catch {
    return false;
  }
}

/**
 * Auto-initialize hooks on MCP server startup
 *
 * Called from initializeSqlewIntegrations() during server startup.
 * Silent mode - only logs via debugLog, no console output.
 * Only runs if hooks are not already configured.
 *
 * @param projectPath - Project root path
 * @returns true if hooks were initialized, false if already configured or skipped
 */
export function autoInitializeHooks(projectPath: string): boolean {
  // Skip if already configured
  if (hasHooksConfigured(projectPath)) {
    return false;
  }

  try {
    // Update Claude settings
    const settingsPath = getSettingsPath(projectPath);
    const settings = loadSettings(settingsPath);

    // Merge hooks
    settings.hooks = settings.hooks || {};
    settings.hooks.PreToolUse = mergeHooks(settings.hooks.PreToolUse, CLAUDE_HOOKS.PreToolUse);
    settings.hooks.PostToolUse = mergeHooks(settings.hooks.PostToolUse, CLAUDE_HOOKS.PostToolUse);

    // Save settings
    saveSettings(settingsPath, settings);

    // Install Git hooks if enabled (silent mode)
    if (isGitHooksEnabled()) {
      installGitHooksSilent(projectPath);
    }

    return true;
  } catch {
    // Silent failure - don't interrupt server startup
    return false;
  }
}

/**
 * Install Git hooks silently (no console output)
 *
 * @param projectPath - Project root path
 */
function installGitHooksSilent(projectPath: string): void {
  const gitPath = join(projectPath, '.git');

  if (!existsSync(gitPath)) {
    return;
  }

  let hooksDir: string;

  try {
    const stat = statSync(gitPath);
    if (stat.isFile()) {
      // Worktree - use main repo's hooks directory
      const content = readFileSync(gitPath, 'utf-8').trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      if (match) {
        // gitdir: C:/repo/.git/worktrees/branch-name
        // We want: C:/repo/.git/hooks
        const gitdirPath = match[1];
        const worktreesIndex = gitdirPath.lastIndexOf('/worktrees/');
        if (worktreesIndex !== -1) {
          const mainGitDir = gitdirPath.substring(0, worktreesIndex);
          hooksDir = join(mainGitDir, 'hooks');
        } else {
          // Windows path fallback
          const winIndex = gitdirPath.lastIndexOf('\\worktrees\\');
          if (winIndex !== -1) {
            const mainGitDir = gitdirPath.substring(0, winIndex);
            hooksDir = join(mainGitDir, 'hooks');
          } else {
            return;
          }
        }
      } else {
        return;
      }
    } else {
      hooksDir = join(gitPath, 'hooks');
    }
  } catch {
    return;
  }

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // Install hooks silently
  installHookFileSilent(join(hooksDir, 'post-merge'), POST_MERGE_HOOK);
  installHookFileSilent(join(hooksDir, 'post-rewrite'), POST_REWRITE_HOOK);
}

/**
 * Install a single hook file silently
 *
 * @param hookPath - Path to hook file
 * @param content - Hook content
 */
function installHookFileSilent(hookPath: string, content: string): void {
  try {
    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, 'utf-8');
      if (existing.includes('sqlew mark-done')) {
        return; // Already installed
      }
      writeFileSync(hookPath, existing.trim() + '\n\n' + content, 'utf-8');
    } else {
      writeFileSync(hookPath, content, 'utf-8');
    }

    if (process.platform !== 'win32') {
      chmodSync(hookPath, 0o755);
    }
  } catch {
    // Silent failure
  }
}
