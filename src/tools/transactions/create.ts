/**
 * Create Transaction Tool
 * 
 * This tool allows creating Solana transactions with one or more instructions.
 * It supports various transaction options like fee payer, recent blockhash,
 * durable nonces, and more.
 */

import { 
  Transaction, 
  TransactionInstruction, 
  PublicKey, 
  SystemProgram,
  NonceAccount,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  SYSVAR_RENT_PUBKEY, 
  VersionedTransaction,
  TransactionMessage,
  AddressLookupTableAccount,
  MessageV0
} from "@solana/web3.js";
import { getLogger } from "../../utils/logging.js";
import { 
  TransactionError, 
  ValidationError, 
  PublicKeyError, 
  tryCatch 
} from "../../utils/errors.js";

// Logger for this module
const logger = getLogger("create-transaction-tool");

// Instruction type for the tool parameters
export interface InstructionData {
  // Program ID that will execute this instruction (as base58 string)
  programId: string;
  
  // Keys used by this instruction (accounts)
  keys: Array<{
    // Account public key (as base58 string)
    pubkey: string;
    
    // Whether this account is a signer
    isSigner: boolean;
    
    // Whether this account is writable
    isWritable: boolean;
  }>;
  
  // Instruction data as base64 string, hex string, or array of numbers
  data: string | number[];
}

// Address lookup table for versioned transactions
export interface AddressLookupTableData {
  // Account address of the lookup table (as base58 string)
  address: string;
  
  // Addresses in the lookup table (as base58 strings)
  addresses: string[];
}

// Optional nonce information for transactions
export interface NonceInfo {
  // The nonce account pubkey (as base58 string)
  nonceAccount: string;
  
  // The nonce authority pubkey (as base58 string)
  nonceAuthority: string;
  
  // The nonce value (as base58 string)
  nonce: string;
}

// Tool parameter definition
export interface CreateTransactionParams {
  // Array of instructions to include in the transaction
  instructions: InstructionData[];
  
  // Optional fee payer public key (as base58 string)
  feePayer?: string;
  
  // Optional recent blockhash (if not provided, use a nonce or latest blockhash)
  recentBlockhash?: string;
  
  // Optional nonce information for offline transaction creation
  nonceInfo?: NonceInfo;
  
  // Whether to create a legacy or versioned transaction (defaults to false)
  useVersionedTransaction?: boolean;
  
  // Optional address lookup tables for versioned transactions
  addressLookupTables?: AddressLookupTableData[];
  
  // Optional blockhash validity seconds if nonce not used (default 60)
  blockhashValiditySeconds?: number;
}

// Tool response type
export interface CreateTransactionResult {
  // Transaction encoded as base64 string for sending
  transaction: string;
  
  // Blockhash used for the transaction
  blockhash: string;
  
  // Transaction type (legacy or versioned)
  type: "legacy" | "versioned";
  
  // Last valid block height (if available)
  lastValidBlockHeight?: number;
}

/**
 * Creates a Solana transaction from the provided instructions and options
 * 
 * @param params - Tool parameters
 * @returns Object containing the serialized transaction and metadata
 */
export const createTransactionTool = {
  name: "createTransaction",
  description: "Creates a new Solana transaction with the specified instructions",
  
  parameters: {
    type: "object",
    properties: {
      instructions: {
        type: "array",
        description: "Array of instructions to include in the transaction",
        items: {
          type: "object",
          properties: {
            programId: {
              type: "string",
              description: "Program ID (public key) that will execute this instruction"
            },
            keys: {
              type: "array",
              description: "Account keys used by this instruction",
              items: {
                type: "object",
                properties: {
                  pubkey: {
                    type: "string",
                    description: "Public key of the account"
                  },
                  isSigner: {
                    type: "boolean",
                    description: "Whether this account is a signer"
                  },
                  isWritable: {
                    type: "boolean",
                    description: "Whether this account is writable"
                  }
                },
                required: ["pubkey", "isSigner", "isWritable"]
              }
            },
            data: {
              oneOf: [
                {
                  type: "string",
                  description: "Instruction data as base64 string or hex string"
                },
                {
                  type: "array",
                  description: "Instruction data as array of numbers",
                  items: {
                    type: "number"
                  }
                }
              ],
              description: "Instruction data"
            }
          },
          required: ["programId", "keys", "data"]
        }
      },
      feePayer: {
        type: "string",
        description: "Public key of the transaction fee payer. If not provided, the first signer will be used"
      },
      recentBlockhash: {
        type: "string",
        description: "Recent blockhash to use for the transaction. If not provided, nonceInfo must be provided or latest blockhash will be used"
      },
      nonceInfo: {
        type: "object",
        description: "Nonce information for durable transaction nonces",
        properties: {
          nonceAccount: {
            type: "string",
            description: "Public key of the nonce account"
          },
          nonceAuthority: {
            type: "string",
            description: "Public key of the nonce authority"
          },
          nonce: {
            type: "string",
            description: "Nonce value as a base58 string"
          }
        },
        required: ["nonceAccount", "nonceAuthority", "nonce"]
      },
      useVersionedTransaction: {
        type: "boolean",
        description: "Whether to create a versioned transaction (v0) instead of a legacy transaction. Defaults to false",
        default: false
      },
      addressLookupTables: {
        type: "array",
        description: "Address lookup tables for versioned transactions",
        items: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description: "Address of the lookup table account"
            },
            addresses: {
              type: "array",
              description: "Addresses in the lookup table",
              items: {
                type: "string"
              }
            }
          },
          required: ["address", "addresses"]
        }
      },
      blockhashValiditySeconds: {
        type: "number",
        description: "How long the blockhash is valid in seconds. Default is 60 seconds",
        default: 60
      }
    },
    required: ["instructions"],
    additionalProperties: false,
  },
  
  execute: async (params: CreateTransactionParams): Promise<CreateTransactionResult> => {
    logger.info("Creating transaction", {
      instructionCount: params.instructions.length,
      useVersionedTransaction: params.useVersionedTransaction,
      hasNonceInfo: !!params.nonceInfo,
      hasFeePayer: !!params.feePayer,
      hasRecentBlockhash: !!params.recentBlockhash,
    });
    
    return tryCatch(async () => {
      // Initialize variables to store parsed data
      const parsedInstructions: TransactionInstruction[] = [];
      let feePayer: PublicKey | undefined;
      let recentBlockhash: string | undefined = params.recentBlockhash;
      
      // Parse fee payer if provided
      if (params.feePayer) {
        try {
          feePayer = new PublicKey(params.feePayer);
        } catch (error) {
          logger.error("Invalid fee payer public key", error);
          throw new PublicKeyError(
            `Invalid fee payer public key: ${params.feePayer}`,
            { cause: error }
          );
        }
      }
      
      // Parse instructions
      for (let i = 0; i < params.instructions.length; i++) {
        const instruction = params.instructions[i];
        
        try {
          // Parse program ID
          const programId = new PublicKey(instruction.programId);
          
          // Parse account keys
          const keys = instruction.keys.map(key => {
            try {
              return {
                pubkey: new PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
              };
            } catch (error) {
              logger.error(`Invalid account public key in instruction ${i}`, { pubkey: key.pubkey });
              throw new PublicKeyError(
                `Invalid account public key in instruction ${i}: ${key.pubkey}`,
                { cause: error }
              );
            }
          });
          
          // Parse instruction data
          let data: Buffer;
          if (typeof instruction.data === 'string') {
            // Try to parse as base64
            try {
              data = Buffer.from(instruction.data, 'base64');
            } catch (e) {
              // If base64 fails, try hex
              try {
                data = Buffer.from(instruction.data.replace(/^0x/i, ''), 'hex');
              } catch (error) {
                logger.error(`Invalid instruction data in instruction ${i}`, { data: instruction.data });
                throw new ValidationError(
                  `Invalid instruction data format in instruction ${i}. Must be base64, hex string, or number array.`,
                  "instructions",
                  { cause: error }
                );
              }
            }
          } else if (Array.isArray(instruction.data)) {
            // Convert number array to Buffer
            data = Buffer.from(instruction.data);
          } else {
            logger.error(`Invalid instruction data type in instruction ${i}`);
            throw new ValidationError(
              `Invalid instruction data type in instruction ${i}. Must be base64, hex string, or number array.`,
              "instructions"
            );
          }
          
          // Create and add instruction
          parsedInstructions.push(
            new TransactionInstruction({
              programId,
              keys,
              data,
            })
          );
          
        } catch (error) {
          // If error is already a ValidationError or PublicKeyError, rethrow
          if (error instanceof ValidationError || error instanceof PublicKeyError) {
            throw error;
          }
          
          logger.error(`Failed to parse instruction ${i}`, error);
          throw new ValidationError(
            `Failed to parse instruction ${i}: ${error instanceof Error ? error.message : String(error)}`,
            "instructions",
            { cause: error }
          );
        }
      }
      
      // Check if we have any instructions
      if (parsedInstructions.length === 0) {
        logger.warn("Creating transaction with no instructions");
      }
      
      // Handle nonce information if provided
      if (params.nonceInfo) {
        try {
          const nonceAccount = new PublicKey(params.nonceInfo.nonceAccount);
          const nonceAuthority = new PublicKey(params.nonceInfo.nonceAuthority);
          const nonce = params.nonceInfo.nonce;
          
          // Use the provided nonce for the blockhash
          recentBlockhash = nonce;
          
          // Add nonce advance instruction as the first instruction
          parsedInstructions.unshift(
            SystemProgram.nonceAdvance({
              noncePubkey: nonceAccount,
              authorizedPubkey: nonceAuthority,
            })
          );
          
          logger.debug("Added nonce advance instruction", {
            nonceAccount: nonceAccount.toString(),
            nonceAuthority: nonceAuthority.toString(),
            nonce,
          });
        } catch (error) {
          logger.error("Failed to process nonce information", error);
          throw new ValidationError(
            `Failed to process nonce information: ${error instanceof Error ? error.message : String(error)}`,
            "nonceInfo",
            { cause: error }
          );
        }
      }
      
      // Create a transaction based on the requested type
      let transaction: Transaction | VersionedTransaction;
      let type: "legacy" | "versioned" = "legacy";
      
      if (params.useVersionedTransaction) {
        // Handle versioned transaction creation
        type = "versioned";
        
        // Parse address lookup tables if provided
        const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
        
        if (params.addressLookupTables && params.addressLookupTables.length > 0) {
          for (const lookupTable of params.addressLookupTables) {
            try {
              const tableAddress = new PublicKey(lookupTable.address);
              const addresses = lookupTable.addresses.map(addr => new PublicKey(addr));
              
              addressLookupTableAccounts.push(
                new AddressLookupTableAccount({
                  key: tableAddress,
                  state: {
                    deactivationSlot: BigInt(0),
                    lastExtendedSlot: 0,
                    lastExtendedSlotStartIndex: 0,
                    addresses,
                  },
                })
              );
            } catch (error) {
              logger.error("Failed to parse address lookup table", error);
              throw new ValidationError(
                `Failed to parse address lookup table: ${error instanceof Error ? error.message : String(error)}`,
                "addressLookupTables",
                { cause: error }
              );
            }
          }
        }
        
        // We need a blockhash for the transaction
        if (!recentBlockhash) {
          logger.error("Versioned transactions require a recent blockhash or nonce");
          throw new ValidationError(
            "Versioned transactions require a recent blockhash or nonce",
            "recentBlockhash"
          );
        }
        
        // Create the transaction message
        const messageV0 = new TransactionMessage({
          payerKey: feePayer || parsedInstructions[0].keys.find(key => key.isSigner)?.pubkey || 
            new PublicKey('11111111111111111111111111111111'), // Default to system program
          recentBlockhash,
          instructions: parsedInstructions,
        }).compileToV0Message(addressLookupTableAccounts);
        
        // Create the versioned transaction
        transaction = new VersionedTransaction(messageV0);
      } else {
        // Legacy transaction
        transaction = new Transaction();
        
        // Set fee payer if provided
        if (feePayer) {
          transaction.feePayer = feePayer;
        }
        
        // Set recent blockhash if provided
        if (recentBlockhash) {
          transaction.recentBlockhash = recentBlockhash;
        }
        
        // Add instructions to the transaction
        transaction.add(...parsedInstructions);
      }
      
      // Serialize the transaction
      const serializedTransaction = Buffer.from(
        type === "legacy" 
          ? (transaction as Transaction).serialize({ requireAllSignatures: false, verifySignatures: false })
          : (transaction as VersionedTransaction).serialize()
      );
      
      // Create the result
      const result: CreateTransactionResult = {
        transaction: serializedTransaction.toString('base64'),
        blockhash: recentBlockhash || '',
        type,
      };
      
      logger.info("Transaction created successfully", {
        type,
        instructionCount: parsedInstructions.length,
        size: serializedTransaction.length,
      });
      
      return result;
    }, 
    (error) => new TransactionError(
      `Failed to create transaction: ${error.message}`, 
      undefined, 
      { cause: error }
    ));
  }
};
