/**
 * Get Rent Exemption Tool
 * 
 * This tool calculates the minimum balance required for rent exemption.
 */

import { getLogger } from '../../utils/logging.js';
import { ConnectionManager, getConnectionManager } from '../../core/connection-manager.js';
import { ValidationError, ConnectionError, tryCatch } from '../../utils/errors.js';

// Logger for this module
const logger = getLogger('get-rent-exemption-tool');

// Constants for SOL/lamports conversion
const LAMPORTS_PER_SOL = 1_000_000_000;

// Tool parameter definition
export interface GetRentExemptionParams {
  // Size of the account data in bytes (required)
  size: number;
  
  // Cluster to connect to (defaults to mainnet-beta)
  cluster?: string;
  
  // Whether to return balance in SOL instead of lamports
  convertToSol?: boolean;
}

// Tool response type
export interface GetRentExemptionResult {
  // Minimum balance required for rent exemption in lamports or SOL
  minimumBalance: number;
  
  // Unit of the balance (lamports or SOL)
  unit: 'lamports' | 'SOL';
  
  // Size of account data in bytes
  size: number;
  
  // Rent per byte-year in lamports
  rentPerByteYear?: number;
  
  // Rent per byte-epoch in lamports
  rentPerByteEpoch?: number;
  
  // Balance in other unit (for convenience)
  balanceInOtherUnit: number;
}

/**
 * Calculates the minimum balance required for rent exemption
 * based on account data size
 * 
 * @returns Tool definition and handler function
 */
export function getRentExemptionTool() {
  return {
    name: 'getRentExemption',
    description: 'Calculate the minimum balance required for rent exemption based on data size',
    
    parameters: {
      type: 'object',
      properties: {
        size: {
          type: 'number',
          description: 'The size of account data in bytes'
        },
        cluster: {
          type: 'string',
          description: 'Solana cluster to use (mainnet, testnet, devnet, or custom URL)',
          default: 'mainnet'
        },
        convertToSol: {
          type: 'boolean',
          description: 'Whether to return the balance in SOL instead of lamports',
          default: false
        }
      },
      required: ['size'],
      additionalProperties: false
    },
    
    handler: async (params: GetRentExemptionParams): Promise<GetRentExemptionResult> => {
      logger.info('Calculating rent exemption', {
        size: params.size,
        cluster: params.cluster,
        convertToSol: params.convertToSol
      });
      
      // Get the connection manager singleton
      const connectionManager = getConnectionManager();
      
      // Validate and normalize parameters
      const cluster = params.cluster || 'mainnet';
      const size = params.size;
      const convertToSol = params.convertToSol === true;
      
      // Check for valid size
      if (size <= 0 || !Number.isInteger(size)) {
        throw new ValidationError(
          'Account size must be a positive integer',
          'size'
        );
      }
      
      return tryCatch(async () => {
        try {
          // Get RPC client from connection manager
          const rpcClient = connectionManager.getConnection(cluster);
          
          // Get rent for account size from the RPC client
          // In web3.js v2.0, we need to use .send() after the RPC method call
          const rentInfo = await rpcClient.getMinimumBalanceForRentExemption(size).send();
          
          // Convert to SOL if requested
          const balanceInSol = rentInfo / LAMPORTS_PER_SOL;
          
          // Create result object
          const result: GetRentExemptionResult = {
            minimumBalance: convertToSol ? balanceInSol : rentInfo,
            unit: convertToSol ? 'SOL' : 'lamports',
            size,
            balanceInOtherUnit: convertToSol ? rentInfo : balanceInSol
          };
          
          // Calculate rent per byte if possible (may require more RPC calls)
          // In a more comprehensive implementation, we would calculate these values
          
          logger.info('Successfully calculated rent exemption', {
            size,
            minimumBalance: rentInfo,
            minimumBalanceSOL: balanceInSol
          });
          
          return result;
        } catch (error) {
          // Wrap any error
          throw new ConnectionError(
            `Failed to calculate rent exemption: ${error.message}`,
            cluster,
            connectionManager.getEndpoint(cluster),
            { cause: error }
          );
        }
      }, (error) => {
        // Final error handler that converts to user-friendly format
        if (error instanceof ValidationError || 
            error instanceof ConnectionError) {
          // Just rethrow specialized errors
          throw error;
        }
        
        // Convert general errors to connection errors
        return new ConnectionError(
          `Failed to calculate rent exemption: ${error.message}`,
          cluster,
          connectionManager.getEndpoint(cluster),
          { cause: error }
        );
      });
    }
  };
}