/**
 * HTTP Server Transport implementation for Solana Web3.js MCP Server
 * 
 * This module provides a HTTP transport implementation for the MCP server
 * following the official MCP SDK patterns.
 */

import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { z } from 'zod';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Configuration options for the HTTP server transport
 */
const HttpTransportConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default('localhost'),
  path: z.string().default('/'),
  corsOrigin: z.string().or(z.array(z.string())).optional(),
  requestSizeLimit: z.string().default('1mb')
});

export type HttpTransportConfig = z.infer<typeof HttpTransportConfigSchema>;

/**
 * A class for tracking message sinks (clients waiting for SSE responses)
 */
interface MessageSink {
  res: express.Response;
  id: string;
  messages: JSONRPCMessage[];
}

/**
 * HTTP Transport implementation for MCP Server
 * Based on the standard express pattern from MCP SDK
 */
export class HttpServerTransport implements Transport {
  // Transport interface callbacks
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sessionId?: string;

  private app = express();
  private server: http.Server | null = null;
  private config: HttpTransportConfig;
  private messageSinks: Map<string, MessageSink> = new Map();
  
  /**
   * Create a new HTTP server transport
   * @param config Transport configuration options
   */
  constructor(config: Partial<HttpTransportConfig> = {}) {
    this.config = HttpTransportConfigSchema.parse(config);
    this.sessionId = `http-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // Configure express
    this.app.use(express.json({ limit: this.config.requestSizeLimit }));
    
    // Setup CORS if configured
    if (this.config.corsOrigin) {
      this.app.use(cors({
        origin: this.config.corsOrigin,
        methods: ['POST', 'GET', 'OPTIONS'],
        allowedHeaders: ['Content-Type']
      }));
    }
    
    // Setup routes
    this.app.post(this.config.path, this.handleJsonRpcRequest.bind(this));
    this.app.get(`${this.config.path}/events`, this.handleSseRequest.bind(this));
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error("HTTP transport already started");
    }
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        console.log(`HTTP transport listening on http://${this.config.host}:${this.config.port}${this.config.path}`);
        resolve();
      });
      
      this.server.on('error', (error) => {
        this.onerror?.(error);
        reject(error);
      });
    });
  }

  /**
   * Handle incoming JSON-RPC requests
   */
  private handleJsonRpcRequest(req: express.Request, res: express.Response) {
    try {
      const message = req.body as JSONRPCMessage;
      
      // Process the message if handler is defined
      if (this.onmessage) {
        this.onmessage(message);
        res.status(202).json({ status: 'accepted' });
      } else {
        res.status(503).json({ error: 'Service unavailable' });
      }
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      res.status(400).json({ error: 'Invalid request' });
    }
  }

  /**
   * Handle SSE connection for server responses
   */
  private handleSseRequest(req: express.Request, res: express.Response) {
    const sinkId = `sink-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // Add initial comment to keep connection open
    res.write(': connected\n\n');
    
    // Create message sink
    const sink: MessageSink = {
      res,
      id: sinkId,
      messages: []
    };
    
    // Store the sink
    this.messageSinks.set(sinkId, sink);
    
    // Handle client disconnect
    req.on('close', () => {
      this.messageSinks.delete(sinkId);
    });
  }

  /**
   * Close the HTTP server
   */
  async close(): Promise<void> {
    if (!this.server) {
      return;
    }
    
    // Close all SSE connections
    for (const [id, sink] of this.messageSinks.entries()) {
      try {
        sink.res.end();
      } catch (e) {
        // Ignore errors during closure
      }
      this.messageSinks.delete(id);
    }
    
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.onclose?.();
        resolve();
      });
    });
  }

  /**
   * Send a JSON-RPC message to connected clients
   * 
   * Uses SSE to deliver messages to connected clients
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.messageSinks.size === 0) {
      console.warn('No connected clients to receive message');
      return;
    }
    
    const messageData = `data: ${JSON.stringify(message)}\n\n`;
    
    // Send to all connected sinks
    for (const [id, sink] of this.messageSinks.entries()) {
      try {
        sink.res.write(messageData);
      } catch (error) {
        console.error(`Error sending to sink ${id}:`, error);
        this.messageSinks.delete(id);
      }
    }
  }
}

/**
 * Create and configure an HTTP server transport
 * 
 * @param config Transport configuration options
 * @returns Configured HTTP server transport
 */
export function createHttpTransport(config: Partial<HttpTransportConfig> = {}): HttpServerTransport {
  return new HttpServerTransport(config);
}