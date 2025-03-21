/**
 * Constants for Solana program deployment and management
 * This file contains program IDs, state enums, deployment modes, and other constants
 * used by program deployment tools like deployProgram, upgradeProgram, and generateProgramAddress
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Solana BPF Loader Program IDs
 */
export const PROGRAM_IDS = {
  /**
   * BPF Loader 2 Program ID
   * Used for immutable programs that cannot be upgraded
   */
  BPF_LOADER_2: new PublicKey('BPFLoader2111111111111111111111111111111111'),
  
  /**
   * BPF Loader Upgradeable Program ID
   * Used for deployments of upgradeable programs
   */
  BPF_LOADER_UPGRADEABLE: new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111111'),
  
  /**
   * Loader V4 Program ID
   * The latest program loader with improved features
   */
  LOADER_V4: new PublicKey('LoaderV411111111111111111111111111111111111'),
  
  /**
   * System Program ID
   * Required for account creation during program deployment
   */
  SYSTEM_PROGRAM: new PublicKey('11111111111111111111111111111111'),
};

/**
 * Upgradeable Loader State enum
 * Corresponds to UpgradeableLoaderState in Solana SDK
 */
export enum UpgradeableLoaderState {
  /**
   * Account is not initialized
   */
  Uninitialized = 0,
  
  /**
   * A Buffer account containing program code
   */
  Buffer = 1,
  
  /**
   * An executable program account
   */
  Program = 2,
  
  /**
   * A ProgramData account containing program code and metadata
   */
  ProgramData = 3,
}

/**
 * Program deployment modes
 */
export enum DeploymentMode {
  /**
   * Deploy an immutable program using BPF Loader 2
   */
  Immutable = 'immutable',
  
  /**
   * Deploy an upgradeable program using BPF Loader Upgradeable
   */
  Upgradeable = 'upgradeable',
}

/**
 * Upgrade authority options
 */
export enum UpgradeAuthority {
  /**
   * Keep the current upgrade authority
   */
  Maintain = 'maintain',
  
  /**
   * Set a new upgrade authority
   */
  Set = 'set',
  
  /**
   * Remove upgrade authority, making program immutable
   */
  Remove = 'remove',
}

/**
 * Buffer account size constants
 */
export const BUFFER_ACCOUNT = {
  /**
   * Size of the buffer metadata in bytes
   */
  METADATA_SIZE: 37, // UpgradeableLoaderState::size_of_buffer_metadata()
};

/**
 * Program account size constants
 */
export const PROGRAM_ACCOUNT = {
  /**
   * Size of a program account in bytes
   */
  SIZE: 36, // UpgradeableLoaderState::size_of_program()
};

/**
 * ProgramData account size constants
 */
export const PROGRAM_DATA_ACCOUNT = {
  /**
   * Size of the program data metadata in bytes
   */
  METADATA_SIZE: 45, // UpgradeableLoaderState::size_of_programdata_metadata()
};

/**
 * Defaults for program deployment
 */
export const DEPLOYMENT_DEFAULTS = {
  /**
   * Default max data length for upgradeable programs (8MB)
   * This defines the maximum size a program can grow to when upgraded
   */
  MAX_DATA_LENGTH: 8 * 1024 * 1024,
  
  /**
   * Maximum program size that can be deployed (10MB)
   */
  MAX_PROGRAM_SIZE: 10 * 1024 * 1024,
  
  /**
   * Minimum buffer size to allow for small test programs
   */
  MIN_BUFFER_SIZE: 1024,
};

/**
 * Upgradeable Loader Instructions
 * Corresponds to UpgradeableLoaderInstruction in Solana SDK
 */
export enum UpgradeableLoaderInstruction {
  /**
   * Initialize a Buffer account
   */
  InitializeBuffer = 0,
  
  /**
   * Write program data into a Buffer account
   */
  Write = 1,
  
  /**
   * Deploy an executable program
   */
  DeployWithMaxDataLen = 2,
  
  /**
   * Upgrade a program
   */
  Upgrade = 3,
  
  /**
   * Set a new authority for buffer or program
   */
  SetAuthority = 4,
  
  /**
   * Close an account owned by the upgradeable loader
   */
  Close = 5,
  
  /**
   * Extend a program's ProgramData account
   */
  ExtendProgram = 6,
  
  /**
   * Set a new authority with authority check
   */
  SetAuthorityChecked = 7,
  
  /**
   * Migrate a program to loader-v4
   */
  Migrate = 8,
}

/**
 * Error codes for program deployment operations
 */
export enum ProgramDeploymentError {
  /**
   * Program is too large to deploy
   */
  ProgramTooLarge = 'program_too_large',
  
  /**
   * Insufficient funds for deployment
   */
  InsufficientFunds = 'insufficient_funds',
  
  /**
   * Invalid buffer account
   */
  InvalidBuffer = 'invalid_buffer',
  
  /**
   * Invalid upgrade authority
   */
  InvalidAuthority = 'invalid_authority',
  
  /**
   * Program already exists
   */
  ProgramExists = 'program_exists',
  
  /**
   * Program deployment failed
   */
  DeploymentFailed = 'deployment_failed',
  
  /**
   * Program upgrade failed
   */
  UpgradeFailed = 'upgrade_failed',
}