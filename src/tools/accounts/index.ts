/**
 * Account Management Tools
 * 
 * This module exports tools for managing Solana accounts, including:
 * - Getting account information
 * - Checking account balances
 * - Finding program accounts
 * - Calculating rent exemption
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getLogger } from '../../utils/logging.js';
import { ServerDependencies } from '../../solana-server.js';
import { getCheckAccountBalanceTool } from './balance.js';

// Create logger for this module
const logger = getLogger('account-tools');

/**
 * Registers all account management tools with the MCP server
 * 
 * @param server - The MCP server instance
 * @param deps - Server dependencies for tool creation
 */
export function registerAccountTools(server: McpServer, deps: ServerDependencies): void {
  logger.info('Registering account management tools');
  
  // Register check account balance tool
  const checkAccountBalanceTool = getCheckAccountBalanceTool(deps);
  server.tool(
    checkAccountBalanceTool.name,
    checkAccountBalanceTool.description,
    checkAccountBalanceTool.parameters,
    checkAccountBalanceTool.execute
  );

  // Other tools would be registered here following the same pattern
  // For now, we're only updating the balance tool as an example

  logger.info('Account management tools registered successfully');
}

// Export tool interfaces for use in other modules
export { CheckAccountBalanceParams, CheckAccountBalanceResult } from './balance.js';