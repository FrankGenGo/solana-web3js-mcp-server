/**
 * Solana-specific type definitions for the MCP server
 * 
 * This file contains TypeScript type definitions for Solana-specific concepts
 * that are used throughout the MCP server implementation. These types provide
 * strong typing based on the @solana/web3.js library but optimized for
 * server-side usage.
 */

import {
  Blockhash,
  Commitment,
  Signature as TransactionSignature,
  Address,
  TransactionMessage,
  AddressLookupTableAccount,
  TransactionVersion
} from '@solana/web3.js';

import type {
  RpcClient as SolanaRpcClient,
  AccountInfo,
  AccountMeta,
  SimulatedTransactionResponse,
  KeyPair as Keypair,
  MessageV0,
  VersionedTransaction,
  Transaction
} from '@solana/web3.js';

/**
 * Solana account address represented as string or Address
 */
export type SolanaAddress = string | Address;

/**
 * Types of networks/clusters available in Solana
 */
export type ClusterType = 'mainnet' | 'testnet' | 'devnet' | 'localnet' | string;

/**
 * Interface for Solana endpoint configuration
 */
export interface SolanaEndpointConfig {
  /** The URL of the RPC endpoint */
  url: string;
  /** Optional WebSocket URL */
  webSocketUrl?: string;
  /** Default commitment level to use */
  commitment?: Commitment;
}

/**
 * Standard cluster configurations
 */
export interface ClusterConfig {
  /** Main production network */
  mainnet: SolanaEndpointConfig;
  /** Test network for testing before deployment to mainnet */
  testnet: SolanaEndpointConfig;
  /** Development network for testing new features and applications */
  devnet: SolanaEndpointConfig;
  /** Local test network running on the developer's machine */
  localnet: SolanaEndpointConfig;
  /** Custom endpoints defined by name */
  [key: string]: SolanaEndpointConfig;
}

/**
 * Simple representation of a Solana account
 */
export interface SolanaAccountData<T = any> {
  /** Account public key */
  address: Address;
  /** Account owner (program that owns this account) */
  owner: Address;
  /** Lamports balance */
  lamports: number;
  /** Whether account is executable */
  executable: boolean;
  /** Rent epoch */
  rentEpoch?: number;
  /** Parsed account data */
  data: T;
}

/**
 * Lamports conversion utility types
 */
export type Sol = number;
export type Lamports = number;

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
 * Instruction data for a Solana transaction
 */
export interface SolanaInstructionData {
  /** Program ID (address of the program being called) */
  programId: SolanaAddress;
  /** Accounts involved in the instruction */
  accounts: AccountMeta[];
  /** Raw instruction data */
  data: Buffer | Uint8Array | number[] | string;
}

/**
 * Program account filter configuration
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
    addresses: SolanaAddress[];
  };
  /** Include transaction details in response */
  includeDetails?: boolean;
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
  raw?: SimulatedTransactionResponse;
}

/**
 * Transaction creation options
 */
export interface TransactionCreationOptions {
  /** Blockhash to use */
  blockhash?: Blockhash;
  /** Last valid block height */
  lastValidBlockHeight?: number;
  /** Fee payer account */
  feePayer?: Address;
  /** Use legacy transaction format */
  useLegacyFormat?: boolean;
  /** Address lookup tables for versioned transactions */
  addressLookupTables?: AddressLookupTableAccount[];
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

/**
 * Union type for raw or parsed transaction data
 */
export type SolanaTransaction = Transaction | VersionedTransaction;

/**
 * Type for transaction message data
 */
export type TransactionMessageData = Message | MessageV0 | TransactionMessage;

/**
 * Connection options for RPC client
 */
export interface ConnectionOptions {
  /** Commitment level for responses */
  commitment?: Commitment;
  /** Initial timeout for transaction confirmation (in ms) */
  confirmTransactionInitialTimeout?: number;
  /** Whether to disable retry on rate limit error */
  disableRetryOnRateLimit?: boolean;
  /** General request timeout in milliseconds */
  timeout?: number;
  /** Maximum number of retries */
  maxRetries?: number;
}