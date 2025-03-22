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
import { getAccountInfoTool } from './info.js';
import { checkAccountBalanceTool } from './balance.js';
import { findProgramAccountsTool } from './find.js';
import { getRentExemptionTool } from './rent.js';
import { getLogger } from '../../utils/logging.js';
import { ConnectionManager } from '../../core/connection-manager.js';

// Create logger for this module
const logger = getLogger('account-tools');

/**
 * Registers all account management tools with the MCP server
 * 
 * @param server - The MCP server instance
 * @param connectionManager - The connection manager instance to pass to tools
 */
export function registerAccountTools(server: McpServer, connectionManager: ConnectionManager): void {
  logger.info('Registering account management tools');
  
  // Register all account management tools
  server.tool(
    getAccountInfoTool.name,
    getAccountInfoTool.description,
    getAccountInfoTool.parameters,
    (params) => getAccountInfoTool.execute(params, connectionManager)
  );
  
  server.tool(
    checkAccountBalanceTool.name,
    checkAccountBalanceTool.description,
    checkAccountBalanceTool.parameters,
    (params) => checkAccountBalanceTool.execute(params, connectionManager)
  );
  
  server.tool(
    findProgramAccountsTool.name,
    findProgramAccountsTool.description,
    findProgramAccountsTool.parameters,
    (params) => findProgramAccountsTool.execute(params)
  );
  
  // For the rent exemption tool, use the tool factory pattern
  const rentExemptionTool = getRentExemptionTool();
  server.tool(
    rentExemptionTool.name,
    rentExemptionTool.description,
    rentExemptionTool.parameters,
    (params) => rentExemptionTool.handler(params)
  );
  
  logger.info('Account management tools registered successfully');
}

// Export tool interfaces for use in other modules
export { GetAccountInfoParams, GetAccountInfoResult } from './info.js';
export { CheckAccountBalanceParams, CheckAccountBalanceResult } from './balance.js';
export { FindProgramAccountsParams, FindProgramAccountsResult } from './find.js';
export { GetRentExemptionParams, GetRentExemptionResult } from './rent.js';