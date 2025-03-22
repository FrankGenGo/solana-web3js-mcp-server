/**
 * Transaction Status Tool Tests
 * 
 * This module tests the transaction status checking functionality
 * using mocks to avoid network dependencies.
 */

import { getTransactionStatusTool } from '../../src/tools/transactions/status.js';
import { ConnectionManager } from '../../src/core/connection-manager.js';

// Mock the ConnectionManager
jest.mock('../../src/core/connection-manager.js');

describe('Transaction Status Tool Tests', () => {
  // Set up mocks
  let mockRpcClient: any;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockGetSignatureStatusesFn: jest.Mock;
  let mockGetTransactionFn: jest.Mock;
  
  beforeEach(() => {
    // Create mock for signature status response
    mockGetSignatureStatusesFn = jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue({
        context: { slot: 123456789 },
        value: [{
          slot: 123456780,
          confirmations: 9,
          err: null,
          confirmationStatus: 'confirmed'
        }]
      })
    });
    
    // Create mock for transaction details response
    mockGetTransactionFn = jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue({
        slot: 123456780,
        transaction: {
          signatures: ['5TfgxZ1FoGuUPZSX3QdKJjnfF9xuBmueA9hFLsL7jQxrjTZopRMern6ofwVPsqcAEPgKpf9hf8cqJA3bYY8Y8z6Q'],
          message: {
            accountKeys: [
              '4Qkev8aNZcqFNSRhQzwyLMFSsi94jHqE8WNVTJzTP99F',
              '3UVYmECPPMZSCqWKfENfuoTv51fTDTWicX9xmBD2euKe'
            ],
            instructions: [
              {
                programIdIndex: 2,
                accounts: [0, 1],
                data: '3Bxs4h24hBtQy9rw'
              }
            ]
          }
        },
        meta: {
          fee: 5000,
          preBalances: [100000000, 0],
          postBalances: [99995000, 0],
          logMessages: [
            'Program 11111111111111111111111111111111 invoke [1]',
            'Program 11111111111111111111111111111111 success'
          ],
          status: { Ok: null }
        }
      })
    });
    
    // Create mock RPC client
    mockRpcClient = {
      getSignatureStatuses: mockGetSignatureStatusesFn,
      getTransaction: mockGetTransactionFn
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
  
  it('should check transaction status correctly', async () => {
    const signature = '5TfgxZ1FoGuUPZSX3QdKJjnfF9xuBmueA9hFLsL7jQxrjTZopRMern6ofwVPsqcAEPgKpf9hf8cqJA3bYY8Y8z6Q';
    
    const statusResult = await getTransactionStatusTool.execute({
      signature,
      cluster: 'devnet'
    }, mockConnectionManager);
    
    // Verify the result
    expect(statusResult).toBeDefined();
    expect(statusResult.status).toBe('confirmed');
    expect(statusResult.slot).toBe(123456780);
    expect(statusResult.confirmations).toBe(9);
    expect(statusResult.error).toBeNull();
    
    // Verify the mock was called correctly
    expect(mockConnectionManager.getConnection).toHaveBeenCalledWith('devnet');
    expect(mockGetSignatureStatusesFn).toHaveBeenCalled();
  });
  
  it('should handle getting detailed transaction information', async () => {
    const signature = '5TfgxZ1FoGuUPZSX3QdKJjnfF9xuBmueA9hFLsL7jQxrjTZopRMern6ofwVPsqcAEPgKpf9hf8cqJA3bYY8Y8z6Q';
    
    const statusResult = await getTransactionStatusTool.execute({
      signature,
      cluster: 'devnet',
      includeDetails: true
    }, mockConnectionManager);
    
    // Verify the result includes transaction details
    expect(statusResult).toBeDefined();
    expect(statusResult.status).toBe('confirmed');
    expect(statusResult.details).toBeDefined();
    expect(statusResult.details.fee).toBe(5000);
    expect(statusResult.details.logs).toContain('Program 11111111111111111111111111111111 success');
    
    // Verify both RPC methods were called
    expect(mockGetSignatureStatusesFn).toHaveBeenCalled();
    expect(mockGetTransactionFn).toHaveBeenCalled();
  });
  
  it('should handle failed transactions', async () => {
    // Update the mock to return an error
    mockGetSignatureStatusesFn = jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue({
        context: { slot: 123456789 },
        value: [{
          slot: 123456780,
          confirmations: 20,
          err: 'Transaction failed: Error processing Instruction 0',
          confirmationStatus: 'finalized'
        }]
      })
    });
    
    mockRpcClient.getSignatureStatuses = mockGetSignatureStatusesFn;
    
    const signature = '5TfgxZ1FoGuUPZSX3QdKJjnfF9xuBmueA9hFLsL7jQxrjTZopRMern6ofwVPsqcAEPgKpf9hf8cqJA3bYY8Y8z6Q';
    
    const statusResult = await getTransactionStatusTool.execute({
      signature,
      cluster: 'devnet'
    }, mockConnectionManager);
    
    // Verify the result contains error information
    expect(statusResult).toBeDefined();
    expect(statusResult.status).toBe('finalized');
    expect(statusResult.slot).toBe(123456780);
    expect(statusResult.confirmations).toBe(20);
    expect(statusResult.error).toBe('Transaction failed: Error processing Instruction 0');
  });
  
  it('should handle non-existent transactions', async () => {
    // Update the mock to return null (transaction not found)
    mockGetSignatureStatusesFn = jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue({
        context: { slot: 123456789 },
        value: [null]
      })
    });
    
    mockRpcClient.getSignatureStatuses = mockGetSignatureStatusesFn;
    
    const signature = 'NonExistentSignature1111111111111111111111111111111111111111111';
    
    const statusResult = await getTransactionStatusTool.execute({
      signature,
      cluster: 'devnet'
    }, mockConnectionManager);
    
    // Verify the result indicates the transaction wasn't found
    expect(statusResult).toBeDefined();
    expect(statusResult.found).toBe(false);
    expect(statusResult.status).toBeNull();
  });
  
  it('should throw an error with invalid signature', async () => {
    await expect(getTransactionStatusTool.execute({
      signature: 'invalid!signature',
      cluster: 'devnet'
    }, mockConnectionManager)).rejects.toThrow();
  });
});