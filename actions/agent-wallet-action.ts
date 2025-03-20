import {
    ActionExample,
    composeContext,
    Content,
    elizaLogger,
    generateObjectDeprecated,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
    ServiceType,
} from "@elizaos/core";

// Define the Agent Wallet operation types
type AgentWalletOperationType = 
    'INITIALIZE_WALLET' | 
    'SET_POLICY' | 
    'ADD_DELEGATEE' | 
    'TRANSFER_TOKEN' |
    'SWAP_TOKEN' |
    'SIGN_MESSAGE' |
    'EXECUTE_TOOL';

// Operation content interface for Agent Wallet operations
interface AgentWalletContent extends Content {
    operation: AgentWalletOperationType;
    // Configuration for initialization
    config?: {
        network?: string;
        adminPrivateKey?: string;
        delegateePrivateKey?: string;
        role?: 'admin' | 'delegatee';
    };
    // Policy settings
    policy?: {
        toolName?: string;
        allowedAddresses?: string[];
        maxDailyAmount?: string;
        tokenType?: string[];
        policyIpfsCid?: string;
    };
    // Delegatee management
    delegatee?: {
        address?: string;
        permissions?: string[];
    };
    // Token operations
    token?: {
        tokenAddress?: string;
        recipient?: string;
        amount?: string;
        outputTokenAddress?: string;
        chainId?: number;
        rpcUrl?: string;
    };
    // Message signing
    message?: {
        content?: string;
        type?: 'plain' | 'typed';
    };
    // Tool execution
    tool?: {
        name?: string;
        params?: Record<string, any>;
    };
}

function isAgentWalletContent(content: any): content is AgentWalletContent {
    elizaLogger.log("Content for Agent Wallet operation", content);
    return typeof content.operation === "string";
}

const agentWalletTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "operation": "TRANSFER_TOKEN",
    "token": {
        "tokenAddress": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "recipient": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        "amount": "10.5",
        "chainId": 1,
        "rpcUrl": "https://ethereum.example.com/rpc"
    }
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the Agent Wallet operation:
- Operation type (INITIALIZE_WALLET, SET_POLICY, ADD_DELEGATEE, TRANSFER_TOKEN, SWAP_TOKEN, SIGN_MESSAGE, EXECUTE_TOOL)
- Configuration settings if initializing a wallet (network, role, etc.)
- Policy configuration if setting a policy (tool name, allowed addresses, etc.)
- Delegatee information if adding a delegatee (address, permissions)
- Token details if performing a token operation (token address, recipient, amount, etc.)
- Message details if signing a message (content, type)
- Tool details if executing a tool (name, parameters)`;

// Dynamic import helper for Lit Protocol agent wallet
async function getLitAgentWallet() {
    try {
        return await import('@lit-protocol/agent-wallet');
    } catch (error) {
        elizaLogger.error("Failed to import Lit Protocol agent wallet:", error);
        throw new Error("Failed to import Lit Protocol agent wallet. Please ensure @lit-protocol/agent-wallet is installed.");
    }
}

export default {
    name: "AGENT_WALLET",
    similes: ["LIT_WALLET", "SECURE_WALLET", "AGENT_FINANCE", "PKP_WALLET"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        try {
            // Check if Lit Protocol's agent-wallet is available
            await getLitAgentWallet();
            return true;
        } catch (error) {
            elizaLogger.error("Agent Wallet validation failed:", error);
            return false;
        }
    },
    description: "Perform secure wallet operations using Lit Protocol's Agent Wallet with tamper-proof policy enforcement",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined,
        options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting AGENT_WALLET handler...");

        try {
            // Parse operation content
            const content = await generateAgentWalletContent(runtime, message, state);
            if (!isAgentWalletContent(content)) {
                throw new Error("Invalid Agent Wallet operation content");
            }

            // Dynamically import the Lit Protocol agent wallet
            const { Admin, Delegatee, OpenAiIntentMatcher } = await getLitAgentWallet();
            
            // Get stored wallet info from memory
            const agentWalletConfig = await getAgentWalletConfig(runtime);
            
            // Process the operation based on type
            switch (content.operation) {
                case 'INITIALIZE_WALLET':
                    return await handleInitialization(runtime, content, { Admin, Delegatee }, callback);
                
                case 'SET_POLICY':
                    return await handleSetPolicy(runtime, content, agentWalletConfig, { Admin }, callback);
                
                case 'ADD_DELEGATEE':
                    return await handleAddDelegatee(runtime, content, agentWalletConfig, { Admin }, callback);
                
                case 'TRANSFER_TOKEN':
                    return await handleTransferToken(runtime, content, agentWalletConfig, { Admin, Delegatee }, callback);
                
                case 'SWAP_TOKEN':
                    return await handleSwapToken(runtime, content, agentWalletConfig, { Admin, Delegatee }, callback);
                
                case 'SIGN_MESSAGE':
                    return await handleSignMessage(runtime, content, agentWalletConfig, { Admin, Delegatee }, callback);
                
                case 'EXECUTE_TOOL':
                    return await handleExecuteTool(runtime, content, agentWalletConfig, { Admin, Delegatee, OpenAiIntentMatcher }, callback);
                
                default:
                    throw new Error(`Unsupported operation: ${content.operation}`);
            }

        } catch (error) {
            elizaLogger.error("Error in Agent Wallet operation:", error);
            if (callback) {
                callback({
                    text: `Error in Agent Wallet operation: ${error.message}`,
                    content: { error: error.message }
                });
            }
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Initialize a new agent wallet as admin with strong security policies",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll set up a secure agent wallet using Lit Protocol...",
                    action: "AGENT_WALLET",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Your Agent Wallet has been initialized successfully! You are now the admin with full control. Your agent's wallet address is 0x742d...",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Transfer 10 USDC to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll process the USDC transfer through your secure Agent Wallet...",
                    action: "AGENT_WALLET",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Transfer completed successfully! 10 USDC has been sent to 0x742d... Transaction hash: 0x8a71...",
                },
            },
        ]
    ] as ActionExample[][],
} satisfies Action;

// Helper functions
async function generateAgentWalletContent(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
): Promise<AgentWalletContent> {
    if (!state) {
        state = await runtime.composeState(message);
    } else {
        state = await runtime.updateRecentMessageState(state);
    }

    const walletContext = composeContext({
        state,
        template: agentWalletTemplate,
    });

    return await generateObjectDeprecated({
        runtime,
        context: walletContext,
        modelClass: ModelClass.LARGE,
    });
}

// Retrieve stored agent wallet configuration from memory
async function getAgentWalletConfig(runtime: IAgentRuntime): Promise<any> {
    const memoryManager = runtime.getMemoryManager("agent_wallets");
    if (!memoryManager) {
        elizaLogger.warn("Memory manager not available for agent_wallets");
        return null;
    }

    const wallets = await memoryManager.getMemories({
        type: "agent_wallet_config",
        count: 1
    });

    if (wallets.length > 0 && wallets[0].content) {
        const walletContent = typeof wallets[0].content === 'string'
            ? JSON.parse(wallets[0].content)
            : wallets[0].content;
        return walletContent;
    }

    return null;
}

// Store agent wallet configuration to memory
async function storeAgentWalletConfig(runtime: IAgentRuntime, config: any): Promise<void> {
    const memoryManager = runtime.getMemoryManager("agent_wallets");
    if (!memoryManager) {
        elizaLogger.warn("Memory manager not available for agent_wallets, creating memory space");
        await runtime.createMemorySpace("agent_wallets");
    }

    const configId = config.pkpId || config.walletAddress || crypto.randomUUID();
    
    await memoryManager.createMemory({
        id: configId,
        content: config,
        roomId: `agent-wallet-${configId}`,
        userId: runtime.agentId,
        timestamp: Date.now(),
        type: "agent_wallet_config",
        metadata: {
            network: config.network,
            role: config.role,
        }
    });
}

// Handler functions for different operations
async function handleInitialization(
    runtime: IAgentRuntime, 
    content: AgentWalletContent, 
    { Admin, Delegatee }: any,
    callback?: HandlerCallback
): Promise<boolean> {
    if (!content.config) {
        throw new Error("Missing configuration for wallet initialization");
    }

    const { network, role, adminPrivateKey, delegateePrivateKey } = content.config;
    
    // Validate required parameters
    if (!network) {
        throw new Error("Network must be specified for initialization");
    }
    
    if (!role) {
        throw new Error("Role (admin or delegatee) must be specified");
    }

    let result;
    let responseText;

    if (role === 'admin') {
        if (!adminPrivateKey) {
            throw new Error("Admin private key is required for admin initialization");
        }

        // Initialize as Admin
        const adminConfig = {
            network,
            credentials: {
                privateKey: adminPrivateKey
            }
        };

        const admin = new Admin(adminConfig);
        await admin.init();

        // Mint new PKP
        const pkpInfo = await admin.mintNewPkp();

        // Store configuration
        const config = {
            role: 'admin',
            network,
            pkpId: pkpInfo.pkpId,
            publicKey: pkpInfo.publicKey,
            ethAddress: pkpInfo.ethAddress,
            adminAddress: admin.address
        };

        await storeAgentWalletConfig(runtime, config);

        result = {
            success: true,
            role: 'admin',
            pkpInfo
        };

        responseText = `Your Agent Wallet has been initialized successfully as admin!\n\n`;
        responseText += `PKP ID: ${pkpInfo.pkpId}\n`;
        responseText += `Wallet Address: ${pkpInfo.ethAddress}\n`;
        responseText += `Network: ${network}\n`;
        responseText += `\nYou can now add delegatees and set policies for your agent wallet.`;

    } else if (role === 'delegatee') {
        if (!delegateePrivateKey) {
            throw new Error("Delegatee private key is required for delegatee initialization");
        }

        // Initialize as Delegatee
        const delegateeConfig = {
            network,
            credentials: {
                privateKey: delegateePrivateKey
            }
        };

        const delegatee = new Delegatee(delegateeConfig);
        await delegatee.init();

        // Get PKPs delegated to this delegatee
        const delegatedPkps = await delegatee.getDelegatedPkps();

        if (delegatedPkps.length === 0) {
            throw new Error("No PKPs have been delegated to this address. The admin must add you as a delegatee first.");
        }

        // Store configuration for the first delegated PKP
        const config = {
            role: 'delegatee',
            network,
            delegatedPkps,
            delegateeAddress: delegatee.address
        };

        await storeAgentWalletConfig(runtime, config);

        result = {
            success: true,
            role: 'delegatee',
            delegatedPkps
        };

        responseText = `Your Agent Wallet has been initialized successfully as delegatee!\n\n`;
        responseText += `Delegatee Address: ${delegatee.address}\n`;
        responseText += `Delegated PKPs: ${delegatedPkps.length}\n`;
        responseText += `Network: ${network}\n`;
        responseText += `\nYou can now execute operations permitted by the admin.`;
    } else {
        throw new Error(`Unsupported role: ${role}`);
    }

    if (callback) {
        callback({
            text: responseText,
            content: result
        });
    }
    
    return true;
}

async function handleSetPolicy(
    runtime: IAgentRuntime, 
    content: AgentWalletContent, 
    agentWalletConfig: any,
    { Admin }: any,
    callback?: HandlerCallback
): Promise<boolean> {
    if (!agentWalletConfig) {
        throw new Error("Agent Wallet not initialized. Please initialize the wallet first.");
    }

    if (agentWalletConfig.role !== 'admin') {
        throw new Error("Only the admin can set policies.");
    }

    if (!content.policy) {
        throw new Error("Missing policy configuration");
    }

    const { toolName, allowedAddresses, maxDailyAmount, tokenType, policyIpfsCid } = content.policy;

    if (!toolName) {
        throw new Error("Tool name must be specified for policy setting");
    }

    // Recreate admin instance
    const admin = new Admin({
        network: agentWalletConfig.network,
        pkpInfo: {
            pkpId: agentWalletConfig.pkpId,
            publicKey: agentWalletConfig.publicKey,
            ethAddress: agentWalletConfig.ethAddress
        }
    });
    
    await admin.init();

    let result;
    let responseText;

    if (policyIpfsCid) {
        // Set policy directly using IPFS CID
        await admin.setToolPolicy(toolName, policyIpfsCid);
        
        result = {
            success: true,
            toolName,
            policyIpfsCid
        };
        
        responseText = `Policy for tool "${toolName}" has been set successfully!\n`;
        responseText += `Policy IPFS CID: ${policyIpfsCid}`;
    } else {
        // Create custom policy based on parameters
        const policyParams: any = {};
        
        if (allowedAddresses) {
            policyParams.allowedAddresses = allowedAddresses;
        }
        
        if (maxDailyAmount) {
            policyParams.maxDailyAmount = maxDailyAmount;
        }
        
        if (tokenType) {
            policyParams.tokenType = tokenType;
        }
        
        // Upload policy to IPFS and set it
        const policyResult = await admin.createAndSetToolPolicy(toolName, policyParams);
        
        result = {
            success: true,
            toolName,
            policyIpfsCid: policyResult.policyIpfsCid,
            policyParams
        };
        
        responseText = `Custom policy for tool "${toolName}" has been created and set successfully!\n`;
        responseText += `Policy IPFS CID: ${policyResult.policyIpfsCid}\n`;
        responseText += `Policy Parameters:\n`;
        
        if (allowedAddresses) {
            responseText += `- Allowed Addresses: ${allowedAddresses.join(', ')}\n`;
        }
        
        if (maxDailyAmount) {
            responseText += `- Max Daily Amount: ${maxDailyAmount}\n`;
        }
        
        if (tokenType) {
            responseText += `- Token Types: ${tokenType.join(', ')}\n`;
        }
    }

    // Update the stored configuration
    agentWalletConfig.policies = agentWalletConfig.policies || {};
    agentWalletConfig.policies[toolName] = result;
    await storeAgentWalletConfig(runtime, agentWalletConfig);

    if (callback) {
        callback({
            text: responseText,
            content: result
        });
    }
    
    return true;
}

async function handleAddDelegatee(
    runtime: IAgentRuntime, 
    content: AgentWalletContent, 
    agentWalletConfig: any,
    { Admin }: any,
    callback?: HandlerCallback
): Promise<boolean> {
    if (!agentWalletConfig) {
        throw new Error("Agent Wallet not initialized. Please initialize the wallet first.");
    }

    if (agentWalletConfig.role !== 'admin') {
        throw new Error("Only the admin can add delegatees.");
    }

    if (!content.delegatee || !content.delegatee.address) {
        throw new Error("Delegatee address must be specified");
    }

    const { address, permissions } = content.delegatee;

    // Recreate admin instance
    const admin = new Admin({
        network: agentWalletConfig.network,
        pkpInfo: {
            pkpId: agentWalletConfig.pkpId,
            publicKey: agentWalletConfig.publicKey,
            ethAddress: agentWalletConfig.ethAddress
        }
    });
    
    await admin.init();

    // Add delegatee
    await admin.addDelegatee(address);

    // If permissions (tool names) are specified, permit those tools
    if (permissions && permissions.length > 0) {
        for (const toolName of permissions) {
            await admin.permitTool(toolName, address);
        }
    }

    // Update stored configuration
    agentWalletConfig.delegatees = agentWalletConfig.delegatees || {};
    agentWalletConfig.delegatees[address] = {
        permissions: permissions || []
    };
    
    await storeAgentWalletConfig(runtime, agentWalletConfig);

    const result = {
        success: true,
        delegateeAddress: address,
        permissions: permissions || []
    };

    let responseText = `Delegatee ${address} has been added successfully!\n`;
    
    if (permissions && permissions.length > 0) {
        responseText += `\nPermitted tools: ${permissions.join(', ')}`;
    } else {
        responseText += `\nNo specific tools were permitted. Use SET_POLICY to permit tools.`;
    }

    if (callback) {
        callback({
            text: responseText,
            content: result
        });
    }
    
    return true;
}

async function handleTransferToken(
    runtime: IAgentRuntime, 
    content: AgentWalletContent, 
    agentWalletConfig: any,
    { Admin, Delegatee }: any,
    callback?: HandlerCallback
): Promise<boolean> {
    if (!agentWalletConfig) {
        throw new Error("Agent Wallet not initialized. Please initialize the wallet first.");
    }

    if (!content.token) {
        throw new Error("Token transfer details must be specified");
    }

    const { tokenAddress, recipient, amount, chainId, rpcUrl } = content.token;

    if (!tokenAddress) {
        throw new Error("Token address must be specified");
    }

    if (!recipient) {
        throw new Error("Recipient address must be specified");
    }

    if (!amount) {
        throw new Error("Amount must be specified");
    }

    let agent;

    // Initialize the appropriate agent type based on role
    if (agentWalletConfig.role === 'admin') {
        agent = new Admin({
            network: agentWalletConfig.network,
            pkpInfo: {
                pkpId: agentWalletConfig.pkpId,
                publicKey: agentWalletConfig.publicKey,
                ethAddress: agentWalletConfig.ethAddress
            }
        });
    } else {
        // Delegatee role
        agent = new Delegatee({
            network: agentWalletConfig.network,
            delegateeAddress: agentWalletConfig.delegateeAddress
        });
    }
    
    await agent.init();

    // For a delegatee, we need to select which PKP to use
    let pkpToUse;
    if (agentWalletConfig.role === 'delegatee') {
        if (!agentWalletConfig.delegatedPkps || agentWalletConfig.delegatedPkps.length === 0) {
            throw new Error("No delegated PKPs available for this delegatee");
        }
        
        // Use the first delegated PKP for simplicity
        pkpToUse = agentWalletConfig.delegatedPkps[0];
    }

    // Execute the ERC20 transfer
    const transferParams = {
        tokenAddress,
        recipientAddress: recipient,
        amount,
        chainId: chainId || 1, // Default to Ethereum mainnet
        rpcUrl: rpcUrl || "https://ethereum.example.com/rpc"
    };

    const transferResult = await agent.executeToolWithParams(
        "erc20-transfer", 
        pkpToUse?.pkpId, 
        transferParams
    );

    const result = {
        success: true,
        tokenAddress,
        recipient,
        amount,
        transactionHash: transferResult.transactionHash
    };

    const responseText = `Token transfer completed successfully!\n\n` +
        `Token: ${tokenAddress}\n` +
        `Amount: ${amount}\n` +
        `Recipient: ${recipient}\n` +
        `Transaction Hash: ${transferResult.transactionHash}`;

    if (callback) {
        callback({
            text: responseText,
            content: result
        });
    }
    
    return true;
}

async function handleSwapToken(
    runtime: IAgentRuntime, 
    content: AgentWalletContent, 
    agentWalletConfig: any,
    { Admin, Delegatee }: any,
    callback?: HandlerCallback
): Promise<boolean> {
    if (!agentWalletConfig) {
        throw new Error("Agent Wallet not initialized. Please initialize the wallet first.");
    }

    if (!content.token) {
        throw new Error("Token swap details must be specified");
    }

    const { tokenAddress, outputTokenAddress, amount, chainId, rpcUrl } = content.token;

    if (!tokenAddress) {
        throw new Error("Input token address must be specified");
    }

    if (!outputTokenAddress) {
        throw new Error("Output token address must be specified");
    }

    if (!amount) {
        throw new Error("Amount must be specified");
    }

    let agent;

    // Initialize the appropriate agent type based on role
    if (agentWalletConfig.role === 'admin') {
        agent = new Admin({
            network: agentWalletConfig.network,
            pkpInfo: {
                pkpId: agentWalletConfig.pkpId,
                publicKey: agentWalletConfig.publicKey,
                ethAddress: agentWalletConfig.ethAddress
            }
        });
    } else {
        // Delegatee role
        agent = new Delegatee({
            network: agentWalletConfig.network,
            delegateeAddress: agentWalletConfig.delegateeAddress
        });
    }
    
    await agent.init();

    // For a delegatee, we need to select which PKP to use
    let pkpToUse;
    if (agentWalletConfig.role === 'delegatee') {
        if (!agentWalletConfig.delegatedPkps || agentWalletConfig.delegatedPkps.length === 0) {
            throw new Error("No delegated PKPs available for this delegatee");
        }
        
        // Use the first delegated PKP for simplicity
        pkpToUse = agentWalletConfig.delegatedPkps[0];
    }

    // Execute the Uniswap swap
    const swapParams = {
        inputToken: tokenAddress,
        outputToken: outputTokenAddress,
        amount,
        chainId: chainId || 1, // Default to Ethereum mainnet
        rpcUrl: rpcUrl || "https://ethereum.example.com/rpc"
    };

    const swapResult = await agent.executeToolWithParams(
        "uniswap-swap", 
        pkpToUse?.pkpId, 
        swapParams
    );

    const result = {
        success: true,
        inputToken: tokenAddress,
        outputToken: outputTokenAddress,
        inputAmount: amount,
        outputAmount: swapResult.outputAmount,
        transactionHash: swapResult.transactionHash
    };

    const responseText = `Token swap completed successfully!\n\n` +
        `Input Token: ${tokenAddress}\n` +
        `Output Token: ${outputTokenAddress}\n` +
        `Input Amount: ${amount}\n` +
        `Output Amount: ${swapResult.outputAmount}\n` +
        `Transaction Hash: ${swapResult.transactionHash}`;

    if (callback) {
        callback({
            text: responseText,
            content: result
        });
    }
    
    return true;
}

async function handleSignMessage(
    runtime: IAgentRuntime, 
    content: AgentWalletContent, 
    agentWalletConfig: any,
    { Admin, Delegatee }: any,
    callback?: HandlerCallback
): Promise<boolean> {
    if (!agentWalletConfig) {
        throw new Error("Agent Wallet not initialized. Please initialize the wallet first.");
    }

    if (!content.message || !content.message.content) {
        throw new Error("Message content must be specified");
    }

    const { content: messageContent, type } = content.message;

    let agent;

    // Initialize the appropriate agent type based on role
    if (agentWalletConfig.role === 'admin') {
        agent = new Admin({
            network: agentWalletConfig.network,
            pkpInfo: {
                pkpId: agentWalletConfig.pkpId,
                publicKey: agentWalletConfig.publicKey,
                ethAddress: agentWalletConfig.ethAddress
            }
        });
    } else {
        // Delegatee role
        agent = new Delegatee({
            network: agentWalletConfig.network,
            delegateeAddress: agentWalletConfig.delegateeAddress
        });
    }
    
    await agent.init();

    // For a delegatee, we need to select which PKP to use
    let pkpToUse;
    if (agentWalletConfig.role === 'delegatee') {
        if (!agentWalletConfig.delegatedPkps || agentWalletConfig.delegatedPkps.length === 0) {
            throw new Error("No delegated PKPs available for this delegatee");
        }
        
        // Use the first delegated PKP for simplicity
        pkpToUse = agentWalletConfig.delegatedPkps[0];
    }

    // Execute the message signing
    const signParams = {
        message: messageContent,
        type: type || 'plain'
    };

    const signResult = await agent.executeToolWithParams(
        "sign-ecdsa", 
        pkpToUse?.pkpId, 
        signParams
    );

    const result = {
        success: true,
        message: messageContent,
        signature: signResult.signature,
        signerAddress: signResult.signerAddress
    };

    const responseText = `Message signed successfully!\n\n` +
        `Message: ${messageContent}\n` +
        `Signature: ${signResult.signature}\n` +
        `Signer Address: ${signResult.signerAddress}`;

    if (callback) {
        callback({
            text: responseText,
            content: result
        });
    }
    
    return true;
}

async function handleExecuteTool(
    runtime: IAgentRuntime, 
    content: AgentWalletContent, 
    agentWalletConfig: any,
    { Admin, Delegatee, OpenAiIntentMatcher }: any,
    callback?: HandlerCallback
): Promise<boolean> {
    if (!agentWalletConfig) {
        throw new Error("Agent Wallet not initialized. Please initialize the wallet first.");
    }

    if (!content.tool || !content.tool.name) {
        throw new Error("Tool name must be specified");
    }

    const { name: toolName, params } = content.tool;

    let agent;
    let intentMatcher;

    // Initialize the appropriate agent type based on role
    if (agentWalletConfig.role === 'admin') {
        agent = new Admin({
            network: agentWalletConfig.network,
            pkpInfo: {
                pkpId: agentWalletConfig.pkpId,
                publicKey: agentWalletConfig.publicKey,
                ethAddress: agentWalletConfig.ethAddress
            }
        });
    } else {
        // Delegatee role
        agent = new Delegatee({
            network: agentWalletConfig.network,
            delegateeAddress: agentWalletConfig.delegateeAddress
        });
        
        // For delegatees, we can use the intent matcher to help parse natural language intent
        intentMatcher = new OpenAiIntentMatcher();
    }
    
    await agent.init();

    // For a delegatee, we need to select which PKP to use
    let pkpToUse;
    if (agentWalletConfig.role === 'delegatee') {
        if (!agentWalletConfig.delegatedPkps || agentWalletConfig.delegatedPkps.length === 0) {
            throw new Error("No delegated PKPs available for this delegatee");
        }
        
        // Use the first delegated PKP for simplicity
        pkpToUse = agentWalletConfig.delegatedPkps[0];
    }

    // Execute the custom tool
    const toolResult = await agent.executeToolWithParams(
        toolName, 
        pkpToUse?.pkpId, 
        params
    );

    const result = {
        success: true,
        toolName,
        params,
        result: toolResult
    };

    const responseText = `Tool "${toolName}" executed successfully!\n\n` +
        `Result: ${JSON.stringify(toolResult, null, 2)}`;

    if (callback) {
        callback({
            text: responseText,
            content: result
        });
    }
    
    return true;
} 