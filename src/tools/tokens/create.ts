/**
 * Create Token Tool
 * 
 * This tool creates a new SPL token mint on the Solana blockchain.
 * It supports creating tokens with configurable decimals, authority, and optional
 * initial supply.
 */

import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Commitment
} from "@solana/web3.js";
import { 
  createInitializeMintInstruction,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  MintLayout,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction
} from "@solana/spl-token";
import { z } from "zod";
import { getLogger } from "../../utils/logging.js";
import { 
  AccountError, 
  TokenError, 
  ValidationError, 
  tryCatch 
} from "../../utils/errors.js";
import { ConnectionManager } from "../../core/connection-manager.js";

// Logger for this module
const logger = getLogger("create-token-tool");

// Define input parameter schema using Zod for validation
const createTokenParamsSchema = z.object({
  // Required parameters
  mintAuthority: z.string().min(32).max(44),
  
  // Optional parameters with defaults
  payerKeypair: z.string().min(32).optional(),
  decimals: z.number().int().min(0).max(9).default(9),
  freezeAuthority: z.string().min(32).max(44).optional(),
  initialSupply: z.number().min(0).optional(),
  initialSupplyReceiver: z.string().min(32).max(44).optional(),
  cluster: z.string().default("devnet"),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  skipPreflight: z.boolean().default(false),
});

// Type for the tool parameters
export type CreateTokenParams = z.infer<typeof createTokenParamsSchema>;

// Type for the tool response
export interface CreateTokenResult {
  // Token information
  mint: string;
  mintAuthority: string;
  freezeAuthority?: string;
  decimals: number;
  
  // Transaction details
  signature?: string;
  initialSupply?: number;
  initialSupplyReceiver?: string;
}

/**
 * Parses a keypair from a string input
 * 
 * @param input - The string input, either a JSON array or base58 encoded secret key
 * @param paramName - The name of the parameter (for error reporting)
 * @returns The parsed keypair
 * @throws ValidationError if the input is invalid
 */
function parseKeypairFromString(input: string, paramName: string): Keypair {
  try {
    // Check if the input looks like a JSON array
    if (input.startsWith("[") && input.endsWith("]")) {
      const secretKeyArray = JSON.parse(input);
      return Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
    } else {
      // Assume base58 encoded secret key
      const secretKey = Buffer.from(input, "base58");
      return Keypair.fromSecretKey(secretKey);
    }
  } catch (error) {
    throw new ValidationError(
      `Invalid ${paramName} format. Must be a valid JSON keypair array or base58 encoded secret key.`,
      paramName,
      { cause: error }
    );
  }
}

/**
 * Creates a new SPL token mint
 * 
 * This tool creates a new SPL token mint with the specified parameters.
 * 
 * @param params - Tool parameters
 * @param connectionManager - Connection manager instance
 * @returns Object containing the token creation result
 */
async function executeCreateToken(
  params: CreateTokenParams,
  connectionManager: ConnectionManager
): Promise<CreateTokenResult> {
  logger.info("Creating new SPL token", { 
    decimals: params.decimals,
    cluster: params.cluster,
    hasInitialSupply: !!params.initialSupply
  });
  
  try {
    // Validate input parameters
    const validatedParams = createTokenParamsSchema.parse(params);
    
    // Set up token creation
    return tryCatch(async () => {
      // Parse keypairs
      let mintAuthority: PublicKey;
      try {
        mintAuthority = new PublicKey(validatedParams.mintAuthority);
      } catch (error) {
        throw new ValidationError(
          "Invalid mint authority public key format",
          "mintAuthority",
          { cause: error }
        );
      }
      
      let freezeAuthority: PublicKey | undefined;
      if (validatedParams.freezeAuthority) {
        try {
          freezeAuthority = new PublicKey(validatedParams.freezeAuthority);
        } catch (error) {
          throw new ValidationError(
            "Invalid freeze authority public key format",
            "freezeAuthority",
            { cause: error }
          );
        }
      }
      
      // If initial supply is specified, ensure receiver is also specified
      let initialSupplyReceiver: PublicKey | undefined;
      if (validatedParams.initialSupply !== undefined && validatedParams.initialSupply > 0) {
        if (!validatedParams.initialSupplyReceiver) {
          throw new ValidationError(
            "initialSupplyReceiver must be provided when initialSupply is specified",
            "initialSupplyReceiver"
          );
        }
        
        try {
          initialSupplyReceiver = new PublicKey(validatedParams.initialSupplyReceiver);
        } catch (error) {
          throw new ValidationError(
            "Invalid initial supply receiver public key format",
            "initialSupplyReceiver",
            { cause: error }
          );
        }
      }
      
      // Parse or generate payer keypair
      let payerKeypair: Keypair;
      if (validatedParams.payerKeypair) {
        payerKeypair = parseKeypairFromString(
          validatedParams.payerKeypair,
          "payerKeypair"
        );
      } else {
        // Use mint authority as payer if not provided
        if (validatedParams.mintAuthority.length >= 64) {
          // Mint authority provided as a keypair
          payerKeypair = parseKeypairFromString(
            validatedParams.mintAuthority,
            "mintAuthority"
          );
        } else {
          throw new ValidationError(
            "payerKeypair must be provided when mintAuthority is only a public key",
            "payerKeypair"
          );
        }
      }
      
      // Generate a new mint keypair
      const mintKeypair = Keypair.generate();
      logger.info("Generated new mint keypair", { 
        mint: mintKeypair.publicKey.toString() 
      });
      
      // Get connection
      const connection = connectionManager.getConnection(validatedParams.cluster);
      
      // Calculate minimum balance for mint account
      const lamports = await getMinimumBalanceForRentExemptMint(connection);
      
      // Create instructions for the transaction
      const instructions = [
        // Create account for mint
        SystemProgram.createAccount({
          fromPubkey: payerKeypair.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID
        }),
        // Initialize mint
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          validatedParams.decimals,
          mintAuthority,
          freezeAuthority ?? null,
          TOKEN_PROGRAM_ID
        )
      ];
      
      // Add initial minting instructions if required
      if (validatedParams.initialSupply !== undefined && 
          validatedParams.initialSupply > 0 && 
          initialSupplyReceiver) {
        
        // Calculate actual token amount with decimals
        const mintAmount = validatedParams.initialSupply * Math.pow(10, validatedParams.decimals);
        
        // Get or create the associated token account for the receiver
        const associatedTokenAccount = await getAssociatedTokenAddress(
          mintKeypair.publicKey,
          initialSupplyReceiver
        );
        
        // Add instruction to create token account if needed
        instructions.push(
          createAssociatedTokenAccountInstruction(
            payerKeypair.publicKey,
            associatedTokenAccount,
            initialSupplyReceiver,
            mintKeypair.publicKey
          )
        );
        
        // Add instruction to mint tokens
        instructions.push(
          createMintToInstruction(
            mintKeypair.publicKey,
            associatedTokenAccount,
            mintAuthority,
            BigInt(mintAmount)
          )
        );
      }
      
      // Create and send transaction
      const transaction = new Transaction().add(...instructions);
      
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payerKeypair, mintKeypair],
        {
          commitment: validatedParams.commitment as Commitment,
          skipPreflight: validatedParams.skipPreflight
        }
      );
      
      logger.info("Token created successfully", {
        mint: mintKeypair.publicKey.toString(),
        signature,
        initialSupply: validatedParams.initialSupply
      });
      
      // Return the result
      return {
        mint: mintKeypair.publicKey.toString(),
        mintAuthority: mintAuthority.toString(),
        freezeAuthority: freezeAuthority?.toString(),
        decimals: validatedParams.decimals,
        signature,
        initialSupply: validatedParams.initialSupply,
        initialSupplyReceiver: initialSupplyReceiver?.toString()
      };
    }, (error) => {
      // Map to appropriate error type if not already a SolanaServerError
      if (error instanceof ValidationError || 
          error instanceof AccountError || 
          error instanceof TokenError) {
        return error;
      }
      
      return new TokenError(
        `Failed to create token: ${error.message}`,
        undefined,
        undefined,
        { cause: error }
      );
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError(
        "Invalid parameters for token creation",
        undefined,
        { 
          cause: error,
          details: { errors: error.errors }
        }
      );
      logger.error("Parameter validation failed", { error: validationError });
      throw validationError;
    }
    
    throw error;
  }
}

// Define the MCP tool
export const createTokenTool = {
  name: "createToken",
  description: "Creates a new SPL token mint with configurable decimals, authority, and optional initial supply",
  
  parameters: {
    type: "object",
    properties: {
      mintAuthority: {
        type: "string",
        description: "Public key or keypair of the mint authority"
      },
      payerKeypair: {
        type: "string",
        description: "Keypair that will pay for the token creation (JSON array or base58 encoded secret key)"
      },
      decimals: {
        type: "number",
        description: "Number of decimals for the token (0-9)",
        default: 9
      },
      freezeAuthority: {
        type: "string",
        description: "Optional public key that can freeze token accounts"
      },
      initialSupply: {
        type: "number",
        description: "Optional initial token supply to mint"
      },
      initialSupplyReceiver: {
        type: "string",
        description: "Public key that will receive the initial supply (required if initialSupply is specified)"
      },
      cluster: {
        type: "string",
        description: "Solana cluster to use (mainnet, testnet, devnet, localnet)",
        default: "devnet"
      },
      commitment: {
        type: "string",
        enum: ["processed", "confirmed", "finalized"],
        description: "Commitment level for transaction confirmation",
        default: "confirmed"
      },
      skipPreflight: {
        type: "boolean",
        description: "Whether to skip preflight transaction checks",
        default: false
      }
    },
    required: ["mintAuthority"],
    additionalProperties: false
  },
  
  execute: (params, connectionManager) => executeCreateToken(params, connectionManager)
};