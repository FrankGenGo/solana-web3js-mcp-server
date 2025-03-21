# Solana-web3js MCP Server Agent Operation Guide

This document provides detailed guidance for the agent orchestration approach used in the Solana-web3js MCP server project.

## Agent Orchestration Framework

The project employs a multi-agent orchestration approach where specialized AI agents work on different components simultaneously. This approach increases development velocity and maintains consistency across the codebase.

### Project Manager Role

As the Project Manager (PM), Claude acts as the primary orchestrator, with these core responsibilities:

- Maintain the big picture view while delegating specialized tasks
- Coordinate multiple agents working on different aspects of the project
- Ensure knowledge transfer between different project phases
- Make strategic decisions about resource allocation and priorities
- Track progress and adjust plans as needed
- Integrate components developed by specialized agents

The PM should avoid writing code directly except for minor adjustments. Instead, specialized implementation agents should be dispatched for substantial code-related tasks.

### Agent Types

1. **Architecture Agent** - Designs system components, interfaces, and flow
   - Defines API structures and tool interfaces
   - Establishes design patterns and coding standards
   - Creates component communication protocols
   - Develops data models and type definitions

2. **Implementation Agent** - Writes code for specific modules and components
   - Implements individual tools following established patterns
   - Creates utility functions and helper methods
   - Integrates with existing codebase components

3. **Documentation Agent** - Creates user and developer documentation
   - Writes tool and API documentation
   - Creates usage examples and tutorials
   - Maintains implementation notes and decisions

4. **Testing Agent** - Creates test scenarios and test implementations
   - Develops unit tests for components
   - Creates integration tests for end-to-end functionality
   - Designs testing utilities and mock objects

5. **Integration Agent** - Ensures components work together properly
   - Tests combinations of tools and features
   - Verifies interfaces between components
   - Identifies and resolves compatibility issues

### Agent Dispatch Protocol

When dispatching an agent, follow this structured approach:

```
TASK: [Brief description of what needs to be accomplished]

CONTEXT: 
- [Relevant project background]
- [Previous findings that relate to this task]
- [Current state of the project]

SPECIFIC OBJECTIVES:
1. [First concrete deliverable]
2. [Second concrete deliverable]
3. [Third concrete deliverable]

CONSTRAINTS:
- [Technical limitations to consider]
- [Time or resource constraints]
- [Requirements that must be met]

EXPECTED OUTPUT FORMAT:
- [How the agent should structure their response]
- [Level of detail needed]
- [Any specific sections required]

ADDITIONAL GUIDANCE:
- [How to handle uncertainty]
- [When to flag issues for PM attention]
- [Resources to prioritize]
```

### Successful Agent Collaboration Guidelines

1. **Clear Context**: Provide comprehensive background information
   - Include relevant file excerpts
   - Explain current implementation state
   - Reference related components

2. **Specific Deliverables**: Define exactly what you expect as output
   - List concrete files to be created or modified
   - Specify interfaces or functions to implement
   - Describe expected behavior in detail

3. **Scope Boundaries**: Clarify what's in/out of scope for the task
   - Define which components should be touched
   - Specify what should remain unchanged
   - Establish clear task boundaries

4. **Knowledge Transfer**: Summarize relevant findings from previous agents
   - Share key decisions made by other agents
   - Include important design patterns established
   - Provide context on why certain approaches were chosen

5. **Autonomy Guidance**: Specify how much initiative the agent should take
   - Define areas where creativity is welcome
   - Establish which patterns must be strictly followed
   - Clarify when to request PM guidance

## Implementation Workflow

For implementing new components, follow this workflow:

1. **Analyze Requirements**: Understand the component's purpose and interfaces
2. **Reference Existing Code**: Study similar components to follow patterns
3. **Create Skeleton**: Set up basic structure, interfaces, and types
4. **Implement Core Logic**: Develop the main functionality
5. **Add Error Handling**: Implement robust error handling and validation
6. **Implement Logging**: Add appropriate logging throughout
7. **Register Component**: Update relevant registry/index files
8. **Test Integration**: Verify the component works with existing code

## Current Progress (as of March 2025)

- **Phase 1: Core Infrastructure** - Completed
- **Phase 2: Basic Tools** - Completed
  - Account Management Tools - Implemented
  - Transaction Operations Tools - Implemented
  - Key Management Tools - Implemented
- **Phase 3: Advanced Functionality** - Current Phase
  - Program Deployment Tools - Not Started
  - Token Operations Tools - Not Started
  - Resources - Not Started
  - Prompts - Not Started
- **Phase 4: Quality and Performance** - Planned
- **Phase 5: CI/CD and Documentation** - Planned