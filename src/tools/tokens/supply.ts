/**
 * Get Token Supply Tool
 * 
 * This tool retrieves information about a token mint, including its
 * total supply, decimals, and authorities.
 */

import { 
  Connection, 
  PublicKey, 
  Commitment
} from "@solana/web3.js";
import { 
  getMint,
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
const logger = getLogger("token-supply-tool");

// Define input parameter schema using Zod for validation
const getTokenSupplyParamsSchema = z.object({
  // Required parameters
  tokenMint: z.string().min(32).max(44),
  
  // Optional parameters with defaults
  cluster: z.string().default("devnet"),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
});

// Type for the tool parameters
export type GetTokenSupplyParams = z.infer<typeof getTokenSupplyParamsSchema>;

// Type for the tool response
export interface GetTokenSupplyResult {
  // Token mint information
  mint: string;
  supply: string;
  decimals: number;
  formattedSupply: string;
  
  // Authority information
  mintAuthority?: string;
  freezeAuthority?: string;
  
  // Status
  isInitialized: boolean;
}

/**
 * Retrieves supply information for a token mint
 * 
 * This tool fetches details about a token mint, including its
 * total supply, decimals, and authorities.
 * 
 * @param params - Tool parameters
 * @param connectionManager - Connection manager instance
 * @returns Object containing the token supply information
 */
async function executeGetTokenSupply(
  params: GetTokenSupplyParams,
  connectionManager: ConnectionManager
): Promise<GetTokenSupplyResult> {
  logger.info("Retrieving token supply information", { 
    tokenMint: params.tokenMint,
    cluster: params.cluster
  });
  
  try {
    // Validate input parameters
    const validatedParams = getTokenSupplyParamsSchema.parse(params);
    
    // Set up token supply query
    return tryCatch(async () => {
      // Get connection
      const connection = connectionManager.getConnection(validatedParams.cluster);
      
      // Parse token mint public key
      let tokenMint: PublicKey;
      try {
        tokenMint = new PublicKey(validatedParams.tokenMint);
      } catch (error) {
        throw new ValidationError(
          "Invalid token mint public key format",
          "tokenMint",
          { cause: error }
        );
      }
      
      // Fetch mint information
      const mintInfo = await getMint(
        connection,
        tokenMint,
        validatedParams.commitment as Commitment
      );
      
      // Calculate formatted supply
      const formattedSupply = (Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals)).toString();
      
      logger.debug("Token supply retrieved", {
        mint: tokenMint.toString(),
        supply: mintInfo.supply.toString(),
        decimals: mintInfo.decimals,
        formattedSupply
      });
      
      // Return the results
      return {
        mint: tokenMint.toString(),
        supply: mintInfo.supply.toString(),
        decimals: mintInfo.decimals,
        formattedSupply,
        mintAuthority: mintInfo.mintAuthority?.toString(),
        freezeAuthority: mintInfo.freezeAuthority?.toString(),
        isInitialized: mintInfo.isInitialized
      };
    }, (error) => {
      // Map to appropriate error type if not already a SolanaServerError
      if (error instanceof ValidationError || 
          error instanceof AccountError || 
          error instanceof TokenError) {
        return error;
      }
      
      return new TokenError(
        `Failed to get token supply: ${error.message}`,
        params.tokenMint,
        undefined,
        { cause: error }
      );
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError(
        "Invalid parameters for getting token supply",
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
export const getTokenSupplyTool = {
  name: "getTokenSupply",
  description: "Retrieves supply information for a token mint, including total supply, decimals, and authorities",
  
  parameters: {
    type: "object",
    properties: {
      tokenMint: {
        type: "string",
        description: "Address of the token mint to query (base58 encoded public key)"
      },
      cluster: {
        type: "string",
        description: "Solana cluster to use (mainnet, testnet, devnet, localnet)",
        default: "devnet"
      },
      commitment: {
        type: "string",
        enum: ["processed", "confirmed", "finalized"],
        description: "Commitment level for queries",
        default: "confirmed"
      }
    },
    required: ["tokenMint"],
    additionalProperties: false
  },
  
  execute: (params, connectionManager) => executeGetTokenSupply(params, connectionManager)
};