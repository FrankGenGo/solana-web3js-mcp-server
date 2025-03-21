/**
 * Loader Utilities for Solana Program Deployment
 * 
 * This module provides utilities for interacting with different BPF loaders in Solana,
 * including functions for program account creation, program data writing, and deployment.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  BpfLoader,
  BpfLoaderUpgradeable,
  sendAndConfirmTransaction,
  Signer,
  LAMPORTS_PER_SOL,
  Commitment,
} from '@solana/web3.js';
import { getLogger } from '../../../utils/logging.js';
import { 
  AccountError, 
  ProgramError, 
  ValidationError, 
  tryCatch 
} from '../../../utils/errors.js';
import { PROGRAM_IDS, BUFFER_ACCOUNT, PROGRAM_ACCOUNT, PROGRAM_DATA_ACCOUNT } from './constants.js';

// Logger for this module
const logger = getLogger('loader-utils');

/**
 * Options for creating a program account
 */
export interface CreateProgramAccountOptions {
  /** The connection to use for the operation */
  connection: Connection;
  
  /** The payer for the transaction */
  payer: Keypair;
  
  /** Optional program keypair (if not provided, one will be generated) */
  programKeypair?: Keypair;
  
  /** Size of the program binary in bytes */
  programDataSize: number;
  
  /** Commitment level for transaction confirmation */
  commitment?: Commitment;
  
  /** For upgradeable programs, the authority that can upgrade the program */
  upgradeAuthority?: PublicKey;
  
  /** For upgradeable programs, the maximum data size for future upgrades */
  maxDataSize?: number;
}

/**
 * Options for writing program data
 */
export interface WriteProgramDataOptions {
  /** The connection to use for the operation */
  connection: Connection;
  
  /** The payer for the transaction */
  payer: Keypair;
  
  /** The program data as a Buffer */
  programData: Buffer;
  
  /** For BPFLoader2: The program account to write to */
  programAccount?: PublicKey;
  
  /** For BPFLoaderUpgradeable: The buffer account to write to */
  bufferAccount?: PublicKey;
  
  /** For BPFLoaderUpgradeable: The authority that can write to the buffer */
  bufferAuthority?: Keypair;
  
  /** Commitment level for transaction confirmation */
  commitment?: Commitment;
  
  /** Chunk size in bytes (default: BPFLoader.chunkSize) */
  chunkSize?: number;
}

/**
 * Options for deploying a program
 */
export interface DeployProgramOptions {
  /** The connection to use for the operation */
  connection: Connection;
  
  /** The payer for the transaction */
  payer: Keypair;
  
  /** For BPFLoader2: The program account to deploy */
  programAccount?: PublicKey;
  
  /** For BPFLoaderUpgradeable: The program keypair */
  programKeypair?: Keypair;
  
  /** For BPFLoaderUpgradeable: The buffer containing the program data */
  bufferAccount?: PublicKey;
  
  /** For BPFLoaderUpgradeable: The authority that can upgrade the program */
  upgradeAuthority?: Keypair;
  
  /** Commitment level for transaction confirmation */
  commitment?: Commitment;
}

/**
 * Result of a program deployment or upgrade operation
 */
export interface ProgramDeploymentResult {
  /** Public key of the deployed program */
  programId: string;
  
  /** Signature of the deployment transaction */
  signature: string;
  
  /** For upgradeable programs, the program data account */
  programDataAccount?: string;
  
  /** For upgradeable programs, the authority that can upgrade the program */
  upgradeAuthority?: string;
}

/**
 * Creates a program account using BPFLoader2 (immutable programs)
 * 
 * @param options - Options for creating the program account
 * @returns Object containing the program keypair
 */
export async function createBPFLoader2ProgramAccount(
  options: Omit<CreateProgramAccountOptions, 'upgradeAuthority' | 'maxDataSize'>
): Promise<{ programKeypair: Keypair }> {
  logger.info('Creating program account using BPFLoader2');
  
  return tryCatch(async () => {
    // Generate program keypair if not provided
    const programKeypair = options.programKeypair || Keypair.generate();
    
    // Get minimum balance for rent exemption
    const programDataAccountSize = options.programDataSize;
    const rentExemptBalance = await options.connection.getMinimumBalanceForRentExemption(
      programDataAccountSize
    );
    
    logger.debug('Calculated rent exempt balance', {
      programSize: programDataAccountSize,
      rentLamports: rentExemptBalance,
      rentSOL: rentExemptBalance / LAMPORTS_PER_SOL
    });
    
    // Create transaction to create program account
    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: options.payer.publicKey,
        newAccountPubkey: programKeypair.publicKey,
        lamports: rentExemptBalance,
        space: programDataAccountSize,
        programId: PROGRAM_IDS.BPF_LOADER_2
      })
    );
    
    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      options.connection,
      transaction,
      [options.payer, programKeypair],
      { commitment: options.commitment || 'confirmed' }
    );
    
    logger.info('Successfully created BPFLoader2 program account', {
      programId: programKeypair.publicKey.toString(),
      signature
    });
    
    return { programKeypair };
  }, (error) => new AccountError(
    `Failed to create BPFLoader2 program account: ${error.message}`,
    undefined,
    { cause: error }
  ));
}

/**
 * Creates accounts needed for an upgradeable program deployment
 * 
 * @param options - Options for creating the program account
 * @returns Object containing the program keypair and buffer keypair
 */
export async function createUpgradeableProgramAccounts(
  options: CreateProgramAccountOptions
): Promise<{ 
  programKeypair: Keypair, 
  bufferKeypair: Keypair,
  bufferSize: number
}> {
  logger.info('Creating accounts for upgradeable program deployment');
  
  return tryCatch(async () => {
    // Generate program keypair if not provided
    const programKeypair = options.programKeypair || Keypair.generate();
    const bufferKeypair = Keypair.generate();
    
    // Ensure we have an upgrade authority
    const upgradeAuthority = options.upgradeAuthority || options.payer.publicKey;
    
    // Calculate buffer size
    const maxDataSize = options.maxDataSize || options.programDataSize;
    const bufferSize = options.programDataSize;
    
    // Create buffer account
    const createBufferTransaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: options.payer.publicKey,
        newAccountPubkey: bufferKeypair.publicKey,
        lamports: await options.connection.getMinimumBalanceForRentExemption(
          bufferSize + BUFFER_ACCOUNT.METADATA_SIZE
        ),
        space: bufferSize + BUFFER_ACCOUNT.METADATA_SIZE,
        programId: PROGRAM_IDS.BPF_LOADER_UPGRADEABLE
      }),
      BpfLoaderUpgradeable.createBuffer({
        authority: upgradeAuthority,
        bufferKeys: bufferKeypair,
        isLatestVersion: false,
        payerKeys: options.payer,
        size: bufferSize
      })
    );
    
    // Send and confirm buffer creation transaction
    const createBufferSignature = await sendAndConfirmTransaction(
      options.connection,
      createBufferTransaction,
      [options.payer, bufferKeypair],
      { commitment: options.commitment || 'confirmed' }
    );
    
    logger.info('Successfully created buffer account', {
      buffer: bufferKeypair.publicKey.toString(),
      signature: createBufferSignature,
      size: bufferSize
    });
    
    return { programKeypair, bufferKeypair, bufferSize };
  }, (error) => new AccountError(
    `Failed to create upgradeable program accounts: ${error.message}`,
    undefined,
    { cause: error }
  ));
}

/**
 * Writes program data to a BPFLoader2 program account
 * 
 * @param options - Options for writing program data
 * @returns Signature of the last transaction
 */
export async function writeProgramData(
  options: WriteProgramDataOptions
): Promise<string> {
  if (!options.programAccount && !options.bufferAccount) {
    throw new ValidationError(
      'Either programAccount (for BPFLoader2) or bufferAccount (for BPFLoaderUpgradeable) must be provided',
      'options',
      { code: 'MISSING_ACCOUNT' }
    );
  }
  
  const useUpgradeable = !!options.bufferAccount;
  const accountType = useUpgradeable ? 'buffer' : 'program';
  const targetAccount = useUpgradeable ? options.bufferAccount! : options.programAccount!;
  
  logger.info(`Writing program data to ${accountType} account`, {
    account: targetAccount.toString(),
    dataSize: options.programData.length,
    useUpgradeable
  });
  
  return tryCatch(async () => {
    // Get chunk size, defaulting to BPFLoader.chunkSize
    const chunkSize = options.chunkSize || BpfLoader.chunkSize;
    
    // Break the program data into chunks and write each chunk
    let lastSignature: string = '';
    
    for (let offset = 0; offset < options.programData.length; offset += chunkSize) {
      const chunkSize = Math.min(options.chunkSize || BpfLoader.chunkSize, options.programData.length - offset);
      const chunk = options.programData.slice(offset, offset + chunkSize);
      
      logger.debug(`Writing program data chunk`, {
        offset,
        chunkSize,
        progress: `${offset}/${options.programData.length} bytes (${Math.round((offset/options.programData.length)*100)}%)`
      });
      
      let transaction: Transaction;
      
      if (useUpgradeable) {
        // For upgradeable loader, use write instruction
        if (!options.bufferAuthority) {
          throw new ValidationError(
            'bufferAuthority is required for writing to an upgradeable buffer',
            'bufferAuthority',
            { code: 'MISSING_AUTHORITY' }
          );
        }
        
        transaction = new Transaction().add(
          BpfLoaderUpgradeable.write({
            authority: options.bufferAuthority.publicKey,
            buffer: options.bufferAccount!,
            offset
          }, chunk)
        );
      } else {
        // For BPFLoader2, use load instruction
        transaction = new Transaction().add(
          BpfLoader.load(
            options.programAccount!,
            options.payer.publicKey,
            offset,
            chunk
          )
        );
      }
      
      // Set up signers
      const signers: Signer[] = [options.payer];
      if (useUpgradeable && options.bufferAuthority) {
        signers.push(options.bufferAuthority);
      }
      
      // Send and confirm transaction
      lastSignature = await sendAndConfirmTransaction(
        options.connection,
        transaction,
        signers,
        { commitment: options.commitment || 'confirmed' }
      );
    }
    
    logger.info('Successfully wrote program data', {
      account: targetAccount.toString(),
      totalSize: options.programData.length,
      lastSignature
    });
    
    return lastSignature;
  }, (error) => new ProgramError(
    `Failed to write program data: ${error.message}`,
    undefined, 
    undefined,
    { cause: error }
  ));
}

/**
 * Deploys a program using BPFLoader2 (finalizes the load)
 * 
 * @param options - Options for deploying the program
 * @returns Result of the deployment operation
 */
export async function deployBPFLoader2Program(
  options: DeployProgramOptions & { programAccount: PublicKey }
): Promise<ProgramDeploymentResult> {
  logger.info('Deploying program using BPFLoader2', {
    programId: options.programAccount.toString()
  });
  
  return tryCatch(async () => {
    // For BPFLoader2, the program is already loaded and just needs to be finalized
    const transaction = new Transaction().add(
      BpfLoader.finalize(
        options.programAccount,
        options.payer.publicKey
      )
    );
    
    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      options.connection,
      transaction,
      [options.payer],
      { commitment: options.commitment || 'confirmed' }
    );
    
    logger.info('Successfully deployed BPFLoader2 program', {
      programId: options.programAccount.toString(),
      signature
    });
    
    return {
      programId: options.programAccount.toString(),
      signature
    };
  }, (error) => new ProgramError(
    `Failed to deploy BPFLoader2 program: ${error.message}`,
    options.programAccount.toString(),
    undefined,
    { cause: error }
  ));
}

/**
 * Deploys an upgradeable program
 * 
 * @param options - Options for deploying the program
 * @returns Result of the deployment operation
 */
export async function deployUpgradeableProgram(
  options: DeployProgramOptions & { 
    programKeypair: Keypair, 
    bufferAccount: PublicKey,
    upgradeAuthority: Keypair,
    maxDataSize?: number
  }
): Promise<ProgramDeploymentResult> {
  logger.info('Deploying upgradeable program', {
    programId: options.programKeypair.publicKey.toString(),
    buffer: options.bufferAccount.toString()
  });
  
  return tryCatch(async () => {
    // Calculate program rent and space
    const programSpace = PROGRAM_ACCOUNT.SIZE;
    const programRent = await options.connection.getMinimumBalanceForRentExemption(programSpace);
    
    // Calculate program data rent and space
    const bufferAccount = await options.connection.getAccountInfo(options.bufferAccount);
    if (!bufferAccount) {
      throw new AccountError(
        `Buffer account not found: ${options.bufferAccount.toString()}`,
        options.bufferAccount.toString()
      );
    }
    
    // The max data size defaults to the buffer data size
    const maxDataSize = options.maxDataSize || (bufferAccount.data.length - BUFFER_ACCOUNT.METADATA_SIZE);
    
    // Calculate program data space and rent
    const programDataSpace = maxDataSize + PROGRAM_DATA_ACCOUNT.METADATA_SIZE;
    const programDataRent = await options.connection.getMinimumBalanceForRentExemption(
      programDataSpace
    );
    
    logger.debug('Creating program accounts', {
      programSpace,
      programRent,
      programDataSpace,
      programDataRent,
      maxDataSize
    });
    
    // Create the program account and program data account, then deploy
    const [programDataAddress] = await PublicKey.findProgramAddress(
      [options.programKeypair.publicKey.toBuffer()],
      PROGRAM_IDS.BPF_LOADER_UPGRADEABLE
    );
    
    // Create transaction for deployment
    const deployTransaction = new Transaction().add(
      // Create program account
      SystemProgram.createAccount({
        fromPubkey: options.payer.publicKey,
        newAccountPubkey: options.programKeypair.publicKey,
        lamports: programRent,
        space: programSpace,
        programId: PROGRAM_IDS.BPF_LOADER_UPGRADEABLE
      }),
      
      // Deploy the program
      BpfLoaderUpgradeable.deployWithMaxDataLen({
        authority: options.upgradeAuthority.publicKey,
        buffer: options.bufferAccount,
        payerKeys: options.payer,
        programAddressKeys: options.programKeypair,
        upgradeAuthority: options.upgradeAuthority.publicKey,
        maxDataLen: maxDataSize
      })
    );
    
    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      options.connection,
      deployTransaction,
      [options.payer, options.programKeypair, options.upgradeAuthority],
      { commitment: options.commitment || 'confirmed' }
    );
    
    logger.info('Successfully deployed upgradeable program', {
      programId: options.programKeypair.publicKey.toString(),
      programData: programDataAddress.toString(),
      signature
    });
    
    return {
      programId: options.programKeypair.publicKey.toString(),
      signature,
      programDataAccount: programDataAddress.toString(),
      upgradeAuthority: options.upgradeAuthority.publicKey.toString()
    };
  }, (error) => new ProgramError(
    `Failed to deploy upgradeable program: ${error.message}`,
    options.programKeypair.publicKey.toString(),
    undefined,
    { cause: error }
  ));
}

/**
 * Upgrades an existing upgradeable program
 * 
 * @param options - Options for upgrading the program
 * @returns Result of the upgrade operation
 */
export async function upgradeProgram(
  options: {
    connection: Connection;
    payer: Keypair;
    programId: PublicKey;
    bufferAccount: PublicKey;
    upgradeAuthority: Keypair;
    commitment?: Commitment;
  }
): Promise<ProgramDeploymentResult> {
  logger.info('Upgrading program', {
    programId: options.programId.toString(),
    buffer: options.bufferAccount.toString()
  });
  
  return tryCatch(async () => {
    // Get the program data address
    const [programDataAddress] = await PublicKey.findProgramAddress(
      [options.programId.toBuffer()],
      PROGRAM_IDS.BPF_LOADER_UPGRADEABLE
    );
    
    // Create upgrade transaction
    const upgradeTransaction = new Transaction().add(
      BpfLoaderUpgradeable.upgrade({
        authority: options.upgradeAuthority.publicKey,
        buffer: options.bufferAccount,
        payerKeys: options.payer,
        programAddressKeys: options.programId,
        programDataAddressKeys: programDataAddress,
        upgradeAuthority: options.upgradeAuthority.publicKey,
      })
    );
    
    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      options.connection,
      upgradeTransaction,
      [options.payer, options.upgradeAuthority],
      { commitment: options.commitment || 'confirmed' }
    );
    
    logger.info('Successfully upgraded program', {
      programId: options.programId.toString(),
      programData: programDataAddress.toString(),
      signature
    });
    
    return {
      programId: options.programId.toString(),
      signature,
      programDataAccount: programDataAddress.toString(),
      upgradeAuthority: options.upgradeAuthority.publicKey.toString()
    };
  }, (error) => new ProgramError(
    `Failed to upgrade program: ${error.message}`,
    options.programId.toString(),
    undefined,
    { cause: error }
  ));
}

/**
 * Sets a new upgrade authority for an upgradeable program
 * 
 * @param options - Options for setting the upgrade authority
 * @returns Signature of the transaction
 */
export async function setUpgradeAuthority(
  options: {
    connection: Connection;
    payer: Keypair;
    programId: PublicKey;
    currentAuthority: Keypair;
    newAuthority: PublicKey | null; // null to remove authority, making program immutable
    commitment?: Commitment;
  }
): Promise<string> {
  logger.info('Setting program upgrade authority', {
    programId: options.programId.toString(),
    newAuthority: options.newAuthority?.toString() || 'none'
  });
  
  return tryCatch(async () => {
    // Get the program data address
    const [programDataAddress] = await PublicKey.findProgramAddress(
      [options.programId.toBuffer()],
      PROGRAM_IDS.BPF_LOADER_UPGRADEABLE
    );
    
    // Create set authority transaction
    const setAuthorityTransaction = new Transaction().add(
      BpfLoaderUpgradeable.setAuthority({
        authority: options.currentAuthority.publicKey,
        newAuthority: options.newAuthority,
        target: programDataAddress,
      })
    );
    
    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      options.connection,
      setAuthorityTransaction,
      [options.payer, options.currentAuthority],
      { commitment: options.commitment || 'confirmed' }
    );
    
    logger.info('Successfully set program upgrade authority', {
      programId: options.programId.toString(),
      newAuthority: options.newAuthority?.toString() || 'none',
      signature
    });
    
    return signature;
  }, (error) => new ProgramError(
    `Failed to set program upgrade authority: ${error.message}`,
    options.programId.toString(),
    undefined,
    { cause: error }
  ));
}

/**
 * Checks if a program is upgradeable by verifying it's owned by the upgradeable loader
 * 
 * @param connection - Solana connection
 * @param programId - Public key of the program to check
 * @returns True if the program is upgradeable, false otherwise
 */
export async function isProgramUpgradeable(
  connection: Connection,
  programId: PublicKey
): Promise<boolean> {
  return tryCatch(async () => {
    const programInfo = await connection.getAccountInfo(programId);
    
    if (!programInfo) {
      throw new AccountError(
        `Program not found: ${programId.toString()}`,
        programId.toString()
      );
    }
    
    return programInfo.owner.equals(PROGRAM_IDS.BPF_LOADER_UPGRADEABLE);
  }, (error) => {
    logger.error(`Failed to check if program is upgradeable: ${error.message}`, {
      programId: programId.toString(),
      error
    });
    return false;
  });
}

/**
 * Gets the upgrade authority for an upgradeable program
 * 
 * @param connection - Solana connection
 * @param programId - Public key of the program
 * @returns The public key of the upgrade authority, or null if no authority or program not upgradeable
 */
export async function getProgramUpgradeAuthority(
  connection: Connection,
  programId: PublicKey
): Promise<PublicKey | null> {
  return tryCatch(async () => {
    // Check if the program is upgradeable
    const isUpgradeable = await isProgramUpgradeable(connection, programId);
    if (!isUpgradeable) {
      return null;
    }
    
    // Get program data account
    const [programDataAddress] = await PublicKey.findProgramAddress(
      [programId.toBuffer()],
      PROGRAM_IDS.BPF_LOADER_UPGRADEABLE
    );
    
    // Get program data account info
    const programDataInfo = await connection.getAccountInfo(programDataAddress);
    if (!programDataInfo) {
      throw new AccountError(
        `Program data account not found: ${programDataAddress.toString()}`,
        programDataAddress.toString()
      );
    }
    
    // Parse upgrade authority from program data account
    // Format: [1 byte state, 8 bytes slot, 32 bytes program address, 
    //         4 bytes data length, 1 byte is activated, 32 bytes upgrade authority]
    const upgradeAuthorityEnabled = programDataInfo.data[45] === 1;
    if (!upgradeAuthorityEnabled) {
      return null;
    }
    
    return new PublicKey(programDataInfo.data.slice(46, 78));
  }, (error) => {
    logger.error(`Failed to get program upgrade authority: ${error.message}`, {
      programId: programId.toString(),
      error
    });
    return null;
  });
}

/**
 * Calculates the minimum balance required for program deployment
 * 
 * @param connection - Solana connection
 * @param programDataSize - Size of the program binary in bytes
 * @param isUpgradeable - Whether the program is upgradeable
 * @param maxDataSize - For upgradeable programs, the maximum data size for future upgrades
 * @returns The minimum balance required in lamports
 */
export async function calculateProgramDeploymentRent(
  connection: Connection,
  programDataSize: number,
  isUpgradeable: boolean,
  maxDataSize?: number
): Promise<number> {
  return tryCatch(async () => {
    if (isUpgradeable) {
      // For upgradeable programs, we need rent for program, programData, and buffer accounts
      const programRent = await connection.getMinimumBalanceForRentExemption(
        PROGRAM_ACCOUNT.SIZE
      );
      
      const actualMaxDataSize = maxDataSize || programDataSize;
      const programDataRent = await connection.getMinimumBalanceForRentExemption(
        actualMaxDataSize + PROGRAM_DATA_ACCOUNT.METADATA_SIZE
      );
      
      const bufferRent = await connection.getMinimumBalanceForRentExemption(
        programDataSize + BUFFER_ACCOUNT.METADATA_SIZE
      );
      
      return programRent + programDataRent + bufferRent;
    } else {
      // For immutable programs, we just need rent for the program account
      return connection.getMinimumBalanceForRentExemption(
        programDataSize
      );
    }
  }, (error) => {
    logger.error(`Failed to calculate program deployment rent: ${error.message}`, { error });
    throw new ProgramError(
      `Failed to calculate program deployment rent: ${error.message}`,
      undefined,
      undefined,
      { cause: error }
    );
  });
}

// Export all functions
export default {
  createBPFLoader2ProgramAccount,
  createUpgradeableProgramAccounts,
  writeProgramData,
  deployBPFLoader2Program,
  deployUpgradeableProgram,
  upgradeProgram,
  setUpgradeAuthority,
  isProgramUpgradeable,
  getProgramUpgradeAuthority,
  calculateProgramDeploymentRent
};