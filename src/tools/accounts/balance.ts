/**
 * Check Account Balance Tool
 * 
 * This tool checks the SOL balance for a Solana address.
 */

import type { Address, Commitment, SolanaRpcClient } from '@solana/web3.js';
import { getLogger } from '../../utils/logging.js';
import { tryCatch, SolanaMcpError, ValidationError, PublicKeyError, ConnectionError } from '../../utils/errors.js';
import { createConnection, getEndpoint } from '../../core/connection-manager.js';
import { ServerDependencies } from '../../solana-server.js';

// Logger for this module
const logger = getLogger('check-account-balance-tool');

// Constants for SOL/lamports conversion
const LAMPORTS_PER_SOL = 1_000_000_000;

// Tool parameter definition
export interface CheckAccountBalanceParams {
  // Account address to check (required)
  address: string;
  
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
 * Factory function to create a tool execution function with the given dependencies
 */
export function createCheckAccountBalanceExecute(deps: ServerDependencies) {
  return async function execute(
    params: CheckAccountBalanceParams
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
        // Get RPC client from connection function
        const rpcClient = deps.createConnection(cluster, { commitment });
        
        // Convert string address to Address type
        const accountAddress = params.address as Address;
        
        // Get balance from the RPC client with .send() for web3.js v2.0
        const balanceResponse = await rpcClient.getBalance(accountAddress, {
          commitment
        }).send();
        
        // Extract the balance value from the RPC response
        const balanceInLamports = Number(balanceResponse.value);
        
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
        if (error instanceof SolanaMcpError) {
          // Rethrow our own errors
          throw error;
        }
        
        // Wrap other errors
        throw new ConnectionError(
          `Failed to check account balance: ${error instanceof Error ? error.message : String(error)}`,
          cluster,
          getEndpoint(cluster),
          { cause: error instanceof Error ? error : new Error(String(error)) }
        );
      }
    }, (error) => {
      // Final error handler
      if (error instanceof SolanaMcpError) {
        throw error;
      }
      
      // Convert general errors to connection errors
      return new ConnectionError(
        `Failed to check account balance: ${error instanceof Error ? error.message : String(error)}`,
        cluster,
        getEndpoint(cluster),
        { cause: error instanceof Error ? error : new Error(String(error)) }
      );
    });
  };
}

/**
 * Tool definition for the MCP server
 */
export function getCheckAccountBalanceTool(deps: ServerDependencies) {
  return {
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
    
    execute: createCheckAccountBalanceExecute(deps)
  };
}