/**
 * Backend Abstraction Types
 *
 * Defines the ToolBackend interface for local and plugin-based backends.
 * Plugin implementations (e.g., SaaS connector) should implement this interface.
 */

/**
 * Backend type identifier
 * - 'local': Direct database connection via Knex
 * - 'plugin': External plugin (e.g., SaaS connector)
 */
export type BackendType = 'local' | 'plugin';

/**
 * Health check result
 */
export interface HealthCheckResult {
  ok: boolean;
  latency: number;
  message?: string;
}

/**
 * ToolBackend interface
 *
 * All backend implementations must implement this interface.
 * This enables transparent switching between local DB and plugin-based backends.
 */
export interface ToolBackend {
  /**
   * Execute a tool action
   * @param tool - Tool name (e.g., 'decision', 'constraint')
   * @param action - Action name (e.g., 'get', 'set', 'list')
   * @param params - Action parameters
   * @returns Action result
   */
  execute<TResponse = unknown>(
    tool: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<TResponse>;

  /**
   * Perform health check
   * @returns Health check result with latency
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Disconnect and cleanup resources
   */
  disconnect(): Promise<void>;

  /**
   * Backend type identifier
   */
  readonly backendType: BackendType;

  /**
   * Optional: Plugin name (for plugin backends)
   */
  readonly pluginName?: string;
}

/**
 * Plugin module interface
 *
 * Plugins must export a class that implements ToolBackend
 * and a factory function to create instances.
 */
export interface PluginModule {
  /**
   * Create a backend instance
   * @param config - Plugin-specific configuration
   */
  createBackend(config: unknown): ToolBackend;

  /**
   * Plugin version
   */
  version: string;

  /**
   * Minimum compatible mcp-sqlew version
   */
  minVersion?: string;
}
