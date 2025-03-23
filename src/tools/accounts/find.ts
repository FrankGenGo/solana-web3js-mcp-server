/**
 * Find Program Accounts Tool
 * 
 * This tool finds accounts owned by a specific program.
 */

import type { Address, Commitment } from '@solana/web3.js';
import { getLogger } from '../../utils/logging.js';
import { ConnectionManager, getConnectionManager } from '../../core/connection-manager.js';
import { ValidationError, PublicKeyError, ConnectionError, tryCatch } from '../../utils/errors.js';
import { SolanaAddress, SolanaAccountData, ProgramAccountFilter } from '../../types/solana.js';

// Logger for this module
const logger = getLogger('find-program-accounts-tool');

// Tool parameter definition
export interface FindProgramAccountsParams {
  // Program ID to find accounts for (required)
  programId: SolanaAddress;
  
  // Cluster to connect to (defaults to mainnet-beta)
  cluster?: string;
  
  // Commitment level for the query
  commitment?: Commitment;
  
  // Filter configuration for the query (optional)
  filters?: ProgramAccountFilter[];
  
  // Data encoding format
  encoding?: 'base64' | 'jsonParsed';
  
  // Whether to include account data in response
  withData?: boolean;
  
  // Limit the number of results
  limit?: number;
}

// Tool response type
export interface FindProgramAccountsResult {
  // Number of accounts found
  count: number;
  
  // Account addresses
  accounts: string[];
  
  // Account data if requested
  accountsData?: SolanaAccountData[];
  
  // Size statistics (min, max, average)
  stats?: {
    minSize: number;
    maxSize: number;
    averageSize: number;
    totalSize: number;
  };
}

/**
 * Finds accounts owned by a specific program
 * 
 * @param params - Tool parameters
 * @returns Information about found program accounts
 */
async function execute(params: FindProgramAccountsParams): Promise<FindProgramAccountsResult> {
  logger.info('Finding program accounts', {
    programId: params.programId,
    cluster: params.cluster,
    commitment: params.commitment,
    hasFilters: !!params.filters && params.filters.length > 0,
    encoding: params.encoding,
    withData: params.withData,
    limit: params.limit
  });
  
  // Get the connection manager singleton
  const connectionManager = getConnectionManager();
  
  // Validate and normalize parameters
  const cluster = params.cluster || 'mainnet';
  const commitment = params.commitment || 'confirmed';
  const encoding = params.encoding || 'base64';
  const withData = params.withData !== false;
  const limit = params.limit || 1000; // Default limit to prevent too many results
  
  return tryCatch(async () => {
    try {
      // Get RPC client from connection manager
      const rpcClient = connectionManager.getConnection(cluster);
      
      // Convert string programId to Address type if needed
      let programAddress: Address;
      try {
        if (typeof params.programId === 'string') {
          programAddress = params.programId as Address;
        } else {
          programAddress = params.programId;
        }
      } catch (error) {
        throw new ValidationError(
          'Invalid program ID format',
          'programId',
          { cause: error instanceof Error ? error : new Error(String(error)) }
        );
      }
      
      // For v2.0 API, we need to use a different approach for filters
      // The filter format has changed significantly
      
      // Define the options object without filters first
      const options: {
        commitment: Commitment;
        encoding: 'base64' | 'jsonParsed';
        filters?: any;
      } = {
        commitment,
        encoding
      };
      
      // Only add filters if we actually have some
      if (params.filters?.length) {
        // Convert each filter to the correct v2.0 format
        const v2Filters = params.filters.map(filter => {
          if (filter.bytes !== undefined) {
            // memcmp filter
            return {
              memcmp: {
                bytes: filter.bytes.toString(), // Ensure it's a string
                offset: BigInt(filter.offset || 0),
                encoding: 'base58' as const // Use const assertion for literal type
              }
            };
          } else if (filter.dataSize !== undefined) {
            // dataSize filter
            return {
              dataSize: BigInt(filter.dataSize)
            };
          }
          // Skip invalid filters
          return null;
        }).filter(f => f !== null); // Remove any null filters
        
        // Only set filters if we have valid ones
        if (v2Filters.length > 0) {
          options.filters = v2Filters;
        }
      }
      
      // Get program accounts from the RPC client with our carefully constructed options
      const programAccountsResponse = await rpcClient.getProgramAccounts(
        programAddress, 
        options
      ).send();
      
      // For v2.0, extract value from response
      const programAccounts = programAccountsResponse.value;
      
      // Convert to array we can work with
      const accountsList = Array.from(programAccounts);
      
      // Limit results if needed
      const limitedAccounts = accountsList.slice(0, limit);
      
      // Calculate statistics about account sizes
      let minSize = Number.MAX_SAFE_INTEGER;
      let maxSize = 0;
      let totalSize = 0;
      
      // Process account data if available
      const accountsData: SolanaAccountData[] = [];
      
      for (const { pubkey, account } of limitedAccounts) {
        // Get data size - handle different formats
        let dataSize = 0;
        
        // In v2.0, data can take different formats
        // We need to handle each possibility
        if (account.data) {
          if (typeof account.data === 'string') {
            // Simple string format
            dataSize = account.data.length;
          } else if (Array.isArray(account.data)) {
            // [data, encoding] format - cast to ensure type safety
            const dataArray = account.data as unknown as [string, string];
            if (dataArray.length >= 1 && typeof dataArray[0] === 'string') {
              dataSize = dataArray[0].length;
            }
          } else {
            // For other formats, we'll just use 0 as we can't determine size
            dataSize = 0;
          }
        }
        
        // Track size statistics
        minSize = Math.min(minSize, dataSize);
        maxSize = Math.max(maxSize, dataSize);
        totalSize += dataSize;
        
        // Add to account data if requested
        if (withData) {
          accountsData.push({
            address: pubkey,
            owner: account.owner,
            lamports: Number(account.lamports),
            executable: account.executable,
            rentEpoch: Number(account.rentEpoch),
            data: account.data
          });
        }
      }
      
      // Build the result
      const result: FindProgramAccountsResult = {
        count: limitedAccounts.length,
        accounts: limitedAccounts.map(({ pubkey }) => pubkey.toString())
      };
      
      // Add account data if requested
      if (withData) {
        result.accountsData = accountsData;
      }
      
      // Add statistics if there are accounts
      if (limitedAccounts.length > 0) {
        result.stats = {
          minSize,
          maxSize,
          averageSize: totalSize / limitedAccounts.length,
          totalSize
        };
      }
      
      logger.info('Successfully found program accounts', {
        programId: params.programId,
        count: result.count,
        limitApplied: accountsList.length > limit
      });
      
      return result;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof PublicKeyError) {
        // Rethrow validation errors as they already contain correct info
        throw error;
      }
      
      // Wrap any other error
      throw new ConnectionError(
        `Failed to find program accounts: ${error instanceof Error ? error.message : String(error)}`,
        cluster,
        connectionManager.getEndpoint(cluster),
        { cause: error instanceof Error ? error : new Error(String(error)) }
      );
    }
  }, (error) => {
    // Final error handler that converts to user-friendly format
    if (error instanceof ValidationError || 
        error instanceof PublicKeyError ||
        error instanceof ConnectionError) {
      // Just rethrow specialized errors
      throw error;
    }
    
    // Convert general errors to connection errors
    return new ConnectionError(
      `Failed to find program accounts: ${error instanceof Error ? error.message : String(error)}`,
      cluster,
      connectionManager.getEndpoint(cluster),
      { cause: error instanceof Error ? error : new Error(String(error)) }
    );
  });
}

/**
 * Tool definition for the MCP server
 */
export const findProgramAccountsTool = {
  name: 'findProgramAccounts',
  description: 'Finds accounts owned by a specific Solana program',
  
  parameters: {
    type: 'object',
    properties: {
      programId: {
        type: 'string',
        description: 'Solana program ID (address) to find accounts for'
      },
      cluster: {
        type: 'string',
        description: 'Solana cluster to use (mainnet, testnet, devnet, or custom URL)',
        default: 'mainnet'
      },
      commitment: {
        type: 'string',
        enum: ['processed', 'confirmed', 'finalized'],
        description: 'Commitment level for the query',
        default: 'confirmed'
      },
      filters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            offset: {
              type: 'number',
              description: 'Byte offset into the account data'
            },
            bytes: {
              type: 'string',
              description: 'Data to match at the specified offset (base58 encoded)'
            },
            dataSize: {
              type: 'number',
              description: 'Filter for accounts of this exact size in bytes'
            }
          }
        },
        description: 'Optional filters to apply when searching for accounts'
      },
      encoding: {
        type: 'string',
        enum: ['base64', 'jsonParsed'],
        description: 'Encoding format for account data',
        default: 'base64'
      },
      withData: {
        type: 'boolean',
        description: 'Whether to include account data in the response',
        default: true
      },
      limit: {
        type: 'number',
        description: 'Maximum number of accounts to return',
        default: 1000
      }
    },
    required: ['programId'],
    additionalProperties: false
  },
  
  execute
};