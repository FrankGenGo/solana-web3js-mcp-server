/**
 * Send Transaction Tool
 * 
 * This tool sends a signed transaction to the Solana blockchain.
 * It provides options for confirmation strategy, preflight checks, timeout policies,
 * and supports both legacy and versioned transactions.
 */

import { 
  Connection, 
  SendOptions, 
  Transaction, 
  VersionedTransaction,
  TransactionSignature,
  SendTransactionError,
  Commitment, 
  TransactionExpiredBlockheightExceededError,
  RpcResponseAndContext,
  SignatureResult
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
    
    // Get connection for the specified cluster
    const connection = connectionManager.getConnection(cluster);
    
    // Process the transaction, handling any errors
    return tryCatch(async () => {
      // Deserialize the transaction based on format
      const deserializedTx = deserializeTransaction(params.transaction, format);
      
      // Handle updating the blockhash if needed
      if (useRecentBlockhash) {
        await updateTransactionBlockhash(connection, deserializedTx);
      }
      
      // Run simulation if requested
      let simulationResults: any = null;
      if (includeSimulation) {
        simulationResults = await simulateTransaction(connection, deserializedTx, commitment);
      }
      
      // Send options
      const sendOptions: SendOptions = {
        skipPreflight,
        preflightCommitment: commitment,
        maxRetries,
      };
      
      // Send the transaction
      const signature = await sendTransactionWithRetry(
        connection,
        deserializedTx,
        sendOptions,
        maxRetries
      );
      
      logger.info("Transaction sent successfully", { signature, cluster });
      
      const result: SendTransactionResult = { signature };
      
      // Add simulation results if available
      if (includeSimulation && simulationResults) {
        result.simulationResults = {
          logs: simulationResults.logs,
          err: simulationResults.err,
          unitsConsumed: simulationResults.unitsConsumed
        };
      }
      
      // Wait for confirmation if requested
      if (awaitConfirmation) {
        try {
          const confirmation = await confirmTransaction(
            connection,
            signature,
            commitment,
            confirmationTimeout
          );
          
          result.confirmed = confirmation.value.err === null;
          result.confirmationDetails = {
            slot: confirmation.context.slot,
            confirmations: confirmation.value.confirmations,
            err: confirmation.value.err
          };
          
          logger.info("Transaction confirmation status", { 
            signature, 
            confirmed: result.confirmed, 
            slot: confirmation.context.slot
          });
        } catch (error) {
          // The transaction was sent but confirmation timed out or failed
          logger.warn("Transaction confirmation failed or timed out", { 
            signature, 
            error 
          });
          
          result.confirmed = false;
          result.confirmationDetails = {
            slot: 0,
            confirmations: null,
            err: error instanceof Error ? error.message : String(error)
          };
        }
      }
      
      return result;
    }, (error) => {
      // Handle specific transaction errors
      if (error instanceof SendTransactionError) {
        return new TransactionError(
          `Failed to send transaction: ${error.message}`,
          undefined,
          {
            code: ErrorCode.TRANSACTION_REJECTED,
            cause: error,
            details: {
              logs: error.logs,
              errorMessage: error.message
            }
          }
        );
      }
      
      if (error instanceof TransactionExpiredBlockheightExceededError) {
        return new TransactionError(
          "Transaction expired: blockhash too old",
          undefined,
          {
            code: ErrorCode.TRANSACTION_TIMEOUT,
            cause: error
          }
        );
      }
      
      // Generic transaction error
      return new TransactionError(
        `Transaction failed: ${error.message}`,
        undefined,
        { cause: error }
      );
    });
  }
};

/**
 * Deserializes a transaction from its string representation
 * 
 * @param serializedTx - The serialized transaction string
 * @param format - The format of the serialized transaction
 * @returns The deserialized Transaction or VersionedTransaction
 */
function deserializeTransaction(
  serializedTx: string,
  format: TransactionFormat
): Transaction | VersionedTransaction {
  try {
    // Convert the serialized transaction to a Buffer based on the format
    let buffer: Buffer;
    switch (format) {
      case TransactionFormat.BASE58:
        buffer = Buffer.from(serializedTx, 'base58');
        break;
      case TransactionFormat.HEX:
        buffer = Buffer.from(serializedTx, 'hex');
        break;
      case TransactionFormat.BASE64:
      default:
        buffer = Buffer.from(serializedTx, 'base64');
        break;
    }
    
    // Try to deserialize as a versioned transaction first
    try {
      return VersionedTransaction.deserialize(buffer);
    } catch {
      // If that fails, try as a legacy transaction
      return Transaction.from(buffer);
    }
  } catch (error) {
    logger.error("Failed to deserialize transaction", { format }, error);
    throw new TransactionError(
      `Failed to deserialize transaction: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      {
        code: ErrorCode.TRANSACTION_INVALID,
        cause: error instanceof Error ? error : undefined
      }
    );
  }
}

/**
 * Updates the blockhash for a transaction
 * 
 * @param connection - The Solana connection
 * @param transaction - The transaction to update
 */
async function updateTransactionBlockhash(
  connection: Connection,
  transaction: Transaction | VersionedTransaction
): Promise<void> {
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    
    if (transaction instanceof Transaction) {
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
    } else if (transaction instanceof VersionedTransaction) {
      // For versioned transactions, create a new message with the updated blockhash
      // This is a complex operation that requires re-serializing the message
      // This would need to be implemented based on the versioned transaction structure
      logger.warn("Cannot update blockhash for versioned transaction");
      throw new TransactionError(
        "Cannot update blockhash for versioned transaction. Please provide a transaction with a recent blockhash.",
        undefined,
        { code: ErrorCode.TRANSACTION_INVALID }
      );
    }
  } catch (error) {
    logger.error("Failed to update transaction blockhash", error);
    throw wrapSolanaError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Simulates a transaction before sending
 * 
 * @param connection - The Solana connection
 * @param transaction - The transaction to simulate
 * @param commitment - The commitment level to use
 * @returns The simulation results
 */
async function simulateTransaction(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  commitment: Commitment
): Promise<any> {
  try {
    const serializedTx = transaction instanceof Transaction
      ? transaction.serialize({ verifySignatures: false })
      : transaction.serialize();
      
    const sim = await connection.simulateTransaction(
      transaction instanceof Transaction ? transaction : transaction,
      { commitment }
    );
    
    return {
      err: sim.value.err,
      logs: sim.value.logs,
      unitsConsumed: sim.value.unitsConsumed || 0
    };
  } catch (error) {
    logger.warn("Transaction simulation failed", error);
    return {
      err: error instanceof Error ? error.message : String(error),
      logs: null
    };
  }
}

/**
 * Sends a transaction with retries on specific errors
 * 
 * @param connection - The Solana connection
 * @param transaction - The transaction to send
 * @param options - Send options
 * @param maxRetries - Maximum number of retries
 * @returns The transaction signature
 */
async function sendTransactionWithRetry(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  options: SendOptions,
  maxRetries: number
): Promise<TransactionSignature> {
  let retries = 0;
  let lastError: Error | null = null;
  
  while (retries <= maxRetries) {
    try {
      if (retries > 0) {
        logger.info(`Retrying transaction send (attempt ${retries}/${maxRetries})`);
      }
      
      // Serialize for sending
      const rawTransaction = transaction instanceof Transaction
        ? transaction.serialize()
        : transaction.serialize();
      
      // Send the transaction
      const signature = await connection.sendRawTransaction(rawTransaction, options);
      return signature;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Only retry on specific errors that might be transient
      const errorMsg = lastError.message.toLowerCase();
      const shouldRetry = 
        errorMsg.includes('timeout') ||
        errorMsg.includes('blockhash not found') ||
        errorMsg.includes('block height exceeded') ||
        errorMsg.includes('rate limited') ||
        errorMsg.includes('network congestion');
      
      if (!shouldRetry || retries >= maxRetries) {
        logger.error(`Transaction send failed after ${retries} retries`, lastError);
        throw lastError;
      }
      
      retries++;
      // Exponential backoff
      const delay = Math.min(500 * Math.pow(2, retries), 5000);
      logger.debug(`Waiting ${delay}ms before retrying`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached because the loop will throw on max retries
  throw lastError || new Error('Failed to send transaction after retries');
}

/**
 * Waits for transaction confirmation with timeout
 * 
 * @param connection - The Solana connection
 * @param signature - The transaction signature to confirm
 * @param commitment - The commitment level to use
 * @param timeoutMs - Timeout in milliseconds
 * @returns The confirmation details
 */
async function confirmTransaction(
  connection: Connection,
  signature: TransactionSignature,
  commitment: Commitment,
  timeoutMs: number
): Promise<RpcResponseAndContext<SignatureResult>> {
  // Create a promise that resolves on confirmation
  const confirmPromise = connection.confirmTransaction(
    { signature, blockhash: '', lastValidBlockHeight: 0 },
    commitment
  );
  
  // Create a promise that rejects on timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Transaction confirmation timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  // Race the confirmation against the timeout
  return Promise.race([confirmPromise, timeoutPromise]);
}