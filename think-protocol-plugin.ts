// think-protocol-plugin.ts
import { PluginClass, type Plugin, elizaLogger } from "@elizaos/core";

// Custom error for the protocol
export class ThinkProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThinkProtocolError";
  }
}

// Plugin configuration interface
export interface ThinkProtocolPluginConfig {
  networkId: string;
  contractAddress: string; // Address of the on-chain memory contract (e.g., agent NFT contract)
  rpcUrl: string;
  mcpIndexUrl?: string; // URL for the MCP index service (defaults to iod.ai)
}

// Thought object interface
export interface Thought {
  content: string;
  signature: string; // Secure self-signature of the thought message
  // Additional fields (e.g., timestamp) can be added as needed
}

// Function to dynamically load ethers when needed
async function getEthers() {
  try {
    return await import('ethers');
  } catch (error) {
    throw new ThinkProtocolError("Failed to load ethers library: " + error.message);
  }
}

/**
 * The main plugin factory function that follows the ElizaOS plugin pattern
 * This approach avoids circular dependencies by using dynamic imports
 */
export default function createThinkProtocolPlugin(config: ThinkProtocolPluginConfig): Plugin {
  // Validate required configuration
  if (!config.contractAddress) {
    throw new ThinkProtocolError("Contract address is required");
  }
  if (!config.networkId) {
    throw new ThinkProtocolError("Network ID is required");
  }
  if (!config.rpcUrl) {
    throw new ThinkProtocolError("RPC URL is required");
  }
  
  // Set default MCP index URL if not provided
  const mcpIndexUrl = config.mcpIndexUrl || 'https://iod.ai';
  
  elizaLogger.log("Initializing THINK Protocol Plugin with config:", config);
  
  // Use a lazy loading approach for actions
  const actionsMap = new Map();
  
  // Return the plugin object with lazy-loaded components
  return {
    name: "think-protocol-plugin",
    version: "0.0.1",
    description: "Implementation of the THINK Protocol for agent interoperability",
    
    // Initialize method is called once when the plugin is loaded
    async initialize(runtime) {
      elizaLogger.log("Initializing THINK Protocol Plugin");
      
      // Store runtime configuration
      runtime.setSetting("THINK_CONTRACT_ADDRESS", config.contractAddress);
      runtime.setSetting("THINK_NETWORK_ID", config.networkId);
      runtime.setSetting("THINK_RPC_URL", config.rpcUrl);
      runtime.setSetting("THINK_MCP_INDEX_URL", mcpIndexUrl);
      
      // Register plugin memory spaces
      const memorySpacesToCreate = [
        "think_protocol",
        "transactions",
        "wallets",
        "mcp_servers"
      ];
      
      for (const space of memorySpacesToCreate) {
        const memoryManager = runtime.getMemoryManager(space);
        if (!memoryManager) {
          elizaLogger.log(`Creating memory space: ${space}`);
          await runtime.createMemorySpace(space);
        }
      }
      
      return true;
    },
    
    // Lazy-load action handlers
    async getActions() {
      if (actionsMap.size === 0) {
        elizaLogger.log("Lazily loading THINK Protocol actions");
        
        try {
          // Dynamically import actions to avoid circular dependencies
          const signTransactionAction = (await import('./actions/sign-transaction-action')).default;
          const createWalletAction = (await import('./actions/create-wallet-action')).default;
          const sendMessageAction = (await import('./actions/send-message-action')).default;
          const registerAgentAction = (await import('./actions/registerAgent')).default;
          const discoverActionsAction = (await import('./actions/discoverActions')).default;
          const findMcpServerAction = (await import('./actions/find-mcp-server')).default;
          
          // Register actions
          actionsMap.set(signTransactionAction.name, signTransactionAction);
          actionsMap.set(createWalletAction.name, createWalletAction);
          actionsMap.set(sendMessageAction.name, sendMessageAction);
          actionsMap.set(registerAgentAction.name, registerAgentAction);
          actionsMap.set(discoverActionsAction.name, discoverActionsAction);
          actionsMap.set(findMcpServerAction.name, findMcpServerAction);
          
          elizaLogger.log("Successfully loaded THINK Protocol actions:", 
            Array.from(actionsMap.keys()).join(", "));
        } catch (error) {
          elizaLogger.error("Error loading THINK Protocol actions:", error);
          throw new ThinkProtocolError("Failed to load actions: " + error.message);
        }
      }
      
      return Array.from(actionsMap.values());
    },
    
    // Helper methods exposed to the runtime
    helpers: {
      async verifyMessage(message: string, signature: string): Promise<boolean> {
        const ethers = await getEthers();
        try {
          const recoveredAddress = ethers.utils.verifyMessage(message, signature);
          return !!recoveredAddress;
        } catch (error) {
          elizaLogger.error("Error verifying message:", error);
          return false;
        }
      },
      
      async signMessage(message: string, privateKey: string): Promise<string> {
        const ethers = await getEthers();
        try {
          const wallet = new ethers.Wallet(privateKey);
          return await wallet.signMessage(message);
        } catch (error) {
          elizaLogger.error("Error signing message:", error);
          throw new ThinkProtocolError("Failed to sign message: " + error.message);
        }
      },
      
      // Helper method to search for MCP servers
      async findMcpServer(capability: string, options?: any): Promise<any> {
        try {
          // We're implementing this directly to avoid circular dependencies
          // In a real implementation, we would fetch this from the MCP index
          elizaLogger.log(`Looking up MCP server for capability: ${capability}`, options);
          
          // This is a simplified version - the actual action provides more functionality
          const mockResponse = {
            capability,
            servers: [
              {
                id: `${capability}-server-1`,
                name: `${capability.charAt(0).toUpperCase() + capability.slice(1)} Service`,
                url: `https://api.example.com/${capability}`,
                capabilities: [capability],
                version: 'v1.0',
                reliability: 0.95,
              }
            ]
          };
          
          return mockResponse;
        } catch (error) {
          elizaLogger.error("Error finding MCP server:", error);
          throw new ThinkProtocolError(`Failed to find MCP server: ${error.message}`);
        }
      }
    },
    
    // Plugin class identifier
    class: PluginClass.PROTOCOL
  };
}



// /**
//  * THINK Protocol Plugin for ElizaOS
//  * Enables secure agent-to-agent communication and trust management
//  * using blockchain-based verification and token economics.
//  * 
//  * @package @elizaos/think-protocol-plugin
//  * @version 0.0.1
//  */

// /**
//  * Represents a thought message in the THINK protocol
//  * @interface Thought
//  */
// export interface Thought {
//     /** Unique identifier of the thought */
//     id: string;
//     /** Content of the thought */
//     content: any;
//     /** Security metadata including signatures */
//     security: {
//         signature?: string;
//         timestamp: number;
//         nonce: string;
//     };
// }

// export class ThinkProtocolError extends Error {
//     constructor(message: string) {
//         super(message);
//         this.name = 'ThinkProtocolError';
//     }
// }

// export interface ThinkProtocolConfig {
//     networkId?: string;
//     contractAddress?: string;
//     defaultGasLimit?: string;
// }

// export interface AgentRegistration {
//     nftId: number;
//     coinAddress: string;
//     metadata: {
//         capabilities: string[];
//         trustScore: number;
//         lastUpdate: number;
//     };
// }

// function validateHandshakeInput(input: any): input is { agentId: string } {
//     return typeof input === 'object' && 
//            typeof input.agentId === 'string' &&
//            input.agentId.length > 0;
// }

// // ... in handler ...
// if (!validateHandshakeInput(input)) {
//     throw new ThinkProtocolError("Invalid handshake input");
// } 