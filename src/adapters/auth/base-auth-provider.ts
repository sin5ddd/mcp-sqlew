/**
 * @fileoverview Base authentication provider for sqlew's multi-RDBMS authentication system.
 *
 * This module provides the foundation for all authentication providers, enabling support for:
 * - SSH tunneling (v3.7.0)
 * - Direct connections (v3.7.0)
 * - AWS IAM authentication (v3.8.0+)
 * - GCP IAM authentication (v3.8.0+)
 *
 * @module adapters/auth/base-auth-provider
 * @since v3.7.0
 */

import type { DatabaseConfig } from '../../config/types.js';

/**
 * Connection parameters used to establish database connections.
 *
 * These parameters are returned by authentication providers after processing
 * credentials, setting up tunnels, or obtaining temporary tokens.
 *
 * @interface ConnectionParams
 * @example
 * // Direct connection
 * {
 *   host: 'postgres.example.com',
 *   port: 5432,
 *   database: 'mydb',
 *   user: 'admin',
 *   password: 'secret123'
 * }
 *
 * @example
 * // SSH tunnel connection
 * {
 *   host: '127.0.0.1',
 *   port: 54321,  // Local tunnel port
 *   database: 'mydb',
 *   user: 'admin',
 *   password: 'secret123'
 * }
 *
 * @example
 * // AWS IAM authentication
 * {
 *   host: 'db.region.rds.amazonaws.com',
 *   port: 5432,
 *   database: 'mydb',
 *   user: 'iam_user',
 *   password: 'temporary_token_generated_by_aws',
 *   ssl: {
 *     ca: '/path/to/rds-ca-bundle.pem',
 *     rejectUnauthorized: true
 *   }
 * }
 */
export interface ConnectionParams {
  /**
   * Database host address.
   * For direct connections: remote host address.
   * For SSH tunnels: '127.0.0.1' (localhost).
   * For cloud IAM: cloud provider's database endpoint.
   */
  host: string;

  /**
   * Database port number.
   * For direct connections: remote database port.
   * For SSH tunnels: local tunnel port.
   * For cloud IAM: cloud provider's database port.
   */
  port: number;

  /**
   * Target database name.
   */
  database: string;

  /**
   * Database user/username.
   * For IAM authentication: IAM role or user identifier.
   */
  user: string;

  /**
   * Database password or authentication token.
   * Optional for IAM-based authentication where tokens are generated dynamically.
   * For AWS/GCP IAM: temporary authentication token.
   */
  password?: string;

  /**
   * SSL/TLS configuration for encrypted connections.
   * Required for most cloud providers (AWS RDS, GCP Cloud SQL).
   */
  ssl?: {
    /**
     * Certificate Authority (CA) certificate.
     * Path to PEM file or certificate content.
     */
    ca?: string;

    /**
     * Client certificate for mutual TLS.
     * Path to PEM file or certificate content.
     */
    cert?: string;

    /**
     * Client private key for mutual TLS.
     * Path to PEM file or key content.
     */
    key?: string;

    /**
     * Whether to reject unauthorized certificates.
     * Set to false for self-signed certificates (not recommended for production).
     */
    rejectUnauthorized?: boolean;
  };

  /**
   * Database-specific connection parameters.
   *
   * Examples:
   * - PostgreSQL: { statement_timeout: 30000, application_name: 'mcp-sqlew' }
   * - MySQL: { connectTimeout: 10000, multipleStatements: false }
   * - SQL Server: { requestTimeout: 30000, encrypt: true }
   */
  additionalParams?: Record<string, any>;
}

/**
 * Abstract base class for all authentication providers.
 *
 * This class establishes the contract that all authentication providers must implement,
 * ensuring consistent behavior across different authentication methods.
 *
 * **Supported Authentication Methods:**
 * - `DirectAuthProvider`: Standard username/password authentication
 * - `SshAuthProvider`: SSH tunneling with key-based or password authentication
 * - `AwsIamAuthProvider`: AWS RDS IAM database authentication
 * - `GcpIamAuthProvider`: GCP Cloud SQL IAM authentication
 *
 * **Authentication Flow:**
 * 1. Provider instantiation with DatabaseConfig
 * 2. `validate()` - Verify configuration is valid
 * 3. `authenticate()` - Process credentials and return ConnectionParams
 * 4. Database connection using returned params
 * 5. `cleanup()` - Release resources when connection closes
 *
 * @abstract
 * @class BaseAuthProvider
 *
 * @example
 * // Implementing a custom authentication provider
 * class CustomAuthProvider extends BaseAuthProvider {
 *   async authenticate(): Promise<ConnectionParams> {
 *     // Implement custom authentication logic
 *     return {
 *       host: this.config.connection.host,
 *       port: this.config.connection.port,
 *       database: this.config.connection.database,
 *       user: this.config.auth.user,
 *       password: await this.getCustomPassword()
 *     };
 *   }
 *
 *   getAuthMethod(): string {
 *     return 'Custom Authentication';
 *   }
 *
 *   async cleanup(): Promise<void> {
 *     // Clean up any resources
 *   }
 *
 *   validate(): void {
 *     if (!this.config.auth.user) {
 *       throw new Error('User is required for custom authentication');
 *     }
 *   }
 * }
 *
 * @example
 * // Using an authentication provider
 * const provider = new DirectAuthProvider(config);
 * provider.validate();
 * const connParams = await provider.authenticate();
 * const connection = await createConnection(connParams);
 * // ... use connection ...
 * await connection.close();
 * await provider.cleanup();
 */
export abstract class BaseAuthProvider {
  /**
   * Database configuration containing connection and authentication settings.
   * Accessible to child classes for implementing authentication logic.
   *
   * @protected
   * @readonly
   */
  protected readonly config: DatabaseConfig;

  /**
   * Creates a new authentication provider instance.
   *
   * @param {DatabaseConfig} config - Database configuration object
   *
   * @example
   * const provider = new SshAuthProvider({
   *   type: 'postgres',
   *   connection: {
   *     host: 'db.internal',
   *     port: 5432,
   *     database: 'production'
   *   },
   *   auth: {
   *     type: 'ssh',
   *     ssh: {
   *       host: 'bastion.example.com',
   *       port: 22,
   *       user: 'deploy',
   *       privateKey: '/path/to/key.pem'
   *     }
   *   }
   * });
   */
  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Authenticates and returns connection parameters for database connection.
   *
   * This method handles the authentication process specific to each provider:
   * - **Direct**: Returns credentials as-is
   * - **SSH**: Establishes tunnel, returns localhost connection params
   * - **AWS IAM**: Generates temporary token, returns params with SSL config
   * - **GCP IAM**: Obtains OAuth token, returns params with cloud SQL proxy
   *
   * @abstract
   * @returns {Promise<ConnectionParams>} Connection parameters for database client
   *
   * @throws {Error} When authentication fails or credentials are invalid
   *
   * @example
   * // Direct authentication
   * const params = await directProvider.authenticate();
   * // Returns: { host: 'db.example.com', port: 5432, user: 'admin', password: 'secret' }
   *
   * @example
   * // SSH tunnel authentication
   * const params = await sshProvider.authenticate();
   * // Returns: { host: '127.0.0.1', port: 54321, user: 'admin', password: 'secret' }
   * // Note: Tunnel is active until cleanup() is called
   *
   * @example
   * // AWS IAM authentication
   * const params = await awsProvider.authenticate();
   * // Returns: { host: 'db.region.rds.amazonaws.com', user: 'iam_user',
   * //           password: 'temp_token_xyz', ssl: { ca: '...' } }
   */
  abstract authenticate(): Promise<ConnectionParams>;

  /**
   * Returns a human-readable name for this authentication method.
   *
   * Used for logging, error messages, and telemetry.
   *
   * @abstract
   * @returns {string} Authentication method name
   *
   * @example
   * directProvider.getAuthMethod(); // Returns: "Direct"
   * sshProvider.getAuthMethod();    // Returns: "SSH Tunnel"
   * awsProvider.getAuthMethod();    // Returns: "AWS IAM"
   * gcpProvider.getAuthMethod();    // Returns: "GCP IAM"
   */
  abstract getAuthMethod(): string;

  /**
   * Releases resources allocated during authentication.
   *
   * This method MUST be called when the database connection is closed to prevent
   * resource leaks. Different providers handle cleanup differently:
   *
   * - **Direct**: No-op (no resources to clean)
   * - **SSH**: Closes SSH tunnel and releases local port
   * - **AWS IAM**: Invalidates cached tokens (if applicable)
   * - **GCP IAM**: Closes Cloud SQL proxy connection
   *
   * @abstract
   * @returns {Promise<void>}
   *
   * @throws {Error} If cleanup fails (should be caught and logged, not propagated)
   *
   * @example
   * try {
   *   await provider.cleanup();
   * } catch (error) {
   *   console.error('Cleanup failed:', error);
   *   // Connection is closed, log error but don't throw
   * }
   */
  abstract cleanup(): Promise<void>;

  /**
   * Validates the authentication configuration.
   *
   * This method checks that all required configuration parameters are present
   * and valid BEFORE attempting authentication. It should be called immediately
   * after provider instantiation to fail fast on configuration errors.
   *
   * **Validation Examples:**
   * - **Direct**: Verify host, port, user, password are present
   * - **SSH**: Verify SSH host, SSH user, privateKey/password, target credentials
   * - **AWS IAM**: Verify region, IAM role/user, AWS credentials available
   * - **GCP IAM**: Verify project ID, service account, GCP credentials available
   *
   * @abstract
   * @returns {void}
   *
   * @throws {Error} If configuration is invalid or incomplete
   *
   * @example
   * try {
   *   provider.validate();
   * } catch (error) {
   *   console.error('Invalid configuration:', error.message);
   *   // Fix configuration before proceeding
   * }
   *
   * @example
   * // Validation in SSH provider
   * validate(): void {
   *   if (!this.config.auth.ssh?.host) {
   *     throw new Error('SSH host is required for SSH authentication');
   *   }
   *   if (!this.config.auth.ssh.privateKey && !this.config.auth.ssh.password) {
   *     throw new Error('SSH privateKey or password is required');
   *   }
   * }
   */
  abstract validate(): void;
}
