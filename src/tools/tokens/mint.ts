/**
 * Mint Tokens Tool
 * 
 * This tool mints additional tokens for an existing SPL token mint.
 * It supports minting to both regular and associated token accounts.
 */

import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  Commitment,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import { 
  createMintToInstruction,
  getMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID
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
const logger = getLogger("mint-tokens-tool");

// Define input parameter schema using Zod for validation
const mintTokensParamsSchema = z.object({
  // Required parameters
  tokenMint: z.string().min(32).max(44),
  mintAuthority: z.string().min(32),
  destinationAddress: z.string().min(32).max(44),
  amount: z.number().positive(),
  
  // Optional parameters with defaults
  autoCreateAccount: z.boolean().default(true),
  cluster: z.string().default("devnet"),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  skipPreflight: z.boolean().default(false),
});

// Type for the tool parameters
export type MintTokensParams = z.infer<typeof mintTokensParamsSchema>;

// Type for the tool response
export interface MintTokensResult {
  // Transaction information
  tokenMint: string;
  amount: number;
  formattedAmount: string;
  destination: string;
  isAssociatedTokenAccount: boolean;
  accountCreated: boolean;
  signature: string;
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
 * Mints additional tokens for an existing SPL token
 * 
 * This tool mints tokens to a specified account for an existing token mint.
 * It can automatically create associated token accounts if needed.
 * 
 * @param params - Tool parameters
 * @param connectionManager - Connection manager instance
 * @returns Object containing the mint operation result
 */
async function executeMintTokens(
  params: MintTokensParams,
  connectionManager: ConnectionManager
): Promise<MintTokensResult> {
  logger.info("Minting SPL tokens", { 
    tokenMint: params.tokenMint,
    destination: params.destinationAddress,
    amount: params.amount,
    cluster: params.cluster
  });
  
  try {
    // Validate input parameters
    const validatedParams = mintTokensParamsSchema.parse(params);
    
    // Set up token minting
    return tryCatch(async () => {
      // Parse mint authority keypair
      const mintAuthorityKeypair = parseKeypairFromString(
        validatedParams.mintAuthority,
        "mintAuthority"
      );
      
      // Parse token mint and destination addresses
      let tokenMint: PublicKey, destinationAddress: PublicKey;
      
      try {
        tokenMint = new PublicKey(validatedParams.tokenMint);
      } catch (error) {
        throw new ValidationError(
          "Invalid token mint public key format",
          "tokenMint",
          { cause: error }
        );
      }
      
      try {
        destinationAddress = new PublicKey(validatedParams.destinationAddress);
      } catch (error) {
        throw new ValidationError(
          "Invalid destination address public key format",
          "destinationAddress",
          { cause: error }
        );
      }
      
      // Get connection
      const connection = connectionManager.getConnection(validatedParams.cluster);
      
      // Fetch token mint info to verify mint authority and get decimals
      const mintInfo = await getMint(connection, tokenMint);
      
      // Verify mint authority matches
      if (!mintInfo.mintAuthority || 
          !mintInfo.mintAuthority.equals(mintAuthorityKeypair.publicKey)) {
        throw new TokenError(
          "Provided mint authority does not match the token's mint authority",
          tokenMint.toString(),
          undefined,
          { 
            details: { 
              providedAuthority: mintAuthorityKeypair.publicKey.toString(),
              actualAuthority: mintInfo.mintAuthority?.toString() 
            } 
          }
        );
      }
      
      // Calculate the actual token amount to mint (accounting for decimals)
      const mintAmount = BigInt(validatedParams.amount * Math.pow(10, mintInfo.decimals));
      
      // Determine if destination is already a token account or if we need to use an associated token account
      let tokenAccount: PublicKey;
      let accountCreated = false;
      let isAssociatedTokenAccount = false;
      
      try {
        // First check if the destination is already a token account for this mint
        const accountInfo = await getAccount(connection, destinationAddress);
        
        // Verify the account is for the correct mint
        if (!accountInfo.mint.equals(tokenMint)) {
          throw new TokenError(
            "Destination account is for a different token mint",
            tokenMint.toString(),
            destinationAddress.toString(),
            {
              details: {
                expectedMint: tokenMint.toString(),
                actualMint: accountInfo.mint.toString()
              }
            }
          );
        }
        
        // Use the existing token account
        tokenAccount = destinationAddress;
        logger.info("Using existing token account", {
          tokenAccount: tokenAccount.toString()
        });
      } catch (error) {
        // If the destination is not already a token account, create/use the associated token account
        if (validatedParams.autoCreateAccount) {
          try {
            // Get the associated token account for the owner
            tokenAccount = await getAssociatedTokenAddress(tokenMint, destinationAddress);
            isAssociatedTokenAccount = true;
            
            // Check if the associated token account already exists
            try {
              await getAccount(connection, tokenAccount);
              logger.info("Using existing associated token account", {
                tokenAccount: tokenAccount.toString()
              });
            } catch (e) {
              // Account doesn't exist, we'll need to create it
              accountCreated = true;
              logger.info("Will create associated token account", {
                tokenAccount: tokenAccount.toString()
              });
            }
          } catch (e) {
            throw new TokenError(
              "Failed to derive associated token account",
              tokenMint.toString(),
              destinationAddress.toString(),
              { cause: e }
            );
          }
        } else {
          // Can't create account and destination is not a valid token account
          throw new TokenError(
            "Destination is not a valid token account and autoCreateAccount is disabled",
            tokenMint.toString(),
            destinationAddress.toString()
          );
        }
      }
      
      // Create transaction
      const transaction = new Transaction();
      
      // Add instruction to create associated token account if needed
      if (accountCreated) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            mintAuthorityKeypair.publicKey,
            tokenAccount,
            destinationAddress,
            tokenMint
          )
        );
      }
      
      // Add instruction to mint tokens
      transaction.add(
        createMintToInstruction(
          tokenMint,
          tokenAccount,
          mintAuthorityKeypair.publicKey,
          mintAmount
        )
      );
      
      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [mintAuthorityKeypair],
        {
          commitment: validatedParams.commitment as Commitment,
          skipPreflight: validatedParams.skipPreflight
        }
      );
      
      logger.info("Tokens minted successfully", {
        tokenMint: tokenMint.toString(),
        destination: tokenAccount.toString(),
        owner: destinationAddress.toString(),
        amount: mintAmount.toString(),
        signature
      });
      
      // Return the result
      return {
        tokenMint: tokenMint.toString(),
        amount: validatedParams.amount,
        formattedAmount: `${validatedParams.amount} (${mintAmount} raw)`,
        destination: tokenAccount.toString(),
        isAssociatedTokenAccount,
        accountCreated,
        signature
      };
    }, (error) => {
      // Map to appropriate error type if not already a SolanaServerError
      if (error instanceof ValidationError || 
          error instanceof AccountError || 
          error instanceof TokenError) {
        return error;
      }
      
      return new TokenError(
        `Failed to mint tokens: ${error.message}`,
        params.tokenMint,
        params.destinationAddress,
        { cause: error }
      );
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError(
        "Invalid parameters for minting tokens",
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
export const mintTokensTool = {
  name: "mintTokens",
  description: "Mints additional tokens for an existing SPL token to a specified account",
  
  parameters: {
    type: "object",
    properties: {
      tokenMint: {
        type: "string",
        description: "Address of the token mint (base58 encoded public key)"
      },
      mintAuthority: {
        type: "string",
        description: "Keypair of the mint authority (JSON array or base58 encoded secret key)"
      },
      destinationAddress: {
        type: "string",
        description: "Address to receive the tokens (either a token account or wallet address)"
      },
      amount: {
        type: "number",
        description: "Amount of tokens to mint (will be adjusted for decimals)"
      },
      autoCreateAccount: {
        type: "boolean",
        description: "Whether to automatically create an associated token account if needed",
        default: true
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
    required: ["tokenMint", "mintAuthority", "destinationAddress", "amount"],
    additionalProperties: false
  },
  
  execute: (params, connectionManager) => executeMintTokens(params, connectionManager)
};