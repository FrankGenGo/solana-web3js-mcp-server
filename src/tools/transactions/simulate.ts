/**
 * Simulate Transaction Tool
 * 
 * This tool simulates a transaction on the Solana blockchain without submitting it.
 * It provides detailed information about potential transaction results including logs,
 * compute units consumed, and any errors that would occur if the transaction were executed.
 */

import {
  simulateTransactionFactory,
  deserializeTransaction,
  ComputeBudgetProgram,
  computeUnit,
  Commitment
} from '@solana/web3.js';

import type {
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  SendTransactionOptions
} from '@solana/web3.js';

import { getLogger } from '../../utils/logging.js';
import { 
  ErrorCode, 
  tryCatch, 
  TransactionError, 
  wrapSolanaError
} from '../../utils/errors.js';
import { ConnectionManager } from '../../core/connection-manager.js';

// Import the transaction format enum from the send transaction tool
import { TransactionFormat } from './send.js';

// Logger for this module
const logger = getLogger('simulate-transaction-tool');

// Tool parameter definition
export interface SimulateTransactionParams {
  // Cluster to use for the transaction (defaults to 'mainnet')
  cluster?: string;
  
  // The transaction to simulate, either as a serialized string
  transaction: string;
  
  // Format of the transaction string (defaults to 'base64')
  format?: TransactionFormat;
  
  // Commitment level to use for the simulation
  commitment?: Commitment;
  
  // Whether to replace recently computed compute budget 
  replaceRecentBlockhash?: boolean;
  
  // Addresses to return signature statuses for
  sigVerify?: boolean;
  
  // Include transaction accounts in the response
  includeAccounts?: boolean;
}

// Simulation result type
export interface SimulationResult {
  // Whether the simulation was successful
  success: boolean;
  
  // Any error message if the transaction would fail
  error?: string;
  
  // Logs emitted during simulation
  logs: string[] | null;
  
  // Number of compute units consumed
  unitsConsumed: number;
  
  // If requested, the accounts data
  accounts?: Array<{
    pubkey: string;
    lamports: number;
    owner: string;
    data: string;
    executable: boolean;
  }>;
  
  // If requested, the signature verification results
  sigVerify?: boolean;
  
  // Additional RPC response information
  context?: {
    slot: number;
  };
}

/**
 * Simulates a transaction on the Solana blockchain without submitting it
 * 
 * This tool allows you to see what would happen if a transaction was executed
 * without actually sending it to the blockchain. It's useful for debugging
 * and testing transactions before sending them.
 * 
 * @param params - The simulation parameters
 * @param connectionManager - The connection manager instance
 * @returns The simulation results
 */
export const simulateTransactionTool = {
  name: "simulateTransaction",
  description: "Simulates a transaction on the Solana blockchain without submitting it",
  
  parameters: {
    type: "object",
    properties: {
      cluster: {
        type: "string",
        description: "Solana cluster to use: 'mainnet', 'testnet', 'devnet', or 'localnet'. Defaults to 'mainnet'.",
        default: "mainnet",
      },
      transaction: {
        type: "string",
        description: "The transaction to simulate as a serialized string",
      },
      format: {
        type: "string",
        enum: Object.values(TransactionFormat),
        description: "Format of the transaction string. Defaults to 'base64'.",
        default: TransactionFormat.BASE64,
      },
      commitment: {
        type: "string",
        enum: ["processed", "confirmed", "finalized"],
        description: "Commitment level to use for transaction simulation. Defaults to 'confirmed'.",
        default: "confirmed",
      },
      replaceRecentBlockhash: {
        type: "boolean",
        description: "Whether to replace the blockhash with the most recent blockhash. Defaults to true.",
        default: true,
      },
      sigVerify: {
        type: "boolean",
        description: "Whether to verify signatures. Defaults to false.",
        default: false,
      },
      includeAccounts: {
        type: "boolean",
        description: "Whether to include account information in the response. Defaults to false.",
        default: false,
      },
    },
    required: ["transaction"],
    additionalProperties: false,
  },
  
  execute: async (
    params: SimulateTransactionParams, 
    connectionManager: ConnectionManager
  ): Promise<SimulationResult> => {
    // Use defaults for optional parameters
    const cluster = params.cluster || 'mainnet';
    const format = params.format || TransactionFormat.BASE64;
    const commitment = params.commitment || 'confirmed';
    const replaceRecentBlockhash = params.replaceRecentBlockhash ?? true;
    const sigVerify = params.sigVerify ?? false;
    const includeAccounts = params.includeAccounts ?? false;
    
    logger.info("Simulating transaction", { 
      cluster,
      format,
      commitment,
      replaceRecentBlockhash,
      sigVerify,
      includeAccounts
    });
    
    // Get RPC client for the specified cluster
    const rpcClient = connectionManager.getConnection(cluster);
    
    // Process the transaction, handling any errors
    return tryCatch(async () => {
      // Deserialize the transaction based on format
      const txBuffer = deserializeTransactionBuffer(params.transaction, format);
      const deserializedTx = deserializeTransaction(txBuffer);
      
      // Create simulation function with rpc client
      const simulateTransaction = simulateTransactionFactory(rpcClient);
      
      // Call the simulate function with appropriate options
      const simulationResponse = await simulateTransaction(
        deserializedTx, 
        {
          commitment,
          replaceRecentBlockhash,
          sigVerify,
          accounts: includeAccounts ? { encoding: 'base64' } : undefined
        }
      ).send();
      
      // Process the simulation response
      const simulationResult: SimulationResult = {
        success: !simulationResponse.value.err,
        logs: simulationResponse.value.logs || null,
        unitsConsumed: simulationResponse.value.unitsConsumed || 0,
        context: {
          slot: simulationResponse.context.slot
        }
      };
      
      // Add error details if transaction would fail
      if (simulationResponse.value.err) {
        simulationResult.error = typeof simulationResponse.value.err === 'string'
          ? simulationResponse.value.err
          : JSON.stringify(simulationResponse.value.err);
      }
      
      // Add account data if requested and available
      if (includeAccounts && simulationResponse.value.accounts) {
        simulationResult.accounts = simulationResponse.value.accounts.map(account => {
          if (!account) return null;
          
          return {
            pubkey: account.pubkey.toString(),
            lamports: account.lamports,
            owner: account.owner.toString(),
            data: account.data[0],
            executable: account.executable
          };
        }).filter(Boolean) as any[];
      }
      
      // Add signature verification result if requested
      if (sigVerify && simulationResponse.value.sigVerify !== undefined) {
        simulationResult.sigVerify = simulationResponse.value.sigVerify;
      }
      
      logger.info("Transaction simulation completed", { 
        success: simulationResult.success,
        unitsConsumed: simulationResult.unitsConsumed
      });
      
      return simulationResult;
    }, (error) => {
      // Handle specific simulation errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('blockhash')) {
        return new TransactionError(
          "Transaction simulation failed: blockhash not found or invalid",
          undefined,
          {
            code: ErrorCode.TRANSACTION_INVALID,
            cause: error instanceof Error ? error : undefined,
            details: {
              errorMessage
            }
          }
        );
      }
      
      // Generic simulation error
      return new TransactionError(
        `Transaction simulation failed: ${errorMessage}`,
        undefined,
        { 
          code: ErrorCode.TRANSACTION_REJECTED,
          cause: error instanceof Error ? error : undefined
        }
      );
    });
  }
};

/**
 * Deserializes a transaction buffer from its string representation
 * 
 * @param serializedTx - The serialized transaction string
 * @param format - The format of the serialized transaction
 * @returns The transaction buffer
 */
function deserializeTransactionBuffer(
  serializedTx: string,
  format: TransactionFormat
): Uint8Array {
  try {
    // Convert the serialized transaction to a Buffer based on the format
    switch (format) {
      case TransactionFormat.BASE58:
        return Buffer.from(serializedTx, 'base58');
      case TransactionFormat.HEX:
        return Buffer.from(serializedTx, 'hex');
      case TransactionFormat.BASE64:
      default:
        return Buffer.from(serializedTx, 'base64');
    }
  } catch (error) {
    logger.error("Failed to decode transaction string", { format }, error);
    throw new TransactionError(
      `Failed to decode transaction string: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      {
        code: ErrorCode.TRANSACTION_INVALID,
        cause: error instanceof Error ? error : undefined
      }
    );
  }
}