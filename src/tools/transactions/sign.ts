/**
 * Transaction Signing Tool
 * 
 * This tool allows signing a Solana transaction with one or more keypairs.
 * It supports both legacy and versioned transactions, and provides a detailed
 * report about the signing status of each required signer.
 */

import { 
  Transaction, 
  VersionedTransaction, 
  TransactionMessage,
  Message,
  PublicKey, 
  Keypair,
  VersionedMessage
} from '@solana/web3.js';
import { getLogger } from '../../utils/logging.js';
import { ValidationError, PublicKeyError, TransactionError, tryCatchSync } from '../../utils/errors.js';
import { z } from 'zod';

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
type SignTransactionParams = z.infer<typeof signTransactionSchema>;

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
 * Signs a transaction with the provided keypairs
 * 
 * @param params - Tool parameters
 * @returns Object containing signing status and the signed transaction
 */
export const signTransactionTool = {
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
  
  execute: (params: SignTransactionParams): SignTransactionResult => {
    logger.info('Signing transaction', {
      signerCount: params.signers.length,
      returnSignedTransaction: params.returnSignedTransaction,
    });
    
    return tryCatchSync(() => {
      // Validate input parameters
      const validatedParams = signTransactionSchema.parse(params);
      
      // Deserialize the transaction
      const transactionBuffer = Buffer.from(validatedParams.transaction, 'base64');
      let transaction: Transaction | VersionedTransaction;
      let isVersioned = false;
      
      try {
        // First try as versioned transaction
        transaction = VersionedTransaction.deserialize(transactionBuffer);
        isVersioned = true;
      } catch (error) {
        // If that fails, try as legacy transaction
        try {
          transaction = Transaction.from(transactionBuffer);
        } catch (innerError) {
          logger.error('Failed to deserialize transaction', {
            originalError: error,
            legacyError: innerError,
          });
          
          throw new ValidationError(
            'Invalid transaction format. Could not deserialize as either versioned or legacy transaction.',
            'transaction',
            { cause: innerError }
          );
        }
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
      
      // Track signatures added in this operation
      const addedSignatures: string[] = [];
      
      // Get information about required signers
      const signingStatus = isVersioned
        ? getVersionedTransactionSigningStatus(transaction as VersionedTransaction, keypairs, addedSignatures)
        : getLegacyTransactionSigningStatus(transaction as Transaction, keypairs, addedSignatures);
      
      // Create result
      const result: SignTransactionResult = {
        signatures: addedSignatures,
        signingStatus,
      };
      
      // Include signed transaction if requested
      if (validatedParams.returnSignedTransaction) {
        const serializedTransaction = isVersioned
          ? (transaction as VersionedTransaction).serialize()
          : (transaction as Transaction).serialize();
          
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
  }
};

/**
 * Converts various signer input formats to a Keypair object
 * 
 * @param signer - The signer in various formats (array, object, or string)
 * @returns A Solana Keypair object
 */
function convertToKeypair(signer: any): Keypair {
  if (Array.isArray(signer)) {
    // Array of numbers (secretKey)
    return Keypair.fromSecretKey(Uint8Array.from(signer));
  }
  
  if (typeof signer === 'object' && signer.secretKey) {
    // Object with secretKey property
    if (Array.isArray(signer.secretKey)) {
      return Keypair.fromSecretKey(Uint8Array.from(signer.secretKey));
    }
    
    if (typeof signer.secretKey === 'string') {
      // Try to parse as hex string
      return Keypair.fromSecretKey(Uint8Array.from(
        Buffer.from(signer.secretKey, 'hex')
      ));
    }
  }
  
  if (typeof signer === 'string') {
    // Hex string
    return Keypair.fromSecretKey(Uint8Array.from(
      Buffer.from(signer, 'hex')
    ));
  }
  
  throw new ValidationError(
    'Invalid signer format. Must be an array of numbers, a hex string, or an object with secretKey.',
    'signers'
  );
}

/**
 * Gets the signing status for a legacy transaction
 * 
 * @param transaction - The legacy transaction
 * @param keypairs - Array of keypairs to sign with
 * @param addedSignatures - Array to collect added signatures
 * @returns Signing status object
 */
function getLegacyTransactionSigningStatus(
  transaction: Transaction,
  keypairs: Keypair[],
  addedSignatures: string[]
): SignTransactionResult['signingStatus'] {
  // Get the message to determine required signers
  const message = transaction.compileMessage();
  const requiredSignerKeys = message.accountKeys
    .filter((_, index) => message.isAccountSigner(index));
  
  // Track already signed keys
  const alreadySignedKeys = new Set<string>();
  const signerKeyToIndex = new Map<string, number>();
  
  // Map requiredSignerKeys public keys to their indices in the accountKeys array
  for (let i = 0; i < message.accountKeys.length; i++) {
    if (message.isAccountSigner(i)) {
      const pubkey = message.accountKeys[i].toString();
      signerKeyToIndex.set(pubkey, i);
    }
  }
  
  // Check for existing signatures
  if (transaction.signatures && transaction.signatures.length > 0) {
    transaction.signatures.forEach((signatureInfo, index) => {
      if (signatureInfo.signature) {
        const pubkey = signatureInfo.publicKey.toString();
        alreadySignedKeys.add(pubkey);
      }
    });
  }
  
  // Apply new signatures
  for (const keypair of keypairs) {
    const publicKey = keypair.publicKey.toString();
    const signerIndex = signerKeyToIndex.get(publicKey);
    
    // Only sign if this keypair corresponds to a required signer and isn't already signed
    if (signerIndex !== undefined && !alreadySignedKeys.has(publicKey)) {
      transaction.partialSign(keypair);
      addedSignatures.push(publicKey);
      alreadySignedKeys.add(publicKey);
    }
  }
  
  // Identify remaining signers
  const remainingSigners = requiredSignerKeys
    .filter(key => !alreadySignedKeys.has(key.toString()))
    .map(key => key.toString());
  
  return {
    totalRequired: requiredSignerKeys.length,
    added: addedSignatures.length,
    alreadySigned: alreadySignedKeys.size - addedSignatures.length,
    isFullySigned: remainingSigners.length === 0,
    remainingSigners: remainingSigners.length > 0 ? remainingSigners : undefined,
  };
}

/**
 * Gets the signing status for a versioned transaction
 * 
 * @param transaction - The versioned transaction
 * @param keypairs - Array of keypairs to sign with
 * @param addedSignatures - Array to collect added signatures
 * @returns Signing status object
 */
function getVersionedTransactionSigningStatus(
  transaction: VersionedTransaction,
  keypairs: Keypair[],
  addedSignatures: string[]
): SignTransactionResult['signingStatus'] {
  const message = transaction.message;
  
  // Get all required signers from the message
  const requiredSigners = getSignersFromVersionedMessage(message);
  
  // Track already signed keys (map public key string to its index in requiredSigners)
  const alreadySignedKeys = new Set<string>();
  const signerKeyToIndex = new Map<string, number>();
  
  // Map requiredSigners public keys to their indices
  requiredSigners.forEach((pubkey, index) => {
    signerKeyToIndex.set(pubkey.toString(), index);
  });
  
  // Check existing signatures
  if (transaction.signatures && transaction.signatures.length > 0) {
    for (let i = 0; i < Math.min(transaction.signatures.length, requiredSigners.length); i++) {
      const signature = transaction.signatures[i];
      if (signature && signature.every(byte => byte !== 0)) {
        const pubkey = requiredSigners[i].toString();
        alreadySignedKeys.add(pubkey);
      }
    }
  }
  
  // Apply new signatures
  for (const keypair of keypairs) {
    const publicKey = keypair.publicKey.toString();
    const signerIndex = signerKeyToIndex.get(publicKey);
    
    if (signerIndex !== undefined && !alreadySignedKeys.has(publicKey)) {
      // For versioned transactions, we need to add the signature at the correct index
      transaction.signatures = transaction.signatures || [];
      while (transaction.signatures.length <= signerIndex) {
        transaction.signatures.push(null);
      }
      
      // Sign the message with this keypair
      const messageData = message.serialize();
      const signature = keypair.sign(messageData).signature;
      transaction.signatures[signerIndex] = signature;
      
      // Track this signature
      addedSignatures.push(publicKey);
      alreadySignedKeys.add(publicKey);
    }
  }
  
  // Identify remaining signers
  const remainingSigners = requiredSigners
    .filter(key => !alreadySignedKeys.has(key.toString()))
    .map(key => key.toString());
  
  return {
    totalRequired: requiredSigners.length,
    added: addedSignatures.length,
    alreadySigned: alreadySignedKeys.size - addedSignatures.length,
    isFullySigned: remainingSigners.length === 0,
    remainingSigners: remainingSigners.length > 0 ? remainingSigners : undefined,
  };
}

/**
 * Gets all signers required by a versioned message
 * 
 * @param message - The versioned message
 * @returns Array of public keys for required signers
 */
function getSignersFromVersionedMessage(message: VersionedMessage): PublicKey[] {
  if ('version' in message && message.version === 0) {
    // This is a v0 message
    const staticAccountKeys = message.staticAccountKeys;
    const numRequiredSignatures = message.header.numRequiredSignatures;
    
    // Return the first numRequiredSignatures keys as signers
    return staticAccountKeys.slice(0, numRequiredSignatures);
  }
  
  throw new ValidationError(
    'Unsupported message version. Only version 0 messages are supported.',
    'transaction'
  );
}
