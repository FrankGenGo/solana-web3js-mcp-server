/**
 * Transaction Simulate Tool Tests
 * 
 * This module tests the transaction simulation functionality using mocks
 * since we don't want to depend on actual RPC responses for unit tests.
 */

import { getTestKeypair, generateTestKeypair } from '../utils/test-utils.js';
import { createTransactionTool } from '../../src/tools/transactions/create.js';
import { signTransactionTool } from '../../src/tools/transactions/sign.js';
import { simulateTransactionTool } from '../../src/tools/transactions/simulate.js';
import { ConnectionManager } from '../../src/core/connection-manager.js';

// Mock the ConnectionManager
jest.mock('../../src/core/connection-manager.js');

describe('Transaction Simulate Tool Tests', () => {
  // Set up mocks
  let mockRpcClient: any;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockSimulateFn: jest.Mock;
  
  beforeEach(() => {
    // Create mock for the RPC simulation response
    mockSimulateFn = jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue({
        context: { slot: 123456789 },
        value: {
          err: null,
          logs: ['Program log: Instruction: Transfer', 'Program 11111111111111111111111111111111 success'],
          accounts: null,
          unitsConsumed: 200000
        }
      })
    });
    
    // Create mock RPC client
    mockRpcClient = {
      simulateTransaction: mockSimulateFn
    };
    
    // Set up the connection manager mock
    mockConnectionManager = {
      getConnection: jest.fn().mockReturnValue(mockRpcClient),
      // Add other required methods as empty mocks
      getInstance: jest.fn(),
      getEndpoint: jest.fn(),
      setEndpoint: jest.fn(),
      setConnectionOptions: jest.fn(),
      setDefaultOptions: jest.fn(),
      hasConnection: jest.fn(),
      getAllConnections: jest.fn(),
      resetConnection: jest.fn(),
      resetAllConnections: jest.fn(),
      testConnection: jest.fn(),
      cleanupIdleConnections: jest.fn(),
      cleanup: jest.fn()
    } as unknown as jest.Mocked<ConnectionManager>;
  });
  
  it('should simulate a transaction successfully', async () => {
    // Get test keypairs
    const keypair = getTestKeypair();
    const recipient = generateTestKeypair().publicKey;
    
    // Create a transaction to simulate
    const createResult = await createTransactionTool.execute({
      feePayer: keypair.publicKey,
      recentBlockhash: 'EGn2LCCQKAEXrAQe24vVADQHqiynpGDgYKQGJD2q4XZD',
      instructions: [{
        programId: '11111111111111111111111111111111', // System program
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
    
    // Sign the transaction
    const signResult = await signTransactionTool.execute({
      transaction: createResult.serializedTransaction,
      signers: [{ secretKey: Array.from(keypair.secretKey) }]
    });
    
    // Simulate the transaction
    const simulateResult = await simulateTransactionTool.execute({
      cluster: 'devnet',
      transaction: signResult.signedTransaction,
      commitment: 'confirmed'
    }, mockConnectionManager);
    
    // Verify the simulation result
    expect(simulateResult).toBeDefined();
    expect(simulateResult.success).toBe(true);
    expect(simulateResult.error).toBeUndefined();
    expect(simulateResult.logs).toEqual([
      'Program log: Instruction: Transfer', 
      'Program 11111111111111111111111111111111 success'
    ]);
    expect(simulateResult.unitsConsumed).toBe(200000);
    expect(simulateResult.context).toEqual({ slot: 123456789 });
    
    // Verify the mock was called correctly
    expect(mockConnectionManager.getConnection).toHaveBeenCalledWith('devnet');
    expect(mockSimulateFn).toHaveBeenCalled();
  });
  
  it('should handle simulation errors', async () => {
    // Update the mock to return an error
    mockSimulateFn.mockReturnValue({
      send: jest.fn().mockResolvedValue({
        context: { slot: 123456789 },
        value: {
          err: 'Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1',
          logs: ['Program log: Error: Insufficient funds'],
          unitsConsumed: 100000
        }
      })
    });
    
    // Get test keypairs
    const keypair = getTestKeypair();
    const recipient = generateTestKeypair().publicKey;
    
    // Create and sign a transaction
    const createResult = await createTransactionTool.execute({
      feePayer: keypair.publicKey,
      recentBlockhash: 'EGn2LCCQKAEXrAQe24vVADQHqiynpGDgYKQGJD2q4XZD',
      instructions: [{
        programId: '11111111111111111111111111111111',
        keys: [
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: recipient, isSigner: false, isWritable: true }
        ],
        data: {
          instruction: 'transfer',
          amount: 1000000000 // Very large amount to trigger error
        }
      }]
    });
    
    const signResult = await signTransactionTool.execute({
      transaction: createResult.serializedTransaction,
      signers: [{ secretKey: Array.from(keypair.secretKey) }]
    });
    
    // Simulate the transaction
    const simulateResult = await simulateTransactionTool.execute({
      cluster: 'devnet',
      transaction: signResult.signedTransaction
    }, mockConnectionManager);
    
    // Verify the simulation result contains error information
    expect(simulateResult).toBeDefined();
    expect(simulateResult.success).toBe(false);
    expect(simulateResult.error).toBe('Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1');
    expect(simulateResult.logs).toEqual(['Program log: Error: Insufficient funds']);
    expect(simulateResult.unitsConsumed).toBe(100000);
  });
  
  it('should throw an error with invalid transaction format', async () => {
    await expect(simulateTransactionTool.execute({
      transaction: 'not-valid-base64!',
      cluster: 'devnet'
    }, mockConnectionManager)).rejects.toThrow();
  });
});