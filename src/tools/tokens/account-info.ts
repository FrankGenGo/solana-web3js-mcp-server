/**
 * Get Token Account Info Tool
 * 
 * This tool retrieves information about SPL token accounts.
 * It supports querying by account address, owner, and token mint.
 */

import { 
  Connection, 
  PublicKey, 
  Commitment
} from "@solana/web3.js";
import { 
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  AccountLayout
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
const logger = getLogger("token-account-info-tool");

// Define input parameter schema using Zod for validation
const getTokenAccountInfoParamsSchema = z.object({
  // At least one of these parameters must be provided
  tokenAccount: z.string().min(32).max(44).optional(),
  owner: z.string().min(32).max(44).optional(),
  mint: z.string().min(32).max(44).optional(),
  
  // Optional filtering and pagination parameters
  limit: z.number().int().positive().max(100).default(10),
  showZeroBalance: z.boolean().default(false),
  
  // Optional parameters with defaults
  cluster: z.string().default("devnet"),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
}).refine(
  data => data.tokenAccount !== undefined || data.owner !== undefined || data.mint !== undefined,
  {
    message: "At least one of tokenAccount, owner, or mint must be provided",
    path: ["tokenAccount"]
  }
);

// Type for the tool parameters
export type GetTokenAccountInfoParams = z.infer<typeof getTokenAccountInfoParamsSchema>;

// Type for a token account
export interface TokenAccountDetails {
  // Account addresses
  address: string;
  mint: string;
  owner: string;
  
  // Token amounts
  amount: string;
  decimals: number;
  displayAmount: string;
  
  // Account attributes
  isInitialized: boolean;
  isFrozen: boolean;
  isNative: boolean;
  
  // Delegation info (if applicable)
  delegate?: string;
  delegatedAmount?: string;
  
  // Additional metadata
  rentExemptReserve?: string;
  closeAuthority?: string;
}

// Type for the tool response
export interface GetTokenAccountInfoResult {
  // List of token accounts matching the query
  accounts: TokenAccountDetails[];
  
  // Total number of accounts found
  total: number;
  
  // Query parameters used
  query: {
    tokenAccount?: string;
    owner?: string;
    mint?: string;
    showZeroBalance: boolean;
    limit: number;
  };
}

/**
 * Retrieves information about SPL token accounts
 * 
 * This tool fetches details about token accounts based on the provided parameters.
 * It can query by account address, owner, or token mint.
 * 
 * @param params - Tool parameters
 * @param connectionManager - Connection manager instance
 * @returns Object containing the token account information
 */
async function executeGetTokenAccountInfo(
  params: GetTokenAccountInfoParams,
  connectionManager: ConnectionManager
): Promise<GetTokenAccountInfoResult> {
  logger.info("Retrieving token account information", { 
    hasTokenAccount: !!params.tokenAccount,
    hasOwner: !!params.owner,
    hasMint: !!params.mint,
    cluster: params.cluster
  });
  
  try {
    // Validate input parameters
    const validatedParams = getTokenAccountInfoParamsSchema.parse(params);
    
    // Set up token account query
    return tryCatch(async () => {
      // Get connection
      const connection = connectionManager.getConnection(validatedParams.cluster);
      
      // Parse public keys from input parameters
      let tokenAccount: PublicKey | undefined;
      let owner: PublicKey | undefined;
      let mint: PublicKey | undefined;
      
      if (validatedParams.tokenAccount) {
        try {
          tokenAccount = new PublicKey(validatedParams.tokenAccount);
        } catch (error) {
          throw new ValidationError(
            "Invalid token account public key format",
            "tokenAccount",
            { cause: error }
          );
        }
      }
      
      if (validatedParams.owner) {
        try {
          owner = new PublicKey(validatedParams.owner);
        } catch (error) {
          throw new ValidationError(
            "Invalid owner public key format",
            "owner",
            { cause: error }
          );
        }
      }
      
      if (validatedParams.mint) {
        try {
          mint = new PublicKey(validatedParams.mint);
        } catch (error) {
          throw new ValidationError(
            "Invalid mint public key format",
            "mint",
            { cause: error }
          );
        }
      }
      
      // List to hold all token accounts
      const results: TokenAccountDetails[] = [];
      
      // If a specific token account is provided, fetch it directly
      if (tokenAccount) {
        try {
          const account = await getAccount(
            connection,
            tokenAccount,
            validatedParams.commitment as Commitment
          );
          
          // Check mint filter if provided
          if (mint && !account.mint.equals(mint)) {
            return {
              accounts: [],
              total: 0,
              query: {
                tokenAccount: tokenAccount.toString(),
                mint: mint.toString(),
                showZeroBalance: validatedParams.showZeroBalance,
                limit: validatedParams.limit
              }
            };
          }
          
          // Check owner filter if provided
          if (owner && !account.owner.equals(owner)) {
            return {
              accounts: [],
              total: 0,
              query: {
                tokenAccount: tokenAccount.toString(),
                owner: owner.toString(),
                showZeroBalance: validatedParams.showZeroBalance,
                limit: validatedParams.limit
              }
            };
          }
          
          // Skip zero balances if showZeroBalance is false
          if (!validatedParams.showZeroBalance && account.amount === BigInt(0)) {
            return {
              accounts: [],
              total: 0,
              query: {
                tokenAccount: tokenAccount.toString(),
                showZeroBalance: validatedParams.showZeroBalance,
                limit: validatedParams.limit
              }
            };
          }
          
          // Add account to results
          results.push({
            address: account.address.toString(),
            mint: account.mint.toString(),
            owner: account.owner.toString(),
            amount: account.amount.toString(),
            decimals: account.mint.toString() ? 9 : 9, // Assuming 9 decimals if we can't directly check
            displayAmount: (Number(account.amount) / Math.pow(10, 9)).toString(),
            isInitialized: true,
            isFrozen: account.isFrozen,
            isNative: !!account.isNative,
            delegate: account.delegate?.toString(),
            delegatedAmount: account.delegatedAmount?.toString(),
            closeAuthority: account.closeAuthority?.toString()
          });
        } catch (error) {
          throw new TokenError(
            "Failed to retrieve token account information",
            mint?.toString(),
            tokenAccount.toString(),
            { cause: error }
          );
        }
      } 
      // If owner and mint are provided, fetch the associated token account
      else if (owner && mint) {
        try {
          // Get the associated token account address
          const associatedTokenAccount = await getAssociatedTokenAddress(mint, owner);
          
          try {
            // Try to fetch the associated token account
            const account = await getAccount(
              connection,
              associatedTokenAccount,
              validatedParams.commitment as Commitment
            );
            
            // Skip zero balances if showZeroBalance is false
            if (!validatedParams.showZeroBalance && account.amount === BigInt(0)) {
              return {
                accounts: [],
                total: 0,
                query: {
                  owner: owner.toString(),
                  mint: mint.toString(),
                  showZeroBalance: validatedParams.showZeroBalance,
                  limit: validatedParams.limit
                }
              };
            }
            
            // Add account to results
            results.push({
              address: account.address.toString(),
              mint: account.mint.toString(),
              owner: account.owner.toString(),
              amount: account.amount.toString(),
              decimals: account.mint.toString() ? 9 : 9, // Assuming 9 decimals if we can't directly check
              displayAmount: (Number(account.amount) / Math.pow(10, 9)).toString(),
              isInitialized: true,
              isFrozen: account.isFrozen,
              isNative: !!account.isNative,
              delegate: account.delegate?.toString(),
              delegatedAmount: account.delegatedAmount?.toString(),
              closeAuthority: account.closeAuthority?.toString()
            });
          } catch (e) {
            // Associated token account might not exist
            logger.debug("Associated token account not found", {
              owner: owner.toString(),
              mint: mint.toString(),
              associatedTokenAccount: associatedTokenAccount.toString()
            });
          }
        } catch (error) {
          throw new TokenError(
            "Failed to derive associated token account",
            mint.toString(),
            owner.toString(),
            { cause: error }
          );
        }
      }
      // If just the owner is provided, find all token accounts owned by this wallet
      else if (owner) {
        // Get all token accounts for the owner
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          owner,
          { programId: TOKEN_PROGRAM_ID },
          validatedParams.commitment as Commitment
        );
        
        // Filter and transform accounts
        for (const { pubkey, account } of tokenAccounts.value) {
          const tokenAccountInfo = account.data.parsed.info;
          
          // Skip accounts with zero balance if showZeroBalance is false
          if (!validatedParams.showZeroBalance && tokenAccountInfo.tokenAmount.amount === '0') {
            continue;
          }
          
          // Skip if mint filter is provided and doesn't match
          if (mint && tokenAccountInfo.mint !== mint.toString()) {
            continue;
          }
          
          // Add account to results
          results.push({
            address: pubkey.toString(),
            mint: tokenAccountInfo.mint,
            owner: tokenAccountInfo.owner,
            amount: tokenAccountInfo.tokenAmount.amount,
            decimals: tokenAccountInfo.tokenAmount.decimals,
            displayAmount: tokenAccountInfo.tokenAmount.uiAmountString,
            isInitialized: !!tokenAccountInfo.state && tokenAccountInfo.state === 'initialized',
            isFrozen: !!tokenAccountInfo.state && tokenAccountInfo.state === 'frozen',
            isNative: tokenAccountInfo.isNative,
            delegate: tokenAccountInfo.delegate,
            delegatedAmount: tokenAccountInfo.delegatedAmount?.amount,
            closeAuthority: tokenAccountInfo.closeAuthority
          });
          
          // Limit the number of results
          if (results.length >= validatedParams.limit) {
            break;
          }
        }
      }
      // If just the mint is provided, find all token accounts for this mint
      else if (mint) {
        // Get all accounts for this mint (this requires a filter approach)
        // This is a more expensive operation that searches by mint
        const tokenAccounts = await connection.getParsedProgramAccounts(
          TOKEN_PROGRAM_ID,
          {
            filters: [
              { dataSize: AccountLayout.span },
              {
                memcmp: {
                  offset: 0,
                  bytes: mint.toString()
                }
              }
            ],
            commitment: validatedParams.commitment as Commitment
          }
        );
        
        // Filter and transform accounts
        for (const { pubkey, account } of tokenAccounts) {
          try {
            const tokenAccountInfo = account.data.parsed.info;
            
            // Skip accounts with zero balance if showZeroBalance is false
            if (!validatedParams.showZeroBalance && tokenAccountInfo.tokenAmount.amount === '0') {
              continue;
            }
            
            // Add account to results
            results.push({
              address: pubkey.toString(),
              mint: tokenAccountInfo.mint,
              owner: tokenAccountInfo.owner,
              amount: tokenAccountInfo.tokenAmount.amount,
              decimals: tokenAccountInfo.tokenAmount.decimals,
              displayAmount: tokenAccountInfo.tokenAmount.uiAmountString,
              isInitialized: !!tokenAccountInfo.state && tokenAccountInfo.state === 'initialized',
              isFrozen: !!tokenAccountInfo.state && tokenAccountInfo.state === 'frozen',
              isNative: tokenAccountInfo.isNative,
              delegate: tokenAccountInfo.delegate,
              delegatedAmount: tokenAccountInfo.delegatedAmount?.amount,
              closeAuthority: tokenAccountInfo.closeAuthority
            });
            
            // Limit the number of results
            if (results.length >= validatedParams.limit) {
              break;
            }
          } catch (e) {
            // Skip accounts that can't be parsed
            logger.debug("Skipping account that couldn't be parsed", {
              address: pubkey.toString(),
              error: e
            });
          }
        }
      }
      
      // Return the results
      return {
        accounts: results,
        total: results.length,
        query: {
          tokenAccount: tokenAccount?.toString(),
          owner: owner?.toString(),
          mint: mint?.toString(),
          showZeroBalance: validatedParams.showZeroBalance,
          limit: validatedParams.limit
        }
      };
    }, (error) => {
      // Map to appropriate error type if not already a SolanaServerError
      if (error instanceof ValidationError || 
          error instanceof AccountError || 
          error instanceof TokenError) {
        return error;
      }
      
      return new TokenError(
        `Failed to get token account info: ${error.message}`,
        params.mint,
        params.tokenAccount,
        { cause: error }
      );
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError(
        "Invalid parameters for getting token account info",
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
export const getTokenAccountInfoTool = {
  name: "getTokenAccountInfo",
  description: "Retrieves information about SPL token accounts by account address, owner, or mint",
  
  parameters: {
    type: "object",
    properties: {
      tokenAccount: {
        type: "string",
        description: "Specific token account address to query (base58 encoded public key)"
      },
      owner: {
        type: "string",
        description: "Owner address to find token accounts for (base58 encoded public key)"
      },
      mint: {
        type: "string",
        description: "Token mint address to find accounts for (base58 encoded public key)"
      },
      limit: {
        type: "number",
        description: "Maximum number of accounts to return (1-100)",
        default: 10
      },
      showZeroBalance: {
        type: "boolean",
        description: "Whether to include accounts with zero balance",
        default: false
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
    additionalProperties: false
  },
  
  execute: (params, connectionManager) => executeGetTokenAccountInfo(params, connectionManager)
};