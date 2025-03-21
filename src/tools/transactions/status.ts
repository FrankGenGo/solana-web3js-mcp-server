/**
 * Transaction Status Tool
 * 
 * This tool allows checking the status and confirmation of Solana transactions.
 * It provides detailed information about transaction status, including confirmation
 * level, containing block, and any errors encountered during processing.
 */

import { 
  Connection, 
  TransactionSignature, 
  TransactionError, 
  TransactionConfirmationStatus,
  PublicKey, 
  Finality, 
  VersionedTransactionResponse,
  InstructionError
} from "@solana/web3.js";
import { getLogger } from "../../utils/logging.js";
import { 
  TransactionError as TransactionErrorType, 
  ErrorCode, 
  tryCatch 
} from "../../utils/errors.js";
import { ConnectionManager } from "../../core/connection-manager.js";

// Logger for this module
const logger = getLogger("transaction-status-tool");

// Tool parameter definition
export interface GetTransactionStatusParams {
  // Transaction signature to check
  signature: string;
  
  // The cluster to use ('mainnet', 'testnet', 'devnet', 'localnet', or custom endpoint)
  cluster?: string;
  
  // Whether to include detailed transaction information if available
  includeDetails?: boolean;
  
  // Commitment level to check against
  commitment?: Finality;
  
  // Whether to check if transaction is still pending if not found
  checkPending?: boolean;
}

// Transaction status result
export interface TransactionStatusResult {
  // The signature that was checked
  signature: string;
  
  // Overall status: 'confirmed', 'finalized', 'processed', 'pending', 'not_found', 'failed'
  status: string;
  
  // Confirmation status from Solana if available
  confirmationStatus?: TransactionConfirmationStatus | null;
  
  // The slot in which the transaction was included (if confirmed)
  slot?: number;
  
  // Block timestamp (if available)
  timestamp?: number;
  
  // Error information (if transaction failed)
  error?: {
    // Error message
    message: string;
    
    // Error code if available
    code?: number;
    
    // Instruction index where the error occurred (if applicable)
    instructionIndex?: number;
    
    // Additional error details
    details?: Record<string, any>;
  };
  
  // Detailed transaction information (if requested and available)
  details?: {
    // Transaction fee in lamports
    fee?: number;
    
    // Array of accounts involved in the transaction
    accounts?: string[];
    
    // Number of instructions in the transaction
    instructionCount?: number;
    
    // Recent blockhash used in the transaction
    recentBlockhash?: string;
    
    // Whether the transaction used compute budget instructions
    hasComputeBudget?: boolean;
    
    // Log messages from the transaction (if any)
    logs?: string[];
  };
}

/**
 * Checks the status of a Solana transaction by its signature
 * 
 * This tool verifies whether a transaction has been confirmed or finalized on the
 * Solana blockchain, and provides detailed information about its status, including
 * any errors that may have occurred during processing.
 * 
 * @param params - Tool parameters including transaction signature and cluster
 * @param connectionManager - Connection manager instance
 * @returns Object containing the transaction status information
 */
export const getTransactionStatusTool = {
  name: "getTransactionStatus",
  description: "Checks the status and confirmation of a Solana transaction by its signature",
  
  parameters: {
    type: "object",
    properties: {
      signature: {
        type: "string",
        description: "Transaction signature to check",
      },
      cluster: {
        type: "string",
        description: "The Solana cluster to connect to (mainnet, testnet, devnet, localnet, or custom name)",
        default: "mainnet",
      },
      includeDetails: {
        type: "boolean",
        description: "Whether to include detailed transaction information if available",
        default: false,
      },
      commitment: {
        type: "string",
        enum: ["processed", "confirmed", "finalized"],
        description: "Commitment level to check against",
        default: "finalized",
      },
      checkPending: {
        type: "boolean",
        description: "Whether to check if transaction is still pending if not found",
        default: true,
      },
    },
    required: ["signature"],
    additionalProperties: false,
  },
  
  execute: async (
    params: GetTransactionStatusParams, 
    connectionManager: ConnectionManager
  ): Promise<TransactionStatusResult> => {
    const { 
      signature, 
      cluster = "mainnet", 
      includeDetails = false, 
      commitment = "finalized", 
      checkPending = true 
    } = params;
    
    logger.info("Checking transaction status", { 
      signature, 
      cluster, 
      commitment, 
      includeDetails, 
      checkPending 
    });
    
    return tryCatch(async () => {
      // Validate signature format
      if (!signature || !/^[0-9a-zA-Z]{87,88}$/.test(signature)) {
        throw new TransactionErrorType(
          "Invalid transaction signature format", 
          signature, 
          { code: ErrorCode.VALIDATION_FAILED }
        );
      }
      
      // Get connection from the connection manager
      const connection: Connection = connectionManager.getConnection(cluster);
      
      // Initialize the result object
      const result: TransactionStatusResult = {
        signature,
        status: "not_found"
      };
      
      try {
        // First check the signature status
        const signatureStatuses = await connection.getSignatureStatuses([signature]);
        const signatureStatus = signatureStatuses?.value[0];
        
        if (signatureStatus) {
          // Transaction found in status lookup
          result.confirmationStatus = signatureStatus.confirmationStatus;
          result.slot = signatureStatus.slot;
          
          // Determine the high-level status
          if (signatureStatus.err) {
            result.status = "failed";
            result.error = {
              message: "Transaction failed"
            };
            
            // Parse error details if available
            if (typeof signatureStatus.err === "object") {
              const error = signatureStatus.err as TransactionError;
              parseTransactionError(error, result);
            } else {
              result.error.message = `Transaction failed: ${signatureStatus.err}`;
            }
          } else if (signatureStatus.confirmationStatus === "finalized") {
            result.status = "finalized";
          } else if (signatureStatus.confirmationStatus === "confirmed") {
            result.status = "confirmed";
          } else {
            result.status = "processed";
          }
          
          // If details are requested or we need to parse errors further, get full transaction info
          if (includeDetails || result.status === "failed") {
            await fetchTransactionDetails(connection, signature, result);
          }
        } else if (checkPending) {
          // Check if the transaction is pending (in the mempool but not yet processed)
          try {
            // Try to get pending transaction to see if it's in the mempool
            const pendingTxs = await connection.getParsedTransactions([signature], {
              maxSupportedTransactionVersion: 0,
              commitment: "processed"
            });
            
            if (pendingTxs[0]) {
              result.status = "pending";
            }
          } catch (error) {
            // If error, transaction may not exist or RPC doesn't support pending lookups
            logger.debug("Failed to check for pending transaction", error);
          }
        }
        
        logger.info("Transaction status check completed", { 
          signature, 
          status: result.status, 
          confirmationStatus: result.confirmationStatus, 
          hasError: !!result.error
        });
        
        return result;
      } catch (error) {
        // Special handling for "not found" vs. other errors
        if (error instanceof Error && 
            error.message.includes("not found") || 
            error.message.includes("could not find")) {
          // This is expected for transactions that don't exist
          logger.debug("Transaction not found", { signature });
          return result;
        }
        
        // For other errors, rethrow so they're handled by the tryCatch wrapper
        throw error;
      }
    }, 
    (error) => new TransactionErrorType(
      `Failed to check transaction status: ${error.message}`, 
      signature, 
      { cause: error }
    ));
  }
};

/**
 * Fetches detailed transaction information and updates the result object
 * 
 * @param connection - Solana connection object
 * @param signature - Transaction signature
 * @param result - Result object to update
 */
async function fetchTransactionDetails(
  connection: Connection, 
  signature: string, 
  result: TransactionStatusResult
): Promise<void> {
  try {
    // Get the full transaction data
    const transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });
    
    if (!transaction) {
      return;
    }
    
    // Add timestamp if available
    if (transaction.blockTime) {
      result.timestamp = transaction.blockTime;
    }
    
    // If we have a failed transaction with a returned error, parse it
    if (result.status === "failed" && transaction.meta?.err) {
      parseTransactionError(transaction.meta.err, result);
    }
    
    // Add detailed information if requested
    if (result.details || !result.details) {
      result.details = {
        fee: transaction.meta?.fee,
        accounts: transaction.transaction.message.accountKeys.map(key => 
          typeof key === 'string' ? key : key.toString()
        ),
        instructionCount: transaction.transaction.message.instructions.length,
        recentBlockhash: transaction.transaction.message.recentBlockhash,
        logs: transaction.meta?.logMessages,
      };
      
      // Check if the transaction includes compute budget instructions
      result.details.hasComputeBudget = transaction.transaction.message.instructions.some(ix => {
        const programId = 
          typeof ix.programId === 'string' ? 
          ix.programId : 
          ix.programId.toString();
          
        return programId === 'ComputeBudget111111111111111111111111111111';
      });
    }
  } catch (error) {
    logger.warn("Failed to fetch transaction details", { signature, error });
    // Don't throw, just continue without details
  }
}

/**
 * Parses a Solana transaction error and adds details to the result object
 * 
 * @param error - Solana transaction error
 * @param result - Result object to update
 */
function parseTransactionError(
  error: TransactionError, 
  result: TransactionStatusResult
): void {
  if (!result.error) {
    result.error = { message: "Transaction failed" };
  }
  
  if (error === null) {
    return;
  }
  
  // Parse InstructionError
  if ('InstructionError' in error) {
    const [instructionIndex, instructionError] = error.InstructionError;
    result.error.instructionIndex = instructionIndex;
    
    if (typeof instructionError === 'string') {
      result.error.message = `Instruction ${instructionIndex} failed: ${instructionError}`;
    } else if (instructionError && typeof instructionError === 'object') {
      let errorCode: string | null = null;
      let customError: number | null = null;
      
      // Extract error code from the error object
      for (const [key, value] of Object.entries(instructionError)) {
        if (key === 'Custom' && typeof value === 'number') {
          customError = value;
        } else {
          errorCode = key;
        }
      }
      
      // Set appropriate error message
      if (customError !== null) {
        result.error.message = `Instruction ${instructionIndex} failed with custom program error: ${customError}`;
        result.error.code = customError;
        result.error.details = { customProgramError: customError };
      } else if (errorCode) {
        result.error.message = `Instruction ${instructionIndex} failed: ${errorCode}`;
        result.error.details = { errorCode };
      }
    }
  } else {
    // Handle other error types
    const errorString = JSON.stringify(error);
    result.error.message = `Transaction failed: ${errorString}`;
    result.error.details = error;
  }
}