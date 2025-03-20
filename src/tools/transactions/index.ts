/**
 * Transaction Tools for Solana Web3.js MCP Server
 * 
 * This module exports functions to register transaction-related tools with the MCP server.
 * These tools provide functionality for creating, signing, sending, simulating, and checking status of Solana transactions.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConnectionManager } from "../../core/connection-manager.js";
import { getLogger } from "../../utils/logging.js";
import { createTransactionTool } from "./create.js";
import { signTransactionTool } from "./sign.js";
import { sendTransactionTool } from "./send.js";
import { simulateTransactionTool } from "./simulate.js";
import { getTransactionStatusTool } from "./status.js";

// Get logger for this module
const logger = getLogger("transaction-tools");

/**
 * Register all transaction-related tools with the MCP server
 * 
 * @param server - The MCP server instance
 * @param connectionManager - The connection manager instance
 */
export function registerTransactionTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  logger.info("Registering transaction tools");
  
  try {
    // Register each transaction tool
    server.registerTool(createTransactionTool);
    server.registerTool(signTransactionTool);
    server.registerTool({
      ...sendTransactionTool,
      execute: (params) => sendTransactionTool.execute(params, connectionManager)
    });
    server.registerTool({
      ...simulateTransactionTool,
      execute: (params) => simulateTransactionTool.execute(params, connectionManager)
    });
    server.registerTool({
      ...getTransactionStatusTool,
      execute: (params) => getTransactionStatusTool.execute(params, connectionManager)
    });
    
    logger.info("Transaction tools registered successfully");
  } catch (error) {
    logger.error("Failed to register transaction tools:", error);
    throw error;
  }
}

// Export individual tools
export { createTransactionTool } from "./create.js";
export { signTransactionTool } from "./sign.js";
export { sendTransactionTool } from "./send.js";
export { simulateTransactionTool } from "./simulate.js";
export { getTransactionStatusTool } from "./status.js";