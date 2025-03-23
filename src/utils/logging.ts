/**
 * Simple logging utilities for Solana Web3.js MCP Server
 * 
 * This file provides a minimal logging interface that follows standard patterns
 * without introducing custom implementations.
 */

// Define log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Map log levels to string representations
export const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR'
};

// Current minimum log level - can be adjusted at runtime
let currentLogLevel = LogLevel.INFO;

/**
 * Simple logger class
 */
export class Logger {
  /**
   * Create a new logger with the specified context
   * @param context The context name for this logger
   */
  constructor(private context: string) {}

  /**
   * Log a debug message
   * @param message The message to log
   * @param data Optional data to include in the log
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log an info message
   * @param message The message to log
   * @param data Optional data to include in the log
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log a warning message
   * @param message The message to log
   * @param data Optional data to include in the log
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log an error message
   * @param message The message to log
   * @param data Optional data to include in the log
   */
  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  /**
   * Internal logging method
   */
  private log(level: LogLevel, message: string, data?: any): void {
    // Skip if below current log level
    if (level < currentLogLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelName = LogLevelNames[level];
    
    // Format the log message
    let logMessage = `[${timestamp}] [${levelName}] [${this.context}] ${message}`;
    
    // Add data if provided
    if (data !== undefined) {
      if (typeof data === 'object' && data !== null) {
        try {
          const formatted = JSON.stringify(data, null, 2);
          logMessage += `\n${formatted}`;
        } catch (e) {
          logMessage += `\n[Error formatting data: ${e instanceof Error ? e.message : String(e)}]`;
        }
      } else {
        logMessage += ` ${data}`;
      }
    }
    
    // Use the appropriate console method based on log level
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
    }
  }
}

/**
 * Get a logger for a specific context
 * @param context The context name for the logger
 * @returns A new logger instance
 */
export function getLogger(context: string): Logger {
  return new Logger(context);
}

/**
 * Set the minimum log level
 * @param level The minimum log level to display
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Set the minimum log level by name
 * @param levelName The name of the log level
 */
export function setLogLevelByName(levelName: string): void {
  const level = Object.entries(LogLevelNames).find(
    ([_, name]) => name.toLowerCase() === levelName.toLowerCase()
  );

  if (level) {
    currentLogLevel = Number(level[0]) as LogLevel;
  } else {
    throw new Error(`Invalid log level name: ${levelName}`);
  }
}