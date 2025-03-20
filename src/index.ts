#!/usr/bin/env node
/**
 * Entry point for the Solana Web3.js MCP Server
 * 
 * This module handles:
 * - Command-line argument parsing
 * - Environment variable configuration
 * - Server initialization with appropriate transport
 * - Signal handling for graceful shutdown
 * - Global error handling
 */

import { createSolanaServer } from './solana-server.js';
import { Logger, getLogger, LogLevel, setLogLevelByName, ConsoleOutput, FileOutput, configureLogging } from './utils/logging.js';
import { ServerError, ErrorCode, ErrorSeverity } from './utils/errors.js';
import { createHttpTransport } from './transport/http.js';
import { StdioTransport } from '@modelcontextprotocol/sdk/server/transport.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get the logger for this module
const logger = getLogger('index');

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Server configuration interface
 */
interface ServerConfig {
  transport: 'http' | 'stdio' | 'both';
  logLevel: string;
  logFile?: string;
  httpPort: number;
  httpHost: string;
  httpBasePath: string;
  httpCorsOrigin: string;
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
    logLevel: 'info',
    httpPort: 3000,
    httpHost: 'localhost',
    httpBasePath: '/api',
    httpCorsOrigin: '*',
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
    } else if (arg.startsWith('--log-level=')) {
      config.logLevel = arg.split('=')[1];
    } else if (arg.startsWith('--log-file=')) {
      config.logFile = arg.split('=')[1];
    } else if (arg.startsWith('--http-port=')) {
      config.httpPort = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--http-host=')) {
      config.httpHost = arg.split('=')[1];
    } else if (arg.startsWith('--http-base-path=')) {
      config.httpBasePath = arg.split('=')[1];
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
      logger.warn(`Invalid transport type in environment variable: ${process.env.SOLANA_MCP_TRANSPORT}, using default: ${config.transport}`);
    }
  }

  if (process.env.SOLANA_MCP_LOG_LEVEL) {
    config.logLevel = process.env.SOLANA_MCP_LOG_LEVEL;
  }

  if (process.env.SOLANA_MCP_LOG_FILE) {
    config.logFile = process.env.SOLANA_MCP_LOG_FILE;
  }

  if (process.env.SOLANA_MCP_HTTP_PORT) {
    config.httpPort = parseInt(process.env.SOLANA_MCP_HTTP_PORT, 10);
  }

  if (process.env.SOLANA_MCP_HTTP_HOST) {
    config.httpHost = process.env.SOLANA_MCP_HTTP_HOST;
  }
  
  if (process.env.SOLANA_MCP_HTTP_BASE_PATH) {
    config.httpBasePath = process.env.SOLANA_MCP_HTTP_BASE_PATH;
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
  --log-level=<level>         Log level (debug, info, warn, error, fatal). Default: info
  --log-file=<path>           Log file path. Default: console only
  --http-port=<port>          HTTP server port (for http transport). Default: 3000
  --http-host=<host>          HTTP server host (for http transport). Default: localhost
  --http-base-path=<path>     HTTP API base path. Default: /api
  --http-cors-origin=<origin> HTTP CORS origin. Default: *
  --default-cluster=<cluster> Default Solana cluster. Default: devnet
  --help, -h                  Show this help message

Environment Variables:
  SOLANA_MCP_TRANSPORT        Same as --transport
  SOLANA_MCP_LOG_LEVEL        Same as --log-level
  SOLANA_MCP_LOG_FILE         Same as --log-file
  SOLANA_MCP_HTTP_PORT        Same as --http-port
  SOLANA_MCP_HTTP_HOST        Same as --http-host
  SOLANA_MCP_HTTP_BASE_PATH   Same as --http-base-path
  SOLANA_MCP_HTTP_CORS_ORIGIN Same as --http-cors-origin
  SOLANA_MCP_DEFAULT_CLUSTER  Same as --default-cluster
  `);
  process.exit(0);
}

/**
 * Configure logging based on settings
 * @param config Server configuration
 */
function setupLogging(config: ServerConfig): void {
  try {
    // Set up the outputs
    const outputs = [new ConsoleOutput()];
    
    // Add file output if configured
    if (config.logFile) {
      // Make sure the directory exists
      const logDir = path.dirname(config.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      outputs.push(new FileOutput(config.logFile));
      logger.info(`Logging to file: ${config.logFile}`);
    }
    
    // Configure the logging system
    configureLogging({
      outputs,
      enableUncaughtExceptionHandler: true,
    });
    
    // Set the log level
    setLogLevelByName(config.logLevel);
    
    logger.info(`Log level set to: ${config.logLevel}`);
  } catch (error) {
    console.error('Failed to configure logging:', error);
    // Continue with default console logging
  }
}

/**
 * Set up process signal handlers for graceful shutdown
 * @param cleanup Cleanup function to call before shutdown
 */
function setupSignalHandlers(cleanup: () => Promise<void>): void {
  let isShuttingDown = false;

  const handleSignal = async (signal: string) => {
    if (isShuttingDown) {
      logger.info(`Received another ${signal} signal during shutdown, forcing exit`);
      process.exit(1);
      return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal} signal, shutting down gracefully...`);
    
    try {
      await cleanup();
      logger.info('Shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Register handlers for different termination signals
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGHUP', () => handleSignal('SIGHUP'));
  
  // Handle uncaught exceptions not caught by the logging system
  process.on('uncaughtException', (error) => {
    logger.fatal('Uncaught exception:', error);
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
    
    // Set up logging
    setupLogging(config);
    
    logger.info('Starting Solana Web3.js MCP Server...');
    
    // Create the Solana MCP server
    const { server, cleanup } = createSolanaServer();
    
    // Set up transport(s)
    if (config.transport === 'http' || config.transport === 'both') {
      const httpTransport = createHttpTransport({
        port: config.httpPort,
        host: config.httpHost,
        basePath: config.httpBasePath,
        cors: {
          origin: config.httpCorsOrigin,
        }
      });
      
      server.addTransport(httpTransport);
      await httpTransport.start();
      logger.info(`HTTP transport started on http://${config.httpHost}:${config.httpPort}${config.httpBasePath}`);
    }
    
    if (config.transport === 'stdio' || config.transport === 'both') {
      const stdioTransport = new StdioTransport();
      server.addTransport(stdioTransport);
      logger.info('STDIO transport started');
    }
    
    // Set up signal handlers for graceful shutdown
    setupSignalHandlers(async () => {
      logger.info('Shutting down server...');
      
      // Stop the server gracefully
      await server.stop();
      
      // Run the cleanup function
      await cleanup();
      
      logger.info('Server stopped');
    });
    
    // Start the server
    await server.start();
    
    logger.info('Solana Web3.js MCP Server started successfully');
    
    // Log configuration info
    logger.debug('Server configuration:', {
      transport: config.transport,
      logLevel: config.logLevel,
      defaultCluster: config.defaultCluster,
      ...(config.transport === 'http' || config.transport === 'both' ? {
        httpPort: config.httpPort,
        httpHost: config.httpHost,
        httpBasePath: config.httpBasePath,
      } : {})
    });
    
  } catch (error) {
    logger.fatal('Failed to start server:', error);
    
    if (error instanceof ServerError) {
      logger.error(error.toLogFormat());
    }
    
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  console.error('Unhandled error in main process:', error);
  process.exit(1);
});