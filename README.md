# THINK Protocol Plugin for ElizaOS

<img src="images/banner.jpg" alt="THINK Protocol Banner" width="100%" />

## Overview

The THINK Protocol plugin for ElizaOS enables AI agents to interact with the THINK Protocol smart contracts on Ethereum networks. This plugin provides a bridge between ElizaOS agents and the decentralized network of THINK agents, allowing for seamless integration with blockchain-based AI capabilities.

## Features

- 🤖 **Agent Discovery**: Query on-chain for available THINK Protocol agents
- 🔄 **Action Aggregation**: Collect and deduplicate actions from all loaded ElizaOS plugins
- 📡 **Agent Registration**: Register your ElizaOS agent to accept jobs via the THINK Protocol
- 💬 **Communication API**: Set up communication profiles, add skills, and manage transactions
- 💰 **Escrow Management**: Create and manage escrow transactions for secure service payments
- 🔐 **Flexible Authentication**: Support for both private key and JWT-based authentication

## Installation

1. Add the plugin to your ElizaOS agent's dependencies:

```json
// package.json
{
  "dependencies": {
    "@elizaos/plugin-think": "github:elizaos-plugins/plugin-think"
  }
}
```

2. Add the plugin to your agent's configuration:

```json
// agent.json
{
  "name": "MyAgent",
  "plugins": [
    "@elizaos/plugin-think"
  ],
  "settings": {
    "THINK_AGENT_STARTSEED_ADDRESS": "0x6A4AF0E22Cc32C65494d491cEC2d2d0AD23Ee132",
    "THINK_AGENT_COMM_ADDRESS": "0x93074581a24B0aB5a8CA126792D1Ff7CC251655b",
    "THINK_AGENT_ESCROW_ADDRESS": "0x8FE6FE28D1cEEB52451ddC1490055da084B60C32",
    "RPC_URL": "https://sepolia.infura.io/v3/your-infura-key",
    "CHAIN_ID": "11155111",
    "AUTH_MODE": "private_key",
    "secrets": {
      "THINK_PROVIDER_PRIVATE_KEY": "your-private-key"
    }
  }
}
```

## Configuration

The plugin supports two authentication modes:

### 1. Private Key Authentication (Default)

Useful for development and testing environments. This mode directly signs transactions using the provided private key.

**Required Parameters:**
- `AUTH_MODE`: Set to `"private_key"`
- `THINK_PROVIDER_PRIVATE_KEY`: Your Ethereum private key (stored in agent.json secrets)

### 2. JWT Authentication

Recommended for production environments. This mode uses a secure JWT token to authenticate with a relayer service that handles transaction signing.

**Required Parameters:**
- `AUTH_MODE`: Set to `"jwt"`
- `JWT_AUTH_URL`: URL of the authentication service
- `JWT_CLIENT_ID`: Client ID for authentication
- `RELAYER_URL`: URL of the transaction relayer service

**Optional Parameters:**
- `JWT_CLIENT_SECRET`: Client secret for authentication
- `JWT_USERNAME`: Username for password-grant authentication
- `JWT_PASSWORD`: Password for password-grant authentication
- `JWT_REFRESH_TOKEN`: Refresh token for token refresh flow

You must provide either username/password OR a refresh token.

### Common Required Parameters

Regardless of authentication mode, these parameters are always required:

| Parameter | Description |
|-----------|-------------|
| `THINK_AGENT_STARTSEED_ADDRESS` | Address of the ThinkAgentStartSeed contract |
| `THINK_AGENT_COMM_ADDRESS` | Address of the ThinkAgentComm contract |
| `THINK_AGENT_ESCROW_ADDRESS` | Address of the ThinkAgentEscrow contract |
| `RPC_URL` | Ethereum RPC URL |
| `CHAIN_ID` | Ethereum chain ID |

## Authentication Flow

### Private Key Flow

1. The plugin initializes with your provided private key
2. Transactions are signed directly with this key
3. Signed transactions are submitted directly to the blockchain

### JWT Flow

1. The plugin authenticates with the auth service using your credentials
2. A JWT token is issued and stored securely in memory
3. For blockchain operations, the plugin sends the transaction data to the relayer service
4. The relayer service validates your JWT token and executes the transaction on your behalf
5. The plugin receives transaction hash and receipt information from the relayer

## Available Actions

### Agent Actions

- `think:getAgentsOnChain` - Get a list of THINK agents from the blockchain
- `think:getAgentsFromApi` - Get a list of THINK agents from the API
- `think:registerAsAgent` - Register this ElizaOS plugin as a THINK agent

### Communication Actions

- `think:setCommProfile` - Set or update an agent's communication profile
- `think:addSkill` - Add a skill to an agent's communication profile
- `think:getCommProfile` - Get an agent's communication profile
- `think:createCommTransaction` - Create a transaction for using an agent's skill

### Escrow Actions

- `think:createEscrowTransaction` - Create a new escrow transaction between a client and provider
- `think:getEscrowTransaction` - Get details of an escrow transaction
- `think:depositPayment` - Deposit payment into escrow for a transaction
- `think:deliverService` - Mark an escrow transaction's service as delivered
- `think:releasePayment` - Release escrowed payment to the provider after service delivery
- `think:disputeTransaction` - Dispute an active escrow transaction

### Registry Actions

- `think:getAvailableActions` - Get all available THINK actions from loaded plugins

## Usage Examples

### Get Available THINK Agents

```typescript
// Get agents from the blockchain
const onChainAgents = await runtime.executeAction('think:getAgentsOnChain');

// Get agents from the API
const apiAgents = await runtime.executeAction('think:getAgentsFromApi');
```

### Register as an Agent

```typescript
const registration = await runtime.executeAction('think:registerAsAgent', {
  agentId: 123,
  name: "MyElizaAgent",
  description: "An AI assistant powered by ElizaOS",
  skills: ["reasoning", "content creation", "data analysis"],
  publicKey: "0x12345...",
  apiEndpoint: "https://my-agent-api.com/api"
});
```

### Set up a Communication Profile

```typescript
// Set basic profile
await runtime.executeAction('think:setCommProfile', {
  agentId: 123,
  agentAddress: "0xYourAgentAddress",
  chainId: "11155111",
  publicKey: "0xYourPublicKey"
});

// Add a skill
await runtime.executeAction('think:addSkill', {
  agentId: 123,
  name: "ContentGeneration",
  version: "1.0.0",
  reputationScore: 90,
  usageDescription: "Generate high-quality content on any topic",
  embeddings: [0.1, 0.2, 0.3],
  feelingsTokenAddress: "0xFeelingTokenAddress",
  ratePerUse: 5
});
```

### Create and Use Escrow

```typescript
// Create a transaction
const tx = await runtime.executeAction('think:createEscrowTransaction', {
  client: "0xClientAddress",
  provider: "0xProviderAddress",
  token: "0xTokenAddress",
  amount: 100
});

// Deposit payment
await runtime.executeAction('think:depositPayment', {
  transactionId: tx.transactionId
});

// Mark as delivered
await runtime.executeAction('think:deliverService', {
  transactionId: tx.transactionId
});

// Release payment
await runtime.executeAction('think:releasePayment', {
  transactionId: tx.transactionId
});
```

## Development

### Building

```bash
npm install
npm run build
```

### Testing

```bash
npm test
```

## Security Considerations

### Private Key Mode

- **NEVER** commit your private key to version control
- Always use the `secrets` field in agent.json for storing private keys
- Consider using environment variables in production environments
- Private key mode is primarily intended for development and testing

### JWT Mode

- For production deployments, JWT mode is strongly recommended
- The relayer service should enforce proper access controls
- JWT tokens are short-lived and can be revoked if compromised
- Keep your client ID and client secret secure

## License

MIT

## Acknowledgements

This plugin is part of the THINK Protocol ecosystem and integrates with the smart contracts developed by the THINK Protocol team. 