/**
 * Connection utility for Solana Web3.js MCP Server
 * 
 * This module provides functions for creating and managing Solana RPC connections
 * following the official Solana web3.js v2.0 SDK patterns.
 */

import { 
  createSolanaRpc,
  Commitment,
  ClusterUrl,
  SolanaRpcClient
} from '@solana/web3.js';

/**
 * Default Solana cluster endpoints
 */
export const DEFAULT_CLUSTERS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  testnet: 'https://api.testnet.solana.com',
  devnet: 'https://api.devnet.solana.com',
  localnet: 'http://localhost:8899',
} as const;

/**
 * Cluster type definition - string literals for the standard clusters
 */
export type ClusterType = keyof typeof DEFAULT_CLUSTERS | string;

/**
 * Connection options interface for v2.0
 */
export interface ConnectionOptions {
  commitment?: Commitment;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * Private map to cache RPC clients by endpoint
 */
const rpcClients = new Map<string, SolanaRpcClient>();

/**
 * Creates a Solana RPC client for a given cluster, optionally with custom configuration.
 * Uses caching for clients to avoid creating new connections unnecessarily.
 *
 * @param cluster - The cluster to connect to ('mainnet', 'testnet', 'devnet', 'localnet', or URL)
 * @param options - Optional connection configuration
 * @param forceNew - Whether to force creation of a new connection instead of using a cached one
 * @returns The Solana RPC client
 */
export function createConnection(
  cluster: ClusterType, 
  options?: ConnectionOptions,
  forceNew = false
): SolanaRpcClient {
  // Get the endpoint URL for the requested cluster
  const endpoint = getEndpoint(cluster);
  
  // Create a cache key from the endpoint and important options
  const cacheKey = `${endpoint}-${options?.commitment || 'default'}`;
  
  // Return cached client if it exists and we're not forcing a new one
  if (!forceNew && rpcClients.has(cacheKey)) {
    return rpcClients.get(cacheKey)!;
  }
  
  // Create a new Solana RPC client with the given options
  const rpcClient = createSolanaRpc(endpoint as ClusterUrl, {
    // These are the officially supported options in the Solana web3.js v2 SDK
    commitment: options?.commitment,
    headers: options?.headers,
    timeoutMs: options?.timeout,
  });
  
  // Cache the client for future use
  rpcClients.set(cacheKey, rpcClient);
  
  return rpcClient;
}

/**
 * Get the endpoint URL for a cluster name
 * 
 * @param cluster - Cluster name or URL
 * @returns Endpoint URL
 */
export function getEndpoint(cluster: ClusterType): string {
  // If the cluster looks like a URL, return it directly
  if (cluster.startsWith('http://') || cluster.startsWith('https://')) {
    return cluster;
  }
  
  // Otherwise, look up the standard cluster URL
  const endpoint = DEFAULT_CLUSTERS[cluster as keyof typeof DEFAULT_CLUSTERS];
  if (!endpoint) {
    throw new Error(`Unknown cluster: ${cluster}`);
  }
  
  return endpoint;
}

/**
 * Clear all cached connections
 */
export function clearConnectionCache(): void {
  rpcClients.clear();
}