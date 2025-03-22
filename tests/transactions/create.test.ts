/**
 * Transaction Create Tool Tests
 * 
 * This module tests the transaction creation functionality:
 * - Creating a basic transfer transaction
 * - Creating transactions with different instruction types
 * - Error handling for invalid inputs
 */

import { getTestKeypair, generateTestKeypair } from '../utils/test-utils.js';
import { createTransactionTool } from '../../src/tools/transactions/create.js';
import { deserializeTransaction } from '@solana/web3.js';

describe('Transaction Create Tool Tests', () => {
  // Get a test keypair to use for transaction creation
  const keypair = getTestKeypair();
  const recipient = generateTestKeypair().publicKey;
  
  it('should create a valid transfer transaction', async () => {
    const amount = 1000; // lamports
    const recentBlockhash = 'EGn2LCCQKAEXrAQe24vVADQHqiynpGDgYKQGJD2q4XZD'; // Sample blockhash
    
    // Create a transaction using our tool
    const result = await createTransactionTool.execute({
      feePayer: keypair.publicKey,
      recentBlockhash,
      instructions: [{
        programId: '11111111111111111111111111111111', // System program
        keys: [
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: recipient, isSigner: false, isWritable: true }
        ],
        data: {
          instruction: 'transfer',
          amount
        }
      }]
    });
    
    // Verify the result contains a serialized transaction
    expect(result).toBeDefined();
    expect(result.serializedTransaction).toBeDefined();
    expect(typeof result.serializedTransaction).toBe('string');
    expect(result.serializedTransaction.length).toBeGreaterThan(0);
    
    // Deserialize the transaction to verify it's valid
    const txBuffer = Buffer.from(result.serializedTransaction, 'base64');
    const tx = deserializeTransaction(txBuffer);
    
    // Validate transaction properties
    expect(tx).toBeDefined();
    
    // Confirm the transaction has the correct structure
    expect(tx.message).toBeDefined();
  });
  
  it('should handle empty instructions', async () => {
    const recentBlockhash = 'EGn2LCCQKAEXrAQe24vVADQHqiynpGDgYKQGJD2q4XZD';
    
    // Create a transaction with no instructions
    const result = await createTransactionTool.execute({
      feePayer: keypair.publicKey,
      recentBlockhash,
      instructions: []
    });
    
    // Empty instructions should still produce a valid transaction
    expect(result).toBeDefined();
    expect(result.serializedTransaction).toBeDefined();
  });
  
  it('should throw an error with invalid parameters', async () => {
    // Missing required parameters should throw an error
    await expect(createTransactionTool.execute({
      // Missing feePayer
      recentBlockhash: 'EGn2LCCQKAEXrAQe24vVADQHqiynpGDgYKQGJD2q4XZD',
      instructions: []
    } as any)).rejects.toThrow();
  });
});