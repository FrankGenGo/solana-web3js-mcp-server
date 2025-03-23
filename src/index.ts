#!/usr/bin/env node
/**
 * Entry point for the Solana Web3.js MCP Server
 * 
 * This module handles:
 * - Command-line argument parsing
 * - Environment variable configuration
 * - Server initialization with appropriate transport
 * - Signal handling for graceful shutdown
 */

import { createSolanaServer } from './solana-server.js';
import { StdioServerTransport } from './transport/stdio.js';
import { createHttpTransport } from './transport/http.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Server configuration interface
 */
interface ServerConfig {
  transport: 'http' | 'stdio' | 'both';
  httpPort: number;
  httpHost: string;
  httpPath: string;
  httpCorsOrigin?: string;
  defaultCluster: string;
}

/**
 * Parse command-line arguments and environment variables
 * @returns Parsed server configuration
 */
function parseConfig(): ServerConfig {
  // Default configuration
  const config: ServerConfig = {
    transport: 'stdio',
    httpPort: 3000,
    httpHost: 'localhost',
    httpPath: '/',
    defaultCluster: 'devnet',
  };

  // Parse command-line arguments
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    
    if (arg === '--transport=http') {
      config.transport = 'http';
    } else if (arg === '--transport=stdio') {
      config.transport = 'stdio';
    } else if (arg === '--transport=both') {
      config.transport = 'both';
    } else if (arg.startsWith('--http-port=')) {
      config.httpPort = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--http-host=')) {
      config.httpHost = arg.split('=')[1];
    } else if (arg.startsWith('--http-path=')) {
      config.httpPath = arg.split('=')[1];
    } else if (arg.startsWith('--http-cors-origin=')) {
      config.httpCorsOrigin = arg.split('=')[1];
    } else if (arg.startsWith('--default-cluster=')) {
      config.defaultCluster = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit();
    }
  }

  // Check environment variables (will override command line args)
  if (process.env.SOLANA_MCP_TRANSPORT) {
    if (['http', 'stdio', 'both'].includes(process.env.SOLANA_MCP_TRANSPORT)) {
      config.transport = process.env.SOLANA_MCP_TRANSPORT as 'http' | 'stdio' | 'both';
    } else {
      console.warn(`Invalid transport type in environment variable: ${process.env.SOLANA_MCP_TRANSPORT}, using default: ${config.transport}`);
    }
  }

  if (process.env.SOLANA_MCP_HTTP_PORT) {
    config.httpPort = parseInt(process.env.SOLANA_MCP_HTTP_PORT, 10);
  }

  if (process.env.SOLANA_MCP_HTTP_HOST) {
    config.httpHost = process.env.SOLANA_MCP_HTTP_HOST;
  }
  
  if (process.env.SOLANA_MCP_HTTP_PATH) {
    config.httpPath = process.env.SOLANA_MCP_HTTP_PATH;
  }
  
  if (process.env.SOLANA_MCP_HTTP_CORS_ORIGIN) {
    config.httpCorsOrigin = process.env.SOLANA_MCP_HTTP_CORS_ORIGIN;
  }
  
  if (process.env.SOLANA_MCP_DEFAULT_CLUSTER) {
    config.defaultCluster = process.env.SOLANA_MCP_DEFAULT_CLUSTER;
  }

  return config;
}

/**
 * Print usage information and exit
 */
function printUsageAndExit(): never {
  console.log(`
Solana Web3.js MCP Server

Usage:
  node dist/index.js [options]

Options:
  --transport=<type>          Transport type (http, stdio, both). Default: stdio
  --http-port=<port>          HTTP server port (for http transport). Default: 3000
  --http-host=<host>          HTTP server host (for http transport). Default: localhost
  --http-path=<path>          HTTP API path. Default: /
  --http-cors-origin=<origin> HTTP CORS origin. Default: * (if not specified, CORS is disabled)
  --default-cluster=<cluster> Default Solana cluster. Default: devnet
  --help, -h                  Show this help message

Environment Variables:
  SOLANA_MCP_TRANSPORT        Same as --transport
  SOLANA_MCP_HTTP_PORT        Same as --http-port
  SOLANA_MCP_HTTP_HOST        Same as --http-host
  SOLANA_MCP_HTTP_PATH        Same as --http-path
  SOLANA_MCP_HTTP_CORS_ORIGIN Same as --http-cors-origin
  SOLANA_MCP_DEFAULT_CLUSTER  Same as --default-cluster
  `);
  process.exit(0);
}

/**
 * Set up process signal handlers for graceful shutdown
 * @param cleanup Cleanup function to call before shutdown
 */
function setupSignalHandlers(cleanup: () => Promise<void>): void {
  let isShuttingDown = false;

  const handleSignal = async (signal: string) => {
    if (isShuttingDown) {
      console.info(`Received another ${signal} signal during shutdown, forcing exit`);
      process.exit(1);
      return;
    }

    isShuttingDown = true;
    console.info(`Received ${signal} signal, shutting down gracefully...`);
    
    try {
      await cleanup();
      console.info('Shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Register handlers for different termination signals
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGHUP', () => handleSignal('SIGHUP'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
  });
}

/**
 * Main server initialization function
 */
async function main(): Promise<void> {
  try {
    // Parse configuration
    const config = parseConfig();
    
    console.info('Starting Solana Web3.js MCP Server...');
    
    // Create the Solana MCP server
    const { server, cleanup } = createSolanaServer();
    
    // Set up transport(s)
    if (config.transport === 'http' || config.transport === 'both') {
      const httpTransport = createHttpTransport({
        port: config.httpPort,
        host: config.httpHost,
        path: config.httpPath,
        corsOrigin: config.httpCorsOrigin,
      });
      
      // Connect HTTP transport
      await server.connect(httpTransport);
      console.info(`HTTP transport started on http://${config.httpHost}:${config.httpPort}${config.httpPath}`);
    }
    
    if (config.transport === 'stdio' || config.transport === 'both') {
      const stdioTransport = new StdioServerTransport();
      
      // Connect STDIO transport
      await server.connect(stdioTransport);
      console.info('STDIO transport started');
    }
    
    // Set up signal handlers for graceful shutdown
    setupSignalHandlers(async () => {
      console.info('Shutting down server...');
      
      // Close the server
      await server.close();
      
      // Run cleanup
      await cleanup();
    });
    
    console.info('Solana Web3.js MCP Server started successfully');
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error('Unhandled error in main process:', error);
  process.exit(1);
});