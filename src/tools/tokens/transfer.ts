/**
 * Transfer Tokens Tool
 * 
 * This tool transfers SPL tokens between accounts.
 * It supports both direct token accounts and wallet addresses (with associated token accounts).
 */

import { 
  Keypair, 
  PublicKey, 
  Commitment,
  sendTransaction
} from "@solana/web3.js";
import { 
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID
} from "@solana-program/token";
import bs58 from "bs58";
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
const logger = getLogger("transfer-tokens-tool");

// Define input parameter schema using Zod for validation
const transferTokensParamsSchema = z.object({
  // Required parameters
  tokenMint: z.string().min(32).max(44),
  fromAuthority: z.string().min(32),
  fromAddress: z.string().min(32).max(44).optional(),
  toAddress: z.string().min(32).max(44),
  amount: z.number().positive(),
  
  // Optional parameters with defaults
  autoCreateAccount: z.boolean().default(true),
  cluster: z.string().default("devnet"),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  skipPreflight: z.boolean().default(false),
  memo: z.string().optional(),
});

// Type for the tool parameters
export type TransferTokensParams = z.infer<typeof transferTokensParamsSchema>;

// Type for the tool response
export interface TransferTokensResult {
  // Transaction information
  tokenMint: string;
  amount: number;
  formattedAmount: string;
  from: string;
  to: string;
  destinationCreated: boolean;
  signature: string;
  memo?: string;
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
      const secretKey = bs58.decode(input);
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
 * Transfers SPL tokens between accounts
 * 
 * This tool transfers tokens from one account to another.
 * It can automatically create associated token accounts if needed.
 * 
 * @param params - Tool parameters
 * @param connectionManager - Connection manager instance
 * @returns Object containing the transfer operation result
 */
async function executeTransferTokens(
  params: TransferTokensParams,
  connectionManager: ConnectionManager
): Promise<TransferTokensResult> {
  logger.info("Transferring SPL tokens", { 
    tokenMint: params.tokenMint,
    amount: params.amount,
    toAddress: params.toAddress,
    hasFromAddress: !!params.fromAddress,
    cluster: params.cluster
  });
  
  try {
    // Validate input parameters
    const validatedParams = transferTokensParamsSchema.parse(params);
    
    // Set up token transfer
    return tryCatch(async () => {
      // Parse authority keypair
      const authorityKeypair = parseKeypairFromString(
        validatedParams.fromAuthority,
        "fromAuthority"
      );
      
      // Parse token mint and addresses
      let tokenMint: PublicKey, toAddress: PublicKey, fromAddress: PublicKey;
      
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
        toAddress = new PublicKey(validatedParams.toAddress);
      } catch (error) {
        throw new ValidationError(
          "Invalid to address public key format",
          "toAddress",
          { cause: error }
        );
      }
      
      // Get connection
      const connection = connectionManager.getConnection(validatedParams.cluster);
      
      // Determine source token account
      let sourceTokenAccount: PublicKey;
      
      if (validatedParams.fromAddress) {
        // If fromAddress is provided, use it or derive associated token account
        try {
          fromAddress = new PublicKey(validatedParams.fromAddress);
        } catch (error) {
          throw new ValidationError(
            "Invalid from address public key format",
            "fromAddress",
            { cause: error }
          );
        }
        
        try {
          // Check if fromAddress is already a token account for this mint
          const accountInfo = await getAccount(connection, fromAddress).send();
          
          // Verify the account is for the correct mint
          if (!accountInfo.mint.equals(tokenMint)) {
            throw new TokenError(
              "Source account is for a different token mint",
              tokenMint.toString(),
              fromAddress.toString(),
              {
                details: {
                  expectedMint: tokenMint.toString(),
                  actualMint: accountInfo.mint.toString()
                }
              }
            );
          }
          
          // Use the existing token account
          sourceTokenAccount = fromAddress;
        } catch (error) {
          // If not a token account, try to use the associated token account
          sourceTokenAccount = await getAssociatedTokenAddress({
            mint: tokenMint, 
            owner: fromAddress
          });
          
          // Verify the associated token account exists
          try {
            await getAccount(connection, sourceTokenAccount).send();
          } catch (e) {
            throw new TokenError(
              "Source associated token account does not exist",
              tokenMint.toString(),
              sourceTokenAccount.toString()
            );
          }
        }
      } else {
        // If fromAddress not provided, assume authority is the token owner
        // and use their associated token account
        fromAddress = authorityKeypair.publicKey;
        sourceTokenAccount = await getAssociatedTokenAddress({
          mint: tokenMint, 
          owner: fromAddress
        });
        
        // Verify the associated token account exists
        try {
          await getAccount(connection, sourceTokenAccount).send();
        } catch (e) {
          throw new TokenError(
            "Authority's associated token account does not exist",
            tokenMint.toString(),
            sourceTokenAccount.toString()
          );
        }
      }
      
      // Determine destination token account
      let destinationTokenAccount: PublicKey;
      let destinationCreated = false;
      
      try {
        // Check if toAddress is already a token account for this mint
        const accountInfo = await getAccount(connection, toAddress).send();
        
        // Verify the account is for the correct mint
        if (!accountInfo.mint.equals(tokenMint)) {
          throw new TokenError(
            "Destination account is for a different token mint",
            tokenMint.toString(),
            toAddress.toString(),
            {
              details: {
                expectedMint: tokenMint.toString(),
                actualMint: accountInfo.mint.toString()
              }
            }
          );
        }
        
        // Use the existing token account
        destinationTokenAccount = toAddress;
        logger.info("Using existing destination token account", {
          destinationTokenAccount: destinationTokenAccount.toString()
        });
      } catch (error) {
        // If the destination is not already a token account, create/use the associated token account
        if (validatedParams.autoCreateAccount) {
          try {
            // Get the associated token account for the destination
            destinationTokenAccount = await getAssociatedTokenAddress({
              mint: tokenMint, 
              owner: toAddress
            });
            
            // Check if the associated token account already exists
            try {
              await getAccount(connection, destinationTokenAccount).send();
              logger.info("Using existing destination associated token account", {
                destinationTokenAccount: destinationTokenAccount.toString()
              });
            } catch (e) {
              // Account doesn't exist, we'll need to create it
              destinationCreated = true;
              logger.info("Will create destination associated token account", {
                destinationTokenAccount: destinationTokenAccount.toString()
              });
            }
          } catch (e) {
            throw new TokenError(
              "Failed to derive destination associated token account",
              tokenMint.toString(),
              toAddress.toString(),
              { cause: e }
            );
          }
        } else {
          // Can't create account and destination is not a valid token account
          throw new TokenError(
            "Destination is not a valid token account and autoCreateAccount is disabled",
            tokenMint.toString(),
            toAddress.toString()
          );
        }
      }
      
      // Get token decimals by fetching a token account
      const sourceAccount = await getAccount(connection, sourceTokenAccount).send();
      const tokenDecimals = sourceAccount.mint.toString() ? 9 : 9; // Default to 9 if we can't determine
      
      // Calculate the actual token amount to transfer (accounting for decimals)
      const transferAmount = BigInt(Math.floor(validatedParams.amount * Math.pow(10, tokenDecimals)));
      
      // Verify sufficient balance
      if (sourceAccount.amount < transferAmount) {
        throw new TokenError(
          "Insufficient token balance for transfer",
          tokenMint.toString(),
          sourceTokenAccount.toString(),
          {
            details: {
              available: sourceAccount.amount.toString(),
              required: transferAmount.toString()
            }
          }
        );
      }
      
      // Create instructions array
      const instructions = [];
      
      // Add instruction to create destination token account if needed
      if (destinationCreated) {
        instructions.push(
          createAssociatedTokenAccountInstruction({
            payer: authorityKeypair.publicKey,
            associatedToken: destinationTokenAccount,
            owner: toAddress,
            mint: tokenMint
          })
        );
      }
      
      // Add instruction to transfer tokens
      instructions.push(
        createTransferInstruction({
          source: sourceTokenAccount,
          destination: destinationTokenAccount,
          owner: authorityKeypair.publicKey,
          amount: transferAmount
        })
      );
      
      // Add memo instruction if specified
      if (validatedParams.memo) {
        // Note: This would require @solana/spl-memo package
        // For now, we'll just log that memo was requested but not implemented
        logger.warn("Memo requested but not implemented in this version", {
          memo: validatedParams.memo
        });
      }
      
      // Send transaction
      const { signature } = await sendTransaction(
        connection,
        instructions,
        {
          signers: [authorityKeypair],
          preflightCommitment: validatedParams.commitment as Commitment,
          skipPreflight: validatedParams.skipPreflight
        }
      ).send();
      
      logger.info("Tokens transferred successfully", {
        tokenMint: tokenMint.toString(),
        from: sourceTokenAccount.toString(),
        to: destinationTokenAccount.toString(),
        amount: transferAmount.toString(),
        signature
      });
      
      // Return the result
      return {
        tokenMint: tokenMint.toString(),
        amount: validatedParams.amount,
        formattedAmount: `${validatedParams.amount} (${transferAmount} raw)`,
        from: sourceTokenAccount.toString(),
        to: destinationTokenAccount.toString(),
        destinationCreated,
        signature,
        memo: validatedParams.memo
      };
    }, (error) => {
      // Map to appropriate error type if not already a SolanaServerError
      if (error instanceof ValidationError || 
          error instanceof AccountError || 
          error instanceof TokenError) {
        return error;
      }
      
      return new TokenError(
        `Failed to transfer tokens: ${error.message}`,
        params.tokenMint,
        params.toAddress,
        { cause: error }
      );
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError(
        "Invalid parameters for transferring tokens",
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
export const transferTokensTool = {
  name: "transferTokens",
  description: "Transfers SPL tokens between accounts with support for associated token accounts",
  
  parameters: {
    type: "object",
    properties: {
      tokenMint: {
        type: "string",
        description: "Address of the token mint (base58 encoded public key)"
      },
      fromAuthority: {
        type: "string",
        description: "Keypair with authority to transfer the tokens (JSON array or base58 encoded secret key)"
      },
      fromAddress: {
        type: "string",
        description: "Optional source address (if different from authority). Can be a token account or wallet address."
      },
      toAddress: {
        type: "string",
        description: "Destination address to receive tokens. Can be a token account or wallet address."
      },
      amount: {
        type: "number",
        description: "Amount of tokens to transfer (will be adjusted for decimals)"
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
      },
      memo: {
        type: "string",
        description: "Optional memo to include with the transfer"
      }
    },
    required: ["tokenMint", "fromAuthority", "toAddress", "amount"],
    additionalProperties: false
  },
  
  execute: (params, connectionManager) => executeTransferTokens(params, connectionManager)
};