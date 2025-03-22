/**
 * Token tools for the Solana MCP server.
 * 
 * This module exports tools for working with SPL tokens,
 * including creating, minting, transferring, and querying token information.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../../core/connection-manager.js";
import { createTokenTool } from "./create.js";
import { mintTokensTool } from "./mint.js";
import { transferTokensTool } from "./transfer.js";
import { getTokenAccountInfoTool } from "./account-info.js";
import { getTokenSupplyTool } from "./supply.js";

/**
 * Register all token-related tools with the MCP server.
 * 
 * @param server The MCP server instance
 * @param connectionManager The connection manager instance
 */
export function registerTokenTools(
  server: McpServer,
  connectionManager: ConnectionManager,
): void {
  // Register token creation tool
  server.registerTool({
    ...createTokenTool,
    execute: (params) => createTokenTool.execute(params, connectionManager),
  });
  
  // Register token minting tool
  server.registerTool({
    ...mintTokensTool,
    execute: (params) => mintTokensTool.execute(params, connectionManager),
  });
  
  // Register token transfer tool
  server.registerTool({
    ...transferTokensTool,
    execute: (params) => transferTokensTool.execute(params, connectionManager),
  });
  
  // Register token account info tool
  server.registerTool({
    ...getTokenAccountInfoTool,
    execute: (params) => getTokenAccountInfoTool.execute(params, connectionManager),
  });
  
  // Register token supply tool
  server.registerTool({
    ...getTokenSupplyTool,
    execute: (params) => getTokenSupplyTool.execute(params, connectionManager),
  });
};