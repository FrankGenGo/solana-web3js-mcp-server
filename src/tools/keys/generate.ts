/**
 * Generate Keypair Tool
 * 
 * This tool creates a new Solana keypair that can be used for signing transactions.
 * It provides options for different output formats (e.g., base58, hex) and can
 * optionally derive keypairs from seeds.
 */

import { Keypair } from "@solana/web3.js";
import { getLogger } from "../../utils/logging.js";
import { PublicKeyError, ValidationError, tryCatch } from "../../utils/errors.js";

// Logger for this module
const logger = getLogger("generate-keypair-tool");

// Output format options for the keypair
export enum KeypairFormat {
  DEFAULT = "default",
  BASE58 = "base58",
  HEX = "hex",
  JSON = "json",
}

// Tool parameter definition
export interface GenerateKeypairParams {
  // Whether to include the private key in the response (defaults to true)
  includePrivateKey?: boolean;
  
  // Output format for the keys (defaults to 'default')
  format?: KeypairFormat;
  
  // Optional seed for deterministic key generation
  seed?: string;
  
  // Whether to return a complete JSON serialization that can be saved to a file
  exportable?: boolean;
}

// Tool response type
export interface GenerateKeypairResult {
  // Public key as a string (always included)
  publicKey: string;
  
  // Private key as a string (only if includePrivateKey is true)
  privateKey?: string;
  
  // Serialized form of the keypair for storage/export (only if exportable is true)
  serialized?: string;
}

/**
 * Generates a new Solana keypair
 * 
 * This tool creates a cryptographically secure Solana keypair that can be
 * used for creating accounts, signing transactions, and other operations.
 * 
 * @param params - Tool parameters
 * @returns Object containing the generated keypair information
 */
export const generateKeypairTool = {
  name: "generateKeypair",
  description: "Generates a new Solana keypair for signing transactions and managing accounts",
  
  parameters: {
    type: "object",
    properties: {
      includePrivateKey: {
        type: "boolean",
        description: "Whether to include the private key in the response. Defaults to true.",
        default: true,
      },
      format: {
        type: "string",
        enum: Object.values(KeypairFormat),
        description: "Format to return the keys in. Defaults to 'default' which returns the public key in base58 format.",
        default: KeypairFormat.DEFAULT,
      },
      seed: {
        type: "string",
        description: "Optional seed for deterministic key generation. If provided, generates a keypair derived from this seed.",
      },
      exportable: {
        type: "boolean",
        description: "Whether to return a serialized form of the keypair that can be stored in a file. Defaults to false.",
        default: false,
      },
    },
    required: [],
    additionalProperties: false,
  },
  
  execute: async (params: GenerateKeypairParams): Promise<GenerateKeypairResult> => {
    logger.info("Generating new Solana keypair", { 
      includePrivateKey: params.includePrivateKey,
      format: params.format,
      hasSeed: !!params.seed,
      exportable: params.exportable,
    });
    
    // Use defaults if parameters are not provided
    const includePrivateKey = params.includePrivateKey !== false;
    const format = params.format || KeypairFormat.DEFAULT;
    const exportable = params.exportable || false;
    
    // Generate the keypair, handling any errors
    return tryCatch(async () => {
      // Create the keypair, either from a seed or randomly
      let keypair: Keypair;
      
      if (params.seed) {
        // Create a keypair from the provided seed
        try {
          // Convert seed to bytes (either directly or via UTF-8 encoding)
          let seedBytes: Uint8Array;
          
          if (/^[0-9a-fA-F]+$/.test(params.seed) && params.seed.length === 64) {
            // Seed is likely a hex string, convert to bytes
            seedBytes = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
              seedBytes[i] = parseInt(params.seed.substring(i * 2, i * 2 + 2), 16);
            }
          } else {
            // Use the seed string as input to generate a hash
            const encoder = new TextEncoder();
            const seedData = encoder.encode(params.seed);
            
            // Create a SHA-256 hash of the seed string
            const hashBuffer = await crypto.subtle.digest("SHA-256", seedData);
            seedBytes = new Uint8Array(hashBuffer);
          }
          
          keypair = Keypair.fromSeed(seedBytes);
          logger.debug("Generated keypair from seed");
        } catch (error) {
          logger.error("Failed to generate keypair from seed", error);
          throw new ValidationError(
            "Invalid seed format. Must be a valid string or 64-character hex string.",
            "seed",
            { cause: error }
          );
        }
      } else {
        // Generate a random keypair
        keypair = Keypair.generate();
        logger.debug("Generated random keypair");
      }
      
      // Prepare the result based on the requested format
      const result: GenerateKeypairResult = {
        publicKey: keypair.publicKey.toString(),
      };
      
      // Include private key if requested
      if (includePrivateKey) {
        switch (format) {
          case KeypairFormat.BASE58:
            // Get the Base58 encoded string of the secret key
            result.privateKey = Buffer.from(keypair.secretKey).toString("base58");
            break;
            
          case KeypairFormat.HEX:
            // Get the hex encoded string of the secret key
            result.privateKey = Buffer.from(keypair.secretKey).toString("hex");
            break;
            
          case KeypairFormat.JSON:
            // Return the private key as a JSON-compatible array
            result.privateKey = JSON.stringify(Array.from(keypair.secretKey));
            break;
            
          case KeypairFormat.DEFAULT:
          default:
            // For default, use Base58 for consistency with public key
            result.privateKey = Buffer.from(keypair.secretKey).toString("base58");
            break;
        }
      }
      
      // Add exportable format if requested
      if (exportable) {
        try {
          // Standard Solana CLI format is a JSON array of bytes
          result.serialized = JSON.stringify(Array.from(keypair.secretKey));
        } catch (error) {
          logger.error("Failed to serialize keypair", error);
          throw new PublicKeyError("Failed to serialize keypair", { cause: error });
        }
      }
      
      logger.info("Successfully generated keypair", { 
        publicKey: result.publicKey,
        hasPrivateKey: !!result.privateKey 
      });
      
      return result;
    }, 
    (error) => new PublicKeyError(
      `Failed to generate keypair: ${error.message}`, 
      { cause: error }
    ));
  }
};
