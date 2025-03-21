/**
 * MCP tool for upgrading Solana programs
 * 
 * This tool allows upgrading existing upgradeable Solana programs by
 * deploying a new program binary while maintaining the same program ID.
 */

import { PublicKey, Keypair } from '@solana/web3.js';
import { z } from 'zod';
import { ConnectionManager } from '../../core/connection-manager';
import { logger } from '../../utils/logging';
import { ProgramError, ValidationError } from '../../utils/errors';
import {
  createBufferAccount,
  isProgramUpgradeable,
  upgradeProgram,
  writeProgram,
} from './utils/loader-utils';
import { loadProgramFromPath, loadProgramFromBuffer } from './utils/buffer-utils';
import { BPF_LOADER_UPGRADEABLE } from './utils/constants';

// Schema for input validation
const upgradeToolParams = z.object({
  programId: z
    .string()
    .min(1, 'Program ID is required')
    .refine((value) => {
      try {
        new PublicKey(value);
        return true;
      } catch (error) {
        return false;
      }
    }, 'Invalid program ID format'),
  
  programPath: z
    .string()
    .optional()
    .describe('Path to the program binary file (.so)'),
  
  programBuffer: z
    .string()
    .optional()
    .describe('Base64-encoded program binary data'),
  
  upgradeAuthority: z
    .string()
    .min(1, 'Upgrade authority is required')
    .describe('Base58-encoded private key of the upgrade authority'),
  
  cluster: z
    .enum(['mainnet-beta', 'testnet', 'devnet', 'localnet', 'custom'])
    .default('devnet')
    .describe('Solana cluster to connect to'),
  
  customClusterUrl: z
    .string()
    .optional()
    .describe('URL for custom cluster (required if cluster is "custom")'),
  
  simulate: z
    .boolean()
    .default(false)
    .describe('Simulate the upgrade without submitting to the network'),
})
.refine(
  (data) => data.programPath || data.programBuffer,
  {
    message: 'Either programPath or programBuffer must be provided',
    path: ['programPath', 'programBuffer'],
  }
)
.refine(
  (data) => data.cluster !== 'custom' || data.customClusterUrl,
  {
    message: 'customClusterUrl is required when cluster is "custom"',
    path: ['customClusterUrl'],
  }
);

// Input type based on the schema
type UpgradeToolParams = z.infer<typeof upgradeToolParams>;

// Result type for the upgrade operation
interface UpgradeToolResult {
  programId: string;
  signature?: string;
  success: boolean;
  message: string;
  programDataAddress?: string;
  upgradeAuthority: string;
  simulation?: {
    estimatedCost: number;
    logs: string[];
  };
}

/**
 * Execute the upgrade process for a Solana program
 * 
 * @param params Parameters for upgrading the program
 * @param connectionManager Connection manager instance
 * @returns Result of the upgrade operation
 */
async function execute(
  params: UpgradeToolParams,
  connectionManager: ConnectionManager,
): Promise<UpgradeToolResult> {
  try {
    // Validate parameters
    const validatedParams = upgradeToolParams.parse(params);
    
    // Setup connection based on cluster information
    const connection = connectionManager.getConnection(
      validatedParams.cluster,
      validatedParams.customClusterUrl
    );
    
    // Parse parameters
    const programId = new PublicKey(validatedParams.programId);
    const upgradeAuthority = Keypair.fromSecretKey(
      Buffer.from(validatedParams.upgradeAuthority, 'base58')
    );
    
    // Load program binary
    let programData: Buffer;
    if (validatedParams.programPath) {
      programData = await loadProgramFromPath(validatedParams.programPath);
    } else if (validatedParams.programBuffer) {
      programData = loadProgramFromBuffer(validatedParams.programBuffer);
    } else {
      throw new ValidationError('Neither programPath nor programBuffer provided');
    }
    
    logger.info(`Loaded program binary: ${programData.length} bytes`);
    
    // Check if the program is upgradeable
    const isProgramUpgradeable = await isProgramUpgradeable(connection, programId);
    if (!isProgramUpgradeable) {
      throw new ProgramError(
        'Program is not upgradeable. Only programs deployed with BPF Loader Upgradeable can be upgraded.'
      );
    }
    
    // Create a new buffer account to hold the program data
    logger.info('Creating buffer account for program data...');
    const bufferAccount = Keypair.generate();
    await createBufferAccount(
      connection,
      upgradeAuthority,
      bufferAccount,
      programData.length,
      BPF_LOADER_UPGRADEABLE
    );
    
    // Write program data to the buffer account
    logger.info('Writing program data to buffer account...');
    await writeProgram(
      connection,
      upgradeAuthority,
      bufferAccount.publicKey,
      programData,
      BPF_LOADER_UPGRADEABLE
    );
    
    // If simulation only, return estimated costs
    if (validatedParams.simulate) {
      logger.info('Simulating program upgrade...');
      const simulation = await connection.simulateTransaction(
        await upgradeProgram(
          connection,
          upgradeAuthority,
          programId,
          bufferAccount.publicKey,
          upgradeAuthority,
          true
        ).transaction
      );
      
      return {
        programId: programId.toBase58(),
        success: true,
        message: 'Program upgrade simulation completed successfully',
        upgradeAuthority: upgradeAuthority.publicKey.toBase58(),
        simulation: {
          estimatedCost: 0, // Actual cost calculation would require manual parsing of simulation results
          logs: simulation.value.logs || [],
        },
      };
    }
    
    // Perform the actual upgrade
    logger.info(`Upgrading program ${programId.toBase58()}...`);
    const result = await upgradeProgram(
      connection,
      upgradeAuthority,
      programId,
      bufferAccount.publicKey,
      upgradeAuthority
    );
    
    logger.info(`Program upgraded successfully, signature: ${result.signature}`);
    
    return {
      programId: programId.toBase58(),
      signature: result.signature,
      success: true,
      message: 'Program upgraded successfully',
      programDataAddress: result.programDataAddress.toBase58(),
      upgradeAuthority: upgradeAuthority.publicKey.toBase58(),
    };
  } catch (error) {
    logger.error('Error upgrading program:', error);
    
    if (error instanceof ValidationError || error instanceof ProgramError) {
      return {
        programId: params.programId,
        success: false,
        message: error.message,
        upgradeAuthority: params.upgradeAuthority,
      };
    }
    
    return {
      programId: params.programId,
      success: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      upgradeAuthority: params.upgradeAuthority,
    };
  }
}

// Export the MCP tool definition
export const upgradeProgram = {
  name: 'upgradeProgram',
  description: 'Upgrade an existing upgradeable Solana program with a new binary while maintaining the same program ID',
  parameters: upgradeToolParams,
  execute,
};