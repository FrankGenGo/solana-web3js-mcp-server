/**
 * Test Utils for Solana Web3.js MCP Server Tests
 * 
 * This module provides utility functions for testing:
 * - Keypair generation and management
 * - Connection management
 * - Test data creation
 * - Mock utilities
 */

import { 
  generateKeyPair, 
  createSolanaRpc,
  getBalance,
  createTransactionMessage,
  deserializeTransaction,
  SystemProgram,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstructions
} from '@solana/web3.js';
import type { KeyPair, Address, SolanaRpcInterface } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Default test networks
export const TEST_NETWORKS = {
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  localnet: 'http://localhost:8899'
};

// Use dedicated test keypair for Solana devnet tests
const TEST_DIR = path.join(os.homedir(), 'solana-web3js-tests');
const KEYPAIR_FILE = path.join(TEST_DIR, 'test-keypair.json');

/**
 * Get or create a test directory
 * @returns The test directory path
 */
export function getTestDir(): string {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  return TEST_DIR;
}

/**
 * Generate a random Solana keypair for testing
 * @returns A Solana keypair
 */
export function generateTestKeypair(): KeyPair {
  return generateKeyPair();
}

/**
 * Get an existing test keypair or create one if it doesn't exist
 * The keypair is stored locally for use across test runs
 * @returns A Solana keypair
 */
export function getTestKeypair(): KeyPair {
  try {
    // Try to load existing keypair
    if (fs.existsSync(KEYPAIR_FILE)) {
      const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_FILE, 'utf-8'));
      return {
        publicKey: keypairData.publicKey,
        secretKey: Uint8Array.from(keypairData.secretKey)
      };
    }
  } catch (error) {
    console.warn('Failed to load existing test keypair, generating new one', error);
  }
  
  // Generate new keypair
  const keypair = generateTestKeypair();
  
  // Store it for future use
  getTestDir();
  const keypairData = {
    publicKey: keypair.publicKey,
    secretKey: Array.from(keypair.secretKey)
  };
  fs.writeFileSync(KEYPAIR_FILE, JSON.stringify(keypairData, null, 2));
  
  return keypair;
}

/**
 * Create an RPC client for testing
 * @param network Network to connect to (defaults to devnet)
 * @returns RPC client for the specified network
 */
export function getTestRpcClient(network: string = 'devnet'): SolanaRpcInterface {
  const endpoint = TEST_NETWORKS[network] || network;
  return createSolanaRpc(endpoint);
}

/**
 * Check if a keypair has a SOL balance
 * @param publicKey Address to check
 * @param network Network to check on (defaults to devnet)
 * @returns True if the account has a non-zero balance
 */
export async function hasBalance(publicKey: Address, network: string = 'devnet'): Promise<boolean> {
  const rpcClient = getTestRpcClient(network);
  const balance = await getBalance(rpcClient, publicKey).send();
  return balance > 0;
}

/**
 * Create a simple transfer transaction for testing
 * @param sender Sender keypair
 * @param recipient Recipient address
 * @param amount Amount in lamports to send
 * @param recentBlockhash Recent blockhash to use
 * @returns Transaction message that can be signed
 */
export function createTestTransferTransaction(
  sender: KeyPair,
  recipient: Address,
  amount: number,
  recentBlockhash: string
): any {
  // Create a new transaction message
  let message = createTransactionMessage({});
  
  // Set the fee payer
  message = setTransactionMessageFeePayer(sender.publicKey, message);
  
  // Create a transfer instruction
  const transferInstruction = SystemProgram.transfer({
    fromPubkey: sender.publicKey,
    toPubkey: recipient,
    lamports: amount
  });
  
  // Add the instruction to the message
  message = appendTransactionMessageInstructions([transferInstruction], message);
  
  return message;
}

/**
 * Sleep for a specified time
 * @param ms Milliseconds to sleep
 * @returns Promise that resolves after the specified time
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert a serialized transaction to a buffer
 * @param serializedTx Serialized transaction string
 * @param format Format of the serialized transaction (base64, base58, hex)
 * @returns Transaction buffer
 */
export function deserializeTransactionBuffer(
  serializedTx: string,
  format: string = 'base64'
): Uint8Array {
  // Convert the serialized transaction to a Buffer based on the format
  switch (format.toLowerCase()) {
    case 'base58':
      return Buffer.from(serializedTx, 'base58');
    case 'hex':
      return Buffer.from(serializedTx, 'hex');
    case 'base64':
    default:
      return Buffer.from(serializedTx, 'base64');
  }
}

/**
 * Parse a serialized transaction
 * @param serializedTx Serialized transaction string
 * @param format Format of the serialized transaction (base64, base58, hex)
 * @returns Deserialized transaction
 */
export function parseTransaction(serializedTx: string, format: string = 'base64'): any {
  const txBuffer = deserializeTransactionBuffer(serializedTx, format);
  return deserializeTransaction(txBuffer);
}