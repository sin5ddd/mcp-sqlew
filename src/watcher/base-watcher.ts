/**
 * Base Watcher - Common file watching functionality
 *
 * Provides shared infrastructure for file watchers:
 * - chokidar v4 initialization
 * - WSL detection and handling
 * - Debounce management
 * - Start/stop lifecycle
 *
 * @since v4.1.0
 */

import chokidar, { FSWatcher } from 'chokidar';
import { execSync } from 'child_process';
import { debugLog } from '../utils/debug-logger.js';

/**
 * Watcher configuration options
 */
export interface WatcherOptions {
  /** Paths to watch */
  paths: string | string[];
  /** Debounce time in milliseconds */
  debounceMs?: number;
  /** Whether to ignore initial scan */
  ignoreInitial?: boolean;
  /** Custom ignore function */
  ignored?: (path: string) => boolean;
  /** Use polling (for network filesystems) */
  usePolling?: boolean;
  /** Polling interval in milliseconds */
  pollInterval?: number;
}

/**
 * Abstract base class for file watchers
 */
export abstract class BaseWatcher {
  protected watcher: FSWatcher | null = null;
  protected isRunning: boolean = false;
  protected debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  protected readonly debounceMs: number;
  protected readonly watcherName: string;

  constructor(name: string, debounceMs: number = 2000) {
    this.watcherName = name;
    this.debounceMs = debounceMs;
  }

  /**
   * Detect if running on WSL (Windows Subsystem for Linux)
   */
  protected isWSL(): boolean {
    if (process.platform !== 'linux') {
      return false;
    }

    try {
      const result = execSync('uname -r', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return (
        result.toLowerCase().includes('microsoft') ||
        result.toLowerCase().includes('wsl')
      );
    } catch {
      return false;
    }
  }

  /**
   * Initialize chokidar watcher with common options
   */
  protected initializeWatcher(options: WatcherOptions): FSWatcher {
    const isWSL = this.isWSL();
    if (isWSL) {
      debugLog('INFO', `${this.watcherName}: WSL detected`);
    }

    const watcherConfig: Parameters<typeof chokidar.watch>[1] = {
      persistent: true,
      ignoreInitial: options.ignoreInitial ?? true,
      awaitWriteFinish: {
        stabilityThreshold: options.debounceMs ?? this.debounceMs,
        pollInterval: 100,
      },
      usePolling: options.usePolling ?? false,
      interval: options.pollInterval ?? 100,
    };

    if (options.ignored && watcherConfig) {
      watcherConfig.ignored = options.ignored;
    }

    return chokidar.watch(options.paths, watcherConfig);
  }

  /**
   * Debounced handler - calls handler after debounce period
   */
  protected debounce(key: string, handler: () => void | Promise<void>): void {
    // Clear existing timer for this key
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(key);
      try {
        await handler();
      } catch (error) {
        debugLog('ERROR', `${this.watcherName}: Error in debounced handler`, {
          error,
        });
      }
    }, this.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  /**
   * Start the watcher - must be implemented by subclasses
   */
  public abstract start(): Promise<void>;

  /**
   * Stop the watcher
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Clear all debounce timers
      this.debounceTimers.forEach((timer) => clearTimeout(timer));
      this.debounceTimers.clear();

      // Close watcher
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }

      this.isRunning = false;
      debugLog('INFO', `${this.watcherName}: Stopped`);
    } catch (error) {
      debugLog('ERROR', `${this.watcherName}: Error stopping`, { error });
      throw error;
    }
  }

  /**
   * Check if watcher is running
   */
  public getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get watcher name for logging
   */
  public getName(): string {
    return this.watcherName;
  }
}
