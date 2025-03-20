# Solana-web3js MCP Server Task Assignments

This document contains specific task assignments for specialized agents working on the Solana-web3js MCP server implementation.

## Connection Manager Agent Assignment

```
TASK: Implement the Connection Manager module for Solana Web3.js MCP Server

CONTEXT:
- We're building an MCP server that enables Claude to interact with the Solana blockchain
- The server needs to maintain connections to different Solana clusters (mainnet, testnet, devnet, localnet)
- Initial connection setup is already in solana-server.ts but needs to be extracted and expanded
- This is part of Phase 1: Core Infrastructure

SPECIFIC OBJECTIVES:
1. Create a new file at src/core/connection-manager.ts implementing the ConnectionManager class
2. Implement methods for getting connections to different clusters with caching
3. Add proper error handling for connection issues
4. Add connection pooling and configuration options
5. Implement connection lifecycle management

CONSTRAINTS:
- Follow TypeScript best practices with proper interfaces and types
- Implement as a singleton to prevent duplicate connections
- Include comprehensive error handling
- Use @solana/web3.js Connection class

DEPENDENCIES:
- @solana/web3.js library
- Will interface with error handling system

IMPLEMENTATION REQUIREMENTS:
- The ConnectionManager should be a singleton class
- Include methods like getConnection(cluster: string) that returns cached connections
- Support all standard clusters: mainnet, testnet, devnet, localnet
- Support custom RPC endpoints
- Include timeout and retry logic for resilience
- Methods should be properly typed and documented

EXPECTED OUTPUT FORMAT:
- A complete TypeScript file with proper imports, exports, and documentation
- Include usage examples in comments
- Follow the existing code style in the project
```

## Error Handling Agent Assignment

```
TASK: Implement the Error Handling system for Solana Web3.js MCP Server

CONTEXT:
- We're building an MCP server that enables Claude to interact with the Solana blockchain
- We need a standardized error handling system for consistent error reporting
- This is part of Phase 1: Core Infrastructure

SPECIFIC OBJECTIVES:
1. Create a new file at src/utils/errors.ts implementing error classes
2. Design an error hierarchy with a base MCPError class
3. Create specialized error classes for different scenarios (connection, transaction, etc.)
4. Implement error formatting for MCP responses
5. Add utility functions for common error handling patterns

CONSTRAINTS:
- Follow TypeScript best practices with proper inheritance
- Ensure all error classes include proper stack traces
- Make errors serializable for MCP responses
- Design for extensibility

DEPENDENCIES:
- Will be used by all other modules in the project
- Should integrate with logging system

IMPLEMENTATION REQUIREMENTS:
- Implement a base MCPError class extending Error
- Create specialized subclasses like ConnectionError, TransactionError, etc.
- Include proper error codes and categories
- Add helper methods for formatting error responses
- Design with both developer debugging and user-friendly messages in mind

EXPECTED OUTPUT FORMAT:
- A complete TypeScript file with proper class hierarchy
- Include usage examples in comments
- Documentation for each error class and method
- Follow the existing code style in the project
```

## Logging Agent Assignment

```
TASK: Implement the Logging Infrastructure for Solana Web3.js MCP Server

CONTEXT:
- We're building an MCP server that enables Claude to interact with the Solana blockchain
- We need a robust logging system for debugging and monitoring
- This is part of Phase 1: Core Infrastructure

SPECIFIC OBJECTIVES:
1. Create a new file at src/utils/logging.ts implementing the logging system
2. Implement different log levels (debug, info, warn, error)
3. Add support for different log outputs (console, file)
4. Create a simple, consistent API for logging throughout the application
5. Integrate with the error handling system

CONSTRAINTS:
- Keep it lightweight without external dependencies if possible
- Ensure log formatting is consistent
- Make it configurable (enable/disable levels, change outputs)
- Design for production and development environments

DEPENDENCIES:
- Will be used by all other modules in the project
- Should integrate with error handling system

IMPLEMENTATION REQUIREMENTS:
- Create a Logger class with methods for different log levels
- Implement a factory method or singleton pattern for logger instances
- Add support for log contexts (component names, request IDs)
- Include timestamp and log level in output
- Make log levels configurable via environment variables

EXPECTED OUTPUT FORMAT:
- A complete TypeScript file with proper exports
- Include usage examples in comments
- Documentation for each method and configuration option
- Follow the existing code style in the project
```

## Transport Layer Agent Assignment

```
TASK: Implement the Transport Layers for Solana Web3.js MCP Server

CONTEXT:
- We're building an MCP server that enables Claude to interact with the Solana blockchain
- We need transport layers to communicate with MCP clients
- Need to implement both stdio and HTTP/SSE transports
- This is part of Phase 1: Core Infrastructure

SPECIFIC OBJECTIVES:
1. Create src/transport/stdio.ts for Standard I/O transport
2. Create src/transport/http.ts for HTTP/SSE transport
3. Implement proper message parsing and formatting
4. Handle transport-specific error scenarios
5. Create a transport factory for configuration and initialization

CONSTRAINTS:
- Follow the MCP protocol specification for communication
- Ensure proper error handling for transport issues
- Make transports configurable
- Design for extensibility

DEPENDENCIES:
- @modelcontextprotocol/sdk library
- Will use the error handling and logging systems
- Express for HTTP transport

IMPLEMENTATION REQUIREMENTS:
- Implement StdioTransport class for command-line usage
- Implement HttpTransport class for web-based clients
- Add proper lifecycle methods (init, send, receive, close)
- Include error handling for connection issues
- Make transports configurable through environment variables

EXPECTED OUTPUT FORMAT:
- Complete TypeScript files with proper imports and exports
- Include usage examples in comments
- Documentation for each class and method
- Follow the existing code style in the project
```

## Main Entry Agent Assignment

```
TASK: Implement the Main Entry Point for Solana Web3.js MCP Server

CONTEXT:
- We're building an MCP server that enables Claude to interact with the Solana blockchain
- We need a main entry point to initialize and start the server
- This is part of Phase 1: Core Infrastructure

SPECIFIC OBJECTIVES:
1. Create src/index.ts as the main entry point
2. Implement command-line argument parsing
3. Configure and initialize the server with appropriate transport
4. Set up signal handling for graceful shutdown
5. Integrate with all Phase 1 components

CONSTRAINTS:
- Keep it simple and focused on initialization
- Handle different environment configurations
- Provide clear startup and shutdown logs
- Don't include business logic (defer to solana-server.ts)

DEPENDENCIES:
- All other Phase 1 components
- solana-server.ts for server instance creation

IMPLEMENTATION REQUIREMENTS:
- Parse command-line arguments for configuration
- Support environment variables for configuration
- Initialize the appropriate transport based on configuration
- Set up error handling for startup failures
- Implement graceful shutdown with cleanup

EXPECTED OUTPUT FORMAT:
- A complete TypeScript file with proper imports
- Clear startup and shutdown logging
- Documentation for configuration options
- Follow the existing code style in the project
```

## Type Definitions Agent Assignment

```
TASK: Implement Type Definitions for Solana Web3.js MCP Server

CONTEXT:
- We're building an MCP server that enables Claude to interact with the Solana blockchain
- We need comprehensive TypeScript type definitions for the project
- This spans both Phase 1 and Phase 2 components

SPECIFIC OBJECTIVES:
1. Create src/types/solana.ts for Solana-specific type definitions
2. Create src/types/tools.ts for MCP tool input/output types
3. Create src/types/config.ts for configuration interfaces
4. Create src/types/transport.ts for transport-related types
5. Define shared interfaces used across multiple components

CONSTRAINTS:
- Follow TypeScript best practices
- Use precise and descriptive types
- Leverage existing types from @solana/web3.js where appropriate
- Make types reusable and composable

DEPENDENCIES:
- @solana/web3.js and @modelcontextprotocol/sdk for base types
- Will be used by all other components

IMPLEMENTATION REQUIREMENTS:
- Define interfaces for all tool inputs and outputs
- Create types for configuration options
- Use proper TypeScript features (generics, unions, etc.)
- Include JSDoc comments for complex types
- Organize types logically by domain

EXPECTED OUTPUT FORMAT:
- Complete TypeScript files with proper exports
- Documentation for each type and interface
- Follow the existing code style in the project
```

## Next Steps

After completing Phase 1 tasks, we'll move to Phase 2 with the following task assignments:

1. Account Tools Agent
2. Transaction Tools Agent 
3. Key Management Agent

Each agent will receive detailed task assignments similar to the ones above, with specific deliverables tailored to their area of responsibility.