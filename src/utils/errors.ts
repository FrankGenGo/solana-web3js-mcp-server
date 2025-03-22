/**
 * Error handling system for Solana Web3.js MCP Server
 * 
 * This module defines:
 * - A hierarchical error class structure
 * - Error formatting and standardization utilities
 * - Integration with the logging system
 * - Utilities for handling Solana-specific errors
 */

import { getLogger } from './logging.js';
// Import error utilities from web3.js v2.0
import { 
  SolanaError,
  TransactionError as SolanaTransactionError
} from '@solana/web3.js';

// Error codes by category for consistent error identification
export enum ErrorCode {
  // General server errors (1000-1999)
  SERVER_ERROR = 1000,
  INITIALIZATION_FAILED = 1001,
  VALIDATION_FAILED = 1002,
  NOT_IMPLEMENTED = 1003,
  TIMEOUT = 1004,
  RATE_LIMIT_EXCEEDED = 1005,
  
  // Connection errors (2000-2999)
  CONNECTION_ERROR = 2000,
  CONNECTION_TIMEOUT = 2001,
  CONNECTION_REFUSED = 2002,
  ENDPOINT_NOT_FOUND = 2003,
  
  // Transaction errors (3000-3999)
  TRANSACTION_ERROR = 3000,
  TRANSACTION_SIMULATION_FAILED = 3001,
  TRANSACTION_REJECTED = 3002,
  TRANSACTION_TIMEOUT = 3003,
  TRANSACTION_CONFIRMATION_FAILED = 3004,
  TRANSACTION_INVALID = 3005,
  SIGNATURE_VERIFICATION_FAILED = 3006,
  
  // Account errors (4000-4999)
  ACCOUNT_ERROR = 4000,
  ACCOUNT_NOT_FOUND = 4001,
  INSUFFICIENT_FUNDS = 4002,
  ACCOUNT_ALREADY_EXISTS = 4003,
  
  // Program errors (5000-5999)
  PROGRAM_ERROR = 5000,
  PROGRAM_NOT_FOUND = 5001,
  PROGRAM_EXECUTION_FAILED = 5002,
  INSTRUCTION_ERROR = 5003,
  
  // Public key errors (6000-6999)
  PUBKEY_ERROR = 6000,
  INVALID_PUBKEY = 6001,
  
  // Token errors (7000-7999)
  TOKEN_ERROR = 7000,
  TOKEN_ACCOUNT_NOT_FOUND = 7001,
  TOKEN_MINT_MISMATCH = 7002,
  INSUFFICIENT_TOKEN_BALANCE = 7003,
  
  // MCP specific errors (8000-8999)
  MCP_ERROR = 8000,
  MCP_REQUEST_INVALID = 8001,
  MCP_RESPONSE_INVALID = 8002,
  
  // Unknown errors (9000-9999)
  UNKNOWN_ERROR = 9000
}

// Error severity levels
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// Base error interface to ensure consistent properties
export interface BaseErrorProps {
  code?: ErrorCode;
  severity?: ErrorSeverity;
  cause?: Error;
  details?: Record<string, any>;
}

// Base class for all system errors
export class SolanaServerError extends Error {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;
  readonly cause?: Error;
  readonly details?: Record<string, any>;
  readonly timestamp: Date;
  readonly name: string = 'SolanaServerError';

  constructor(message: string, props: BaseErrorProps = {}) {
    super(message);
    this.code = props.code ?? ErrorCode.UNKNOWN_ERROR;
    this.severity = props.severity ?? ErrorSeverity.ERROR;
    this.cause = props.cause;
    this.details = props.details;
    this.timestamp = new Date();
    
    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, SolanaServerError.prototype);
  }

  /**
   * Formats the error for logging
   */
  toLogFormat(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      details: this.details,
      stack: this.stack,
      cause: this.cause ? 
        (this.cause instanceof SolanaServerError ? 
          this.cause.toLogFormat() : 
          {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack
          }) 
        : undefined
    };
  }

  /**
   * Formats the error for client response (excludes sensitive information)
   */
  toResponseFormat(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      // Only include certain details that are safe for client response
      details: this.safeClientDetails()
    };
  }

  /**
   * Filter details to only include safe properties for client responses
   */
  protected safeClientDetails(): Record<string, any> | undefined {
    if (!this.details) return undefined;
    
    // Create a sanitized copy without sensitive information
    const safeDetails: Record<string, any> = {};
    
    // Add only safe properties to share with clients
    // Never expose private keys, secrets, internal IDs, etc.
    for (const [key, value] of Object.entries(this.details)) {
      // Skip sensitive keys
      if (
        key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('token')
      ) {
        continue;
      }
      
      // Include safe keys
      safeDetails[key] = value;
    }
    
    return Object.keys(safeDetails).length > 0 ? safeDetails : undefined;
  }

  /**
   * Logs the error using the provided logger
   */
  log(logger = getLogger('errors')): void {
    switch (this.severity) {
      case ErrorSeverity.INFO:
        logger.info('Error:', this.toLogFormat());
        break;
      case ErrorSeverity.WARNING:
        logger.warn('Warning:', this.toLogFormat());
        break;
      case ErrorSeverity.CRITICAL:
        logger.error('Critical Error:', this.toLogFormat());
        break;
      case ErrorSeverity.ERROR:
      default:
        logger.error('Error:', this.toLogFormat());
        break;
    }
  }
}

//------------------------------------------------------
// Specific error categories
//------------------------------------------------------

// Server errors (initialization, configuration, etc.)
export class ServerError extends SolanaServerError {
  readonly name: string = 'ServerError';
  
  constructor(message: string, props: BaseErrorProps = {}) {
    super(message, {
      code: props.code ?? ErrorCode.SERVER_ERROR,
      severity: props.severity ?? ErrorSeverity.CRITICAL,
      ...props
    });
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

// Connection-related errors
export class ConnectionError extends SolanaServerError {
  readonly name: string = 'ConnectionError';
  readonly cluster?: string;
  readonly endpoint?: string;
  
  constructor(
    message: string, 
    cluster?: string, 
    endpoint?: string, 
    props: BaseErrorProps = {}
  ) {
    super(message, {
      code: props.code ?? ErrorCode.CONNECTION_ERROR,
      severity: props.severity ?? ErrorSeverity.ERROR,
      details: {
        ...(props.details || {}),
        cluster,
        endpoint
      },
      ...props
    });
    this.cluster = cluster;
    this.endpoint = endpoint;
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

// Transaction-related errors
export class TransactionError extends SolanaServerError {
  readonly name: string = 'TransactionError';
  readonly signature?: string;
  
  constructor(
    message: string, 
    signature?: string, 
    props: BaseErrorProps = {}
  ) {
    super(message, {
      code: props.code ?? ErrorCode.TRANSACTION_ERROR,
      severity: props.severity ?? ErrorSeverity.ERROR,
      details: {
        ...(props.details || {}),
        signature
      },
      ...props
    });
    this.signature = signature;
    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

// Account-related errors
export class AccountError extends SolanaServerError {
  readonly name: string = 'AccountError';
  readonly pubkey?: string;
  
  constructor(
    message: string, 
    pubkey?: string, 
    props: BaseErrorProps = {}
  ) {
    super(message, {
      code: props.code ?? ErrorCode.ACCOUNT_ERROR,
      severity: props.severity ?? ErrorSeverity.ERROR,
      details: {
        ...(props.details || {}),
        pubkey
      },
      ...props
    });
    this.pubkey = pubkey;
    Object.setPrototypeOf(this, AccountError.prototype);
  }
}

// Program-related errors
export class ProgramError extends SolanaServerError {
  readonly name: string = 'ProgramError';
  readonly programId?: string;
  readonly instruction?: number;
  
  constructor(
    message: string, 
    programId?: string,
    instruction?: number,
    props: BaseErrorProps = {}
  ) {
    super(message, {
      code: props.code ?? ErrorCode.PROGRAM_ERROR,
      severity: props.severity ?? ErrorSeverity.ERROR,
      details: {
        ...(props.details || {}),
        programId,
        instruction
      },
      ...props
    });
    this.programId = programId;
    this.instruction = instruction;
    Object.setPrototypeOf(this, ProgramError.prototype);
  }
}

// Public key-related errors
export class PublicKeyError extends SolanaServerError {
  readonly name: string = 'PublicKeyError';
  
  constructor(
    message: string, 
    props: BaseErrorProps = {}
  ) {
    super(message, {
      code: props.code ?? ErrorCode.PUBKEY_ERROR,
      severity: props.severity ?? ErrorSeverity.ERROR,
      ...props
    });
    Object.setPrototypeOf(this, PublicKeyError.prototype);
  }
}

// Token-related errors
export class TokenError extends SolanaServerError {
  readonly name: string = 'TokenError';
  readonly mint?: string;
  readonly tokenAccount?: string;
  
  constructor(
    message: string, 
    mint?: string,
    tokenAccount?: string,
    props: BaseErrorProps = {}
  ) {
    super(message, {
      code: props.code ?? ErrorCode.TOKEN_ERROR,
      severity: props.severity ?? ErrorSeverity.ERROR,
      details: {
        ...(props.details || {}),
        mint,
        tokenAccount
      },
      ...props
    });
    this.mint = mint;
    this.tokenAccount = tokenAccount;
    Object.setPrototypeOf(this, TokenError.prototype);
  }
}

// Validation-related errors
export class ValidationError extends SolanaServerError {
  readonly name: string = 'ValidationError';
  readonly field?: string;
  
  constructor(
    message: string, 
    field?: string,
    props: BaseErrorProps = {}
  ) {
    super(message, {
      code: props.code ?? ErrorCode.VALIDATION_FAILED,
      severity: props.severity ?? ErrorSeverity.WARNING,
      details: {
        ...(props.details || {}),
        field
      },
      ...props
    });
    this.field = field;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// MCP-specific errors
export class McpError extends SolanaServerError {
  readonly name: string = 'McpError';
  
  constructor(
    message: string, 
    props: BaseErrorProps = {}
  ) {
    super(message, {
      code: props.code ?? ErrorCode.MCP_ERROR,
      severity: props.severity ?? ErrorSeverity.ERROR,
      ...props
    });
    Object.setPrototypeOf(this, McpError.prototype);
  }
}

//------------------------------------------------------
// Error handling utility functions
//------------------------------------------------------

/**
 * Wraps a Solana Web3.js error into the appropriate system error
 */
export function wrapSolanaError(error: Error): SolanaServerError {
  // Check if the error is a Solana error from web3.js v2.0
  if (error instanceof SolanaError) {
    // Handle Transaction errors
    if (error instanceof SolanaTransactionError) {
      return new TransactionError(
        `Transaction error: ${error.message}`,
        undefined,
        { cause: error, code: ErrorCode.TRANSACTION_ERROR }
      );
    }
    
    // For other Solana errors, extract useful information if available
    const details: Record<string, any> = {};
    
    // Determine the error type based on name and message pattern
    const errorName = error.name.toLowerCase();
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('program') || errorName.includes('program')) {
      return new ProgramError(
        `Program error: ${error.message}`,
        undefined,
        undefined,
        { cause: error, code: ErrorCode.PROGRAM_EXECUTION_FAILED }
      );
    }
    
    if (errorMessage.includes('signature') || errorName.includes('signature')) {
      return new TransactionError(
        `Signature verification failed: ${error.message}`,
        undefined,
        { cause: error, code: ErrorCode.SIGNATURE_VERIFICATION_FAILED }
      );
    }
    
    // Extract any additional properties for details
    for (const key in error) {
      // Skip standard Error properties
      if (['name', 'message', 'stack'].includes(key)) continue;
      // @ts-ignore - We're safely extracting properties
      details[key] = error[key];
    }
    
    return new ConnectionError(
      `Solana error: ${error.message}`,
      undefined,
      undefined,
      {
        cause: error,
        code: ErrorCode.CONNECTION_ERROR,
        details: Object.keys(details).length ? details : undefined
      }
    );
  }
  
  // Check for error name patterns
  const errorName = error.name.toLowerCase();
  
  if (errorName.includes('transaction')) {
    return new TransactionError(
      `Transaction error: ${error.message}`,
      undefined,
      { cause: error }
    );
  }
  
  if (errorName.includes('account')) {
    return new AccountError(
      `Account error: ${error.message}`,
      undefined,
      { cause: error }
    );
  }
  
  if (errorName.includes('program') || errorName.includes('instruction')) {
    return new ProgramError(
      `Program error: ${error.message}`,
      undefined,
      undefined,
      { cause: error }
    );
  }
  
  if (errorName.includes('pubkey') || errorName.includes('key')) {
    return new PublicKeyError(
      `Public key error: ${error.message}`,
      { cause: error }
    );
  }
  
  if (errorName.includes('token')) {
    return new TokenError(
      `Token error: ${error.message}`,
      undefined,
      undefined,
      { cause: error }
    );
  }
  
  if (errorName.includes('connection')) {
    return new ConnectionError(
      `Connection error: ${error.message}`,
      undefined,
      undefined,
      { cause: error }
    );
  }
  
  // Default: wrap in a generic SolanaServerError
  return new SolanaServerError(
    `Solana error: ${error.message}`,
    { cause: error }
  );
}

/**
 * Safely executes a function and wraps any errors
 * @param fn Function to execute
 * @param errorMapper Optional custom error mapper function
 * @returns Result of the function
 * @throws SolanaServerError or subclass
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorMapper?: (error: any) => SolanaServerError
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Use provided error mapper or default wrapper
    const mappedError = errorMapper ? 
      errorMapper(error) : 
      (error instanceof SolanaServerError ? 
        error : 
        wrapSolanaError(error instanceof Error ? error : new Error(String(error))));
    
    // Log the error
    mappedError.log();
    
    // Rethrow the mapped error
    throw mappedError;
  }
}

/**
 * Safely executes a function synchronously and wraps any errors
 * @param fn Function to execute
 * @param errorMapper Optional custom error mapper function
 * @returns Result of the function
 * @throws SolanaServerError or subclass
 */
export function tryCatchSync<T>(
  fn: () => T,
  errorMapper?: (error: any) => SolanaServerError
): T {
  try {
    return fn();
  } catch (error: any) {
    // Use provided error mapper or default wrapper
    const mappedError = errorMapper ? 
      errorMapper(error) : 
      (error instanceof SolanaServerError ? 
        error : 
        wrapSolanaError(error instanceof Error ? error : new Error(String(error))));
    
    // Log the error
    mappedError.log();
    
    // Rethrow the mapped error
    throw mappedError;
  }
}

/**
 * Extracts useful information from a Solana program error
 * @param error The error to analyze
 * @returns Object with extracted information
 */
export function analyzeProgramError(error: Error): Record<string, any> {
  const errorInfo: Record<string, any> = {
    type: 'program_error',
    message: error.message,
  };
  
  // Check for common program error patterns in the error message
  const customProgramErrorMatch = error.message.match(/Custom program error: (0x[0-9a-f]+|[0-9]+)/i);
  if (customProgramErrorMatch) {
    errorInfo.customProgramError = customProgramErrorMatch[1];
  }
  
  // Extract instruction index if available
  const instructionErrorMatch = error.message.match(/Instruction (\d+):/i);
  if (instructionErrorMatch) {
    errorInfo.instructionIndex = parseInt(instructionErrorMatch[1], 10);
  }
  
  // Extract logs if available in the error object
  if ('logs' in error && Array.isArray((error as any).logs)) {
    errorInfo.logs = (error as any).logs;
    
    // Analyze logs for program invocation details
    const programInvocations: Record<string, number> = {};
    for (const log of (error as any).logs) {
      const programInvokeMatch = log.match(/Program (\w+) invoke/);
      if (programInvokeMatch) {
        const programId = programInvokeMatch[1];
        programInvocations[programId] = (programInvocations[programId] || 0) + 1;
      }
    }
    
    if (Object.keys(programInvocations).length > 0) {
      errorInfo.programInvocations = programInvocations;
    }
  }
  
  return errorInfo;
}

/**
 * Helper function to create a ValidationError from Zod or other validation errors
 */
export function createValidationError(error: any, message = 'Validation failed'): ValidationError {
  // Handle Zod validation errors
  if (error && typeof error === 'object' && 'errors' in error) {
    const details: Record<string, any> = {};
    const zodErrors = error.errors || [];
    
    // Format Zod errors in a clean way
    for (const zodError of zodErrors) {
      if (zodError.path && zodError.path.length > 0) {
        const path = zodError.path.join('.');
        details[path] = zodError.message;
      } else {
        details[`error_${Object.keys(details).length}`] = zodError.message;
      }
    }
    
    return new ValidationError(message, undefined, {
      details,
      cause: error
    });
  }
  
  // Generic validation error
  return new ValidationError(message, undefined, { cause: error });
}