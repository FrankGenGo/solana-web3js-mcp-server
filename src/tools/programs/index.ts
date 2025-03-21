/**
 * Program tools for the Solana MCP server.
 * 
 * This module exports tools for working with Solana programs,
 * including deployment, upgrading, and deriving program addresses.
 */

import type { MCPServer } from '../../types/mcp';
import type { ConnectionManager } from '../../core/connection-manager';
import { generateProgramAddress } from './address';
import { deployProgram } from './deploy';
import { upgradeProgram } from './upgrade';

/**
 * Register all program-related tools with the MCP server.
 * 
 * @param server The MCP server instance
 * @param connectionManager The connection manager instance
 */
export function registerProgramTools(
  server: MCPServer,
  connectionManager: ConnectionManager,
): void {
  // Register program deployment tools
  server.registerTool({
    ...deployProgram,
    execute: (params) => deployProgram.execute(params, connectionManager),
  });

  // Register program upgrade tools
  server.registerTool({
    ...upgradeProgram,
    execute: (params) => upgradeProgram.execute(params, connectionManager),
  });

  // Register program address tools
  server.registerTool({
    ...generateProgramAddress,
    execute: (params) => generateProgramAddress.execute(params, connectionManager),
  });
}