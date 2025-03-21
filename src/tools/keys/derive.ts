/**
 * Derive Keypair Tool
 * 
 * This tool derives Solana keypairs deterministically using various methods.
 * It supports derivation from seed bytes/strings and parent keypairs.
 * 
 * Note: Full BIP39/BIP44 derivation would require additional dependencies
 * not currently included in the project (bip39, ed25519-hd-key, etc.).
 */

import { Keypair } from '@solana/web3.js';
import { getLogger } from '../../utils/logging.js';
import { PublicKeyError, ValidationError, tryCatch } from '../../utils/errors.js';
import { z } from 'zod';

// Get logger for this module
const logger = getLogger('derive-keypair-tool');

// Define output formats
export enum KeypairFormat {
  DEFAULT = 'default',
  BASE58 = 'base58',
  HEX = 'hex',
  JSON = 'json',
}

// Define derivation methods
export enum DerivationMethod {
  SEED = 'seed',
  PARENT = 'parent', 
}

// Define validation schema for input parameters
const deriveKeypairSchema = z.object({
  // Derivation method
  method: z.nativeEnum(DerivationMethod).default(DerivationMethod.SEED),
  
  // Seed for derivation (required for SEED method)
  seed: z.string().min(1).optional(),
  
  // Index for derivation path (optional, defaults to 0)
  index: z.number().int().min(0).optional().default(0),
  
  // Parent keypair (required for PARENT method)
  parentSecretKey: z.union([
    z.array(z.number()).length(64),
    z.string().min(64)
  ]).optional(),
  
  // Output format options
  format: z.nativeEnum(KeypairFormat).optional().default(KeypairFormat.DEFAULT),
  includePrivateKey: z.boolean().optional().default(true),
  exportable: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  // Validate required parameters based on method
  if (data.method === DerivationMethod.SEED && !data.seed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Seed is required when using the 'seed' derivation method",
      path: ['seed'],
    });
  }
  
  if (data.method === DerivationMethod.PARENT && !data.parentSecretKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Parent secret key is required when using the 'parent' derivation method",
      path: ['parentSecretKey'],
    });
  }
});

// Type for the tool parameters
type DeriveKeypairParams = z.infer<typeof deriveKeypairSchema>;

// Type for the tool response
export interface DeriveKeypairResult {
  publicKey: string;
  privateKey?: string;
  serialized?: string;
  derivationPath?: string;
}

/**
 * Derives a Solana keypair deterministically using various methods
 * 
 * @param params - Parameters for deriving the keypair
 * @returns Object containing the derived keypair information
 */
async function executeDeriveKeypair(params: DeriveKeypairParams): Promise<DeriveKeypairResult> {
  logger.info('Deriving Solana keypair', { 
    method: params.method,
    hasSeed: !!params.seed,
    hasParentKey: !!params.parentSecretKey,
    index: params.index,
    format: params.format,
  });
  
  try {
    // Validate input parameters
    const validatedParams = deriveKeypairSchema.parse(params);
    
    // Derive the keypair using the specified method
    return tryCatch(async () => {
      let keypair: Keypair;
      let derivationPath: string | undefined;
      
      switch (validatedParams.method) {
        case DerivationMethod.SEED: {
          if (!validatedParams.seed) {
            throw new ValidationError('Seed is required for seed derivation method');
          }
          
          // Create a seed string that incorporates the index
          const indexedSeed = `${validatedParams.seed}:${validatedParams.index || 0}`;
          
          // Hash the seed string to create deterministic bytes
          const encoder = new TextEncoder();
          const seedData = encoder.encode(indexedSeed);
          const hashBuffer = await crypto.subtle.digest('SHA-256', seedData);
          const seedBytes = new Uint8Array(hashBuffer);
          
          // Create keypair from seed bytes
          keypair = Keypair.fromSeed(seedBytes);
          derivationPath = `seed/${validatedParams.index || 0}`;
          logger.debug('Derived keypair from seed', { index: validatedParams.index });
          break;
        }
        
        case DerivationMethod.PARENT: {
          if (!validatedParams.parentSecretKey) {
            throw new ValidationError('Parent secret key is required for parent derivation method');
          }
          
          // Parse parent keypair
          let parentKeypair: Keypair;
          if (Array.isArray(validatedParams.parentSecretKey)) {
            parentKeypair = Keypair.fromSecretKey(Uint8Array.from(validatedParams.parentSecretKey));
          } else {
            // Try to parse as hex
            if (validatedParams.parentSecretKey.match(/^[0-9a-fA-F]+$/)) {
              const secretKeyBytes = Buffer.from(validatedParams.parentSecretKey, 'hex');
              parentKeypair = Keypair.fromSecretKey(secretKeyBytes);
            } else {
              // Try to parse as comma-separated values
              try {
                const values = validatedParams.parentSecretKey.split(',').map(s => parseInt(s.trim(), 10));
                parentKeypair = Keypair.fromSecretKey(Uint8Array.from(values));
              } catch (err) {
                throw new ValidationError('Invalid parent secret key format', undefined, { cause: err });
              }
            }
          }
          
          // Create a deterministic seed combining parent public key and index
          const seedBase = `${parentKeypair.publicKey.toString()}:${validatedParams.index || 0}`;
          const encoder = new TextEncoder();
          const seedData = encoder.encode(seedBase);
          const hashBuffer = await crypto.subtle.digest('SHA-256', seedData);
          const derivedSeedBytes = new Uint8Array(hashBuffer);
          
          // Create keypair from derived seed
          keypair = Keypair.fromSeed(derivedSeedBytes);
          derivationPath = `${parentKeypair.publicKey.toString().slice(0, 8)}.../${validatedParams.index || 0}`;
          logger.debug('Derived child keypair from parent', { 
            parentPublicKey: parentKeypair.publicKey.toString(),
            index: validatedParams.index,
          });
          break;
        }
          
        default:
          throw new ValidationError(`Unsupported derivation method: ${validatedParams.method}`);
      }
      
      // Format the result according to requested format
      const result: DeriveKeypairResult = {
        publicKey: keypair.publicKey.toString(),
        derivationPath,
      };
      
      // Include private key if requested
      if (validatedParams.includePrivateKey) {
        switch (validatedParams.format) {
          case KeypairFormat.BASE58:
            // For base58, we'd need the bs58 package, so fallback to hex
            // result.privateKey = bs58.encode(keypair.secretKey);
            result.privateKey = Buffer.from(keypair.secretKey).toString('hex');
            logger.warn('Base58 encoding not available without bs58 package, using hex instead');
            break;
            
          case KeypairFormat.HEX:
            result.privateKey = Buffer.from(keypair.secretKey).toString('hex');
            break;
            
          case KeypairFormat.JSON:
            // Return the private key as a JSON-compatible array
            result.privateKey = JSON.stringify(Array.from(keypair.secretKey));
            break;
            
          case KeypairFormat.DEFAULT:
          default:
            // For default, use hex encoding
            result.privateKey = Buffer.from(keypair.secretKey).toString('hex');
            break;
        }
      }
      
      // Add exportable format if requested
      if (validatedParams.exportable) {
        try {
          // Standard Solana CLI format is a JSON array of bytes
          result.serialized = JSON.stringify(Array.from(keypair.secretKey));
        } catch (error) {
          logger.error('Failed to serialize keypair', error);
          throw new PublicKeyError('Failed to serialize keypair', { cause: error });
        }
      }
      
      logger.info('Successfully derived keypair', { 
        publicKey: result.publicKey,
        hasPrivateKey: !!result.privateKey,
        derivationPath: result.derivationPath,
      });
      
      return result;
    }, (error) => new PublicKeyError(
      `Failed to derive keypair: ${error.message}`, 
      { cause: error }
    ));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid parameters for deriving keypair', undefined, {
        cause: error,
        details: error.errors,
      });
    }
    throw error;
  }
}

// Define the MCP tool
export const deriveKeypairTool = {
  name: 'deriveKeypair',
  description: 'Derives a Solana keypair deterministically using various methods',
  execute: executeDeriveKeypair,
  parameters: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        enum: Object.values(DerivationMethod),
        description: 'Derivation method to use',
        default: DerivationMethod.SEED,
      },
      seed: {
        type: 'string',
        description: 'Seed string to derive keypair from (required for seed method)',
      },
      parentSecretKey: {
        oneOf: [
          { type: 'array', items: { type: 'integer' }, minItems: 64, maxItems: 64 },
          { type: 'string', description: 'Parent secret key as hex string or comma-separated bytes' },
        ],
        description: 'Parent keypair secret key to derive child keypair from (required for parent method)',
      },
      index: {
        type: 'integer',
        minimum: 0,
        description: 'Index for derivation path (defaults to 0)',
        default: 0,
      },
      format: {
        type: 'string',
        enum: Object.values(KeypairFormat),
        description: 'Output format for the keypair',
        default: KeypairFormat.DEFAULT,
      },
      includePrivateKey: {
        type: 'boolean',
        description: 'Whether to include the private key in the response',
        default: true,
      },
      exportable: {
        type: 'boolean',
        description: 'Whether to return a serialized form of the keypair',
        default: false,
      },
    },
    additionalProperties: false,
    required: ['method'],
  },
};
