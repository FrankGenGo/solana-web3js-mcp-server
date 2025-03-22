# Solana-web3js MCP Server Migration Plan

## Migration Overview

This document outlines the step-by-step plan for migrating the Solana-web3js MCP Server from @solana/web3.js v1.x to v2.0. The migration is necessary to leverage the performance improvements, enhanced TypeScript support, and modern functional programming patterns introduced in v2.0.

**Update (2025-03-22)**: All token operations tools have been implemented using the v1.x API. The next priority is to migrate the entire codebase to Web3.js v2.0 as outlined in this document.

## Current Status

- Current version: @solana/web3.js v1.98.0 (specified as ^1.91.1 in package.json)
- The codebase primarily uses v1.x class-based APIs
- There are 129 TypeScript errors across 22 files
- The errors are concentrated in program tools (52), transaction tools (37), account tools (10), and key management tools (11)

## Migration Benefits

1. **Performance**: Up to 10x faster cryptographic operations using native APIs
2. **Bundle Size**: Reduced bundle size through tree-shaking capabilities
3. **Dependencies**: Zero external dependencies in Web3.js v2.0
4. **Type Safety**: Enhanced TypeScript interfaces and stricter types
5. **Maintainability**: Modern functional programming patterns for better code composition
6. **Future-proofing**: Alignment with Solana's preferred SDK approach

## Prerequisite Tasks

1. **Create a Git Branch**
   - Create a new branch `feature/web3js-v2-migration`
   - This will allow for easy comparison and potential rollback

2. **Update Dependencies**
   - Update package.json to specify the latest @solana/web3.js version
   - Add required program-specific modules (e.g., @solana-program/system)

```bash
# Update web3.js and add program-specific modules
npm install --save @solana/web3.js@latest
npm install --save @solana-program/system @solana-program/token @solana-program/associated-token
```

## Migration Phases

### Phase 1: Core Infrastructure (2-3 days)

#### 1.1 Update Error and Logging Utilities

- Fix `/src/utils/errors.ts` (2 errors)
- Fix `/src/utils/logging.ts` (3 errors)
- Ensure they're compatible with the new functional approach

#### 1.2 Update Transport Layer

- Fix `/src/transport/stdio.ts` (1 error)
- Fix `/src/transport/http.ts` (2 errors)
- Update MCP communication code to support both v1.x and v2.0 patterns

#### 1.3 Update Entry Points

- Fix `/src/index.ts` (8 errors)
- Fix `/src/solana-server.ts` (1 error)
- Update server initialization and registration logic

### Phase 2: Tool Migration - Key Management (1-2 days)

#### 2.1 Keypair Generation

- Update `/src/tools/keys/generate.ts` (4 errors)
- Migrate from `Keypair` class to functional `generateKeypair` utilities
- Example change:
  ```typescript
  // Old (v1.x)
  const keypair = Keypair.generate();
  
  // New (v2.0)
  import { generateKeyPair } from '@solana/web3.js';
  const keypair = generateKeyPair();
  ```

#### 2.2 Keypair Import and Derivation

- Update `/src/tools/keys/import.ts` (2 errors)
- Update `/src/tools/keys/derive.ts` (2 errors)
- Migrate to v2.0 `Ed25519SecretKey` and related cryptographic utilities

#### 2.3 Key Index Updates

- Update `/src/tools/keys/index.ts` (3 errors)
- Update exports and imports to match new patterns

### Phase 3: Tool Migration - Account Management (1-2 days)

#### 3.1 Account Tools

- Update `/src/tools/accounts/index.ts` (10 errors)
- Migrate from `Connection` class methods to functional RPC calls
- Example change:
  ```typescript
  // Old (v1.x)
  const connection = new Connection(endpoint);
  const accountInfo = await connection.getAccountInfo(pubkey);
  
  // New (v2.0)
  import { createRpcClient, getAccountInfo } from '@solana/web3.js';
  const rpcClient = createRpcClient(...);
  const accountInfo = await getAccountInfo(rpcClient, pubkey);
  ```

### Phase 4: Tool Migration - Transaction Tools (3-4 days)

#### 4.1 Transaction Creation

- Update `/src/tools/transactions/create.ts` (6 errors)
- Completely refactor to use new transaction message composition pattern
- Example change:
  ```typescript
  // Old (v1.x)
  const transaction = new Transaction();
  transaction.add(instruction);
  
  // New (v2.0)
  import { createTransactionMessage, appendTransactionMessageInstructions } from '@solana/web3.js';
  let message = createTransactionMessage({});
  message = appendTransactionMessageInstructions([instruction], message);
  ```

#### 4.2 Transaction Signing

- Update `/src/tools/transactions/sign.ts` (4 errors)
- Migrate to `signTransactionMessageWithSigners` pattern

#### 4.3 Transaction Sending and Status

- Update `/src/tools/transactions/send.ts` (4 errors)
- Update `/src/tools/transactions/status.ts` (13 errors)
- Use `sendAndConfirmTransactionFactory` and related utilities

#### 4.4 Transaction Index

- Update `/src/tools/transactions/index.ts` (10 errors)
- Update exports and imports

### Phase 5: Tool Migration - Program Tools (4-5 days)

#### 5.1 Program Utilities

- Update `/src/tools/programs/utils/buffer-utils.ts` (9 errors)
- Update `/src/tools/programs/utils/loader-utils.ts` (10 errors)
- Focus on correct BPF loader API usage

#### 5.2 Program Address Computation

- Update `/src/tools/programs/address.ts` (5 errors)
- Migrate to new PDA derivation functions

#### 5.3 Program Deployment

- Update `/src/tools/programs/deploy.ts` (8 errors)
- Update `/src/tools/programs/upgrade.ts` (14 errors)
- Completely refactor the deployment flow to match v2.0 patterns

#### 5.4 Program Index

- Update `/src/tools/programs/index.ts` (8 errors)
- Update exports and imports

### Phase 6: Testing and Integration (2-3 days)

#### 6.1 Manual Testing

- Test each tool individually with sample inputs
- Verify correct operation with Solana devnet or localnet

#### 6.2 Integration Testing

- Test combinations of tools that depend on each other
- Verify full workflows (e.g., create keypair → deploy program)

#### 6.3 Bug Fixing

- Address any issues discovered during testing
- Fix edge cases and error handling

## Common Migration Patterns

### Pattern 1: Classes to Functions

```typescript
// Old (v1.x)
import { Connection, Keypair, Transaction } from '@solana/web3.js';
const connection = new Connection(url);
const keypair = Keypair.generate();
const tx = new Transaction().add(instruction);

// New (v2.0)
import { createRpcClient, generateKeyPair, createTransactionMessage, 
         appendTransactionMessageInstructions } from '@solana/web3.js';
const rpcClient = createRpcClient({ url });
const keypair = generateKeyPair();
let tx = createTransactionMessage({});
tx = appendTransactionMessageInstructions([instruction], tx);
```

### Pattern 2: Transaction Construction

```typescript
// Old (v1.x)
const transaction = new Transaction();
transaction.feePayer = payer.publicKey;
transaction.recentBlockhash = blockhash;
transaction.add(instruction1, instruction2);
transaction.sign(payer);

// New (v2.0)
import { createTransactionMessage, setTransactionMessageFeePayer,
         setTransactionMessageLifetimeUsingBlockhash, 
         appendTransactionMessageInstructions,
         signTransactionMessageWithSigners } from '@solana/web3.js';
         
let message = createTransactionMessage({});
message = setTransactionMessageFeePayer(payer.publicKey, message);
message = setTransactionMessageLifetimeUsingBlockhash(blockhash, message);
message = appendTransactionMessageInstructions([instruction1, instruction2], message);
const signedTx = signTransactionMessageWithSigners(message, [payer]);
```

### Pattern 3: RPC Calls

```typescript
// Old (v1.x)
const connection = new Connection(url);
const balance = await connection.getBalance(publicKey);
const signature = await connection.sendTransaction(transaction);

// New (v2.0)
import { createRpcClient, getBalance, 
         sendAndConfirmTransactionFactory } from '@solana/web3.js';
const rpcClient = createRpcClient({ url });
const balance = await getBalance(rpcClient, publicKey);
const sendAndConfirmTransaction = sendAndConfirmTransactionFactory(rpcClient);
const signature = await sendAndConfirmTransaction(signedTx);
```

## Documentation Updates

After completing the migration, the following documentation should be updated:

1. **README.md**: Update examples and installation instructions
2. **MIGRATION.md**: Create a document detailing the migration process for users
3. **API Documentation**: Update all API reference docs to reflect v2.0 patterns

## Rollback Plan

If significant issues are encountered during migration:

1. Switch back to the main branch
2. Re-pin dependencies to v1.x in package.json
3. Consider a more gradual approach with dual-support for both API versions

## Post-Migration Tasks

1. **Performance Benchmarking**: Measure improvements in operation speed
2. **Bundle Size Analysis**: Verify reduction in bundle size
3. **Memory Usage Testing**: Monitor memory consumption
4. **Edge Case Testing**: Test with various network conditions and error scenarios

## Reference Resources

For detailed guidance on API changes, refer to:

- [Solana Web3.js v2.0 Documentation](https://solana-labs.github.io/solana-web3.js/)
- [Solana Web3.js v2.0 Examples](https://solana-labs.github.io/solana-web3.js/example/)
- [Solana Program Specific Modules](https://github.com/solana-program)
- [Transition Guide](https://www.helius.dev/blog/how-to-start-building-with-the-solana-web3-js-2-0-sdk)