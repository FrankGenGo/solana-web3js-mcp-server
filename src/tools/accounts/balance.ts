/**
 * Check Account Balance Tool
 * 
 * This tool checks the SOL balance for a Solana address.
 */

import type { Address, Commitment } from '@solana/web3.js';
import { getLogger } from '../../utils/logging.js';
import { ConnectionManager } from '../../core/connection-manager.js';
import { ValidationError, PublicKeyError, ConnectionError, tryCatch } from '../../utils/errors.js';
import { SolanaAddress } from '../../types/solana.js';

// Logger for this module
const logger = getLogger('check-account-balance-tool');

// Constants for SOL/lamports conversion
const LAMPORTS_PER_SOL = 1_000_000_000;

// Tool parameter definition
export interface CheckAccountBalanceParams {
  // Account address to check (required)
  address: SolanaAddress;
  
  // Cluster to connect to (defaults to mainnet-beta)
  cluster?: string;
  
  // Commitment level for the query
  commitment?: Commitment;
  
  // Whether to return balance in SOL instead of lamports
  convertToSol?: boolean;
}

// Tool response type
export interface CheckAccountBalanceResult {
  // Account address checked
  address: string;
  
  // Balance in lamports (or SOL if convertToSol is true)
  balance: number;
  
  // Unit of the balance (lamports or SOL)
  unit: 'lamports' | 'SOL';
  
  // Balance in the other unit (for convenience)
  balanceInOtherUnit: number;
  
  // Conversion rate used
  conversionRate: number;
}

/**
 * Checks the SOL balance for a Solana account
 * 
 * @param params - Tool parameters
 * @param connectionManager - Connection manager instance
 * @returns Account balance information
 */
async function execute(
  params: CheckAccountBalanceParams,
  connectionManager: ConnectionManager
): Promise<CheckAccountBalanceResult> {
  logger.info('Checking account balance', {
    address: params.address,
    cluster: params.cluster,
    commitment: params.commitment,
    convertToSol: params.convertToSol
  });
  
  // Validate and normalize parameters
  const cluster = params.cluster || 'mainnet';
  const commitment = params.commitment || 'confirmed';
  const convertToSol = params.convertToSol === true;
  
  return tryCatch(async () => {
    try {
      // Get RPC client from connection manager
      const rpcClient = connectionManager.getConnection(cluster);
      
      // Convert string address to Address type if needed
      let accountAddress: Address;
      try {
        if (typeof params.address === 'string') {
          accountAddress = params.address as Address;
        } else {
          accountAddress = params.address;
        }
      } catch (error) {
        throw new ValidationError(
          'Invalid account address format',
          'address',
          { cause: error }
        );
      }
      
      // Get balance from the RPC client
      // In web3.js v2.0, we need to use .send() after the RPC method call
      const balanceInLamports = await rpcClient.getBalance(accountAddress, {
        commitment
      }).send();
      
      // Convert to SOL if requested
      const balanceInSol = balanceInLamports / LAMPORTS_PER_SOL;
      
      // Create result object
      const result: CheckAccountBalanceResult = {
        address: accountAddress.toString(),
        balance: convertToSol ? balanceInSol : balanceInLamports,
        unit: convertToSol ? 'SOL' : 'lamports',
        balanceInOtherUnit: convertToSol ? balanceInLamports : balanceInSol,
        conversionRate: LAMPORTS_PER_SOL
      };
      
      logger.info('Successfully retrieved account balance', {
        address: params.address,
        balanceInLamports,
        balanceInSol
      });
      
      return result;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof PublicKeyError) {
        // Rethrow validation errors as they already contain correct info
        throw error;
      }
      
      // Wrap any other error
      throw new ConnectionError(
        `Failed to check account balance: ${error.message}`,
        cluster,
        connectionManager.getEndpoint(cluster),
        { cause: error }
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
      `Failed to check account balance: ${error.message}`,
      cluster,
      connectionManager.getEndpoint(cluster),
      { cause: error }
    );
  });
}

/**
 * Tool definition for the MCP server
 */
export const checkAccountBalanceTool = {
  name: 'checkAccountBalance',
  description: 'Checks the SOL balance for a Solana account',
  
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Solana account address (public key) to check the balance for'
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
      convertToSol: {
        type: 'boolean',
        description: 'Whether to return the balance in SOL instead of lamports',
        default: false
      }
    },
    required: ['address'],
    additionalProperties: false
  },
  
  execute
};