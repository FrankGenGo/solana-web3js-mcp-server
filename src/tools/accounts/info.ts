/**
 * Get Account Info Tool
 * 
 * This tool fetches and decodes information about a Solana account.
 */

import { createSolanaRpc, base58, base64 } from '@solana/web3.js';
import type { Address, Commitment, AccountInfo } from '@solana/web3.js';
import { getLogger } from '../../utils/logging.js';
import { ConnectionManager } from '../../core/connection-manager.js';
import { ValidationError, PublicKeyError, ConnectionError, tryCatch } from '../../utils/errors.js';
import { SolanaAccountData, SolanaAddress } from '../../types/solana.js';

// Logger for this module
const logger = getLogger('get-account-info-tool');

// Tool parameter definition
export interface GetAccountInfoParams {
  // Account address to look up (required)
  address: SolanaAddress;
  
  // Cluster to connect to (defaults to mainnet-beta)
  cluster?: string;
  
  // Encoding for the account data (base58, base64, or jsonParsed)
  encoding?: 'base58' | 'base64' | 'jsonParsed';
  
  // Commitment level for the query
  commitment?: Commitment;
}

// Tool response type
export interface GetAccountInfoResult {
  // Account exists flag
  exists: boolean;
  
  // Account data if exists
  account?: SolanaAccountData;
  
  // Raw data format - depends on encoding
  rawData?: string | any;
  
  // Lamports in the account
  lamports?: number;
  
  // Owner program of the account
  owner?: string;
  
  // Whether the account is executable
  executable?: boolean;
  
  // Rent epoch
  rentEpoch?: number;
}

/**
 * Gets information about a Solana account
 * 
 * @param params - Tool parameters
 * @param connectionManager - Connection manager instance
 * @returns Account information
 */
async function execute(
  params: GetAccountInfoParams,
  connectionManager: ConnectionManager
): Promise<GetAccountInfoResult> {
  logger.info('Getting account info', {
    address: params.address,
    cluster: params.cluster,
    encoding: params.encoding,
    commitment: params.commitment
  });
  
  // Validate and normalize parameters
  const cluster = params.cluster || 'mainnet';
  const encoding = params.encoding || 'base64';
  const commitment = params.commitment || 'confirmed';
  
  return tryCatch(async () => {
    try {
      // Get RPC client from connection manager
      const rpcClient = connectionManager.getConnection(cluster);
      
      // Convert string address to Address type if needed
      let accountAddress: Address;
      try {
        if (typeof params.address === 'string') {
          accountAddress = params.address as Address;
        } else {
          accountAddress = params.address;
        }
      } catch (error) {
        throw new ValidationError(
          'Invalid account address format',
          'address',
          { cause: error }
        );
      }
      
      // Get account info from the RPC client
      // In web3.js v2.0, we need to use .send() after the RPC method call
      const accountInfo = await rpcClient.getAccountInfo(accountAddress, {
        commitment,
        encoding
      }).send();
      
      // If account doesn't exist, return exists: false
      if (!accountInfo) {
        logger.info('Account not found', { address: params.address });
        return { exists: false };
      }
      
      // Build response with account data
      const result: GetAccountInfoResult = {
        exists: true,
        lamports: accountInfo.lamports,
        owner: accountInfo.owner.toString(),
        executable: accountInfo.executable,
        rentEpoch: accountInfo.rentEpoch
      };
      
      // Format the data according to encoding
      if (encoding === 'jsonParsed') {
        // If data was returned in parsed format
        result.rawData = accountInfo.data;
      } else if (encoding === 'base58') {
        // If data was returned in base58 format
        result.rawData = accountInfo.data;
      } else {
        // Default data format is base64
        result.rawData = accountInfo.data;
      }
      
      // Create standardized account structure
      result.account = {
        address: accountAddress,
        owner: accountInfo.owner,
        lamports: accountInfo.lamports,
        executable: accountInfo.executable,
        rentEpoch: accountInfo.rentEpoch,
        data: accountInfo.data
      };
      
      logger.info('Successfully retrieved account info', {
        address: params.address,
        exists: true,
        owner: result.owner,
        hasData: !!result.rawData
      });
      
      return result;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof PublicKeyError) {
        // Rethrow validation errors as they already contain correct info
        throw error;
      }
      
      // Wrap any other error
      throw new ConnectionError(
        `Failed to get account info: ${error.message}`,
        cluster,
        connectionManager.getEndpoint(cluster),
        { cause: error }
      );
    }
  }, (error) => {
    // Final error handler that converts to user-friendly format
    if (error instanceof ValidationError || 
        error instanceof PublicKeyError ||
        error instanceof ConnectionError) {
      // Just rethrow specialized errors
      throw error;
    }
    
    // Convert general errors to connection errors
    return new ConnectionError(
      `Failed to get account info: ${error.message}`,
      cluster,
      connectionManager.getEndpoint(cluster),
      { cause: error }
    );
  });
}

/**
 * Tool definition for the MCP server
 */
export const getAccountInfoTool = {
  name: 'getAccountInfo',
  description: 'Gets detailed information about a Solana account',
  
  parameters: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Solana account address (public key) to get information about'
      },
      cluster: {
        type: 'string',
        description: 'Solana cluster to use (mainnet, testnet, devnet, or custom URL)',
        default: 'mainnet'
      },
      encoding: {
        type: 'string',
        enum: ['base58', 'base64', 'jsonParsed'],
        description: 'Encoding format for the account data',
        default: 'base64'
      },
      commitment: {
        type: 'string',
        enum: ['processed', 'confirmed', 'finalized'],
        description: 'Commitment level for the query',
        default: 'confirmed'
      }
    },
    required: ['address'],
    additionalProperties: false
  },
  
  execute
};