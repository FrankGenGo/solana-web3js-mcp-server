/**
 * ConnectionManager for Solana Web3.js MCP Server
 * 
 * This module provides a singleton ConnectionManager class that handles:
 * - Connection creation and caching for different Solana clusters
 * - Error handling for connection issues
 * - Connection pooling and configuration
 * - Connection lifecycle management
 */

import { 
  createSolanaRpc,
  createDefaultRpcTransport,
  Commitment
} from '@solana/web3.js';
import { ConnectionError } from '../utils/errors.js';

// Import the RPC client type
// For web3.js v2.0, we're using the result of createSolanaRpc as our client type
type SolanaRpcClient = ReturnType<typeof createSolanaRpc>;

// Define options for v2.0 transport config
interface SolanaRpcClientOptions {
  commitment?: Commitment;
  headers?: Record<string, string>;
  timeout?: number;
}

// Default Solana cluster endpoints
export const DEFAULT_CLUSTERS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  testnet: 'https://api.testnet.solana.com',
  devnet: 'https://api.devnet.solana.com',
  localnet: 'http://localhost:8899',
};

// Cluster type definition - string literals for the standard clusters
export type ClusterType = 'mainnet' | 'testnet' | 'devnet' | 'localnet' | string;

// Connection options interface updated for v2.0
export interface ConnectionOptions {
  commitment?: Commitment;
  timeout?: number;
  maxRetries?: number;
  useRateLimiter?: boolean;
  headers?: Record<string, string>;
}

/**
 * Singleton ConnectionManager class for managing Solana RPC connections
 */
export class ConnectionManager {
  private static instance: ConnectionManager;
  private rpcClients: Map<string, SolanaRpcClient> = new Map();
  private customEndpoints: Map<string, string> = new Map();
  private connectionOptions: Map<string, ConnectionOptions> = new Map();
  private lastUsed: Map<string, number> = new Map();
  private connectionAttempts: Map<string, number> = new Map();
  
  // Default connection options
  private defaultOptions: ConnectionOptions = {
    commitment: 'confirmed',
    timeout: 30000,
    maxRetries: 3,
    useRateLimiter: true
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
   * Get a SolanaRpcClient instance for the specified cluster
   * 
   * @param cluster - The cluster to connect to ('mainnet', 'testnet', 'devnet', 'localnet', or custom name)
   * @param forceNew - Force creation of a new client even if one exists
   * @returns SolanaRpcClient instance
   * @throws ConnectionError if client cannot be established
   */
  public getConnection(cluster: ClusterType, forceNew = false): SolanaRpcClient {
    // Update last used timestamp
    this.lastUsed.set(cluster, Date.now());
    
    // If we already have a client and don't need to force a new one, return it
    if (!forceNew && this.rpcClients.has(cluster)) {
      return this.rpcClients.get(cluster)!;
    }

    try {
      // Get the endpoint for this cluster
      const endpoint = this.getEndpoint(cluster);
      
      // Get connection options (or use defaults)
      const options = this.connectionOptions.get(cluster) || this.defaultOptions;
      
      // Create the RPC client (simplified for v2.0)
      // In v2.0, commitment is passed as a parameter to individual RPC methods
      const rpcClient = createSolanaRpc(endpoint);
      
      // Cache the client
      this.rpcClients.set(cluster, rpcClient);
      
      // Reset connection attempts
      this.connectionAttempts.set(cluster, 0);
      
      return rpcClient;
    } catch (error) {
      // Increment connection attempts
      const attempts = (this.connectionAttempts.get(cluster) || 0) + 1;
      this.connectionAttempts.set(cluster, attempts);
      
      // Throw a wrapped ConnectionError
      throw new ConnectionError(
        `Failed to establish connection to ${cluster} cluster (attempt ${attempts})`,
        cluster,
        this.getEndpoint(cluster),
        {
          cause: error instanceof Error ? error : new Error(String(error))
        }
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
    
    // Remove any existing client so it will be recreated with the new endpoint
    this.rpcClients.delete(cluster);
    
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
    
    // Remove existing client so it will be recreated with new options
    this.rpcClients.delete(cluster);
    
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
    
    // Reset all clients to use new defaults
    this.rpcClients.clear();
    
    return this;
  }

  /**
   * Check if an RPC client for the specified cluster exists in the cache
   * 
   * @param cluster - The cluster name
   * @returns True if a client exists, false otherwise
   */
  public hasConnection(cluster: ClusterType): boolean {
    return this.rpcClients.has(cluster);
  }

  /**
   * Get all currently active RPC clients
   * 
   * @returns Map of all RPC clients
   */
  public getAllConnections(): Map<string, SolanaRpcClient> {
    return new Map(this.rpcClients);
  }

  /**
   * Reset a specific RPC client, forcing it to be recreated on next use
   * 
   * @param cluster - The cluster name
   */
  public resetConnection(cluster: ClusterType): void {
    this.rpcClients.delete(cluster);
    this.connectionAttempts.delete(cluster);
  }

  /**
   * Reset all RPC clients, forcing them to be recreated on next use
   */
  public resetAllConnections(): void {
    this.rpcClients.clear();
    this.connectionAttempts.clear();
  }

  /**
   * Test an RPC client to verify it's working
   * 
   * @param cluster - The cluster to test
   * @returns Promise resolving to true if client is working, rejects with error otherwise
   */
  public async testConnection(cluster: ClusterType): Promise<boolean> {
    try {
      const rpcClient = this.getConnection(cluster);
      // Try to get a simple value to verify the connection works
      const versionResponse = await rpcClient.getVersion().send();
      // If we get here, the connection is working
      return true;
    } catch (error) {
      // Reset the client so it will be recreated on next attempt
      this.resetConnection(cluster);
      throw new ConnectionError(
        `Connection test failed for ${cluster}`,
        cluster,
        this.getEndpoint(cluster),
        { cause: error instanceof Error ? error : new Error(String(error)) }
      );
    }
  }

  /**
   * Close idle RPC clients that haven't been used for the specified time
   * 
   * @param maxIdleTimeMs - Maximum idle time in milliseconds (default: 10 minutes)
   * @returns Number of clients closed
   */
  public cleanupIdleConnections(maxIdleTimeMs = 10 * 60 * 1000): number {
    const now = Date.now();
    let closedCount = 0;
    
    for (const [cluster, lastUsedTime] of this.lastUsed.entries()) {
      if (now - lastUsedTime > maxIdleTimeMs && this.rpcClients.has(cluster)) {
        this.rpcClients.delete(cluster);
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
    // RPC clients don't require explicit cleanup
    
    // Clear all cached clients
    this.rpcClients.clear();
    this.lastUsed.clear();
    this.connectionAttempts.clear();
  }
}

// Export singleton instance getter
export const getConnectionManager = (): ConnectionManager => {
  return ConnectionManager.getInstance();
};