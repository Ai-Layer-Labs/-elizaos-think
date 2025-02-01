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
} from "@elizaos/core";
import { Wallet } from "ethereum-wallet";
import { ethers } from "ethers";

interface WalletContent extends Content {
    password?: string;
    backupLocation?: string;
    metadata?: {
        purpose?: string;
        network?: string;
        tags?: string[];
    };
}

function isWalletContent(content: any): content is WalletContent {
    elizaLogger.log("Content for createWallet", content);
    return (!content.password || typeof content.password === "string") &&
           (!content.backupLocation || typeof content.backupLocation === "string") &&
           (!content.metadata || typeof content.metadata === "object");
}

const walletTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "password": "secure_generated_password",
    "backupLocation": "./wallets",
    "metadata": {
        "purpose": "agent_operations",
        "network": "mainnet",
        "tags": ["think_protocol", "agent_wallet"]
    }
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the wallet creation:
- Optional password for encryption
- Optional backup location
- Optional metadata (purpose, network, tags)`;

export default {
    name: "CREATE_ETH_WALLET",
    similes: ["GENERATE_WALLET", "NEW_WALLET", "INIT_WALLET", "CREATE_WALLET"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true; // No specific external requirements needed
    },
    description: "Create a new Ethereum wallet for the agent",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting CREATE_ETH_WALLET handler...");

        try {
            // Generate wallet content
            const content = await generateWalletContent(runtime, message, state);
            
            // Generate random wallet
            const wallet = new Wallet();
            
            // Create wallet instance with entropy
            const privateKey = wallet.generateRandomPrivateKey();
            const address = wallet.getAddressString();
            
            // If password provided, encrypt the wallet
            let encryptedWallet = null;
            if (content.password) {
                encryptedWallet = await wallet.toV3(content.password);
            }

            // Save wallet details securely
            const vaultService = runtime.getService("vault");
            if (vaultService) {
                await vaultService.setSecrets(`wallet_${address}`, {
                    privateKey: privateKey.toString('hex'),
                    address,
                    encrypted: encryptedWallet
                });
            }

            // Store in memory system
            const memoryManager = runtime.getMemoryManager("wallets");
            await memoryManager.createMemory({
                id: address,
                content: JSON.stringify({
                    address,
                    hasEncryption: !!content.password,
                    metadata: {
                        ...content.metadata,
                        createdAt: Date.now()
                    }
                }),
                roomId: message.roomId,
                userId: runtime.agentId,
                timestamp: Date.now(),
                type: "wallet_creation",
                metadata: {
                    address,
                    network: content.metadata?.network || "mainnet"
                }
            });

            // Backup wallet if location specified
            if (content.backupLocation) {
                const fs = require('fs').promises;
                const backupData = encryptedWallet || {
                    address,
                    privateKey: privateKey.toString('hex')
                };
                await fs.writeFile(
                    `${content.backupLocation}/${address}.json`,
                    JSON.stringify(backupData, null, 2)
                );
            }

            // Check initial balance
            const provider = new ethers.providers.JsonRpcProvider(
                runtime.getSetting("ETH_RPC_URL") || "https://eth-mainnet.public.blastapi.io"
            );
            const balance = await provider.getBalance(address);

            elizaLogger.log(`Successfully created wallet: ${address}`);

            if (callback) {
                callback({
                    text: `Successfully created new Ethereum wallet: ${address}. Initial balance: ${ethers.utils.formatEther(balance)} ETH`,
                    content: {
                        success: true,
                        wallet: {
                            address,
                            hasEncryption: !!content.password,
                            balance: ethers.utils.formatEther(balance),
                            metadata: content.metadata
                        }
                    },
                });
            }
            return true;

        } catch (error) {
            elizaLogger.error("Error creating wallet:", error);
            if (callback) {
                callback({
                    text: `Error creating wallet: ${error.message}`,
                    content: { error: error.message },
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
                    text: "Create a new Ethereum wallet for this agent",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll create a new Ethereum wallet now...",
                    action: "CREATE_ETH_WALLET",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully created new Ethereum wallet: 0x1234... Initial balance: 0 ETH",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Generate an encrypted wallet for mainnet operations",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Creating an encrypted Ethereum wallet...",
                    action: "CREATE_ETH_WALLET",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully created encrypted Ethereum wallet: 0x5678... Initial balance: 0 ETH",
                },
            },
        ]
    ] as ActionExample[][],
} satisfies Action;

async function generateWalletContent(
    runtime: IAgentRuntime,
    message: Memory,
    state: State
): Promise<WalletContent> {
    if (!state) {
        state = await runtime.composeState(message);
    } else {
        state = await runtime.updateRecentMessageState(state);
    }

    const walletContext = composeContext({
        state,
        template: walletTemplate,
    });

    const content = await generateObjectDeprecated({
        runtime,
        context: walletContext,
        modelClass: ModelClass.LARGE,
    });

    if (!isWalletContent(content)) {
        throw new Error("Invalid wallet content generated");
    }

    return content;
}