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

### Code Refactoring Strategy
- Update imports to use functional API
- Replace class-based API usage with functional equivalents
- Update transaction creation flows
- Adapt signing and verification logic

### TypeScript Updates
- Fix type errors in existing codebase
- Leverage enhanced TypeScript interfaces in v2.0
- Update method signatures
- Implement stricter type checks

### Performance Optimization
- Leverage native WebAssembly cryptographic operations
- Implement batch processing for related operations
- Utilize tree-shaking capabilities
- Reduce bundle size through module optimization

## Implementation Priorities

1. **First Priority**: Complete Token Operations tools
2. **Second Priority**: Implement Web3.js v2.0 migration
3. **Third Priority**: Add comprehensive testing
4. **Fourth Priority**: Implement extended RPC functionality
5. **Fifth Priority**: Develop natural language interaction capabilities

Each phase should include documentation updates and example code to demonstrate usage.