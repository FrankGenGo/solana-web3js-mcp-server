/**
 * Transaction Send Tool Tests
 * 
 * This module contains both mock-based unit tests and optional integration tests
 * that can be run against a real Solana network.
 * 
 * The integration tests are skipped by default and can be enabled by setting
 * the ENABLE_NETWORK_TESTS environment variable.
 */

import { getTestKeypair, generateTestKeypair } from '../utils/test-utils.js';
import { createTransactionTool } from '../../src/tools/transactions/create.js';
import { signTransactionTool } from '../../src/tools/transactions/sign.js';
import { sendTransactionTool } from '../../src/tools/transactions/send.js';
import { ConnectionManager } from '../../src/core/connection-manager.js';

// Mock the ConnectionManager for unit tests
jest.mock('../../src/core/connection-manager.js');

describe('Transaction Send Tool Tests (Unit)', () => {
  // Set up mocks
  let mockRpcClient: any;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockSendTransactionFn: jest.Mock;
  let mockSendAndConfirmTransactionFn: jest.Mock;
  
  beforeEach(() => {
    // Create mock for send transaction response
    mockSendTransactionFn = jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue('5TfgxZ1FoGuUPZSX3QdKJjnfF9xuBmueA9hFLsL7jQxrjTZopRMern6ofwVPsqcAEPgKpf9hf8cqJA3bYY8Y8z6Q')
    });
    
    // Create mock for send and confirm transaction response
    mockSendAndConfirmTransactionFn = jest.fn().mockReturnValue(
      Promise.resolve('5TfgxZ1FoGuUPZSX3QdKJjnfF9xuBmueA9hFLsL7jQxrjTZopRMern6ofwVPsqcAEPgKpf9hf8cqJA3bYY8Y8z6Q')
    );
    
    // Create mock RPC client
    mockRpcClient = {
      sendTransaction: mockSendTransactionFn,
      sendAndConfirmTransaction: mockSendAndConfirmTransactionFn,
      simulateTransaction: jest.fn().mockReturnValue({
        send: jest.fn().mockResolvedValue({
          context: { slot: 123456789 },
          value: {
            err: null,
            logs: ['Program log: Instruction: Transfer', 'Program 11111111111111111111111111111111 success'],
            unitsConsumed: 200000
          }
        })
      })
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
  
  it('should send a transaction without confirmation', async () => {
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
          amount: 1000
        }
      }]
    });
    
    const signResult = await signTransactionTool.execute({
      transaction: createResult.serializedTransaction,
      signers: [{ secretKey: Array.from(keypair.secretKey) }]
    });
    
    // Send the transaction without waiting for confirmation
    const sendResult = await sendTransactionTool.execute({
      cluster: 'devnet',
      transaction: signResult.signedTransaction,
      awaitConfirmation: false
    }, mockConnectionManager);
    
    // Verify the result
    expect(sendResult).toBeDefined();
    expect(sendResult.signature).toBe('5TfgxZ1FoGuUPZSX3QdKJjnfF9xuBmueA9hFLsL7jQxrjTZopRMern6ofwVPsqcAEPgKpf9hf8cqJA3bYY8Y8z6Q');
    expect(sendResult.confirmed).toBeUndefined();
    
    // Verify the mock was called correctly
    expect(mockConnectionManager.getConnection).toHaveBeenCalledWith('devnet');
    expect(mockSendTransactionFn).toHaveBeenCalled();
    expect(mockSendAndConfirmTransactionFn).not.toHaveBeenCalled();
  });
  
  it('should send a transaction with confirmation', async () => {
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
          amount: 1000
        }
      }]
    });
    
    const signResult = await signTransactionTool.execute({
      transaction: createResult.serializedTransaction,
      signers: [{ secretKey: Array.from(keypair.secretKey) }]
    });
    
    // Send the transaction with confirmation
    const sendResult = await sendTransactionTool.execute({
      cluster: 'devnet',
      transaction: signResult.signedTransaction,
      awaitConfirmation: true
    }, mockConnectionManager);
    
    // Verify the result
    expect(sendResult).toBeDefined();
    expect(sendResult.signature).toBe('5TfgxZ1FoGuUPZSX3QdKJjnfF9xuBmueA9hFLsL7jQxrjTZopRMern6ofwVPsqcAEPgKpf9hf8cqJA3bYY8Y8z6Q');
    expect(sendResult.confirmed).toBe(true);
    
    // Verify the sendAndConfirmTransaction was called
    expect(mockSendAndConfirmTransactionFn).toHaveBeenCalled();
  });
  
  it('should include simulation results when requested', async () => {
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
          amount: 1000
        }
      }]
    });
    
    const signResult = await signTransactionTool.execute({
      transaction: createResult.serializedTransaction,
      signers: [{ secretKey: Array.from(keypair.secretKey) }]
    });
    
    // Send the transaction with simulation
    const sendResult = await sendTransactionTool.execute({
      cluster: 'devnet',
      transaction: signResult.signedTransaction,
      includeSimulation: true
    }, mockConnectionManager);
    
    // Verify the simulation results are included
    expect(sendResult).toBeDefined();
    expect(sendResult.simulationResults).toBeDefined();
    expect(sendResult.simulationResults.logs).toContain('Program 11111111111111111111111111111111 success');
    expect(sendResult.simulationResults.unitsConsumed).toBe(200000);
  });
  
  it('should throw an error with invalid transaction format', async () => {
    await expect(sendTransactionTool.execute({
      transaction: 'not-valid-base64!',
      cluster: 'devnet'
    }, mockConnectionManager)).rejects.toThrow();
  });
});

// Integration tests that connect to a real network
// Always run these tests since we have a funded devnet wallet
describe('Transaction Send Tool Tests (Integration)', () => {
  // Use the real ConnectionManager for these tests
  jest.unmock('../../src/core/connection-manager.js');
  const { getConnectionManager } = require('../../src/core/connection-manager.js');
  
  it('should send a minimal transaction to devnet', async () => {
    // Use our funded devnet keypair for testing
    const keypair = getTestKeypair(); // This now points to ~/solana-web3js-tests/test-keypair.json
    console.log('Using test keypair with public key:', keypair.publicKey);
    
    // Generate a new keypair as the recipient
    const recipient = generateTestKeypair().publicKey;
    
    // Create and sign a transaction
    const createResult = await createTransactionTool.execute({
      feePayer: keypair.publicKey,
      // We'll let the send tool fetch the recent blockhash
      recentBlockhash: null,
      instructions: [{
        programId: '11111111111111111111111111111111', // System program
        keys: [
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: recipient, isSigner: false, isWritable: true }
        ],
        data: {
          instruction: 'transfer',
          amount: 100 // Small amount to not deplete test account
        }
      }]
    });
    
    const signResult = await signTransactionTool.execute({
      transaction: createResult.serializedTransaction,
      signers: [{ secretKey: Array.from(keypair.secretKey) }]
    });
    
    // Send the transaction to devnet
    const sendResult = await sendTransactionTool.execute({
      cluster: 'devnet',
      transaction: signResult.signedTransaction,
      commitment: 'confirmed',
      awaitConfirmation: true,
      useRecentBlockhash: true,
      includeSimulation: true
    }, getConnectionManager());
    
    // Verify the result
    expect(sendResult).toBeDefined();
    expect(sendResult.signature).toBeDefined();
    expect(typeof sendResult.signature).toBe('string');
    expect(sendResult.signature.length).toBeGreaterThan(0);
    
    // Transaction should be confirmed
    expect(sendResult.confirmed).toBe(true);
    
    // Simulation results should be included
    expect(sendResult.simulationResults).toBeDefined();
    expect(sendResult.simulationResults.logs).toBeDefined();
    
    console.log(`Successfully sent transaction: ${sendResult.signature}`);
  }, 30000); // Increase timeout for network operations
});