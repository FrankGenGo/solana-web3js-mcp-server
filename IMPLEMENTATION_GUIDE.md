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

#### Transactions (To Be Implemented)
```typescript
// Old (v1.x)
import { Transaction } from '@solana/web3.js';
const transaction = new Transaction();
transaction.add(instruction);
transaction.sign(keypair);

// New (v2.0)
import { 
  createTransactionMessage, 
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners 
} from '@solana/web3.js';
let message = createTransactionMessage({});
message = appendTransactionMessageInstructions([instruction], message);
const signedTx = signTransactionMessageWithSigners(message, [keypair]);
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

## Implementation Priorities (Updated 2025-03-22)

1. **Completed**: Token Operations tools
2. **Current Priority**: Complete Web3.js v2.0 migration
   - Focus on account tools and transaction tools next
   - Update transport layer and entry points
   - Finalize program deployment tools migration
3. **Next Priority**: Add comprehensive testing
   - Implement unit tests for migrated components
   - Add integration tests for MCP functionality
   - Create end-to-end tests for Solana operations
4. **Future Priority**: Implement extended RPC functionality
5. **Future Priority**: Develop natural language interaction capabilities

Each phase should include documentation updates and example code to demonstrate usage.