/**
 * ProjectContext Singleton - Manages current project identity for multi-project support
 *
 * Satisfies constraints:
 * - #41 (CRITICAL): Caches project_id after first detection, no repeated DB queries
 * - #44, #30 (HIGH): Provides getProjectId() and getProjectName() methods
 * - #47 (HIGH): Provides reset() for test isolation
 * - #23, #24 (CRITICAL): Config.toml as source of truth, auto-write on first run
 */

import type { Knex } from 'knex';

export interface ProjectMetadata {
  id: number;
  name: string;
  display_name?: string;
  detection_source: 'cli' | 'config' | 'git' | 'metadata' | 'directory';
  project_root_path?: string;
  metadata?: Record<string, unknown>;
}

/**
 * ProjectContext singleton - manages current project identity
 *
 * Design:
 * - Single instance per MCP server session
 * - Lazy initialization on first access
 * - Caches project_id and project_name in memory
 * - Never queries database after initialization
 * - Reset capability for test isolation
 */
export class ProjectContext {
  private static instance: ProjectContext | null = null;
  private projectMetadata: ProjectMetadata | null = null;
  private initialized = false;

  /**
   * Private constructor enforces singleton pattern
   */
  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): ProjectContext {
    if (!ProjectContext.instance) {
      ProjectContext.instance = new ProjectContext();
    }
    return ProjectContext.instance;
  }

  /**
   * Reset singleton state (for testing only)
   * Satisfies Constraint #47: Test isolation
   */
  public static reset(): void {
    if (ProjectContext.instance) {
      ProjectContext.instance.projectMetadata = null;
      ProjectContext.instance.initialized = false;
    }
    ProjectContext.instance = null;
  }

  /**
   * Ensure project is initialized and cached
   *
   * @param knex - Database connection
   * @param projectName - Project name from config or detection
   * @param detectionSource - How the project name was detected
   * @param options - Optional metadata
   * @returns Project metadata with cached ID
   *
   * Satisfies Constraints:
   * - #41: Query once per session, cache in memory
   * - #23: Register project in database if doesn't exist
   */
  public async ensureProject(
    knex: Knex,
    projectName: string,
    detectionSource: 'cli' | 'config' | 'git' | 'metadata' | 'directory',
    options?: {
      displayName?: string;
      projectRootPath?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<ProjectMetadata> {
    // Return cached metadata if already initialized
    if (this.initialized && this.projectMetadata) {
      return this.projectMetadata;
    }

    // Validate project name (Constraint #37)
    this.validateProjectName(projectName);

    // Query database for existing project or create new one
    // Uses Knex query builder (Constraint #49, #50)
    let project = await knex('v4_projects')
      .where({ name: projectName })
      .first<{
        id: number;
        name: string;
        display_name: string | null;
        detection_source: string;
        project_root_path: string | null;
        metadata: string | null;
      }>();

    if (!project) {
      // Insert new project using Knex query builder (Constraint #49)
      // Set timestamps in application code for cross-DB compatibility
      const now = Math.floor(Date.now() / 1000);

      await knex('v4_projects').insert({
        name: projectName,
        display_name: options?.displayName || projectName,
        detection_source: detectionSource,
        project_root_path: options?.projectRootPath || null,
        created_ts: now,
        last_active_ts: now,
        metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
      });

      // Fetch the newly created project by name
      // (Avoids cross-database inconsistencies with .returning())
      project = await knex('v4_projects')
        .where({ name: projectName })
        .first<{
          id: number;
          name: string;
          display_name: string | null;
          detection_source: string;
          project_root_path: string | null;
          metadata: string | null;
        }>();

      if (!project) {
        throw new Error(`Failed to create project: ${projectName}`);
      }
    }

    // Cache project metadata in memory (Constraint #41)
    this.projectMetadata = {
      id: project.id,
      name: project.name,
      display_name: project.display_name || undefined,
      detection_source: project.detection_source as ProjectMetadata['detection_source'],
      project_root_path: project.project_root_path || undefined,
      metadata: project.metadata ? JSON.parse(project.metadata) : undefined,
    };

    this.initialized = true;

    return this.projectMetadata;
  }

  /**
   * Get cached project ID
   *
   * @throws Error if project not initialized
   * @returns Project ID
   *
   * Satisfies Constraint #44: Provide getProjectId() method
   */
  public getProjectId(): number {
    if (!this.initialized || !this.projectMetadata) {
      throw new Error(
        'ProjectContext not initialized. Call ensureProject() first during server startup.'
      );
    }
    return this.projectMetadata.id;
  }

  /**
   * Get cached project name
   *
   * @throws Error if project not initialized
   * @returns Project name
   *
   * Satisfies Constraint #44: Provide getProjectName() method
   */
  public getProjectName(): string {
    if (!this.initialized || !this.projectMetadata) {
      throw new Error(
        'ProjectContext not initialized. Call ensureProject() first during server startup.'
      );
    }
    return this.projectMetadata.name;
  }

  /**
   * Get all cached project metadata
   *
   * @throws Error if project not initialized
   * @returns Complete project metadata
   */
  public getProjectMetadata(): ProjectMetadata {
    if (!this.initialized || !this.projectMetadata) {
      throw new Error(
        'ProjectContext not initialized. Call ensureProject() first during server startup.'
      );
    }
    return { ...this.projectMetadata }; // Return copy to prevent mutations
  }

  /**
   * Check if project context is initialized
   *
   * @returns true if initialized, false otherwise
   */
  public isInitialized(): boolean {
    return this.initialized && this.projectMetadata !== null;
  }

  /**
   * Validate project name according to security constraints
   *
   * @param projectName - Project name to validate
   * @throws Error if project name is invalid
   *
   * Satisfies Constraint #37: Alphanumeric + hyphens/underscores only, max 64 chars
   */
  private validateProjectName(projectName: string): void {
    // Max 64 characters
    if (projectName.length > 64) {
      throw new Error(
        `Project name exceeds maximum length of 64 characters: ${projectName.length}`
      );
    }

    // Alphanumeric + hyphens/underscores only
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(projectName)) {
      throw new Error(
        `Invalid project name: ${projectName}. Only alphanumeric characters, hyphens, and underscores are allowed.`
      );
    }

    // Additional check: must not be empty
    if (projectName.trim().length === 0) {
      throw new Error('Project name cannot be empty');
    }
  }
}

/**
 * Convenience function to get the singleton instance
 *
 * @returns ProjectContext singleton instance
 */
export function getProjectContext(): ProjectContext {
  return ProjectContext.getInstance();
}
