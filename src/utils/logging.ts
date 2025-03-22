/**
 * Logging system for Solana-web3js MCP server
 * 
 * This module provides a flexible logging infrastructure with:
 * - Multiple log levels (debug, info, warn, error, fatal)
 * - Configurable outputs (console, file, custom)
 * - Context-based loggers
 * - Formatted log entries with timestamps
 * - Support for serialization of complex objects
 */

import fs from 'fs';
import path from 'path';
import util from 'util';

// Define log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
  NONE = 5,
}

// Map log levels to string representations
export const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
  [LogLevel.NONE]: 'NONE',
};

// Output destination interface
export interface LogOutput {
  write(entry: LogEntry): void;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

// Log entry structure
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  context: string;
  message: string;
  data?: any;
  error?: Error;
}

// Global configuration for the logging system
export interface LogConfig {
  minLevel: LogLevel;
  outputs: LogOutput[];
  enableUncaughtExceptionHandler: boolean;
  redactSensitiveKeys: string[];
}

// Default configuration
const DEFAULT_CONFIG: LogConfig = {
  minLevel: LogLevel.INFO,
  outputs: [],
  enableUncaughtExceptionHandler: true,
  redactSensitiveKeys: ['password', 'secret', 'key', 'token', 'authorization'],
};

// Current configuration
let currentConfig: LogConfig = { ...DEFAULT_CONFIG };

// Console output implementation
export class ConsoleOutput implements LogOutput {
  constructor(private colorize: boolean = true) {}

  write(entry: LogEntry): void {
    const formatted = this.format(entry);
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      case LogLevel.INFO:
        console.info(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(formatted);
        break;
    }
  }

  private format(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = LogLevelNames[entry.level];
    const context = entry.context;
    const message = entry.message;
    let formatted = `[${timestamp}] [${level}] [${context}] ${message}`;
    
    if (entry.data) {
      const data = this.sanitize(entry.data);
      formatted += '\n' + util.inspect(data, { depth: 4, colors: this.colorize });
    }
    
    if (entry.error) {
      formatted += '\n' + (entry.error.stack || entry.error.toString());
    }
    
    return formatted;
  }

  private sanitize(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    
    for (const key in sanitized) {
      if (currentConfig.redactSensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }
    
    return sanitized;
  }
}

// File output implementation
export class FileOutput implements LogOutput {
  private stream: fs.WriteStream | null = null;
  private queue: LogEntry[] = [];
  private isWriting = false;

  constructor(private filePath: string, private maxFileSizeBytes: number = 10 * 1024 * 1024) {
    this.ensureDirectoryExists();
    this.openStream();
  }

  write(entry: LogEntry): void {
    this.queue.push(entry);
    this.processQueue();
  }

  private ensureDirectoryExists(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private openStream(): void {
    try {
      this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
      this.stream.on('error', (err) => {
        console.error(`Error writing to log file ${this.filePath}:`, err);
      });
    } catch (err) {
      console.error(`Failed to open log file ${this.filePath}:`, err);
    }
  }

  private async rotateLogFileIfNeeded(): Promise<void> {
    try {
      const stats = fs.statSync(this.filePath);
      if (stats.size >= this.maxFileSizeBytes) {
        if (this.stream) {
          this.stream.end();
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const newPath = `${this.filePath}.${timestamp}`;
        fs.renameSync(this.filePath, newPath);
        
        this.openStream();
      }
    } catch (err) {
      // If the file doesn't exist yet, no need to rotate
      if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
        console.error('Error rotating log file:', err);
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isWriting || this.queue.length === 0 || !this.stream) {
      return;
    }

    this.isWriting = true;
    
    try {
      await this.rotateLogFileIfNeeded();
      
      while (this.queue.length > 0) {
        const entry = this.queue.shift()!;
        const formatted = this.format(entry);
        
        if (this.stream) {
          this.stream.write(formatted + '\n');
        }
      }
    } catch (err) {
      console.error('Error processing log queue:', err);
    } finally {
      this.isWriting = false;
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  private format(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = LogLevelNames[entry.level];
    const context = entry.context;
    const message = entry.message;
    
    let formatted = `[${timestamp}] [${level}] [${context}] ${message}`;
    
    if (entry.data) {
      const data = this.sanitize(entry.data);
      formatted += '\n' + JSON.stringify(data);
    }
    
    if (entry.error) {
      formatted += '\n' + (entry.error.stack || entry.error.toString());
    }
    
    return formatted;
  }

  private sanitize(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }
    
    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    
    for (const key in sanitized) {
      if (currentConfig.redactSensitiveKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }
    
    return sanitized;
  }

  async flush(): Promise<void> {
    if (this.stream) {
      return new Promise<void>((resolve) => {
        if (this.stream) {
          this.stream.cork();
          process.nextTick(() => {
            if (this.stream) {
              this.stream.uncork();
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    }
  }

  async close(): Promise<void> {
    if (this.stream) {
      return new Promise<void>((resolve, reject) => {
        if (this.stream) {
          this.stream.end(() => {
            this.stream = null;
            resolve();
          });
        } else {
          resolve();
        }
      });
    }
    return Promise.resolve();
  }
}

// Logger class
export class Logger {
  private static instances: Map<string, Logger> = new Map();
  
  constructor(private context: string) {
    if (!currentConfig.outputs.length) {
      // Add default console output if none configured
      configureLogging({
        outputs: [new ConsoleOutput()],
      });
    }
  }

  debug(message: string, data?: any): void {
    this.logMessage(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any): void {
    this.logMessage(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any, error?: Error): void {
    this.logMessage(LogLevel.WARN, message, data, error);
  }

  error(message: string, data?: any, error?: Error): void {
    this.logMessage(LogLevel.ERROR, message, data, error);
  }

  fatal(message: string, data?: any, error?: Error): void {
    this.logMessage(LogLevel.FATAL, message, data, error);
  }
  
  // Make this public so it can be used by other classes
  log(level: LogLevel, message: string, data?: any, error?: Error): void {
    this.logMessage(level, message, data, error);
  }

  private logMessage(level: LogLevel, message: string, data?: any, error?: Error): void {
    // Skip if the log level is below the configured minimum
    if (level < currentConfig.minLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      context: this.context,
      message,
      data,
      error,
    };

    for (const output of currentConfig.outputs) {
      try {
        output.write(entry);
      } catch (err) {
        console.error('Error writing to log output:', err);
      }
    }
  }
  
  /**
   * Get all instances of loggers created
   */
  static getAllInstances(): Map<string, Logger> {
    return Logger.instances;
  }
  
  /**
   * Shutdown all loggers and clear instances
   */
  static shutdownAll(): void {
    Logger.instances.clear();
  }
}

// Factory function to create loggers
export function getLogger(context: string): Logger {
  const logger = new Logger(context);
  Logger.getAllInstances().set(context, logger);
  return logger;
}

// Configure the logging system
export function configureLogging(config: Partial<LogConfig>): void {
  // Close any existing outputs that have a close method
  const closePromises = currentConfig.outputs
    .filter(output => typeof output.close === 'function')
    .map(output => output.close?.());
  
  Promise.all(closePromises).catch(err => {
    console.error('Error closing log outputs:', err);
  });

  // Update configuration
  currentConfig = {
    ...currentConfig,
    ...config,
  };

  // Set up global uncaught exception handler
  if (currentConfig.enableUncaughtExceptionHandler) {
    setupUncaughtExceptionHandler();
  }
}

// Set up uncaught exception handler
let uncaughtExceptionHandlerRegistered = false;
function setupUncaughtExceptionHandler(): void {
  if (uncaughtExceptionHandlerRegistered) {
    return;
  }

  process.on('uncaughtException', (err) => {
    const logger = getLogger('process');
    logger.fatal('Uncaught exception', {}, err);
    
    // Flush outputs before exiting
    const flushPromises = currentConfig.outputs
      .filter(output => typeof output.flush === 'function')
      .map(output => output.flush?.());
    
    Promise.all(flushPromises)
      .catch(flushErr => {
        console.error('Error flushing log outputs:', flushErr);
      })
      .finally(() => {
        process.exit(1);
      });
  });

  process.on('unhandledRejection', (reason, promise) => {
    const logger = getLogger('process');
    logger.error('Unhandled promise rejection', { promise }, reason instanceof Error ? reason : new Error(String(reason)));
  });

  uncaughtExceptionHandlerRegistered = true;
}

// Set log level by name
export function setLogLevelByName(levelName: string): void {
  const level = Object.entries(LogLevelNames).find(
    ([_, name]) => name.toLowerCase() === levelName.toLowerCase()
  );

  if (level) {
    configureLogging({ minLevel: Number(level[0]) as LogLevel });
  } else {
    throw new Error(`Invalid log level name: ${levelName}`);
  }
}

// Create a default logger for top-level use
export const logger = getLogger('app');

// Utility to create a file logger with sensible defaults
export function createFileLogger(filePath: string, options?: { 
  maxFileSizeBytes?: number;
  addConsoleOutput?: boolean;
  minLevel?: LogLevel;
}): void {
  const fileOutput = new FileOutput(
    filePath, 
    options?.maxFileSizeBytes
  );

  const outputs: LogOutput[] = [fileOutput];
  
  if (options?.addConsoleOutput) {
    outputs.push(new ConsoleOutput());
  }

  configureLogging({
    outputs,
    minLevel: options?.minLevel !== undefined ? options.minLevel : currentConfig.minLevel,
  });
}

// Helper to determine if a level would be logged
export function wouldLog(level: LogLevel): boolean {
  return level >= currentConfig.minLevel;
}

// Helper to log elapsed time for operations
export function logTime<T>(
  operation: string, 
  fn: () => T | Promise<T>, 
  logger = getLogger('performance'),
  level: LogLevel = LogLevel.DEBUG
): Promise<T> {
  if (!wouldLog(level)) {
    return Promise.resolve(fn() as T);
  }

  const start = Date.now();
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => {
        const elapsed = Date.now() - start;
        if (level === LogLevel.DEBUG) logger.debug(`${operation} completed in ${elapsed}ms`);
        else if (level === LogLevel.INFO) logger.info(`${operation} completed in ${elapsed}ms`);
        else if (level === LogLevel.WARN) logger.warn(`${operation} completed in ${elapsed}ms`);
        else if (level === LogLevel.ERROR) logger.error(`${operation} completed in ${elapsed}ms`);
        else if (level === LogLevel.FATAL) logger.fatal(`${operation} completed in ${elapsed}ms`);
      });
    } else {
      const elapsed = Date.now() - start;
      if (level === LogLevel.DEBUG) logger.debug(`${operation} completed in ${elapsed}ms`);
      else if (level === LogLevel.INFO) logger.info(`${operation} completed in ${elapsed}ms`);
      else if (level === LogLevel.WARN) logger.warn(`${operation} completed in ${elapsed}ms`);
      else if (level === LogLevel.ERROR) logger.error(`${operation} completed in ${elapsed}ms`);
      else if (level === LogLevel.FATAL) logger.fatal(`${operation} completed in ${elapsed}ms`);
      return Promise.resolve(result);
    }
  } catch (error) {
    const elapsed = Date.now() - start;
    logger.error(`${operation} failed after ${elapsed}ms`, {}, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

// Ensure clean shutdown by flushing all logs
export async function shutdownLogging(): Promise<void> {
  const closePromises = currentConfig.outputs
    .filter(output => typeof output.close === 'function')
    .map(output => output.close?.());
  
  await Promise.all(closePromises);
  Logger.shutdownAll();
}