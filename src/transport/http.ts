/**
 * HTTP/SSE Transport implementation for Solana Web3.js MCP Server
 * 
 * This module provides HTTP and Server-Sent Events (SSE) transport for the MCP server:
 * - HTTP REST API for request/response interactions
 * - SSE for streaming updates to clients
 * - Proper error handling and logging integration
 * - Configuration options for port, host, CORS, etc.
 */

import express, { Request, Response, NextFunction, Application } from 'express';
import http from 'http';
import cors from 'cors';
import { z } from 'zod';
import { EventEmitter } from 'events';
import { 
  McpTransport, 
  McpRequest, 
  McpResponse, 
  McpTransportEvents,
  McpStreamController
} from '@modelcontextprotocol/sdk/server/transport.js';
import { Logger, getLogger } from '../utils/logging.js';

// Logger for this module
const logger = getLogger('http-transport');

/**
 * HTTP/SSE Transport Configuration Schema
 */
const HttpTransportConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default('localhost'),
  cors: z.object({
    enabled: z.boolean().default(true),
    origin: z.union([z.string(), z.array(z.string())]).default('*'),
    methods: z.array(z.string()).default(['GET', 'POST']),
    allowedHeaders: z.array(z.string()).default(['Content-Type', 'X-MCP-Client-ID']),
    credentials: z.boolean().default(false)
  }).default({}),
  basePath: z.string().default('/api'),
  requestSizeLimit: z.string().default('1mb')
}).default({});

/**
 * HTTP/SSE Transport Configuration Interface
 */
export type HttpTransportConfig = z.infer<typeof HttpTransportConfigSchema>;

/**
 * Error class for HTTP transport-related errors
 */
export class HttpTransportError extends Error {
  public readonly statusCode: number;
  public readonly cause?: Error;

  constructor(message: string, statusCode: number = 500, cause?: Error) {
    super(message);
    this.name = 'HttpTransportError';
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

/**
 * HTTP/SSE Transport implementation for MCP Server
 * Provides both HTTP API endpoints and SSE streaming capabilities
 */
export class HttpTransport extends EventEmitter implements McpTransport {
  private app: Application;
  private server: http.Server | null = null;
  private config: HttpTransportConfig;
  private clientStreams: Map<string, Response> = new Map();
  private isRunning: boolean = false;

  /**
   * Create a new HTTP/SSE transport
   * @param config Transport configuration options
   */
  constructor(config: Partial<HttpTransportConfig> = {}) {
    super();
    
    // Parse and validate config
    try {
      this.config = HttpTransportConfigSchema.parse(config);
    } catch (error) {
      throw new HttpTransportError('Invalid HTTP transport configuration', 500, error instanceof Error ? error : undefined);
    }

    // Create Express app
    this.app = express();
    
    // Configure Express middleware
    this.configureMiddleware();
    
    // Set up API routes
    this.setupRoutes();

    logger.debug('HTTP/SSE transport created with config:', this.config);
  }

  /**
   * Configure Express middleware
   */
  private configureMiddleware(): void {
    // Parse JSON request bodies
    this.app.use(express.json({ limit: this.config.requestSizeLimit }));
    
    // Configure CORS if enabled
    if (this.config.cors.enabled) {
      this.app.use(cors({
        origin: this.config.cors.origin,
        methods: this.config.cors.methods,
        allowedHeaders: this.config.cors.allowedHeaders,
        credentials: this.config.cors.credentials
      }));
    }
    
    // Add request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.debug(`${req.method} ${req.path}`, { 
        clientId: req.headers['x-mcp-client-id'],
        query: req.query,
        contentLength: req.headers['content-length']
      });
      next();
    });
    
    // Error handling middleware
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      const statusCode = err instanceof HttpTransportError ? err.statusCode : 500;
      logger.error(`Error processing ${req.method} ${req.path}:`, err);
      
      res.status(statusCode).json({
        error: true,
        message: err.message,
        statusCode
      });
    });
  }

  /**
   * Set up API routes for the MCP server
   */
  private setupRoutes(): void {
    const basePath = this.config.basePath;
    
    // Health check endpoint
    this.app.get(`${basePath}/health`, (req: Request, res: Response) => {
      res.json({ status: 'ok', transport: 'http' });
    });
    
    // MCP request endpoint
    this.app.post(`${basePath}/request`, async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Extract client ID from headers or generate one
        const clientId = req.headers['x-mcp-client-id'] as string || `http-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        
        // Create MCP request from incoming HTTP request
        const mcpRequest: McpRequest = {
          id: req.body.id || `req-${Date.now()}`,
          clientId,
          payload: req.body.payload,
          metadata: {
            ...req.body.metadata,
            source: 'http',
            ip: req.ip,
            userAgent: req.headers['user-agent']
          }
        };
        
        // Emit request event to be processed by the MCP server
        this.emit(McpTransportEvents.REQUEST, mcpRequest, {
          respond: (response: McpResponse) => {
            // Send the response back to the client
            res.json({
              id: response.id,
              payload: response.payload,
              metadata: response.metadata
            });
          },
          reject: (error: Error) => {
            next(error);
          }
        });
      } catch (error) {
        next(error);
      }
    });
    
    // SSE endpoint for streaming updates
    this.app.get(`${basePath}/stream`, (req: Request, res: Response) => {
      // Extract client ID from query params or headers or generate one
      const clientId = (req.query.clientId as string) || 
                       (req.headers['x-mcp-client-id'] as string) || 
                       `sse-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      
      // Set up SSE connection
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-MCP-Client-ID': clientId
      });
      
      // Send initial connection message
      res.write(`data: ${JSON.stringify({ type: 'connection', clientId })}\n\n`);
      
      // Store the client stream
      this.clientStreams.set(clientId, res);
      
      logger.info(`SSE stream opened for client ${clientId}`);
      
      // Clean up when client disconnects
      req.on('close', () => {
        this.clientStreams.delete(clientId);
        logger.info(`SSE stream closed for client ${clientId}`);
        
        // Emit disconnect event
        this.emit(McpTransportEvents.DISCONNECT, { clientId });
      });
      
      // Emit connect event
      this.emit(McpTransportEvents.CONNECT, { 
        clientId,
        metadata: {
          source: 'sse',
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      });
    });
    
    // Default 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: true,
        message: `Endpoint not found: ${req.method} ${req.path}`,
        statusCode: 404
      });
    });
  }

  /**
   * Start the HTTP server
   */
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        logger.warn('HTTP transport is already running');
        resolve();
        return;
      }
      
      // Create HTTP server
      this.server = http.createServer(this.app);
      
      // Start listening
      this.server.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        logger.info(`HTTP/SSE transport started on http://${this.config.host}:${this.config.port}${this.config.basePath}`);
        resolve();
      });
      
      // Handle server errors
      this.server.on('error', (error) => {
        logger.error('HTTP server error:', error);
        reject(new HttpTransportError('Failed to start HTTP server', 500, error));
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isRunning || !this.server) {
        logger.warn('HTTP transport is not running');
        resolve();
        return;
      }
      
      // Close all client connections
      for (const [clientId, stream] of this.clientStreams.entries()) {
        try {
          stream.write(`data: ${JSON.stringify({ type: 'shutdown' })}\n\n`);
          stream.end();
          logger.debug(`Closed SSE stream for client ${clientId}`);
        } catch (error) {
          logger.error(`Error closing SSE stream for client ${clientId}:`, error);
        }
      }
      
      // Clear client streams map
      this.clientStreams.clear();
      
      // Stop HTTP server
      this.server.close((error) => {
        if (error) {
          logger.error('Error stopping HTTP server:', error);
          reject(new HttpTransportError('Failed to stop HTTP server', 500, error));
          return;
        }
        
        this.isRunning = false;
        this.server = null;
        logger.info('HTTP/SSE transport stopped');
        resolve();
      });
    });
  }

  /**
   * Send a response to a specific client via SSE
   */
  public send(clientId: string, message: McpResponse): void {
    const clientStream = this.clientStreams.get(clientId);
    
    if (!clientStream) {
      logger.warn(`Cannot send message to client ${clientId} - no active SSE connection`);
      return;
    }
    
    try {
      clientStream.write(`data: ${JSON.stringify({
        id: message.id,
        payload: message.payload,
        metadata: message.metadata
      })}\n\n`);
      
      logger.debug(`Sent message to client ${clientId}`, { messageId: message.id });
    } catch (error) {
      logger.error(`Error sending message to client ${clientId}:`, error);
      
      // Clean up the connection if we can't send to it
      this.clientStreams.delete(clientId);
    }
  }

  /**
   * Create a stream controller for a client
   */
  public createStream(clientId: string): McpStreamController {
    return {
      write: (chunk: any) => {
        const clientStream = this.clientStreams.get(clientId);
        
        if (!clientStream) {
          logger.warn(`Cannot write to stream for client ${clientId} - no active SSE connection`);
          return false;
        }
        
        try {
          clientStream.write(`data: ${JSON.stringify(chunk)}\n\n`);
          return true;
        } catch (error) {
          logger.error(`Error writing to stream for client ${clientId}:`, error);
          return false;
        }
      },
      end: () => {
        const clientStream = this.clientStreams.get(clientId);
        
        if (!clientStream) {
          return;
        }
        
        try {
          clientStream.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
          clientStream.end();
          this.clientStreams.delete(clientId);
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
    return this.clientStreams.has(clientId);
  }

  /**
   * Get the current status of the transport
   */
  public getStatus(): { isRunning: boolean; clientCount: number } {
    return {
      isRunning: this.isRunning,
      clientCount: this.clientStreams.size
    };
  }
}

/**
 * Create and configure an HTTP/SSE transport instance
 * 
 * @param config Transport configuration options
 * @returns Configured HTTP/SSE transport instance
 */
export function createHttpTransport(config: Partial<HttpTransportConfig> = {}): HttpTransport {
  return new HttpTransport(config);
}