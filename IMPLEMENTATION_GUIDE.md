# Solana-web3js MCP Server Implementation Guide

This document provides detailed guidance for implementing the extended functionality outlined in the updated implementation plan.

## Implementing Token Operations

### Create Token Tool
- Use `@solana/spl-token` package to create token mints
- Implement parameters for:
  - Decimals (default: 9)
  - Token authority
  - Freeze authority (optional)
  - Initial supply (optional)
- Return token mint address and transaction signature

### Mint Tokens Tool
- Accept token mint address and recipient address
- Support minting to associated token accounts
- Auto-create associated token accounts if needed
- Include authority signature verification

### Transfer Tokens Tool
- Support transfers between any token accounts
- Handle delegation authority
- Include fee options (fee payer)
- Support both direct and associated token accounts

### Get Token Account Info Tool
- Retrieve token account balance and metadata
- Include ownership information
- Return delegation status if applicable
- Support bulk queries for multiple accounts

### Get Token Supply Tool
- Query token supply for a mint
- Return circulating supply
- Include mint authority information
- Provide decimals information for correct display

## Extended RPC Functionality

### Block Data Tools

#### Get Block Tool
- Query block by slot number or commitment level
- Return transaction information
- Include options for transaction details level
- Support pagination for large blocks

#### Get Block Production Tool
- Retrieve block production statistics
- Support filtering by slot range
- Include validator identity information
- Return block success/failure counts

#### Get Recent Blockhash Tool
- Get latest blockhash with fee calculator
- Include expiry information
- Return commitment level
- Support different commitment levels

### System Information Tools

#### Get Health Tool
- Query node health status
- Return RPC status information
- Include version compatibility check
- Support health details level option

#### Get Genesis Hash Tool
- Retrieve network genesis hash
- Return formatted hash string
- Include genesis timestamp if available

#### Get Version Tool
- Query solana-core version
- Return feature support information
- Include solana-runtime version
- Support version compatibility mapping

### Epoch and Inflation Tools

#### Get Epoch Info Tool
- Retrieve current epoch information
- Include epoch progress percentage
- Return slot information
- Support different commitment levels

#### Get Inflation Rate Tool
- Query current inflation rate
- Return total and effective rates
- Include inflation schedule data
- Support different commitment levels

#### Get Inflation Reward Tool
- Calculate rewards for addresses/epochs
- Support multiple addresses
- Include reward breakdown
- Return APY calculation

### Enhanced Account Tools

#### Get Multiple Accounts Tool
- Batch account information retrieval
- Support data encoding options
- Include ownership information
- Return account existence status

#### Get Program Accounts With Filters Tool
- Extended filtering capabilities:
  - Data size filters
  - Data content filters
  - Owner filters
  - Multiple filter combinations
- Support pagination
- Return optimized dataset

#### Get Account History Tool
- Retrieve historical account states
- Support slot/time range filters
- Include state transition information
- Return balance history

## Natural Language Interaction

### Conversational Query Prompts
- Design prompt templates for natural language queries
- Map common questions to specific RPC calls
- Support context-aware follow-up questions
- Implement query intent detection

### User-Friendly Error Explanations
- Create human-readable error messages
- Map technical errors to user-friendly explanations
- Include suggested resolutions
- Support contextual error handling

### Guided Blockchain Exploration Prompts
- Create exploration workflows for beginners
- Implement step-by-step guidance templates
- Support educational content embedding
- Design progressive learning paths

## Migration to Web3.js v2.0

### Migration Patterns (Based on Implementation Experience)

#### Connection Management
```typescript
// Old (v1.x)
import { Connection } from '@solana/web3.js';
const connection = new Connection(url, options);
const result = await connection.getBalance(address);

// New (v2.0)
import { createSolanaRpc } from '@solana/web3.js';
const rpcClient = createSolanaRpc(url);
const result = await rpcClient.getBalance(address).send();
```

#### Key Generation and Management
```typescript
// Old (v1.x)
import { Keypair } from '@solana/web3.js';
const keypair = Keypair.generate();
const fromSeed = Keypair.fromSeed(seedBytes);
const fromSecret = Keypair.fromSecretKey(secretKeyBytes);

// New (v2.0)
import { generateKeyPair, importKeyPair } from '@solana/web3.js';
const keypair = generateKeyPair();
const fromSeed = generateKeyPair({ seed: seedBytes });
const fromSecret = importKeyPair(secretKeyBytes);
```

#### Program Addresses
```typescript
// Old (v1.x)
import { PublicKey } from '@solana/web3.js';
const address = PublicKey.createProgramAddressSync(seeds, programId);
const [pda, bump] = PublicKey.findProgramAddressSync(seeds, programId);

// New (v2.0)
import { createProgramAddress, findProgramAddress } from '@solana/web3.js';
const address = createProgramAddress(seeds, programId);
const [pda, bump] = findProgramAddress(seeds, programId);
```

#### Account Management
```typescript
// Old (v1.x)
import { Connection, PublicKey } from '@solana/web3.js';
const connection = new Connection(url);
const accountInfo = await connection.getAccountInfo(new PublicKey(address));
const balance = await connection.getBalance(new PublicKey(address));
const programAccounts = await connection.getProgramAccounts(new PublicKey(programId));
const rentExemption = await connection.getMinimumBalanceForRentExemption(size);

// New (v2.0)
import { createSolanaRpc } from '@solana/web3.js';
const rpcClient = createSolanaRpc(url);
const accountInfo = await rpcClient.getAccountInfo(address).send();
const balance = await rpcClient.getBalance(address).send();
const programAccounts = await rpcClient.getProgramAccounts(programId).send();
const rentExemption = await rpcClient.getMinimumBalanceForRentExemption(size).send();
```

#### Transactions
```typescript
// Old (v1.x)
import { Transaction, Connection } from '@solana/web3.js';
const transaction = new Transaction();
transaction.add(instruction);
transaction.sign(keypair);
const signature = await connection.sendTransaction(transaction);
const status = await connection.getSignatureStatus(signature);
const simulation = await connection.simulateTransaction(transaction);

// New (v2.0)
import { 
  createTransactionMessage, 
  appendTransactionMessageInstructions,
  signTransactionWithSigners,
  createSolanaRpc,
  sendTransactionFactory,
  getSignatureStatusesFactory,
  simulateTransactionFactory
} from '@solana/web3.js';

// Create and sign transaction
let message = createTransactionMessage({});
message = appendTransactionMessageInstructions([instruction], message);
const signedTx = signTransactionWithSigners(message, [keypair]);

// Send transaction
const rpcClient = createSolanaRpc(url);
const sendTransaction = sendTransactionFactory(rpcClient);
const signature = await sendTransaction(signedTx).send();

// Get status
const getSignatureStatuses = getSignatureStatusesFactory(rpcClient);
const status = await getSignatureStatuses([signature]).send();

// Simulate transaction
const simulateTransaction = simulateTransactionFactory(rpcClient);
const simulation = await simulateTransaction(signedTx).send();
```

### Code Refactoring Strategy
- Update imports to use functional API
- Replace class-based API usage with functional equivalents
- Add `.send()` at the end of RPC method calls
- Update transaction creation flows to use the message composition pattern
- Adapt signing and verification logic for the new message-based approach

### Type System Updates
- Replace `PublicKey` with `Address` type for most use cases
- Update method signatures to match v2.0 patterns
- Use explicit `import type` syntax for type-only imports
- Define derived types using v2.0 base types
- Use ReturnType utility for functional API result types

### Performance Optimization
- Leverage native WebAssembly cryptographic operations
- Take advantage of immutable data structures
- Utilize tree-shaking capabilities through specific imports
- Implement batch processing for related operations
- Reduce bundle size through module optimization

## CLI Parity Implementation

To achieve full functionality parity with the Solana CLI, the following tool sets must be implemented:

### Configuration Management

- **Get Config Tool**
  - Retrieve and display current configuration
  - Include RPC URL, keypair path, commitment level
  - Match output format of `solana config get`

- **Set Config Tool**
  - Update configuration parameters
  - Support all CLI config options
  - Store configuration persistently

### Enhanced Keypair Management

- **Save Keypair Tool**
  - Save keypairs to specified file path
  - Support various output formats
  - Implement secure storage options

- **Recover Keypair Tool**
  - Recover keypairs from seed phrases
  - Support BIP39 passphrase
  - Match functionality of `solana-keygen recover`

- **Keypair Verification Tool**
  - Verify keypair integrity
  - Match all `solana-keygen verify` functionality

### Network Interaction

- **Airdrop Tool**
  - Request SOL from faucet on devnet/testnet
  - Support customizable amounts
  - Include error handling for rate limits

- **Stake Management Tools**
  - Implement all stake account operations
  - Support delegation and withdrawal
  - Include stake account status queries

### Transaction Utilities

- **Decode Transaction Tool**
  - Parse transaction details from serialized format
  - Display human-readable transaction information
  - Support various encoding formats

- **Confirm Transaction Tool**
  - Check transaction confirmation status
  - Wait for specified confirmation level
  - Report detailed status information

### Blockchain Data Inspection

- **Block Data Tools**
  - Retrieve block details by slot number
  - Get recent blocks
  - Support filtering and output formatting

- **System Information Tools**
  - Monitor network health
  - Display version information
  - Track cluster status

### Logging & Monitoring

- **Transaction Logs Tool**
  - Stream and display transaction logs
  - Filter by address, program ID, or signature
  - Support both historical and real-time log viewing

## Implementation Priorities (Updated 2025-03-22)

1. **Completed**: 
   - Token Operations tools
   - Web3.js v2.0 migration for:
     - Connection Manager (core)
     - Key Management tools
     - Account Management tools
     - Transaction tools
2. **Current Priority**: Complete Web3.js v2.0 migration
   - Focus on program deployment tools next
   - Update transport layer and entry points
3. **Next Priority**: Add comprehensive testing
   - Implement unit tests for migrated components
   - Add integration tests for MCP functionality
   - Create end-to-end tests for Solana operations
4. **Future Priority**: Implement CLI parity functionality
   - Start with configuration and keypair management
   - Add network interaction capabilities
   - Implement block and transaction inspection tools
5. **Future Priority**: Develop natural language interaction capabilities

Each phase should include documentation updates and example code to demonstrate usage.