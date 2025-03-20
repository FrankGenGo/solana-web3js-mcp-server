# Solana-web3js MCP Server Project Guide

This document serves as a reference for the Solana-web3js MCP server project development.

## Project Overview

The Solana-web3js MCP server enables AI assistants like Claude to build and deploy Solana smart contracts end-to-end through a standardized MCP (Model Context Protocol) interface. This server provides tools, resources, and prompt templates for interacting with the Solana blockchain.

## Development Commands

- `npm run build` - Build the TypeScript project
- `npm run start` - Start the server using stdio transport
- `npm run dev` - Start the server in development mode with auto-restart
- `npm run test` - Run test suite
- `npm run lint` - Run ESLint

## Git Workflow

- Default branch: `main`
- Feature branches: `feature/feature-name`
- Fix branches: `fix/issue-description`
- Commit messages should be descriptive and follow the format:
  - `feat: Add new feature X`
  - `fix: Resolve issue with Y`
  - `docs: Update documentation for Z`
  - `refactor: Improve code structure for W`

## Project Structure

- `/src/index.ts` - Main entry point
- `/src/solana-server.ts` - Core server implementation
- `/src/core/` - Core functionality modules
- `/src/tools/` - MCP tool implementations
- `/src/resources/` - MCP resource implementations
- `/src/prompts/` - MCP prompt templates
- `/src/types/` - TypeScript type definitions
- `/src/utils/` - Utility functions and helpers
- `/src/transport/` - Transport layer implementations

## Agent Orchestration Strategy

This project follows a specialized agent approach where the Project Manager (Claude) orchestrates multiple specialized agents working on different components of the system.

### Agent Types

1. **Architecture Agent** - Designs system components, interfaces, and flow
2. **Implementation Agent** - Writes code for specific modules and components
3. **Documentation Agent** - Creates user and developer documentation
4. **Testing Agent** - Creates test scenarios and test implementations
5. **Integration Agent** - Ensures components work together properly

### Agent Communication Guidelines

- Provide clear context about the project and component being worked on
- Include relevant code/files that impact the current task
- Specify detailed deliverables and success criteria
- Establish boundaries for decision making authority
- Provide guidance on coding style and project conventions

## Implementation Plan

### Phase 1: Core Infrastructure
1. Set up project structure and configuration
2. Implement connection management module
3. Create basic server framework with transports
4. Develop error handling and logging

### Phase 2: Basic Tools
1. Implement account management tools
2. Implement transaction operations tools
3. Implement key management tools
4. Create basic resources and documentation

### Phase 3: Advanced Functionality
1. Implement program deployment tools
2. Implement token operations tools
3. Enhance resources with comprehensive documentation
4. Develop advanced prompts for complex workflows

### Phase 4: Quality and Performance
1. Implement comprehensive test suite
2. Add connection pooling and retry logic
3. Optimize performance for high-throughput operations
4. Add extensive logging and monitoring

## Testing Strategy

- Unit tests for individual components
- Integration tests for MCP server functionality
- End-to-end tests for Solana operations
- Test coverage targets: 85% for critical components

## Repository

- GitHub: https://github.com/FrankGenGo/solana-web3js-mcp-server
- Issue tracking, pull requests, and project management through GitHub