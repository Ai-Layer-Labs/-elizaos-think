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
import { ethers } from "ethers";

interface TransactionContent extends Content {
    walletAddress: string;
    to: string;
    value?: string;
    data?: string;
    gasLimit?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    nonce?: number;
    metadata?: {
        purpose?: string;
        network?: string;
        urgency?: 'low' | 'medium' | 'high';
    };
}

function isTransactionContent(content: any): content is TransactionContent {
    elizaLogger.log("Content for signTransaction", content);
    return typeof content.walletAddress === "string" &&
           typeof content.to === "string";
}

const transactionTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "walletAddress": "0x1234...",
    "to": "0x5678...",
    "value": "0.1",
    "data": "0x",
    "gasLimit": "21000",
    "maxFeePerGas": "30",
    "maxPriorityFeePerGas": "2",
    "metadata": {
        "purpose": "contract_interaction",
        "network": "mainnet",
        "urgency": "medium"
    }
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the transaction:
- Wallet address to use for signing
- Recipient address
- Value in ETH (if sending ETH)
- Transaction data (if contract interaction)
- Gas parameters (if specified)
- Optional metadata (purpose, network, urgency)`;

export default {
    name: "SIGN_TRANSACTION",
    similes: ["PREPARE_TRANSACTION", "SIGN_TX", "CREATE_TRANSACTION"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return !!(runtime.getSetting("ETH_RPC_URL"));
    },
    description: "Sign an Ethereum transaction using a stored wallet",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined,
        options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting SIGN_TRANSACTION handler...");

        try {
            // Generate transaction content
            const content = await generateTransactionContent(runtime, message, state);
            if (!isTransactionContent(content)) {
                throw new Error("Invalid transaction content");
            }

            // Get wallet from vault or memory
            const wallet = await loadWallet(runtime, content.walletAddress);
            if (!wallet) {
                throw new Error(`Wallet not found: ${content.walletAddress}`);
            }

            // Initialize provider
            const provider = new ethers.providers.JsonRpcProvider(
                runtime.getSetting("ETH_RPC_URL")
            );
            const walletWithProvider = new ethers.Wallet(wallet.privateKey, provider);

            // Get current network state
            const [nonce, feeData] = await Promise.all([
                provider.getTransactionCount(content.walletAddress),
                provider.getFeeData()
            ]);

            // Prepare transaction
            const tx = await prepareTransaction(content, nonce, feeData);

            // Check balance for transaction
            const balance = await provider.getBalance(content.walletAddress);
            const totalCost = tx.gasLimit.mul(tx.maxFeePerGas || 0).add(
                ethers.utils.parseEther(content.value || '0')
            );

            if (balance.lt(totalCost)) {
                throw new Error(`Insufficient balance. Required: ${ethers.utils.formatEther(totalCost)} ETH`);
            }

            // Sign transaction
            const signedTx = await walletWithProvider.signTransaction(tx);

            // Store signed transaction in memory
            const memoryManager = runtime.getMemoryManager("transactions");
            if (!memoryManager) {
                throw new Error("Memory manager not available");
            }
            const txHash = ethers.utils.keccak256(signedTx);
            
            await memoryManager.createMemory({
                id: txHash,
                content: {
                    from: content.walletAddress,
                    to: content.to,
                    value: content.value,
                    nonce: tx.nonce,
                    gasLimit: tx.gasLimit.toString(),
                    maxFeePerGas: tx.maxFeePerGas?.toString(),
                    maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString(),
                    data: content.data,
                    metadata: content.metadata
                },
                roomId: message.roomId,
                userId: runtime.agentId,
                timestamp: Date.now(),
                type: "signed_transaction",
                metadata: {
                    txHash,
                    from: content.walletAddress,
                    to: content.to,
                    network: content.metadata?.network || "mainnet"
                }
            });

            // Generate human-readable response
            let responseText = `Transaction signed successfully!\n`;
            responseText += `From: ${content.walletAddress}\n`;
            responseText += `To: ${content.to}\n`;
            if (content.value) {
                responseText += `Value: ${content.value} ETH\n`;
            }
            responseText += `Estimated gas cost: ${ethers.utils.formatEther(
                tx.gasLimit.mul(tx.maxFeePerGas || 0)
            )} ETH\n`;
            responseText += `Transaction hash: ${txHash}`;

            if (callback) {
                callback({
                    text: responseText,
                    content: {
                        success: true,
                        transaction: {
                            hash: txHash,
                            signedTx: signedTx,
                            details: {
                                from: content.walletAddress,
                                to: content.to,
                                value: content.value,
                                nonce: tx.nonce,
                                gasLimit: tx.gasLimit.toString(),
                                maxFeePerGas: tx.maxFeePerGas?.toString(),
                                maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString()
                            }
                        }
                    },
                });
            }
            return true;

        } catch (error) {
            elizaLogger.error("Error signing transaction:", error);
            if (callback) {
                callback({
                    text: `Error signing transaction: ${error.message}`,
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
                    text: "Sign a transaction sending 0.1 ETH to 0x5678",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll prepare and sign the transaction...",
                    action: "SIGN_TRANSACTION",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Transaction signed successfully! From: 0x1234... To: 0x5678... Value: 0.1 ETH",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Prepare a contract interaction with high gas priority",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Signing the contract interaction with priority gas settings...",
                    action: "SIGN_TRANSACTION",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Transaction signed successfully! Contract interaction prepared with high priority gas settings.",
                },
            },
        ]
    ] as ActionExample[][],
} satisfies Action;

// Helper functions

async function generateTransactionContent(
    runtime: IAgentRuntime,
    message: Memory,
    state: State
): Promise<TransactionContent> {
    if (!state) {
        state = await runtime.composeState(message);
    } else {
        state = await runtime.updateRecentMessageState(state);
    }

    const txContext = composeContext({
        state,
        template: transactionTemplate,
    });

    return await generateObjectDeprecated({
        runtime,
        context: txContext,
        modelClass: ModelClass.LARGE,
    });
}

async function loadWallet(runtime: IAgentRuntime, address: string) {
    // Try vault first
    const vaultService = runtime.getService(ServiceType.VAULT);
    if (vaultService) {
        try {
            const walletData = await vaultService.get(`wallet_${address}`);
            if (walletData?.privateKey) {
                return {
                    address: address,
                    privateKey: walletData.privateKey
                };
            }
        } catch (error) {
            elizaLogger.error("Error accessing vault:", error);
        }
    }

    // Try memory system
    const memoryManager = runtime.getMemoryManager("wallets");
    if (!memoryManager) {
        throw new Error("Memory manager not available");
    }
    
    const wallets = await memoryManager.getMemories({
        roomId: `wallet-${address}`,
        count: 1,
        metadata: { address }
    });

    if (wallets.length > 0 && wallets[0].content) {
        // Ensure content is properly typed
        const walletContent = typeof wallets[0].content === 'string' 
            ? JSON.parse(wallets[0].content)
            : wallets[0].content;
        return walletContent;
    }

    return null;
}

async function prepareTransaction(
    content: TransactionContent,
    nonce: number,
    feeData: any
): Promise<ethers.utils.UnsignedTransaction> {
    const tx: ethers.utils.UnsignedTransaction = {
        to: content.to,
        nonce: content.nonce ?? nonce,
        gasLimit: ethers.BigNumber.from(content.gasLimit || '21000'),
        data: content.data || '0x',
    };

    if (content.value) {
        tx.value = ethers.utils.parseEther(content.value);
    }

    // Handle EIP-1559 gas parameters
    if (content.maxFeePerGas || content.maxPriorityFeePerGas) {
        tx.maxFeePerGas = ethers.utils.parseUnits(
            content.maxFeePerGas || feeData.maxFeePerGas.toString(),
            'gwei'
        );
        tx.maxPriorityFeePerGas = ethers.utils.parseUnits(
            content.maxPriorityFeePerGas || feeData.maxPriorityFeePerGas.toString(),
            'gwei'
        );
    } else {
        tx.maxFeePerGas = feeData.maxFeePerGas;
        tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    }

    return tx;
}