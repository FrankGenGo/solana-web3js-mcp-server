/**
 * Keypair Import Tool
 * 
 * This tool allows importing an existing Solana keypair from various formats:
 * - Secret key as array of bytes
 * - Secret key as hex encoded string
 * - JSON keypair file format (compatible with Solana CLI)
 * 
 * Note: For base58 encoded keys or mnemonic phrases, additional dependencies
 * would be required (bs58 and bip39 packages respectively).
 */

import { importKeyPair } from '@solana/web3.js';
import type { KeyPair } from '@solana/web3.js';
import { getLogger } from '../../utils/logging.js';
import { PublicKeyError, ValidationError, tryCatchSync } from '../../utils/errors.js';
import { z } from 'zod';

// Get logger for this module
const logger = getLogger('import-keypair-tool');

// Define validation schema for input parameters
const importKeypairSchema = z.object({
  // At least one of these must be provided
  secretKey: z.union([
    z.array(z.number()).min(64).max(64),
    z.string().min(64),
  ]).optional(),
  json: z.string().min(10).optional(),
  
  // Output format options
  format: z.enum(['hex', 'json']).optional().default('json'),
  includePublicKey: z.boolean().optional().default(true),
}).refine((data) => {
  // At least one import method must be provided
  return Boolean(data.secretKey || data.json);
}, {
  message: 'At least one of secretKey or json must be provided',
  path: ['secretKey'],
});

// Type for the tool parameters
type ImportKeypairParams = z.infer<typeof importKeypairSchema>;

/**
 * Imports a Solana keypair from various formats and returns it
 * 
 * @param {ImportKeypairParams} params - Parameters for importing the keypair
 * @returns The imported keypair in the requested format
 */
function executeImportKeypair(params: ImportKeypairParams) {
  logger.info('Importing Solana keypair');
  
  try {
    // Validate input parameters
    const validatedParams = importKeypairSchema.parse(params);
    
    // Import keypair from the provided format
    const keypair = tryCatchSync(() => {
      if (validatedParams.secretKey) {
        // Import from secret key (either array or string)
        if (Array.isArray(validatedParams.secretKey)) {
          // If array of numbers, convert to Uint8Array
          return importKeyPair(Uint8Array.from(validatedParams.secretKey));
        } else {
          // If string, try to parse as comma-separated numbers or hex
          try {
            // First try as comma-separated numbers
            if (validatedParams.secretKey.includes(',')) {
              const secretKeyArray = validatedParams.secretKey
                .split(',')
                .map(s => parseInt(s.trim(), 10));
              return importKeyPair(Uint8Array.from(secretKeyArray));
            } 
            // Try as hex string
            else if (validatedParams.secretKey.match(/^[0-9a-fA-F]+$/)) {
              const secretKeyBytes = Buffer.from(validatedParams.secretKey, 'hex');
              return importKeyPair(secretKeyBytes);
            }
            else {
              throw new ValidationError('Invalid secret key string format. Expected comma-separated numbers or hex string');
            }
          } catch (err) {
            throw new ValidationError('Failed to parse secret key string', undefined, { cause: err });
          }
        }
      } else if (validatedParams.json) {
        // Import from JSON format (compatible with Solana CLI)
        try {
          const keyData = JSON.parse(validatedParams.json);
          if (Array.isArray(keyData)) {
            // Array format
            return importKeyPair(Uint8Array.from(keyData));
          } else if (keyData && keyData.secretKey) {
            // Object format with secretKey property
            if (Array.isArray(keyData.secretKey)) {
              return importKeyPair(Uint8Array.from(keyData.secretKey));
            } else if (typeof keyData.secretKey === 'string') {
              try {
                // Try to parse as JSON array
                const parsedSecretKey = JSON.parse(keyData.secretKey);
                return importKeyPair(Uint8Array.from(parsedSecretKey));
              } catch {
                // Not JSON, try as hex string
                if (keyData.secretKey.match(/^[0-9a-fA-F]+$/)) {
                  const secretKeyBytes = Buffer.from(keyData.secretKey, 'hex');
                  return importKeyPair(secretKeyBytes);
                } else {
                  throw new ValidationError(
                    'Unable to parse secret key from JSON. Format not recognized.'
                  );
                }
              }
            } else {
              throw new ValidationError('Invalid secretKey format in JSON');
            }
          } else {
            throw new ValidationError('Invalid JSON keypair format');
          }
        } catch (err) {
          throw new ValidationError('Failed to parse JSON keypair', undefined, { cause: err });
        }
      } else {
        throw new ValidationError('No valid import method provided');
      }
    }, (err) => new PublicKeyError('Failed to import keypair', { cause: err }));
    
    // Format the keypair according to requested format
    const format = validatedParams.format || 'json';
    const includePublicKey = validatedParams.includePublicKey ?? true;
    
    const result: Record<string, any> = {};
    
    if (includePublicKey) {
      result.publicKey = keypair.publicKey.toString();
    }
    
    // Add the secret key in the requested format
    switch (format) {
      case 'hex':
        result.secretKey = Buffer.from(keypair.secretKey).toString('hex');
        break;
      case 'json':
      default:
        result.secretKey = Array.from(keypair.secretKey);
        break;
    }
    
    logger.info('Keypair imported successfully');
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid parameters for importing keypair', undefined, {
        cause: error,
        details: error.errors,
      });
    }
    throw error;
  }
}

// Define the MCP tool
export const importKeypairTool = {
  name: 'importKeypair',
  description: 'Imports an existing Solana keypair from various formats',
  execute: executeImportKeypair,
  parameters: {
    type: 'object',
    properties: {
      secretKey: {
        oneOf: [
          { type: 'array', items: { type: 'integer' }, minItems: 64, maxItems: 64 },
          { 
            type: 'string', 
            description: 'Secret key as comma-separated list of bytes or hex string' 
          }
        ],
        description: 'Secret key as array of numbers or string'
      },
      json: {
        type: 'string',
        description: 'JSON string containing keypair data (compatible with Solana CLI format)'
      },
      format: {
        type: 'string',
        enum: ['hex', 'json'],
        description: 'Output format for the secret key',
        default: 'json'
      },
      includePublicKey: {
        type: 'boolean',
        description: 'Whether to include the public key in the response',
        default: true
      }
    },
    additionalProperties: false
  }
};