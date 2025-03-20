/**
 * Core implementation of the Solana Web3.js MCP Server
 * This file defines the server instance and registers all tools, resources, and prompts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Connection } from "@solana/web3.js";

// Server version - update this when making significant changes
const VERSION = "0.1.0";

// Default Solana cluster endpoints
const CLUSTERS = {
  mainnet: "https://api.mainnet-beta.solana.com",
  testnet: "https://api.testnet.solana.com",
  devnet: "https://api.devnet.solana.com",
  localnet: "http://localhost:8899",
};

/**
 * Creates and configures the Solana MCP server
 * @returns An object containing the server instance and a cleanup function
 */
export function createSolanaServer() {
  // Create connections to each Solana cluster
  const connections = new Map<string, Connection>();
  
  // Initialize connections
  for (const [name, endpoint] of Object.entries(CLUSTERS)) {
    connections.set(name, new Connection(endpoint));
  }

  // Create the MCP server
  const server = new McpServer({
    name: "solana-web3js",
    version: VERSION,
  });

  // Register tools from each module
  // These will be imported and registered here once implemented
  // registerAccountTools(server, connections);
  // registerTransactionTools(server, connections);
  // registerProgramTools(server, connections);
  // registerKeyTools(server);
  // registerTokenTools(server, connections);

  // Register resources
  // These will be imported and registered here once implemented
  // registerClusterResources(server);
  // registerTemplateResources(server);
  // registerDocumentationResources(server);

  // Register prompts
  // These will be imported and registered here once implemented
  // registerTransactionPrompts(server);
  // registerProgramPrompts(server);
  // registerTokenPrompts(server);

  // Cleanup function to close connections when the server shuts down
  const cleanup = async () => {
    // Additional cleanup logic if needed
    console.log("Cleaning up Solana connections...");
  };

  return { server, cleanup };
}