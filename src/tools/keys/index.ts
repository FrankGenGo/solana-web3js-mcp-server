/**
 * Key Management Tools
 * 
 * This module provides tools for generating, importing, and deriving Solana keypairs.
 * These tools allow AI assistants to securely handle key material for Solana accounts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateKeypairTool } from "./generate.js";
import { importKeypairTool } from "./import.js";
import { deriveKeypairTool } from "./derive.js";
import { getLogger } from "../../utils/logging.js";

// Get logger for this module
const logger = getLogger("key-tools");

/**
 * Registers all key management tools with the MCP server
 * @param server The MCP server instance
 */
export function registerKeyTools(server: McpServer): void {
  logger.info("Registering key management tools");
  
  try {
    // Register individual tools
    server.registerTool(generateKeypairTool);
    server.registerTool(importKeypairTool);
    server.registerTool(deriveKeypairTool);
    
    logger.info("Key management tools registered successfully");
  } catch (error) {
    logger.error("Failed to register key management tools:", error);
    throw error;
  }
}

// Export individual tools for direct imports
export { generateKeypairTool } from "./generate.js";
export { importKeypairTool } from "./import.js";
export { deriveKeypairTool } from "./derive.js";