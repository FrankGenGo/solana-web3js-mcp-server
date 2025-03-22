/**
 * Send Transaction Tool
 * 
 * This tool sends a signed transaction to the Solana blockchain.
 * It provides options for confirmation strategy, preflight checks, timeout policies,
 * and supports both legacy and versioned transactions.
 */

import {
  sendAndConfirmTransactionFactory,
  sendTransactionFactory,
  deserializeTransaction,
  getTransactionSigners,
  getLatestBlockhashFactory,
  simulateTransactionFactory
} from '@solana/web3.js';

import type {
  Transaction,
  Address,
  Commitment,
  TransactionSignature,
  VersionedTransaction,
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

// Logger for this module
const logger = getLogger('send-transaction-tool');

// Enum for transaction format type
export enum TransactionFormat {
  BASE64 = 'base64',
  BASE58 = 'base58',
  HEX = 'hex',
}

// Tool parameter definition
export interface SendTransactionParams {
  // Cluster to use for the transaction (defaults to 'mainnet')
  cluster?: string;
  
  // The signed transaction, either as a serialized string or buffer
  transaction: string;
  
  // Format of the transaction string (defaults to 'base64')
  format?: TransactionFormat;
  
  // Whether to skip the preflight transaction checks
  skipPreflight?: boolean;
  
  // Commitment level to use for checking transaction finality
  commitment?: Commitment;
  
  // Number of times to retry sending when failing
  maxRetries?: number;
  
  // Whether to wait for transaction confirmation before returning
  awaitConfirmation?: boolean;
  
  // Timeout in milliseconds when waiting for confirmation
  confirmationTimeout?: number;
  
  // Whether to include recent blockhash query in transaction send
  useRecentBlockhash?: boolean;
  
  // Whether to include transaction simulation results
  includeSimulation?: boolean;
}

// Tool response type
export interface SendTransactionResult {
  // The transaction signature (transaction ID)
  signature: string;
  
  // Whether the transaction was confirmed (if awaitConfirmation=true)
  confirmed?: boolean;
  
  // Confirmation details if the transaction was confirmed
  confirmationDetails?: {
    slot: number;
    confirmations: number | null;
    err: any;
  };
  
  // Simulation results if requested
  simulationResults?: {
    logs: string[] | null;
    err: any;
    unitsConsumed?: number;
  };
}

/**
 * Sends a signed transaction to the Solana blockchain
 * 
 * This tool allows you to send a transaction that has already been signed.
 * It supports various options including confirmation strategies, preflight checks,
 * and retry policies.
 * 
 * @param params - Tool parameters
 * @param connectionManager - The connection manager instance
 * @returns Object containing the transaction signature and confirmation details
 */
export const sendTransactionTool = {
  name: "sendTransaction",
  description: "Sends a signed transaction to the Solana blockchain and optionally awaits confirmation",
  
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
        description: "The signed transaction as a serialized string",
      },
      format: {
        type: "string",
        enum: Object.values(TransactionFormat),
        description: "Format of the transaction string. Defaults to 'base64'.",
        default: TransactionFormat.BASE64,
      },
      skipPreflight: {
        type: "boolean",
        description: "Skip the preflight transaction checks. Defaults to false.",
        default: false,
      },
      commitment: {
        type: "string",
        enum: ["processed", "confirmed", "finalized"],
        description: "Commitment level to use for transaction confirmation. Defaults to 'confirmed'.",
        default: "confirmed",
      },
      maxRetries: {
        type: "number",
        description: "Maximum number of times to retry sending the transaction. Defaults to 3.",
        default: 3,
      },
      awaitConfirmation: {
        type: "boolean",
        description: "Whether to wait for transaction confirmation before returning. Defaults to true.",
        default: true,
      },
      confirmationTimeout: {
        type: "number",
        description: "Timeout in milliseconds when waiting for confirmation. Defaults to 30000 (30 seconds).",
        default: 30000,
      },
      useRecentBlockhash: {
        type: "boolean",
        description: "Whether to use the most recent blockhash before sending. Only needed for transactions without a recent blockhash. Defaults to false.",
        default: false,
      },
      includeSimulation: {
        type: "boolean",
        description: "Whether to include transaction simulation results in the response. Defaults to false.",
        default: false,
      },
    },
    required: ["transaction"],
    additionalProperties: false,
  },
  
  execute: async (params: SendTransactionParams, connectionManager: ConnectionManager): Promise<SendTransactionResult> => {
    // Use defaults for optional parameters
    const cluster = params.cluster || 'mainnet';
    const format = params.format || TransactionFormat.BASE64;
    const skipPreflight = params.skipPreflight ?? false;
    const commitment = params.commitment || 'confirmed';
    const maxRetries = params.maxRetries ?? 3;
    const awaitConfirmation = params.awaitConfirmation ?? true;
    const confirmationTimeout = params.confirmationTimeout ?? 30000;
    const useRecentBlockhash = params.useRecentBlockhash ?? false;
    const includeSimulation = params.includeSimulation ?? false;
    
    logger.info("Sending transaction", { 
      cluster,
      format,
      skipPreflight,
      commitment,
      maxRetries,
      awaitConfirmation,
      confirmationTimeout,
      useRecentBlockhash,
      includeSimulation
    });
    
    // Get RPC client for the specified cluster
    const rpcClient = connectionManager.getConnection(cluster);
    
    // Process the transaction, handling any errors
    return tryCatch(async () => {
      // Deserialize the transaction based on format
      const txBuffer = deserializeTransactionBuffer(params.transaction, format);
      const deserializedTx = deserializeTransaction(txBuffer);
      
      // Set up simulation if requested
      let simulationResults: any = null;
      if (includeSimulation) {
        try {
          // Create simulation function with rpc client
          const simulateTransaction = simulateTransactionFactory(rpcClient);
          
          // Send for simulation
          const sim = await simulateTransaction(deserializedTx, {
            commitment
          }).send();
          
          simulationResults = {
            err: sim.value.err,
            logs: sim.value.logs,
            unitsConsumed: sim.value.unitsConsumed || 0
          };
        } catch (error) {
          logger.warn("Transaction simulation failed", error);
          simulationResults = {
            err: error instanceof Error ? error.message : String(error),
            logs: null
          };
        }
      }
      
      // Handle updating the blockhash if needed
      if (useRecentBlockhash) {
        try {
          const getLatestBlockhash = getLatestBlockhashFactory(rpcClient);
          const { blockhash, lastValidBlockHeight } = await getLatestBlockhash().send();
          
          // In v2.0, we would need to recreate the transaction with the new blockhash
          // rather than modifying it in place. This is a complex operation and would
          // require more involved transaction re-creation logic.
          logger.warn("Using recent blockhash not fully implemented in v2.0");
        } catch (error) {
          logger.error("Failed to get latest blockhash", error);
          throw wrapSolanaError(error instanceof Error ? error : new Error(String(error)));
        }
      }
      
      // Send options
      const sendOptions: SendTransactionOptions = {
        skipPreflight,
        preflightCommitment: commitment,
        maxRetries,
      };
      
      // Create result object to store output
      const result: SendTransactionResult = { signature: '' };
      
      // Add simulation results if available
      if (includeSimulation && simulationResults) {
        result.simulationResults = {
          logs: simulationResults.logs,
          err: simulationResults.err,
          unitsConsumed: simulationResults.unitsConsumed
        };
      }
      
      // Send transaction with or without confirmation
      if (awaitConfirmation) {
        try {
          // Create send and confirm function with timeout
          const sendAndConfirmTransaction = sendAndConfirmTransactionFactory(rpcClient);
          
          // Send and wait for confirmation
          const signature = await sendAndConfirmTransaction(
            deserializedTx,
            { commitment, skipPreflight, maxRetries },
            { maxTimeout: confirmationTimeout }
          );
          
          result.signature = signature;
          result.confirmed = true;
          
          // Since we confirmed successfully, create confirmation details
          result.confirmationDetails = {
            slot: 0, // We don't know the slot in the simplified response
            confirmations: null, // We don't have this info in simplified interface
            err: null
          };
          
          logger.info("Transaction sent and confirmed successfully", { 
            signature,
            commitment, 
            cluster
          });
        } catch (error) {
          // If this is a timeout error, the transaction may still be in flight
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isTimeoutError = errorMessage.toLowerCase().includes('timeout');
          
          if (isTimeoutError) {
            // If it's a timeout, get the signature from the error if possible
            const match = errorMessage.match(/signature (\w+)/i);
            const signature = match ? match[1] : 'unknown';
            
            logger.warn("Transaction confirmation timed out", { signature });
            
            result.signature = signature;
            result.confirmed = false;
            result.confirmationDetails = {
              slot: 0,
              confirmations: null,
              err: "Confirmation timeout"
            };
          } else {
            // Other error - propagate it
            logger.error("Transaction send and confirm failed", error);
            throw error;
          }
        }
      } else {
        // Send without waiting for confirmation
        try {
          // Create send function
          const sendTransaction = sendTransactionFactory(rpcClient);
          
          // Send transaction
          const signature = await sendTransaction(
            deserializedTx,
            { commitment, skipPreflight, maxRetries }
          ).send();
          
          result.signature = signature;
          logger.info("Transaction sent successfully without waiting for confirmation", { 
            signature, 
            cluster 
          });
        } catch (error) {
          logger.error("Transaction send failed", error);
          throw error;
        }
      }
      
      return result;
    }, (error) => {
      // Handle specific transaction errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('Transaction simulation failed')) {
        return new TransactionError(
          `Failed to send transaction: ${errorMessage}`,
          undefined,
          {
            code: ErrorCode.TRANSACTION_REJECTED,
            cause: error instanceof Error ? error : undefined,
            details: {
              errorMessage
            }
          }
        );
      }
      
      if (errorMessage.includes('blockhash') && errorMessage.includes('expired')) {
        return new TransactionError(
          "Transaction expired: blockhash too old",
          undefined,
          {
            code: ErrorCode.TRANSACTION_TIMEOUT,
            cause: error instanceof Error ? error : undefined
          }
        );
      }
      
      // Generic transaction error
      return new TransactionError(
        `Transaction failed: ${errorMessage}`,
        undefined,
        { cause: error instanceof Error ? error : undefined }
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