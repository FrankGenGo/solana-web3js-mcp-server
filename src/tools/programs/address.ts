/**
 * Program Address Tool
 * 
 * This tool implements functionality to generate Program Derived Addresses (PDAs).
 * It supports both createProgramAddress and findProgramAddress functions from
 * the Solana web3.js library.
 */

import { 
  createProgramAddress, 
  findProgramAddress,
  Address
} from "@solana/web3.js";
import { getLogger } from "../../utils/logging.js";
import { PublicKeyError, ValidationError, tryCatch } from "../../utils/errors.js";
import { z } from "zod";

// Logger for this module
const logger = getLogger("program-address-tool");

// Define seed types for PDAs
export enum SeedType {
  STRING = "string",
  BUFFER = "buffer",
  NUMBER = "number",
  PUBKEY = "pubkey",
}

// Define PDA function types
export enum PdaFunctionType {
  CREATE = "create", // For createProgramAddress
  FIND = "find",     // For findProgramAddress
}

// Define a schema for seed items
const seedItemSchema = z.union([
  z.object({
    type: z.literal(SeedType.STRING),
    value: z.string().max(32, "Seed string cannot exceed 32 bytes"),
  }),
  z.object({
    type: z.literal(SeedType.BUFFER),
    value: z.array(z.number().int().min(0).max(255)).max(32, "Seed buffer cannot exceed 32 bytes"),
  }),
  z.object({
    type: z.literal(SeedType.NUMBER),
    value: z.number().int(),
  }),
  z.object({
    type: z.literal(SeedType.PUBKEY),
    value: z.string().min(32).max(44),
  }),
]);

// Define the schema for generateProgramAddress parameters
const generateProgramAddressSchema = z.object({
  // Program ID that will own the PDA
  programId: z.string().min(32).max(44, "Invalid program ID format"),
  
  // Seeds array for PDA generation (limited to 16 seeds by Solana)
  seeds: z.array(seedItemSchema).max(16, "Maximum of 16 seeds allowed by Solana"),
  
  // Function type - create or find
  functionType: z.nativeEnum(PdaFunctionType).default(PdaFunctionType.FIND),
});

// Type for the tool parameters
type GenerateProgramAddressParams = z.infer<typeof generateProgramAddressSchema>;

// Type for the tool response
export interface GenerateProgramAddressResult {
  // The generated PDA as a base58 string
  address: string;
  
  // The bump seed used (only relevant for findProgramAddress)
  bumpSeed?: number;
  
  // Whether this is an on-curve address (should always be false for valid PDAs)
  isOnCurve: boolean;
}

/**
 * Converts a seed item into a Uint8Array buffer
 * 
 * @param seed - The seed item to convert
 * @returns Uint8Array representation of the seed
 */
function convertSeedToBuffer(seed: z.infer<typeof seedItemSchema>): Uint8Array {
  logger.debug("Converting seed to buffer", { type: seed.type });

  switch (seed.type) {
    case SeedType.STRING: {
      // Convert string to UTF-8 encoded bytes
      const encoder = new TextEncoder();
      return encoder.encode(seed.value);
    }
    
    case SeedType.BUFFER: {
      // Use provided buffer directly
      return new Uint8Array(seed.value);
    }
    
    case SeedType.NUMBER: {
      // Convert number to little-endian bytes (8 bytes for consistency)
      const buffer = new Uint8Array(8);
      const view = new DataView(buffer.buffer);
      view.setBigUint64(0, BigInt(seed.value), true);
      return buffer;
    }
    
    case SeedType.PUBKEY: {
      // Use provided public key - in v2.0 we work with strings directly
      try {
        // For v2.0, we can just return the bytes of the base58 string
        const address = seed.value as Address;
        // Convert address to bytes if needed
        const encoder = new TextEncoder();
        return encoder.encode(address);
      } catch (error) {
        logger.error("Failed to parse public key seed", error);
        throw new ValidationError(
          "Invalid public key provided as seed",
          "seed.value",
          { cause: error }
        );
      }
    }
  }
}

/**
 * Creates or finds a Program Derived Address based on the provided parameters
 * 
 * @param params - Parameters for generating the program address
 * @returns Object containing the generated address information
 */
async function executeGenerateProgramAddress(
  params: GenerateProgramAddressParams
): Promise<GenerateProgramAddressResult> {
  logger.info("Generating program address", {
    functionType: params.functionType,
    programId: params.programId,
    seedCount: params.seeds.length,
  });

  try {
    // Validate input parameters
    const validatedParams = generateProgramAddressSchema.parse(params);

    // Execute the address generation
    return tryCatch(async () => {
      // Parse the program ID
      let programId: Address;
      try {
        programId = validatedParams.programId as Address;
        logger.debug("Using program ID", { programId: programId });
      } catch (error) {
        logger.error("Failed to parse program ID", error);
        throw new ValidationError(
          "Invalid program ID format",
          "programId",
          { cause: error }
        );
      }

      // Convert all seeds to buffers
      const seedBuffers = validatedParams.seeds.map((seed, index) => {
        try {
          const buffer = convertSeedToBuffer(seed);
          
          // Validate seed size (must be <= 32 bytes)
          if (buffer.length > 32) {
            throw new ValidationError(
              `Seed at index ${index} exceeds maximum length of 32 bytes`,
              `seeds[${index}]`,
              { details: { actualLength: buffer.length } }
            );
          }
          
          return buffer;
        } catch (error) {
          if (error instanceof ValidationError) {
            throw error;
          }
          
          logger.error(`Failed to convert seed at index ${index}`, error);
          throw new ValidationError(
            `Failed to process seed at index ${index}`,
            `seeds[${index}]`,
            { cause: error }
          );
        }
      });

      logger.debug("Converted seeds to buffers", {
        bufferCount: seedBuffers.length,
        bufferSizes: seedBuffers.map(b => b.length),
      });

      // Execute the appropriate function based on functionType
      if (validatedParams.functionType === PdaFunctionType.CREATE) {
        // Use createProgramAddress
        try {
          const address = createProgramAddress(
            seedBuffers,
            programId
          );
          
          logger.info("Successfully created program address", {
            address: address,
          });
          
          return {
            address: address,
            isOnCurve: false, // CreateProgramAddress always returns off-curve addresses
          };
        } catch (error) {
          logger.error("Failed to create program address", error);
          throw new PublicKeyError(
            "Failed to create program address. This may occur if the resulting address would be on the ed25519 curve. Try different seeds.",
            { cause: error }
          );
        }
      } else {
        // Use findProgramAddress (which includes a bump seed)
        try {
          const [address, bumpSeed] = findProgramAddress(
            seedBuffers,
            programId
          );
          
          logger.info("Successfully found program address with bump seed", {
            address: address,
            bumpSeed,
          });
          
          return {
            address: address,
            bumpSeed,
            isOnCurve: false, // FindProgramAddress always returns off-curve addresses
          };
        } catch (error) {
          logger.error("Failed to find program address", error);
          throw new PublicKeyError(
            "Failed to find program address",
            { cause: error }
          );
        }
      }
    }, (error) => {
      if (error instanceof ValidationError || error instanceof PublicKeyError) {
        return error;
      }
      
      return new PublicKeyError(
        `Failed to generate program address: ${error.message}`,
        { cause: error }
      );
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError("Invalid parameters for generating program address", undefined, {
        cause: error,
        details: error.errors,
      });
    }
    throw error;
  }
}

// Define the MCP tool
export const generateProgramAddressTool = {
  name: "generateProgramAddress",
  description: "Generates a Program Derived Address (PDA) from a program ID and seeds",
  
  parameters: {
    type: "object",
    properties: {
      programId: {
        type: "string",
        description: "The program ID that will own the PDA (as a base58 string)",
      },
      seeds: {
        type: "array",
        description: "Array of seeds to use for deriving the address (max 16)",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: Object.values(SeedType),
              description: "Type of the seed (string, buffer, number, pubkey)",
            },
            value: {
              description: "Value of the seed, format depends on the type",
            },
          },
          required: ["type", "value"],
        },
        maxItems: 16,
      },
      functionType: {
        type: "string",
        enum: Object.values(PdaFunctionType),
        description: "Function to use: 'create' for createProgramAddress, 'find' for findProgramAddress (with bump seed)",
        default: PdaFunctionType.FIND,
      },
    },
    required: ["programId", "seeds"],
    additionalProperties: false,
  },
  
  execute: executeGenerateProgramAddress,
};