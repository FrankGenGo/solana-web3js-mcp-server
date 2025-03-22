/**
 * Transaction Sign Tool Tests
 * 
 * This module tests the transaction signing functionality:
 * - Signing a transaction with a single keypair
 * - Verifying signatures are properly applied
 * - Error handling for invalid inputs
 */

import { getTestKeypair, generateTestKeypair } from '../utils/test-utils.js';
import { createTransactionTool } from '../../src/tools/transactions/create.js';
import { signTransactionTool } from '../../src/tools/transactions/sign.js';
import { deserializeTransaction } from '@solana/web3.js';

describe('Transaction Sign Tool Tests', () => {
  // Get test keypairs
  const keypair = getTestKeypair();
  const recipient = generateTestKeypair().publicKey;
  
  it('should sign a transaction with a single signer', async () => {
    // Create a transaction to sign
    const amount = 1000; // lamports
    const recentBlockhash = 'EGn2LCCQKAEXrAQe24vVADQHqiynpGDgYKQGJD2q4XZD';
    
    const createResult = await createTransactionTool.execute({
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
    
    // Sign the transaction
    const signResult = await signTransactionTool.execute({
      transaction: createResult.serializedTransaction,
      signers: [{
        secretKey: Array.from(keypair.secretKey)
      }]
    });
    
    // Verify the result contains a signed transaction
    expect(signResult).toBeDefined();
    expect(signResult.signedTransaction).toBeDefined();
    expect(typeof signResult.signedTransaction).toBe('string');
    expect(signResult.signedTransaction.length).toBeGreaterThan(0);
    
    // Deserialize the transaction to verify it's properly signed
    const txBuffer = Buffer.from(signResult.signedTransaction, 'base64');
    const tx = deserializeTransaction(txBuffer);
    
    // Confirm the transaction has the correct structure with signatures
    expect(tx).toBeDefined();
    expect(tx.signatures).toBeDefined();
    expect(tx.signatures.length).toBeGreaterThan(0);
  });
  
  it('should handle multiple signers', async () => {
    // Create a second keypair
    const secondKeypair = generateTestKeypair();
    
    // Create a multisig-style transaction
    const recentBlockhash = 'EGn2LCCQKAEXrAQe24vVADQHqiynpGDgYKQGJD2q4XZD';
    
    const createResult = await createTransactionTool.execute({
      feePayer: keypair.publicKey,
      recentBlockhash,
      instructions: [{
        programId: '11111111111111111111111111111111', // System program
        keys: [
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: secondKeypair.publicKey, isSigner: true, isWritable: false },
          { pubkey: recipient, isSigner: false, isWritable: true }
        ],
        data: {
          instruction: 'transfer',
          amount: 1000
        }
      }]
    });
    
    // Sign with both keypairs
    const signResult = await signTransactionTool.execute({
      transaction: createResult.serializedTransaction,
      signers: [
        { secretKey: Array.from(keypair.secretKey) },
        { secretKey: Array.from(secondKeypair.secretKey) }
      ]
    });
    
    // Verify the result
    expect(signResult).toBeDefined();
    expect(signResult.signedTransaction).toBeDefined();
    
    // Deserialize to verify signatures
    const txBuffer = Buffer.from(signResult.signedTransaction, 'base64');
    const tx = deserializeTransaction(txBuffer);
    
    // Should have two signatures
    expect(tx.signatures.length).toBe(2);
  });
  
  it('should throw an error with invalid transaction', async () => {
    // Invalid base64 string
    await expect(signTransactionTool.execute({
      transaction: 'not-valid-base64!',
      signers: [{ secretKey: Array.from(keypair.secretKey) }]
    })).rejects.toThrow();
  });
  
  it('should throw an error with missing signers', async () => {
    // Create a valid transaction
    const recentBlockhash = 'EGn2LCCQKAEXrAQe24vVADQHqiynpGDgYKQGJD2q4XZD';
    
    const createResult = await createTransactionTool.execute({
      feePayer: keypair.publicKey,
      recentBlockhash,
      instructions: [{
        programId: '11111111111111111111111111111111',
        keys: [
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: recipient, isSigner: false, isWritable: true }
        ],
        data: {
          instruction: 'transfer',
          amount: 1000
        }
      }]
    });
    
    // Try to sign without providing any signers
    await expect(signTransactionTool.execute({
      transaction: createResult.serializedTransaction,
      signers: []
    })).rejects.toThrow();
  });
});