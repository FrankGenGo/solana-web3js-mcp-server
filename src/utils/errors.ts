/**
 * Error handling utilities for Solana Web3.js MCP Server
 * 
 * This module provides error classes and utilities following Solana web3.js v2 patterns.
 */

/**
 * Base error class for Solana MCP Server errors
 */
export class SolanaMcpError extends Error {
  /** Error code for categorization */
  readonly code: string;
  /** Additional error context */
  readonly context: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    context: Record<string, unknown> = {},
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
  }

  /**
   * Gets the cause of this error if available
   */
  getCause(): Error | undefined {
    return this.cause as Error | undefined;
  }
}

/**
 * Error thrown when there's an issue with the Solana RPC connection
 */
export class ConnectionError extends SolanaMcpError {
  constructor(
    message: string,
    cluster: string,
    endpoint: string,
    options?: ErrorOptions
  ) {
    super(
      message,
      'SOLANA_CONNECTION_ERROR',
      { cluster, endpoint },
      options
    );
  }
}

/**
 * Error thrown when there's an issue with transaction validation or execution
 */
export class TransactionError extends SolanaMcpError {
  constructor(
    message: string,
    signature?: string,
    options?: ErrorOptions
  ) {
    super(
      message,
      'SOLANA_TRANSACTION_ERROR',
      signature ? { signature } : {},
      options
    );
  }
}

/**
 * Error thrown when there's an issue with a Public Key
 */
export class PublicKeyError extends SolanaMcpError {
  constructor(
    message: string,
    options?: ErrorOptions
  ) {
    super(
      message,
      'SOLANA_PUBLIC_KEY_ERROR',
      {},
      options
    );
  }
}

/**
 * Error thrown for parameter validation failures
 */
export class ValidationError extends SolanaMcpError {
  constructor(
    message: string,
    paramName: string,
    options?: ErrorOptions
  ) {
    super(
      message,
      'SOLANA_VALIDATION_ERROR',
      { param: paramName },
      options
    );
  }
}

/**
 * Error thrown when a program or instruction fails
 */
export class ProgramError extends SolanaMcpError {
  constructor(
    message: string,
    programId: string,
    errorCode?: number,
    options?: ErrorOptions
  ) {
    super(
      message,
      'SOLANA_PROGRAM_ERROR',
      { programId, errorCode },
      options
    );
  }
}

/**
 * Helper to determine if an error is a SolanaMcpError
 */
export function isSolanaMcpError(error: unknown): error is SolanaMcpError {
  return error instanceof SolanaMcpError;
}

/**
 * Helper to check if an error is a specific type of SolanaMcpError
 */
export function isSolanaMcpErrorWithCode(error: unknown, code: string): boolean {
  return isSolanaMcpError(error) && error.code === code;
}

/**
 * Utility to safely execute a function and handle errors
 * 
 * @param fn The function to execute
 * @param errorHandler A function to transform any errors
 * @returns The result of the function or throws the transformed error
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorHandler: (error: Error) => Error
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw errorHandler(error instanceof Error ? error : new Error(String(error)));
  }
}