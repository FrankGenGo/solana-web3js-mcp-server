/**
 * Solana-specific type definitions for the MCP server
 * 
 * This file contains TypeScript type definitions for Solana-specific concepts
 * that are used throughout the MCP server implementation. These types are
 * based on @solana/web3.js v2.0 types.
 */

import type {
  Address,
  Blockhash,
  Commitment,
  TransactionSignature as SolanaTransactionSignature,
  Signature,
  IAccountMeta,
  TransactionVersion,
  TransactionMessage,
  TransactionInstruction,
  RpcResponseAndContext
} from '@solana/web3.js';

// Re-export common types from web3.js
export { Address, Blockhash, Commitment, TransactionVersion, TransactionMessage };

// Transaction signature is just a string in v2
export type TransactionSignature = SolanaTransactionSignature;

// Account metadata type from web3.js
export type AccountMeta = IAccountMeta;

/**
 * Types of networks/clusters available in Solana
 */
export type ClusterType = 'mainnet' | 'testnet' | 'devnet' | 'localnet' | string;

/**
 * Lamports conversion utility types
 */
export type Sol = number;
export type Lamports = bigint;

/**
 * Transaction status enum
 */
export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FINALIZED = 'finalized',
  FAILED = 'failed',
  UNKNOWN = 'unknown'
}

/**
 * Transaction confirmation response 
 */
export interface TransactionConfirmationResponse {
  /** Transaction signature */
  signature: TransactionSignature;
  /** Current status of the transaction */
  status: TransactionStatus;
  /** Error message if transaction failed */
  error?: string;
  /** Confirmation timestamp */
  timestamp?: number;
  /** Block in which the transaction was included */
  slot?: number;
  /** Estimated fees */
  estimatedFee?: number;
}

/**
 * Program account filter configuration for getProgramAccounts
 */
export interface ProgramAccountFilter {
  /** Byte offset into the account data */
  offset?: number;
  /** Data to match, either as base-58 encoded string or Uint8Array */
  bytes?: string | Uint8Array;
  /** Alternative to bytes, data to match as base-10 encoded number */
  dataSize?: number;
}

/**
 * Transaction simulation options
 */
export interface SimulationOptions {
  /** Commitment level to use for simulation */
  commitment?: Commitment;
  /** Additional accounts to include in the simulation response */
  accounts?: {
    encoding: 'base64' | 'jsonParsed';
    addresses: Address[];
  };
  /** Replace recent blockhash with simulation blockhash */
  replaceRecentBlockhash?: boolean;
  /** Signature verification mode */
  sigVerify?: boolean;
}

/**
 * Transaction simulation result
 */
export interface SimulationResult {
  /** Simulation status */
  success: boolean;
  /** Error details if simulation failed */
  error?: string;
  /** Logs from the simulation */
  logs?: string[];
  /** Raw simulation response */
  raw?: any;
}

/**
 * Solana account info
 */
export interface AccountInfo<T = Uint8Array> {
  /** Account lamports balance */
  lamports: bigint;
  /** Account owner (program that owns this account) */
  owner: Address;
  /** Whether account is executable */
  executable: boolean;
  /** Rent epoch */
  rentEpoch: bigint;
  /** Parsed account data */
  data: T;
}

/**
 * Solana token account information
 */
export interface TokenAccountInfo {
  /** Token account address */
  address: Address;
  /** Token mint address */
  mint: Address;
  /** Token account owner */
  owner: Address;
  /** Token amount */
  amount: bigint;
  /** Decimals for display purposes */
  decimals: number;
  /** Optional delegate info */
  delegate?: Address;
  /** Optional delegated amount */
  delegatedAmount?: bigint;
  /** Whether account is frozen */
  isFrozen?: boolean;
  /** Whether account is native (wrapped SOL) */
  isNative?: boolean;
}

/**
 * Solana SPL Token mint information
 */
export interface TokenMintInfo {
  /** Mint address */
  address: Address;
  /** Token mint authority */
  mintAuthority?: Address;
  /** Token supply */
  supply: bigint;
  /** Token decimals */
  decimals: number;
  /** Whether mint is initialized */
  isInitialized: boolean;
  /** Freeze authority */
  freezeAuthority?: Address;
}

/**
 * Result of a successful public key derivation
 */
export interface DerivedAddressResult {
  /** Derived public key */
  publicKey: Address;
  /** Bump seed value (if PDA) */
  bump?: number;
  /** Seeds used for derivation */
  seeds?: (Buffer | Uint8Array)[];
}