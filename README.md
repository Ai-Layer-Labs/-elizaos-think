# THINK Protocol Plugin for ElizaOS

A plugin that implements the THINK Protocol for agent interoperability, enabling secure agent-to-agent communication and trust management using blockchain-based verification.

## Features

- **Ethereum Transaction Signing**: Sign transactions using stored wallets
- **Wallet Management**: Create and store Ethereum wallets securely
- **Agent Registration**: Register agents with the THINK Protocol network
- **Action Discovery**: Find and match compatible actions from other agents
- **Message Sending**: Send secure messages between agents
- **MCP Server Search**: Find available MCP (Machine Cognition Protocol) servers for specific capabilities
- **Agent Wallet**: Secure, policy-enforced wallet operations using Lit Protocol's Agent Wallet framework

## Installation

```bash
npm install @elizaos/think-protocol-plugin
```

## Usage

```typescript
import { createPlugin } from '@elizaos/think-protocol-plugin';

// Create and register the plugin
const thinkPlugin = createPlugin({
  networkId: 'mainnet',
  contractAddress: '0x1234567890abcdef1234567890abcdef12345678',
  rpcUrl: 'https://ethereum.example.com/rpc',
  mcpIndexUrl: 'https://iod.ai', // Optional, defaults to iod.ai
  agentWallet: {                 // Optional Agent Wallet configuration
    enabled: true,
    adminPrivateKey: '0x...'     // For admin initialization (store securely!)
  }
});

// Register the plugin with ElizaOS
await runtime.registerPlugin(thinkPlugin);
```

## Available Actions

### 1. SIGN_TRANSACTION

Sign an Ethereum transaction using a stored wallet.

```typescript
// Example
await runtime.performAction('SIGN_TRANSACTION', {
  walletAddress: '0x1234...',
  to: '0x5678...',
  value: '0.1',
  gasLimit: '21000'
});
```

### 2. CREATE_WALLET

Create a new Ethereum wallet and store it securely.

```typescript
// Example
await runtime.performAction('CREATE_WALLET', {
  name: 'My Trading Wallet'
});
```

### 3. REGISTER_AGENT

Register the current agent with the THINK Protocol network.

```typescript
// Example
await runtime.performAction('REGISTER_AGENT', {
  capabilities: ['trading', 'data_analysis'],
  description: 'Finance agent specializing in market analysis'
});
```

### 4. DISCOVER_ACTIONS

Find and match available actions from other agents based on criteria.

```typescript
// Example
await runtime.performAction('DISCOVER_ACTIONS', {
  filters: {
    capabilities: ['image_generation'],
    keywords: ['stable', 'diffusion'],
    matchOptions: {
      minScore: 0.5,
      maxResults: 10
    }
  }
});
```

### 5. SEND_MESSAGE

Send a secure message to another agent.

```typescript
// Example
await runtime.performAction('SEND_MESSAGE', {
  recipientId: 'agent-123',
  content: 'Hello, would you like to collaborate on a project?',
  encryption: 'default'
});
```

### 6. FIND_MCP_SERVER

Find available MCP servers that match specific capability requirements using the iod.ai index.

```typescript
// Example
await runtime.performAction('FIND_MCP_SERVER', {
  capability: 'image_generation',
  minReliability: 0.95,
  maxLatency: 2000,
  preferredCost: 'low',
  prioritizeBy: 'reliability'
});
```

### 7. AGENT_WALLET

Perform secure wallet operations using Lit Protocol's Agent Wallet with tamper-proof policy enforcement.

#### Initialize Wallet

```typescript
// Initialize as admin
await runtime.performAction('AGENT_WALLET', {
  operation: 'INITIALIZE_WALLET',
  config: {
    network: 'polygon',
    role: 'admin',
    adminPrivateKey: '0x...' // Private key for the admin
  }
});

// Initialize as delegatee
await runtime.performAction('AGENT_WALLET', {
  operation: 'INITIALIZE_WALLET',
  config: {
    network: 'polygon',
    role: 'delegatee',
    delegateePrivateKey: '0x...' // Private key for the delegatee
  }
});
```

#### Set Policy

```typescript
// Set a policy for a tool
await runtime.performAction('AGENT_WALLET', {
  operation: 'SET_POLICY',
  policy: {
    toolName: 'erc20-transfer',
    allowedAddresses: ['0x1234...', '0x5678...'],
    maxDailyAmount: '100',
    tokenType: ['USDC', 'DAI']
  }
});
```

#### Add Delegatee

```typescript
// Add a delegatee with permissions
await runtime.performAction('AGENT_WALLET', {
  operation: 'ADD_DELEGATEE',
  delegatee: {
    address: '0x1234...',
    permissions: ['erc20-transfer', 'sign-message']
  }
});
```

#### Transfer Token

```typescript
// Transfer ERC20 tokens
await runtime.performAction('AGENT_WALLET', {
  operation: 'TRANSFER_TOKEN',
  token: {
    tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
    recipient: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    amount: '10.5',
    chainId: 1
  }
});
```

#### Swap Token

```typescript
// Swap tokens using Uniswap
await runtime.performAction('AGENT_WALLET', {
  operation: 'SWAP_TOKEN',
  token: {
    tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
    outputTokenAddress: '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
    amount: '100',
    chainId: 1
  }
});
```

#### Sign Message

```typescript
// Sign a message
await runtime.performAction('AGENT_WALLET', {
  operation: 'SIGN_MESSAGE',
  message: {
    content: 'I authorize this transaction',
    type: 'plain'
  }
});
```

#### Execute Custom Tool

```typescript
// Execute a custom tool
await runtime.performAction('AGENT_WALLET', {
  operation: 'EXECUTE_TOOL',
  tool: {
    name: 'custom-tool-name',
    params: {
      param1: 'value1',
      param2: 'value2'
    }
  }
});
```

## Agent Wallet Security Features

The Agent Wallet implementation uses Lit Protocol to provide the following security features:

1. **Programmable Key Pairs (PKPs)**: ECDSA keypairs represented as ERC-721 NFTs
2. **Tamper-Proof Policies**: Cryptographically secured policies define what operations are allowed
3. **Delegatee Access Control**: Admins can delegate execution rights while maintaining control
4. **Immutable Execution Environment**: Operations are executed in a secure, verifiable context
5. **Policy Enforcement**: Policies provide:
   - Transaction value limits
   - Token type restrictions
   - Address allowlists
   - Rate limiting
   - Multi-signature requirements

## Architecture

This plugin has been architected to avoid circular dependencies through:

1. **Dynamic Imports**: All heavy dependencies like ethers.js are loaded dynamically when needed
2. **Lazy Loading**: Actions are loaded on-demand rather than at initialization time
3. **Factory Pattern**: The plugin uses a factory function pattern for initialization
4. **Memory Management**: Proper management of memory spaces with reliable null checks

### Plugin Initialization Flow

1. Plugin factory function is called with configuration
2. Basic validation is performed on required configuration
3. Plugin object is created with lazy-loading methods
4. The `initialize` method sets up memory spaces when called by the runtime
5. Actions are dynamically imported only when `getActions()` is called

## Development

### Prerequisites

- Node.js 16+
- npm or pnpm

### Setup

```bash
# Clone the repository
git clone https://github.com/elizaos/think-protocol-plugin.git
cd think-protocol-plugin

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Adding New Actions

1. Create a new file in the `actions/` directory (e.g., `actions/my-new-action.ts`)
2. Follow the action pattern established in existing actions
3. Update the `getActions()` method in `think-protocol-plugin.ts` to import and register your new action

## License

MIT

## Contributors

- ElizaOS Team 