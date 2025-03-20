/**
 * Standard I/O Transport implementation for Solana Web3.js MCP Server
 * 
 * This module provides a transport implementation that uses Node.js standard input/output streams:
 * - Reads McpRequests from standard input (stdin)
 * - Writes McpResponses to standard output (stdout)
 * - Provides proper error handling and logging
 * - Supports streaming of responses
 */

import { EventEmitter } from 'events';
import { createInterface, Interface } from 'readline';
import { z } from 'zod';
import { 
  McpTransport, 
  McpRequest, 
  McpResponse, 
  McpTransportEvents,
  McpStreamController
} from '@modelcontextprotocol/sdk/server/transport.js';
import { Logger, getLogger } from '../utils/logging.js';

// Logger for this module
const logger = getLogger('stdio-transport');

/**
 * Standard I/O Transport Configuration Schema
 */
const StdioTransportConfigSchema = z.object({
  encoding: z.enum(['utf8', 'ascii', 'binary']).default('utf8'),
  inputBufferSize: z.number().int().positive().default(1024 * 1024), // 1MB
  outputBufferSize: z.number().int().positive().default(1024 * 1024), // 1MB
  terminateOnStdinClose: z.boolean().default(true),
  messageDelimiter: z.string().default('\n'),
  rawMode: z.boolean().default(false),
  responseTimeout: z.number().int().positive().default(30000) // 30 seconds
}).default({});

/**
 * Standard I/O Transport Configuration Interface
 */
export type StdioTransportConfig = z.infer<typeof StdioTransportConfigSchema>;

/**
 * Error class for Standard I/O transport-related errors
 */
export class StdioTransportError extends Error {
  public readonly code: string;
  public readonly cause?: Error;

  constructor(message: string, code: string = 'STDIO_ERROR', cause?: Error) {
    super(message);
    this.name = 'StdioTransportError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Standard I/O Transport implementation for MCP Server
 * Provides stdin/stdout communication capabilities for MCP protocol
 */
export class StdioTransport extends EventEmitter implements McpTransport {
  private config: StdioTransportConfig;
  private isRunning: boolean = false;
  private readlineInterface: Interface | null = null;
  private activeStreams: Map<string, boolean> = new Map();
  private pendingResponses: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Create a new Standard I/O transport
   * @param config Transport configuration options
   */
  constructor(config: Partial<StdioTransportConfig> = {}) {
    super();
    
    // Parse and validate config
    try {
      this.config = StdioTransportConfigSchema.parse(config);
    } catch (error) {
      throw new StdioTransportError(
        'Invalid stdio transport configuration', 
        'CONFIG_ERROR', 
        error instanceof Error ? error : undefined
      );
    }

    logger.debug('Standard I/O transport created with config:', this.config);
  }

  /**
   * Initialize the Standard I/O transport
   * This sets up needed configurations but doesn't start reading yet
   */
  private initialize(): void {
    // Configure stdin
    process.stdin.setEncoding(this.config.encoding);
    
    if (this.config.rawMode) {
      // Set raw mode if requested
      process.stdin.setRawMode(true);
    }

    // Configure readline interface
    this.readlineInterface = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    // Set up event handlers
    process.stdin.on('error', this.handleStdinError.bind(this));
    process.stdout.on('error', this.handleStdoutError.bind(this));
  }

  /**
   * Handle errors from stdin
   */
  private handleStdinError(error: Error): void {
    logger.error('Error on stdin:', error);
    this.emit(McpTransportEvents.ERROR, new StdioTransportError(
      'Error reading from standard input', 
      'STDIN_ERROR', 
      error
    ));
  }

  /**
   * Handle errors from stdout
   */
  private handleStdoutError(error: Error): void {
    logger.error('Error on stdout:', error);
    this.emit(McpTransportEvents.ERROR, new StdioTransportError(
      'Error writing to standard output', 
      'STDOUT_ERROR', 
      error
    ));
  }

  /**
   * Parse an incoming message string into an MCP request object
   */
  private parseMessage(message: string): McpRequest {
    try {
      const parsed = JSON.parse(message);
      
      // Generate a client ID if not provided
      const clientId = parsed.clientId || `stdio-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      
      // Create a standardized McpRequest object
      const mcpRequest: McpRequest = {
        id: parsed.id || `req-${Date.now()}`,
        clientId,
        payload: parsed.payload,
        metadata: {
          ...parsed.metadata,
          source: 'stdio'
        }
      };
      
      return mcpRequest;
    } catch (error) {
      throw new StdioTransportError(
        'Failed to parse incoming message as JSON', 
        'PARSE_ERROR', 
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Start the Standard I/O transport
   * This begins reading from stdin and emitting events for received messages
   */
  public start(): Promise<void> {
    return new Promise((resolve) => {
      if (this.isRunning) {
        logger.warn('Standard I/O transport is already running');
        resolve();
        return;
      }
      
      // Initialize if not already initialized
      if (!this.readlineInterface) {
        this.initialize();
      }
      
      // Start reading from stdin
      if (this.readlineInterface) {
        this.readlineInterface.on('line', this.handleLineReceived.bind(this));
        
        // Handle closing of stdin
        this.readlineInterface.on('close', () => {
          logger.info('Standard input stream closed');
          
          if (this.config.terminateOnStdinClose) {
            this.stop().catch(error => {
              logger.error('Error stopping transport after stdin close:', error);
            });
          }
        });
      }
      
      this.isRunning = true;
      logger.info('Standard I/O transport started');
      
      // Emit ready event - unlike HTTP we have a single client
      const defaultClientId = `stdio-default-${Date.now()}`;
      this.emit(McpTransportEvents.CONNECT, { 
        clientId: defaultClientId,
        metadata: { source: 'stdio' }
      });
      
      resolve();
    });
  }

  /**
   * Handle a line of input received from stdin
   */
  private handleLineReceived(line: string): void {
    if (!line || line.trim() === '') {
      return; // Skip empty lines
    }
    
    try {
      // Parse the incoming message
      const request = this.parseMessage(line);
      logger.debug('Received message:', request.id);
      
      // Set up a timeout for the response
      const timeout = setTimeout(() => {
        logger.warn(`Response timeout for message ${request.id}`);
        this.pendingResponses.delete(request.id);
      }, this.config.responseTimeout);
      
      this.pendingResponses.set(request.id, timeout);
      
      // Emit the request event for the MCP server to handle
      this.emit(McpTransportEvents.REQUEST, request, {
        respond: (response: McpResponse) => {
          // Clear the timeout
          const pendingTimeout = this.pendingResponses.get(request.id);
          if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            this.pendingResponses.delete(request.id);
          }
          
          // Send the response
          this.send(response.clientId, response);
        },
        reject: (error: Error) => {
          // Clear the timeout
          const pendingTimeout = this.pendingResponses.get(request.id);
          if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            this.pendingResponses.delete(request.id);
          }
          
          // Send error response
          this.sendError(request.clientId, request.id, error);
        }
      });
    } catch (error) {
      logger.error('Error processing incoming message:', error);
      
      // Send a generic error response since we might not have a valid request
      const errorResponse = {
        id: `error-${Date.now()}`,
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error processing message',
        code: error instanceof StdioTransportError ? error.code : 'UNKNOWN_ERROR'
      };
      
      process.stdout.write(JSON.stringify(errorResponse) + this.config.messageDelimiter);
    }
  }

  /**
   * Send an error response to stdout
   */
  private sendError(clientId: string, requestId: string, error: Error): void {
    const errorResponse: McpResponse = {
      id: requestId,
      clientId,
      payload: {
        error: true,
        message: error.message,
        code: error instanceof StdioTransportError ? error.code : 'UNKNOWN_ERROR'
      },
      metadata: {
        source: 'stdio',
        timestamp: Date.now(),
        error: true
      }
    };
    
    this.send(clientId, errorResponse);
  }

  /**
   * Stop the Standard I/O transport
   * This stops reading from stdin and cleans up resources
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isRunning) {
        logger.warn('Standard I/O transport is not running');
        resolve();
        return;
      }
      
      // Clear all timeouts for pending responses
      for (const [id, timeout] of this.pendingResponses.entries()) {
        clearTimeout(timeout);
        logger.debug(`Cleared timeout for pending response ${id}`);
      }
      this.pendingResponses.clear();
      
      // Close readline interface if it exists
      if (this.readlineInterface) {
        this.readlineInterface.close();
        this.readlineInterface = null;
      }
      
      // Reset raw mode if it was enabled
      if (this.config.rawMode && process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      
      this.isRunning = false;
      this.activeStreams.clear();
      
      logger.info('Standard I/O transport stopped');
      resolve();
    });
  }

  /**
   * Send a response to a client via stdout
   * For stdio transport, we write to stdout regardless of clientId
   */
  public send(clientId: string, message: McpResponse): void {
    try {
      // Format the message as JSON with the configured delimiter
      const formattedMessage = JSON.stringify(message) + this.config.messageDelimiter;
      
      // Write to stdout
      const success = process.stdout.write(formattedMessage);
      
      if (success) {
        logger.debug(`Sent message ${message.id} to client ${clientId}`);
      } else {
        logger.warn(`stdout buffer full when sending message ${message.id}`);
      }
    } catch (error) {
      logger.error(`Error sending message to client ${clientId}:`, error);
      this.emit(McpTransportEvents.ERROR, new StdioTransportError(
        `Failed to send message to client ${clientId}`, 
        'SEND_ERROR', 
        error instanceof Error ? error : undefined
      ));
    }
  }

  /**
   * Create a stream controller for sending chunked responses to a client
   */
  public createStream(clientId: string): McpStreamController {
    // Mark this client as having an active stream
    this.activeStreams.set(clientId, true);
    
    return {
      write: (chunk: any) => {
        // If the stream is no longer active, don't try to write
        if (!this.activeStreams.has(clientId)) {
          return false;
        }
        
        try {
          // Format the chunk as a stream message
          const streamMessage = {
            type: 'stream',
            clientId,
            chunk,
            timestamp: Date.now()
          };
          
          // Write to stdout
          const success = process.stdout.write(
            JSON.stringify(streamMessage) + this.config.messageDelimiter
          );
          
          return success;
        } catch (error) {
          logger.error(`Error writing to stream for client ${clientId}:`, error);
          return false;
        }
      },
      end: () => {
        // If the stream is already ended, do nothing
        if (!this.activeStreams.has(clientId)) {
          return;
        }
        
        try {
          // Format the end message
          const endMessage = {
            type: 'stream-end',
            clientId,
            timestamp: Date.now()
          };
          
          // Write to stdout
          process.stdout.write(
            JSON.stringify(endMessage) + this.config.messageDelimiter
          );
          
          // Mark the stream as no longer active
          this.activeStreams.delete(clientId);
          logger.debug(`Ended stream for client ${clientId}`);
        } catch (error) {
          logger.error(`Error ending stream for client ${clientId}:`, error);
        }
      }
    };
  }

  /**
   * Check if a client has an active stream
   */
  public hasStream(clientId: string): boolean {
    return this.activeStreams.has(clientId);
  }

  /**
   * Get the current status of the transport
   */
  public getStatus(): { isRunning: boolean; clientCount: number } {
    return {
      isRunning: this.isRunning,
      clientCount: this.activeStreams.size
    };
  }
}

/**
 * Create and configure a Standard I/O transport instance
 * 
 * @param config Transport configuration options
 * @returns Configured Standard I/O transport instance
 */
export function createStdioTransport(config: Partial<StdioTransportConfig> = {}): StdioTransport {
  return new StdioTransport(config);
}