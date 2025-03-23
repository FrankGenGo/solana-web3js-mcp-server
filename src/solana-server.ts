/**
 * Core implementation of the Solana Web3.js MCP Server
 * This file defines the server instance and registers all tools, resources, and prompts
 * following the official MCP SDK implementation patterns.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createConnection, clearConnectionCache } from "./core/connection-manager.js";
import { registerKeyTools } from "./tools/keys/index.js";
import { registerTransactionTools } from "./tools/transactions/index.js";
import { registerAccountTools } from "./tools/accounts/index.js";
import { registerProgramTools } from "./tools/programs/index.js";
import { registerTokenTools } from "./tools/tokens/index.js";

// Server version - update this when making significant changes
const VERSION = "0.1.0";

/**
 * Interface for server dependencies that will be passed to tool registration functions
 */
export interface ServerDependencies {
  createConnection: typeof createConnection;
}

/**
 * Creates and configures the Solana MCP server
 * @returns An object containing the server instance and a cleanup function
 */
export function createSolanaServer() {
  console.info(`Creating Solana Web3.js MCP Server v${VERSION}`);
  
  // Create the MCP server with implementation info
  const server = new McpServer({
    name: "solana-web3js",
    version: VERSION,
  }, {
    // Register server capabilities
    capabilities: {
      tools: {},         // Enable tools capability
      resources: {},     // Enable resources capability (when implemented)
      prompts: {},       // Enable prompts capability (when implemented)
    },
    // Optional server instructions
    instructions: "Solana Web3.js MCP Server provides tools for interacting with the Solana blockchain."
  });

  // Create dependencies object to pass to tool registration functions
  const dependencies: ServerDependencies = {
    createConnection
  };

  // Register tools from each module with the connection function
  registerAccountTools(server, dependencies);
  registerTransactionTools(server, dependencies);
  registerProgramTools(server, dependencies);
  registerKeyTools(server);
  registerTokenTools(server, dependencies);

  // Resources and prompts will be registered here when implemented
  // registerResources(server);
  // registerPrompts(server);

  console.info("Solana Web3.js MCP Server created successfully");

  // Cleanup function to close connections when the server shuts down
  const cleanup = async () => {
    console.info("Cleaning up Solana connections...");
    clearConnectionCache();
    console.info("Cleanup completed successfully");
  };

  return { server, cleanup };
}