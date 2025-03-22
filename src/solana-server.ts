/**
 * Core implementation of the Solana Web3.js MCP Server
 * This file defines the server instance and registers all tools, resources, and prompts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConnectionManager } from "./core/connection-manager.js";
import { Logger, getLogger } from "./utils/logging.js";
import { ServerError } from "./utils/errors.js";
import { registerKeyTools } from "./tools/keys/index.js";
import { registerTransactionTools } from "./tools/transactions/index.js";
import { registerAccountTools } from "./tools/accounts/index.js";
import { registerProgramTools } from "./tools/programs/index.js";
import { registerTokenTools } from "./tools/tokens/index.js";

// Server version - update this when making significant changes
const VERSION = "0.1.0";

// Get logger for this module
const logger = getLogger("solana-server");

/**
 * Creates and configures the Solana MCP server
 * @returns An object containing the server instance and a cleanup function
 */
export function createSolanaServer() {
  logger.info(`Creating Solana Web3.js MCP Server v${VERSION}`);
  
  try {
    // Get the connection manager instance
    const connectionManager = getConnectionManager();
    
    // Create the MCP server
    const server = new McpServer({
      name: "solana-web3js",
      version: VERSION,
    });

    // Register tools from each module
    // Uncomment these as they are implemented
    registerAccountTools(server, connectionManager);
    registerTransactionTools(server, connectionManager);
    registerProgramTools(server, connectionManager);
    registerKeyTools(server);
    registerTokenTools(server, connectionManager);

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

    logger.info("Solana Web3.js MCP Server created successfully");

    // Cleanup function to close connections when the server shuts down
    const cleanup = async () => {
      logger.info("Cleaning up Solana connections...");
      try {
        await connectionManager.cleanup();
        Logger.shutdownAll();
        logger.info("Cleanup completed successfully");
      } catch (error) {
        logger.error("Error during cleanup:", error);
      }
    };

    return { server, cleanup };
  } catch (error) {
    logger.error("Failed to create Solana Web3.js MCP Server:", error);
    throw new ServerError("Failed to create server", { cause: error });
  }
}