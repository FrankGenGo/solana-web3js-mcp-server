# Solana Web3.js MCP Server

A Model Context Protocol (MCP) server that enables AI assistants like Claude to develop and deploy Solana smart contracts end-to-end. This server acts as a bridge between AI language models and the Solana blockchain, providing a standardized interface for blockchain interactions.

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io) (MCP) is an open standard that allows AI assistants to access external tools and data sources in a secure, controlled manner. This server implements the MCP specification to expose Solana blockchain functionality to AI assistants.

## What This Server Does

This MCP server provides AI assistants with the ability to:

1. **Interact with the Solana Blockchain**: Query account data, check balances, view transaction history, and get network status from various Solana clusters (mainnet, testnet, devnet)

2. **Create and Manage Transactions**: Build, simulate, sign, and send transactions to the Solana blockchain with proper error handling and fee estimation

3. **Develop Smart Contracts**: Access templates, compile, test, and deploy Solana programs written in Rust using the Solana SDK or Pinocchio framework

4. **Manage Wallets and Keys**: Generate keypairs, derive addresses, and interact with wallet adapters while maintaining security best practices

5. **Work with Tokens**: Create, transfer, and manage SPL tokens and token accounts

## Architecture

The server exposes three types of MCP capabilities:

- **Tools**: Functions that perform actions like sending transactions, deploying programs, or generating keypairs
- **Resources**: Data sources such as documentation, code templates, and blockchain state information
- **Prompts**: Templates for guiding the AI through complex workflows like smart contract development

All blockchain interactions are performed through the [@solana/web3.js](https://github.com/solana-labs/solana-web3.js) library and related SDKs, with the MCP server acting as a secure intermediary between the AI and the blockchain.

## Installation

```bash
# Clone the repository
git clone https://github.com/FrankGenGo/solana-web3js-mcp-server.git
cd solana-web3js-mcp-server

# Install dependencies
npm install

# Build the server
npm run build

# Start the server
npm start
```

## Usage with Claude Desktop

1. Install [Claude Desktop](https://claude.ai/download)

2. Add the following to your Claude Desktop configuration file:

   **On macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   **On Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "solana": {
      "command": "node",
      "args": ["/absolute/path/to/solana-web3js-mcp-server/dist/index.js"]
    }
  }
}
```

3. Restart Claude Desktop

4. You can now ask Claude to perform Solana-related tasks, such as:
   - "Create a new Solana account and show me the keypair"
   - "What's the current balance of address X?"
   - "Help me write and deploy a simple token contract on Solana devnet"

## Security Considerations

- This server does NOT store private keys by default
- Sensitive operations (signing, deploying to mainnet) require explicit user approval
- The server follows best practices for secure blockchain interactions

## Available Tools

### Account Management (Implemented)
- `getAccountInfo`: Fetch and decode account information
- `checkAccountBalance`: Get SOL balance for an address
- `findProgramAccounts`: Find accounts owned by a program
- `getRentExemption`: Calculate minimum balance for rent exemption

### Transaction Management (Implemented)
- `createTransaction`: Build a transaction with specified instructions
- `signTransaction`: Sign a transaction with one or more keypairs
- `sendTransaction`: Send and confirm a transaction on-chain
- `simulateTransaction`: Simulate a transaction without sending it
- `getTransactionStatus`: Check the status of a transaction

### Key Management (Implemented)
- `generateKeypair`: Create a new Solana keypair
- `importKeypair`: Import an existing keypair from various formats
- `deriveKeypair`: Derive a keypair from seed, mnemonic, or path

### Program Development (Coming Soon)
- `deployProgram`: Deploy a program to a Solana cluster
- `upgradeProgram`: Upgrade an existing upgradeable program
- `generateProgramAddress`: Derive a program derived address (PDA)

### Token Operations (Coming Soon)
- `createToken`: Create a new SPL token
- `mintTokens`: Mint tokens to a token account
- `transferTokens`: Transfer tokens between accounts

## Development

```bash
# Run in development mode (with auto-reload)
npm run dev

# Run tests
npm test

# Lint the code
npm run lint
```

## Project Structure

- `src/index.ts`: Main entry point (implemented)
- `src/solana-server.ts`: Core server implementation (implemented)
- `src/core/connection-manager.ts`: Solana connection management (implemented)
- `src/transport/`: Transport layer implementations
  - `src/transport/stdio.ts`: Standard I/O transport (implemented)
  - `src/transport/http.ts`: HTTP/SSE transport (implemented)
  - `src/transport/index.ts`: Transport exports (implemented)
- `src/tools/`: Tool implementations for Solana operations
  - `src/tools/accounts/`: Account management tools (implemented)
  - `src/tools/transactions/`: Transaction operations tools (implemented)
  - `src/tools/keys/`: Key management tools (implemented)
- `src/resources/`: Resource implementations for Solana data (planned)
- `src/prompts/`: Reusable prompts for common workflows (planned)
- `src/types/`: TypeScript type definitions
  - `src/types/solana.ts`: Solana-specific type definitions (partial implementation)
  - `src/types/tools.ts`: Tool input/output type definitions (planned)
  - `src/types/config.ts`: Configuration type definitions (planned)
- `src/utils/`: Utility functions and classes
  - `src/utils/errors.ts`: Error handling system (implemented)
  - `src/utils/logging.ts`: Logging system (implemented)

## Extending the Server

This server is designed to be extensible. To add new functionality:

1. Create a new tool in the appropriate file in the `tools` directory
2. Register the tool in `solana-server.ts`
3. Test the tool with both unit tests and integration tests

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT