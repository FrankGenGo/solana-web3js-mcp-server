/**
 * Buffer Utilities for Solana Program Deployment
 * 
 * This module provides utilities for handling Solana program binaries,
 * including loading, chunking, and validation functions used by the
 * program deployment and upgrade tools.
 */

import fs from 'fs';
import path from 'path';
import { getLogger } from '../../../utils/logging.js';
import { ProgramError, ValidationError, tryCatch } from '../../../utils/errors.js';
import { BpfLoader } from '@solana/web3.js';

// Logger for this module
const logger = getLogger('buffer-utils');

// Maximum chunk size for program uploads (BPFLoader2 limit)
export const MAX_CHUNK_SIZE = BpfLoader.chunkSize;

// Maximum total program size (16MB)
export const MAX_PROGRAM_SIZE = 16 * 1024 * 1024;

// Minimum program size (must have some content)
export const MIN_PROGRAM_SIZE = 32;

/**
 * Error codes for buffer-related operations
 */
export enum BufferErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  INVALID_PROGRAM_SIZE = 'INVALID_PROGRAM_SIZE',
  INVALID_BUFFER_FORMAT = 'INVALID_BUFFER_FORMAT',
  CHUNKING_ERROR = 'CHUNKING_ERROR'
}

/**
 * Loads a program binary from a file path
 * 
 * @param filePath - Path to the compiled program (.so file)
 * @returns Promise resolving to a Buffer containing the program data
 * @throws ValidationError if the file is not found or cannot be read
 */
export async function loadProgramFromFile(filePath: string): Promise<Buffer> {
  logger.info(`Loading program from file: ${filePath}`);
  
  return tryCatch(async () => {
    // Validate file exists
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new ValidationError(
        `Program file not found at path: ${resolvedPath}`,
        'filePath',
        { code: BufferErrorCode.FILE_NOT_FOUND }
      );
    }
    
    // Load the file
    const data = await fs.promises.readFile(resolvedPath);
    logger.info(`Successfully loaded program, size: ${data.length} bytes`);
    
    // Validate program binary
    validateProgramBinary(data);
    
    return data;
  }, (error) => new ProgramError(
    `Failed to load program binary: ${error.message}`,
    undefined,
    undefined,
    { cause: error, details: { filePath } }
  ));
}

/**
 * Loads a program binary from a buffer or Uint8Array
 * 
 * @param data - Buffer or Uint8Array containing the program binary
 * @returns Buffer containing the program data
 * @throws ValidationError if the buffer is invalid
 */
export function loadProgramFromBuffer(data: Buffer | Uint8Array): Buffer {
  logger.info(`Loading program from buffer, size: ${data.length} bytes`);
  
  return tryCatch(() => {
    // Convert to Buffer if it's a Uint8Array
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    // Validate program binary
    validateProgramBinary(buffer);
    
    return buffer;
  }, (error) => new ProgramError(
    `Failed to load program from buffer: ${error.message}`,
    undefined,
    undefined,
    { cause: error }
  ));
}

/**
 * Validates a program binary
 * 
 * @param data - Buffer containing the program binary
 * @throws ValidationError if the program binary is invalid
 */
export function validateProgramBinary(data: Buffer): void {
  // Check if the program is too small
  if (data.length < MIN_PROGRAM_SIZE) {
    throw new ValidationError(
      `Program binary is too small: ${data.length} bytes (minimum: ${MIN_PROGRAM_SIZE} bytes)`,
      'programData',
      { code: BufferErrorCode.INVALID_PROGRAM_SIZE }
    );
  }
  
  // Check if the program is too large
  if (data.length > MAX_PROGRAM_SIZE) {
    throw new ValidationError(
      `Program binary is too large: ${data.length} bytes (maximum: ${MAX_PROGRAM_SIZE} bytes)`,
      'programData',
      { code: BufferErrorCode.INVALID_PROGRAM_SIZE }
    );
  }
  
  // Check ELF header magic (Solana programs are ELF binaries)
  if (data.length >= 4 && 
      !(data[0] === 0x7F && data[1] === 0x45 && data[2] === 0x4C && data[3] === 0x46)) {
    logger.warn('Program binary does not start with ELF header magic bytes', {
      magicBytes: data.slice(0, 4)
    });
    // This is just a warning, not an error, as custom loaders might use different formats
  }
  
  logger.debug('Program binary validation passed', { size: data.length });
}

/**
 * Splits a program binary into chunks for deployment
 * 
 * @param programData - Buffer containing the program binary
 * @param chunkSize - Size of each chunk in bytes (defaults to BPFLoader limit)
 * @returns Array of Buffer chunks
 */
export function chunkProgramData(
  programData: Buffer, 
  chunkSize: number = MAX_CHUNK_SIZE
): Buffer[] {
  logger.info(`Chunking program data into pieces of ${chunkSize} bytes`, {
    programSize: programData.length,
    expectedChunks: Math.ceil(programData.length / chunkSize)
  });
  
  return tryCatch(() => {
    const chunks: Buffer[] = [];
    
    for (let offset = 0; offset < programData.length; offset += chunkSize) {
      const chunk = programData.slice(offset, offset + chunkSize);
      chunks.push(chunk);
    }
    
    logger.debug(`Program successfully chunked into ${chunks.length} pieces`);
    
    return chunks;
  }, (error) => new ProgramError(
    `Failed to chunk program data: ${error.message}`,
    undefined,
    undefined,
    { 
      cause: error, 
      code: BufferErrorCode.CHUNKING_ERROR,
      details: { programSize: programData.length, chunkSize }
    }
  ));
}

/**
 * Calculates an estimate of the required space (and thus rent) for a program
 * 
 * @param programData - Buffer containing the program binary
 * @returns The estimated space required in bytes
 */
export function calculateProgramSpace(programData: Buffer): number {
  // Programs need space for the actual program data and some overhead for metadata
  const PROGRAM_METADATA_OVERHEAD = 128;
  return programData.length + PROGRAM_METADATA_OVERHEAD;
}

/**
 * Calculates SHA256 hash of program data for verification
 * 
 * @param programData - Buffer containing the program binary
 * @returns Promise resolving to a Buffer containing the SHA256 hash
 */
export async function calculateProgramHash(programData: Buffer): Promise<Buffer> {
  logger.debug('Calculating program hash for verification');
  
  return tryCatch(async () => {
    // Calculate SHA256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', programData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = Buffer.from(hashArray);
    
    logger.debug('Program hash calculated', { 
      hashHex: hash.toString('hex') 
    });
    
    return hash;
  }, (error) => new ProgramError(
    `Failed to calculate program hash: ${error.message}`,
    undefined,
    undefined,
    { cause: error }
  ));
}

/**
 * Creates a buffer filled with zeros of the specified size
 * 
 * @param size - Size of the buffer in bytes
 * @returns Buffer filled with zeros
 */
export function createEmptyBuffer(size: number): Buffer {
  return Buffer.alloc(size, 0);
}

/**
 * Compares two program binaries to identify if they are different
 * 
 * @param oldProgramData - Buffer containing the old program binary
 * @param newProgramData - Buffer containing the new program binary
 * @returns Object with comparison details
 */
export async function compareProgramBinaries(
  oldProgramData: Buffer,
  newProgramData: Buffer
): Promise<{
  sizeChanged: boolean;
  hashChanged: boolean;
  oldSize: number;
  newSize: number;
  oldHash: string;
  newHash: string;
}> {
  logger.info('Comparing program binaries');
  
  return tryCatch(async () => {
    const oldHash = await calculateProgramHash(oldProgramData);
    const newHash = await calculateProgramHash(newProgramData);
    
    const result = {
      sizeChanged: oldProgramData.length !== newProgramData.length,
      hashChanged: !oldHash.equals(newHash),
      oldSize: oldProgramData.length,
      newSize: newProgramData.length,
      oldHash: oldHash.toString('hex'),
      newHash: newHash.toString('hex')
    };
    
    logger.info('Program binary comparison complete', result);
    
    return result;
  }, (error) => new ProgramError(
    `Failed to compare program binaries: ${error.message}`,
    undefined,
    undefined,
    { cause: error }
  ));
}

// Export all functions
export default {
  loadProgramFromFile,
  loadProgramFromBuffer,
  validateProgramBinary,
  chunkProgramData,
  calculateProgramSpace,
  calculateProgramHash,
  createEmptyBuffer,
  compareProgramBinaries,
  MAX_CHUNK_SIZE,
  MAX_PROGRAM_SIZE,
  MIN_PROGRAM_SIZE,
  BufferErrorCode
};