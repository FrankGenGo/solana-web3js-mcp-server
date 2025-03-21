/**
 * Program Deployment Tool
 * 
 * This tool allows deploying Solana programs to any cluster.
 * It supports both regular (BPFLoader2022) and upgradeable (BPFLoaderUpgradeable) deployment modes.
 */

import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  BpfLoader,
  BpfLoaderUpgradeable,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Commitment
} from "@solana/web3.js";
import fs from "fs";
import { z } from "zod";
import { getLogger } from "../../utils/logging.js";
import { 
  AccountError, 
  ProgramError, 
  ValidationError, 
  tryCatch 
} from "../../utils/errors.js";
import { getConnectionManager } from "../../core/connection-manager.js";
import * as bufferUtils from "./utils/buffer-utils.js";
import * as loaderUtils from "./utils/loader-utils.js";
import { DeploymentMode, PROGRAM_IDS } from "./utils/constants.js";

// Logger for this module
const logger = getLogger("deploy-program-tool");

// Define input parameter schema using Zod for validation
const deployProgramParamsSchema = z.object({
  // Required parameters
  programPath: z.string().min(1).optional(),
  programData: z.instanceof(Buffer).optional(),
  payerKeypair: z.string().min(32),
  
  // Optional parameters with defaults
  programKeypair: z.string().optional(),
  cluster: z.string().default("mainnet"),
  deploymentMode: z.nativeEnum(DeploymentMode).default(DeploymentMode.Immutable),
  upgradeAuthority: z.string().optional(),
  maxDataSize: z.number().positive().optional(),
  simulate: z.boolean().default(false),
  commitment: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  skipPreflight: z.boolean().default(false),
  
  // Transaction version
  useVersionedTransactions: z.boolean().default(false),
}).refine(
  data => data.programPath !== undefined || data.programData !== undefined,
  {
    message: "Either programPath or programData must be provided",
    path: ["programPath"]
  }
);

// Type for the tool parameters
export type DeployProgramParams = z.infer<typeof deployProgramParamsSchema>;

// Type for the tool response
export interface DeployProgramResult {
  // Basic deployment information
  programId: string;
  success: boolean;
  deploymentMode: DeploymentMode;
  
  // Deployment transaction details
  signature?: string;
  
  // Additional information for upgradeable programs
  programDataAccount?: string;
  upgradeAuthority?: string;
  
  // Simulation results (if simulated)
  simulation?: {
    logs: string[];
    units: number;
    estimatedFee: number;
    message?: string;
  };
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
 * Deploys a Solana program
 * 
 * This tool allows deploying a Solana program to any cluster.
 * It supports both regular (immutable) and upgradeable deployment modes.
 * 
 * @param params - Tool parameters
 * @returns Object containing the deployment result
 */
async function executeDeployProgram(params: DeployProgramParams): Promise<DeployProgramResult> {
  logger.info("Deploying Solana program", { 
    deploymentMode: params.deploymentMode,
    cluster: params.cluster,
    simulate: params.simulate,
    hasProgramPath: !!params.programPath,
    hasProgramData: !!params.programData,
  });
  
  try {
    // Validate input parameters
    const validatedParams = deployProgramParamsSchema.parse(params);
    
    // Set up deployment
    return tryCatch(async () => {
      // Parse keypairs
      const payerKeypair = parseKeypairFromString(
        validatedParams.payerKeypair, 
        "payerKeypair"
      );
      
      let programKeypair: Keypair | undefined;
      if (validatedParams.programKeypair) {
        programKeypair = parseKeypairFromString(
          validatedParams.programKeypair,
          "programKeypair"
        );
      } else {
        // Generate a new keypair if not provided
        programKeypair = Keypair.generate();
        logger.info("Generated new program keypair", { 
          programId: programKeypair.publicKey.toString() 
        });
      }
      
      let upgradeAuthorityKeypair: Keypair | undefined;
      if (validatedParams.deploymentMode === DeploymentMode.Upgradeable) {
        if (validatedParams.upgradeAuthority) {
          upgradeAuthorityKeypair = parseKeypairFromString(
            validatedParams.upgradeAuthority,
            "upgradeAuthority"
          );
        } else {
          // Use payer as upgrade authority if not specified
          upgradeAuthorityKeypair = payerKeypair;
          logger.info("Using payer as upgrade authority");
        }
      }
      
      // Get connection
      const connectionManager = getConnectionManager();
      const connection = connectionManager.getConnection(validatedParams.cluster);
      
      // Load program data
      let programData: Buffer;
      if (validatedParams.programData) {
        programData = bufferUtils.loadProgramFromBuffer(validatedParams.programData);
      } else if (validatedParams.programPath) {
        programData = await bufferUtils.loadProgramFromFile(validatedParams.programPath);
      } else {
        // This should never happen due to the schema refinement
        throw new ValidationError(
          "Either programPath or programData must be provided",
          "programPath"
        );
      }
      
      logger.info("Program binary loaded", { 
        size: programData.length,
        deployment: validatedParams.deploymentMode
      });
      
      // Execute the appropriate deployment mode
      if (validatedParams.deploymentMode === DeploymentMode.Immutable) {
        return await deployImmutableProgram(
          connection,
          programData,
          payerKeypair,
          programKeypair,
          validatedParams
        );
      } else {
        return await deployUpgradeableProgram(
          connection,
          programData,
          payerKeypair,
          programKeypair,
          upgradeAuthorityKeypair!,
          validatedParams
        );
      }
    }, (error) => {
      // Map to appropriate error type if not already a SolanaServerError
      if (error instanceof ValidationError || 
          error instanceof AccountError || 
          error instanceof ProgramError) {
        return error;
      }
      
      return new ProgramError(
        `Failed to deploy program: ${error.message}`,
        programKeypair?.publicKey.toString(),
        undefined,
        { cause: error }
      );
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const validationError = new ValidationError(
        "Invalid parameters for program deployment",
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

/**
 * Deploys an immutable program using BPFLoader2
 * 
 * @param connection - Solana connection
 * @param programData - Program binary data
 * @param payerKeypair - Keypair that will pay for the deployment
 * @param programKeypair - Keypair for the program
 * @param params - Other deployment parameters
 * @returns Deployment result
 */
async function deployImmutableProgram(
  connection: Connection,
  programData: Buffer,
  payerKeypair: Keypair,
  programKeypair: Keypair,
  params: DeployProgramParams
): Promise<DeployProgramResult> {
  logger.info("Deploying immutable program", { 
    programId: programKeypair.publicKey.toString(),
    size: programData.length
  });
  
  // Check if program account already exists
  const existingAccount = await connection.getAccountInfo(programKeypair.publicKey);
  if (existingAccount) {
    throw new AccountError(
      `Program account already exists at ${programKeypair.publicKey.toString()}`,
      programKeypair.publicKey.toString()
    );
  }
  
  // Estimate costs
  const rentExemptBalance = await connection.getMinimumBalanceForRentExemption(
    programData.length
  );
  
  logger.info("Estimated deployment cost", {
    rentLamports: rentExemptBalance,
    rentSol: rentExemptBalance / LAMPORTS_PER_SOL
  });
  
  // If simulation mode, don't actually deploy
  if (params.simulate) {
    try {
      // Create a transaction to simulate
      const simulationTransaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payerKeypair.publicKey,
          newAccountPubkey: programKeypair.publicKey,
          lamports: rentExemptBalance,
          space: programData.length,
          programId: PROGRAM_IDS.BPF_LOADER_2
        })
      );
      
      // Simulate the transaction
      const simulation = await connection.simulateTransaction(simulationTransaction);
      
      logger.info("Simulation result", {
        success: simulation.value.err === null,
        logs: simulation.value.logs?.length || 0
      });
      
      // Return simulation results
      return {
        programId: programKeypair.publicKey.toString(),
        success: simulation.value.err === null,
        deploymentMode: DeploymentMode.Immutable,
        simulation: {
          logs: simulation.value.logs || [],
          units: simulation.value.unitsConsumed || 0,
          estimatedFee: rentExemptBalance,
          message: simulation.value.err?.toString()
        }
      };
    } catch (error) {
      logger.error("Simulation failed", { error });
      throw new ProgramError(
        `Simulation failed: ${error instanceof Error ? error.message : String(error)}`,
        programKeypair.publicKey.toString(),
        undefined,
        { cause: error }
      );
    }
  }
  
  // Create the program account
  const { programKeypair: bpfProgramKeypair } = await loaderUtils.createBPFLoader2ProgramAccount({
    connection,
    payer: payerKeypair,
    programKeypair,
    programDataSize: programData.length,
    commitment: params.commitment
  });
  
  // Write program data to the account
  await loaderUtils.writeProgramData({
    connection,
    payer: payerKeypair,
    programData,
    programAccount: bpfProgramKeypair.publicKey,
    commitment: params.commitment
  });
  
  // Deploy (finalize) the program
  const deployResult = await loaderUtils.deployBPFLoader2Program({
    connection,
    payer: payerKeypair,
    programAccount: bpfProgramKeypair.publicKey,
    commitment: params.commitment
  });
  
  logger.info("Program deployed successfully", {
    programId: deployResult.programId,
    signature: deployResult.signature,
    mode: DeploymentMode.Immutable
  });
  
  // Return the result
  return {
    programId: deployResult.programId,
    success: true,
    deploymentMode: DeploymentMode.Immutable,
    signature: deployResult.signature
  };
}

/**
 * Deploys an upgradeable program using BPFLoaderUpgradeable
 * 
 * @param connection - Solana connection
 * @param programData - Program binary data
 * @param payerKeypair - Keypair that will pay for the deployment
 * @param programKeypair - Keypair for the program
 * @param upgradeAuthorityKeypair - Keypair that will have authority to upgrade the program
 * @param params - Other deployment parameters
 * @returns Deployment result
 */
async function deployUpgradeableProgram(
  connection: Connection,
  programData: Buffer,
  payerKeypair: Keypair,
  programKeypair: Keypair,
  upgradeAuthorityKeypair: Keypair,
  params: DeployProgramParams
): Promise<DeployProgramResult> {
  logger.info("Deploying upgradeable program", { 
    programId: programKeypair.publicKey.toString(),
    size: programData.length,
    upgradeAuthority: upgradeAuthorityKeypair.publicKey.toString()
  });
  
  // Check if program account already exists
  const existingAccount = await connection.getAccountInfo(programKeypair.publicKey);
  if (existingAccount) {
    throw new AccountError(
      `Program account already exists at ${programKeypair.publicKey.toString()}`,
      programKeypair.publicKey.toString()
    );
  }
  
  // Get the max data size for future upgrades
  const maxDataSize = params.maxDataSize || programData.length;
  
  // Calculate the program data address
  const [programDataAddress] = await PublicKey.findProgramAddress(
    [programKeypair.publicKey.toBuffer()],
    PROGRAM_IDS.BPF_LOADER_UPGRADEABLE
  );
  
  // Estimate costs
  const rentExemptBalance = await loaderUtils.calculateProgramDeploymentRent(
    connection,
    programData.length,
    true,
    maxDataSize
  );
  
  logger.info("Estimated deployment cost", {
    rentLamports: rentExemptBalance,
    rentSol: rentExemptBalance / LAMPORTS_PER_SOL,
    programDataAddress: programDataAddress.toString(),
    maxDataSize
  });
  
  // If simulation mode, don't actually deploy
  if (params.simulate) {
    try {
      // Create a transaction to simulate
      const simulationTransaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payerKeypair.publicKey,
          newAccountPubkey: programKeypair.publicKey,
          lamports: await connection.getMinimumBalanceForRentExemption(
            loaderUtils.PROGRAM_ACCOUNT.SIZE
          ),
          space: loaderUtils.PROGRAM_ACCOUNT.SIZE,
          programId: PROGRAM_IDS.BPF_LOADER_UPGRADEABLE
        })
      );
      
      // Simulate the transaction
      const simulation = await connection.simulateTransaction(simulationTransaction);
      
      logger.info("Simulation result", {
        success: simulation.value.err === null,
        logs: simulation.value.logs?.length || 0
      });
      
      // Return simulation results
      return {
        programId: programKeypair.publicKey.toString(),
        success: simulation.value.err === null,
        deploymentMode: DeploymentMode.Upgradeable,
        upgradeAuthority: upgradeAuthorityKeypair.publicKey.toString(),
        programDataAccount: programDataAddress.toString(),
        simulation: {
          logs: simulation.value.logs || [],
          units: simulation.value.unitsConsumed || 0,
          estimatedFee: rentExemptBalance,
          message: simulation.value.err?.toString()
        }
      };
    } catch (error) {
      logger.error("Simulation failed", { error });
      throw new ProgramError(
        `Simulation failed: ${error instanceof Error ? error.message : String(error)}`,
        programKeypair.publicKey.toString(),
        undefined,
        { cause: error }
      );
    }
  }
  
  // Create the program accounts (buffer and eventual program)
  const { 
    bufferKeypair, 
    bufferSize
  } = await loaderUtils.createUpgradeableProgramAccounts({
    connection,
    payer: payerKeypair,
    programKeypair,
    programDataSize: programData.length,
    upgradeAuthority: upgradeAuthorityKeypair.publicKey,
    maxDataSize,
    commitment: params.commitment
  });
  
  // Write program data to the buffer account
  await loaderUtils.writeProgramData({
    connection,
    payer: payerKeypair,
    programData,
    bufferAccount: bufferKeypair.publicKey,
    bufferAuthority: upgradeAuthorityKeypair,
    commitment: params.commitment
  });
  
  // Deploy the program
  const deployResult = await loaderUtils.deployUpgradeableProgram({
    connection,
    payer: payerKeypair,
    programKeypair,
    bufferAccount: bufferKeypair.publicKey,
    upgradeAuthority: upgradeAuthorityKeypair,
    maxDataSize,
    commitment: params.commitment
  });
  
  logger.info("Program deployed successfully", {
    programId: deployResult.programId,
    signature: deployResult.signature,
    programDataAccount: deployResult.programDataAccount,
    upgradeAuthority: deployResult.upgradeAuthority,
    mode: DeploymentMode.Upgradeable
  });
  
  // Return the result
  return {
    programId: deployResult.programId,
    success: true,
    deploymentMode: DeploymentMode.Upgradeable,
    signature: deployResult.signature,
    programDataAccount: deployResult.programDataAccount,
    upgradeAuthority: deployResult.upgradeAuthority
  };
}

// Define the MCP tool
export const deployProgramTool = {
  name: "deployProgram",
  description: "Deploy a Solana program to any cluster in either immutable or upgradeable mode",
  
  parameters: {
    type: "object",
    properties: {
      programPath: {
        type: "string",
        description: "Path to the compiled program file (.so)"
      },
      programData: {
        type: "object",
        description: "Program binary data as a Buffer (alternative to programPath)"
      },
      payerKeypair: {
        type: "string",
        description: "Keypair that will pay for the deployment (JSON array or base58 encoded secret key)"
      },
      programKeypair: {
        type: "string",
        description: "Optional keypair for the program (JSON array or base58 encoded secret key). If not provided, a new keypair will be generated."
      },
      cluster: {
        type: "string",
        description: "Solana cluster to deploy to (mainnet, testnet, devnet, localnet)",
        default: "mainnet"
      },
      deploymentMode: {
        type: "string",
        enum: Object.values(DeploymentMode),
        description: "Deployment mode (immutable or upgradeable)",
        default: DeploymentMode.Immutable
      },
      upgradeAuthority: {
        type: "string",
        description: "For upgradeable programs, the upgrade authority keypair (JSON array or base58 encoded secret key). If not provided, payer will be used."
      },
      maxDataSize: {
        type: "number",
        description: "For upgradeable programs, the maximum size the program can be upgraded to in the future (in bytes). Defaults to current program size."
      },
      simulate: {
        type: "boolean",
        description: "If true, only simulate the deployment without actually deploying",
        default: false
      },
      commitment: {
        type: "string",
        enum: ["processed", "confirmed", "finalized"],
        description: "Commitment level for transaction confirmation",
        default: "confirmed"
      },
      skipPreflight: {
        type: "boolean",
        description: "If true, skip the preflight transaction checks",
        default: false
      },
      useVersionedTransactions: {
        type: "boolean",
        description: "If true, use versioned transactions (requires recent Solana version)",
        default: false
      }
    },
    required: ["payerKeypair"],
    additionalProperties: false
  },
  
  execute: executeDeployProgram
};