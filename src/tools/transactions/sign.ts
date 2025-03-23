/**
 * Transaction Signing Tool
 * 
 * This tool allows signing a Solana transaction with one or more keypairs.
 * It supports both legacy and versioned transactions, and provides a detailed
 * report about the signing status of each required signer.
 */

import { 
  signTransactionWithSigners, 
  importKeyPair,
  getTransactionMessage,
  getTransactionSigners,
  deserializeTransaction
} from '@solana/web3.js';

import type { 
  Address, 
  KeyPair, 
  Transaction
} from '@solana/web3.js';

import { getLogger } from '../../utils/logging.js';
import { ValidationError, PublicKeyError, TransactionError, tryCatchSync } from '../../utils/errors.js';
import { z } from 'zod';
import { ServerDependencies } from '../../solana-server.js';

// Logger for this module
const logger = getLogger('sign-transaction-tool');

// Define the tool parameters validation schema
const signTransactionSchema = z.object({
  // Transaction to sign, as a serialized base64 string
  transaction: z.string().min(10),
  
  // Array of keypairs to sign with
  signers: z.array(z.union([
    // Keypair as an array of numbers (full secret key)
    z.array(z.number().int().min(0).max(255)).length(64),
    
    // Keypair as a JSON object with secretKey
    z.object({
      secretKey: z.union([
        z.array(z.number().int().min(0).max(255)).length(64),
        z.string().min(64),
      ]),
    }),
    
    // Keypair as a hex string
    z.string().regex(/^[0-9a-fA-F]{128}$/),
  ])).min(1),
  
  // Whether to return the signed transaction in the same format
  returnSignedTransaction: z.boolean().default(true),
});

// Type for the tool parameters
export type SignTransactionParams = z.infer<typeof signTransactionSchema>;

// Type for the tool response
export interface SignTransactionResult {
  // The signed transaction (serialized as base64)
  signedTransaction?: string;
  
  // Array of signatures that were added
  signatures: string[];
  
  // Information about the signing status
  signingStatus: {
    // Total number of signatures required by the transaction
    totalRequired: number;
    
    // Number of signatures added in this operation
    added: number;
    
    // Number of signatures already present before this operation
    alreadySigned: number;
    
    // Whether all required signatures are now present
    isFullySigned: boolean;
    
    // Public keys that still need to sign (if not fully signed)
    remainingSigners?: string[];
  };
}

/**
 * Creates a function to execute the sign transaction operation
 * 
 * @param deps - Server dependencies
 * @returns Execute function for signing transactions
 */
export function createSignTransactionExecutor(deps: ServerDependencies) {
  return (params: SignTransactionParams): SignTransactionResult => {
    logger.info('Signing transaction', {
      signerCount: params.signers.length,
      returnSignedTransaction: params.returnSignedTransaction,
    });
    
    return tryCatchSync(() => {
      // Validate input parameters
      const validatedParams = signTransactionSchema.parse(params);
      
      // Deserialize the transaction
      const transactionBuffer = Buffer.from(validatedParams.transaction, 'base64');
      let transaction: Transaction;
      
      try {
        transaction = deserializeTransaction(transactionBuffer);
      } catch (error) {
        logger.error('Failed to deserialize transaction', { error });
        throw new ValidationError(
          'Invalid transaction format. Could not deserialize transaction.',
          'transaction',
          { cause: error }
        );
      }
      
      // Convert signers to Keypair objects
      const keypairs = validatedParams.signers.map((signer, index) => {
        try {
          return convertToKeypair(signer);
        } catch (error) {
          logger.error(`Invalid signer at index ${index}`, error);
          throw new ValidationError(
            `Invalid signer at index ${index}: ${error instanceof Error ? error.message : String(error)}`,
            'signers',
            { cause: error }
          );
        }
      });
      
      // Get transaction message to analyze required signers
      const message = getTransactionMessage(transaction);
      
      // Get the required signers for the transaction
      const requiredSigners = getTransactionSigners(transaction);
      
      // Track signatures that already exist in the transaction
      const alreadySignedKeys = new Set<string>();
      const signerKeyToIndex = new Map<string, number>();
      
      // Map required signers to their public key strings for easy lookup
      requiredSigners.forEach((pubkey, index) => {
        const pubkeyStr = pubkey.toString();
        signerKeyToIndex.set(pubkeyStr, index);
      });
      
      // Check for existing signatures (ones that are not null or all zeros)
      const existingSignatures = transaction.signatures || [];
      existingSignatures.forEach((sig, index) => {
        // If signature is not null and not all zeros, consider it already signed
        if (sig && !sig.every(byte => byte === 0)) {
          // Get the corresponding public key for this signature index
          if (index < requiredSigners.length) {
            const pubkeyStr = requiredSigners[index].toString();
            alreadySignedKeys.add(pubkeyStr);
          }
        }
      });
      
      // Track signatures added in this operation
      const addedSignatures: string[] = [];
      
      // Filter keypairs to only include those needed for this transaction
      const relevantKeypairs = keypairs.filter(keypair => {
        const pubkeyStr = keypair.publicKey.toString();
        return signerKeyToIndex.has(pubkeyStr) && !alreadySignedKeys.has(pubkeyStr);
      });
      
      // If we have any relevant keypairs, sign the transaction
      if (relevantKeypairs.length > 0) {
        // Use the new signTransactionWithSigners function to sign
        transaction = signTransactionWithSigners(transaction, relevantKeypairs);
        
        // Track which signatures were added
        relevantKeypairs.forEach(keypair => {
          const pubkeyStr = keypair.publicKey.toString();
          addedSignatures.push(pubkeyStr);
          alreadySignedKeys.add(pubkeyStr);
        });
      }
      
      // Identify remaining signers
      const remainingSigners = requiredSigners
        .filter(pubkey => !alreadySignedKeys.has(pubkey.toString()))
        .map(pubkey => pubkey.toString());
      
      // Create the signing status response
      const signingStatus = {
        totalRequired: requiredSigners.length,
        added: addedSignatures.length,
        alreadySigned: alreadySignedKeys.size - addedSignatures.length,
        isFullySigned: remainingSigners.length === 0,
        remainingSigners: remainingSigners.length > 0 ? remainingSigners : undefined,
      };
      
      // Create result
      const result: SignTransactionResult = {
        signatures: addedSignatures,
        signingStatus,
      };
      
      // Include signed transaction if requested
      if (validatedParams.returnSignedTransaction) {
        const serializedTransaction = transaction.serialize();
        result.signedTransaction = Buffer.from(serializedTransaction).toString('base64');
      }
      
      logger.info('Transaction signing completed', {
        signaturesAdded: addedSignatures.length,
        isFullySigned: signingStatus.isFullySigned,
        remainingSigners: signingStatus.remainingSigners?.length || 0,
      });
      
      return result;
    }, 
    (error) => {
      // Handle specific error types
      if (error instanceof z.ZodError) {
        return new ValidationError(
          'Invalid parameters for signing transaction',
          undefined,
          { cause: error, details: error.format() }
        );
      }
      
      if (error instanceof ValidationError || error instanceof PublicKeyError) {
        return error;
      }
      
      return new TransactionError(
        `Failed to sign transaction: ${error.message}`,
        undefined,
        { cause: error }
      );
    });
  };
}

/**
 * Get the sign transaction tool definition
 * 
 * @param deps - Server dependencies
 * @returns Sign transaction tool definition
 */
export function getSignTransactionTool(deps: ServerDependencies) {
  return {
    name: 'signTransaction',
    description: 'Signs a Solana transaction with one or more keypairs',
    
    parameters: {
      type: 'object',
      properties: {
        transaction: {
          type: 'string',
          description: 'Base64-encoded serialized transaction to sign',
        },
        signers: {
          type: 'array',
          description: 'Array of keypairs to sign with',
          items: {
            oneOf: [
              {
                type: 'array',
                description: 'Secret key as array of 64 bytes',
                items: {
                  type: 'number',
                },
              },
              {
                type: 'object',
                description: 'Keypair object with secretKey property',
                properties: {
                  secretKey: {
                    oneOf: [
                      {
                        type: 'array',
                        items: {
                          type: 'number',
                        },
                      },
                      {
                        type: 'string',
                        description: 'Secret key as hex string',
                      },
                    ],
                  },
                },
                required: ['secretKey'],
              },
              {
                type: 'string',
                description: 'Secret key as hex string',
              },
            ],
          },
        },
        returnSignedTransaction: {
          type: 'boolean',
          description: 'Whether to return the signed transaction in the response',
          default: true,
        },
      },
      required: ['transaction', 'signers'],
      additionalProperties: false,
    },
    
    execute: createSignTransactionExecutor(deps)
  };
}

/**
 * Converts various signer input formats to a Keypair object
 * 
 * @param signer - The signer in various formats (array, object, or string)
 * @returns A Solana Keypair object
 */
function convertToKeypair(signer: any): KeyPair {
  if (Array.isArray(signer)) {
    // Array of numbers (secretKey)
    return importKeyPair(Uint8Array.from(signer));
  }
  
  if (typeof signer === 'object' && signer.secretKey) {
    // Object with secretKey property
    if (Array.isArray(signer.secretKey)) {
      return importKeyPair(Uint8Array.from(signer.secretKey));
    }
    
    if (typeof signer.secretKey === 'string') {
      // Try to parse as hex string
      return importKeyPair(Uint8Array.from(
        Buffer.from(signer.secretKey, 'hex')
      ));
    }
  }
  
  if (typeof signer === 'string') {
    // Hex string
    return importKeyPair(Uint8Array.from(
      Buffer.from(signer, 'hex')
    ));
  }
  
  throw new ValidationError(
    'Invalid signer format. Must be an array of numbers, a hex string, or an object with secretKey.',
    'signers'
  );
}