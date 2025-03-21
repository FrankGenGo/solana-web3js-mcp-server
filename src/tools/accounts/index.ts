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
  
  server.tool(
    'getRentExemption',
    'Calculate the minimum balance required for rent exemption based on data size',
    {
      type: 'object',
      properties: {
        size: {
          type: 'number',
          description: 'The size of account data in bytes'
        },
        cluster: {
          type: 'string',
          description: 'Solana cluster to use (mainnet-beta, testnet, devnet, or custom URL)',
          default: 'mainnet-beta'
        }
      },
      required: ['size']
    },
    async (params) => {
      const tool = getRentExemptionTool();
      return tool.handler({ 
        size: params.size, 
        cluster: params.cluster || 'mainnet-beta' 
      });
    }
  );
  
  logger.info('Account management tools registered successfully');
}