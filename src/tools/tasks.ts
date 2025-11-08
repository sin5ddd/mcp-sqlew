/**
 * Task management tools for Kanban Task Watcher
 *
 * REFACTORED: This file now re-exports from the modular tasks/ directory structure.
 * The original 2,362-line monolithic file has been split into 23 action-based files.
 *
 * Directory structure:
 * - actions/         (14 action files - one per action)
 * - internal/        (5 utility files - validation, state machine, queries)
 * - watcher/         (2 watcher files - status queries)
 * - help/            (2 help files - help and examples)
 * - types.ts         (Task-specific types and constants)
 * - index.ts         (Barrel export for all actions)
 */

// Re-export everything from the modular implementation
export * from './tasks/index.js';
