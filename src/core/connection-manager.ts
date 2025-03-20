/**
 * ConnectionManager for Solana Web3.js MCP Server
 * 
 * This module provides a singleton ConnectionManager class that handles:
 * - Connection creation and caching for different Solana clusters
 * - Error handling for connection issues
 * - Connection pooling and configuration
 * - Connection lifecycle management
 */

import { Connection, ConnectionConfig, Commitment } from '@solana/web3.js';

// Default Solana cluster endpoints
export const DEFAULT_CLUSTERS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  testnet: 'https://api.testnet.solana.com',
  devnet: 'https://api.devnet.solana.com',
  localnet: 'http://localhost:8899',
};

// Cluster type definition - string literals for the standard clusters
export type ClusterType = 'mainnet' | 'testnet' | 'devnet' | 'localnet' | string;

// Connection options interface
export interface ConnectionOptions {
  commitment?: Commitment;
  confirmTransactionInitialTimeout?: number;
  disableRetryOnRateLimit?: boolean;
  timeout?: number;
  maxRetries?: number;
}

// Connection error class - basic implementation 
// This would likely be replaced with a more sophisticated error system
export class ConnectionError extends Error {
  public readonly cluster: string;
  public readonly endpoint: string;
  public readonly cause?: Error;

  constructor(message: string, cluster: string, endpoint: string, cause?: Error) {
    super(message);
    this.name = 'ConnectionError';
    this.cluster = cluster;
    this.endpoint = endpoint;
    this.cause = cause;
  }
}

/**
 * Singleton ConnectionManager class for managing Solana RPC connections
 */
export class ConnectionManager {
  private static instance: ConnectionManager;
  private connections: Map<string, Connection> = new Map();
  private customEndpoints: Map<string, string> = new Map();
  private connectionOptions: Map<string, ConnectionConfig> = new Map();
  private lastUsed: Map<string, number> = new Map();
  private connectionAttempts: Map<string, number> = new Map();
  
  // Default connection options
  private defaultOptions: ConnectionOptions = {
    commitment: 'confirmed',
    disableRetryOnRateLimit: false,
    timeout: 30000,
    maxRetries: 3
  };

  // Private constructor to enforce singleton pattern
  private constructor() {
    // Initialize with default clusters
    for (const [cluster, endpoint] of Object.entries(DEFAULT_CLUSTERS)) {
      this.customEndpoints.set(cluster, endpoint);
    }
  }

  /**
   * Get the singleton ConnectionManager instance
   */
  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * Get a Connection instance for the specified cluster
   * 
   * @param cluster - The cluster to connect to ('mainnet', 'testnet', 'devnet', 'localnet', or custom name)
   * @param forceNew - Force creation of a new connection even if one exists
   * @returns Connection instance
   * @throws ConnectionError if connection cannot be established
   */
  public getConnection(cluster: ClusterType, forceNew = false): Connection {
    // Update last used timestamp
    this.lastUsed.set(cluster, Date.now());
    
    // If we already have a connection and don't need to force a new one, return it
    if (!forceNew && this.connections.has(cluster)) {
      return this.connections.get(cluster)!;
    }

    try {
      // Get the endpoint for this cluster
      const endpoint = this.getEndpoint(cluster);
      
      // Get connection options (or use defaults)
      const options = this.connectionOptions.get(cluster) || this.defaultOptions;
      
      // Create a new connection
      const connection = new Connection(endpoint, options);
      
      // Cache the connection
      this.connections.set(cluster, connection);
      
      // Reset connection attempts
      this.connectionAttempts.set(cluster, 0);
      
      return connection;
    } catch (error) {
      // Increment connection attempts
      const attempts = (this.connectionAttempts.get(cluster) || 0) + 1;
      this.connectionAttempts.set(cluster, attempts);
      
      // Throw a wrapped ConnectionError
      throw new ConnectionError(
        `Failed to establish connection to ${cluster} cluster (attempt ${attempts})`,
        cluster,
        this.getEndpoint(cluster),
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get the endpoint URL for a cluster
   * 
   * @param cluster - The cluster name
   * @returns The endpoint URL
   * @throws Error if the cluster is unknown
   */
  public getEndpoint(cluster: ClusterType): string {
    const endpoint = this.customEndpoints.get(cluster);
    if (!endpoint) {
      throw new Error(`Unknown cluster: ${cluster}`);
    }
    return endpoint;
  }

  /**
   * Set a custom endpoint for a cluster
   * 
   * @param cluster - The cluster name
   * @param endpoint - The endpoint URL
   * @param options - Optional connection configuration options
   * @returns The ConnectionManager instance for chaining
   */
  public setEndpoint(
    cluster: ClusterType, 
    endpoint: string, 
    options?: ConnectionOptions
  ): ConnectionManager {
    this.customEndpoints.set(cluster, endpoint);
    
    // If options are provided, store them
    if (options) {
      this.connectionOptions.set(cluster, {
        ...this.defaultOptions,
        ...options
      });
    }
    
    // Remove any existing connection so it will be recreated with the new endpoint
    this.connections.delete(cluster);
    
    return this;
  }

  /**
   * Set connection options for a specific cluster
   * 
   * @param cluster - The cluster name
   * @param options - Connection configuration options
   * @returns The ConnectionManager instance for chaining
   */
  public setConnectionOptions(
    cluster: ClusterType, 
    options: ConnectionOptions
  ): ConnectionManager {
    // Merge with existing options or defaults
    const existingOptions = this.connectionOptions.get(cluster) || this.defaultOptions;
    this.connectionOptions.set(cluster, {
      ...existingOptions,
      ...options
    });
    
    // Remove existing connection so it will be recreated with new options
    this.connections.delete(cluster);
    
    return this;
  }

  /**
   * Set default connection options for all clusters
   * 
   * @param options - Default connection configuration options
   * @returns The ConnectionManager instance for chaining
   */
  public setDefaultOptions(options: ConnectionOptions): ConnectionManager {
    this.defaultOptions = {
      ...this.defaultOptions,
      ...options
    };
    
    // Reset all connections to use new defaults
    this.connections.clear();
    
    return this;
  }

  /**
   * Check if a connection to the specified cluster exists in the cache
   * 
   * @param cluster - The cluster name
   * @returns True if a connection exists, false otherwise
   */
  public hasConnection(cluster: ClusterType): boolean {
    return this.connections.has(cluster);
  }

  /**
   * Get all currently active connections
   * 
   * @returns Map of all connections
   */
  public getAllConnections(): Map<string, Connection> {
    return new Map(this.connections);
  }

  /**
   * Reset a specific connection, forcing it to be recreated on next use
   * 
   * @param cluster - The cluster name
   */
  public resetConnection(cluster: ClusterType): void {
    this.connections.delete(cluster);
    this.connectionAttempts.delete(cluster);
  }

  /**
   * Reset all connections, forcing them to be recreated on next use
   */
  public resetAllConnections(): void {
    this.connections.clear();
    this.connectionAttempts.clear();
  }

  /**
   * Test a connection to verify it's working
   * 
   * @param cluster - The cluster to test
   * @returns Promise resolving to true if connection is working, rejects with error otherwise
   */
  public async testConnection(cluster: ClusterType): Promise<boolean> {
    try {
      const connection = this.getConnection(cluster);
      // Try to get a simple value to verify the connection works
      await connection.getVersion();
      return true;
    } catch (error) {
      // Reset the connection so it will be recreated on next attempt
      this.resetConnection(cluster);
      throw new ConnectionError(
        `Connection test failed for ${cluster}`,
        cluster,
        this.getEndpoint(cluster),
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Close idle connections that haven't been used for the specified time
   * 
   * @param maxIdleTimeMs - Maximum idle time in milliseconds (default: 10 minutes)
   * @returns Number of connections closed
   */
  public cleanupIdleConnections(maxIdleTimeMs = 10 * 60 * 1000): number {
    const now = Date.now();
    let closedCount = 0;
    
    for (const [cluster, lastUsedTime] of this.lastUsed.entries()) {
      if (now - lastUsedTime > maxIdleTimeMs && this.connections.has(cluster)) {
        this.connections.delete(cluster);
        closedCount++;
      }
    }
    
    return closedCount;
  }

  /**
   * Perform cleanup operations before application shutdown
   * This should be called when the application is shutting down
   */
  public async cleanup(): Promise<void> {
    // Currently, the Connection class doesn't have a close/disconnect method
    // This is a placeholder for future implementation if needed
    
    // Clear all cached connections
    this.connections.clear();
    this.lastUsed.clear();
    this.connectionAttempts.clear();
  }
}

// Export singleton instance getter
export const getConnectionManager = (): ConnectionManager => {
  return ConnectionManager.getInstance();
};