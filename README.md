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

### Account Management
- `get_account_info`: Fetch and decode account information
- `get_balance`: Get SOL balance for an address
- `get_token_accounts`: List all token accounts for an address

### Transaction Management
- `create_transaction`: Build a transaction with specified instructions
- `simulate_transaction`: Simulate a transaction without sending it
- `send_transaction`: Send and confirm a transaction on-chain

### Program Development
- `compile_program`: Compile a Rust program for Solana
- `deploy_program`: Deploy a program to a Solana cluster
- `generate_program_address`: Derive a program derived address (PDA)

### Key Management
- `generate_keypair`: Create a new Solana keypair
- `derive_address`: Derive an address from a seed phrase or path

### Network Management
- `get_cluster_stats`: Get current stats for a Solana cluster
- `get_transaction_fee`: Estimate transaction fees
- `get_recent_blockhash`: Get a recent blockhash for transaction building

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

- `src/index.ts`: Main entry point using stdio transport
- `src/sse.ts`: HTTP SSE transport implementation
- `src/solana-server.ts`: Core server implementation
- `src/tools/`: Tool implementations for Solana operations
- `src/resources/`: Resource implementations for Solana data
- `src/prompts/`: Reusable prompts for common workflows
- `src/types/`: TypeScript type definitions

## Extending the Server

This server is designed to be extensible. To add new functionality:

1. Create a new tool in the appropriate file in the `tools` directory
2. Register the tool in `solana-server.ts`
3. Test the tool with both unit tests and integration tests

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT