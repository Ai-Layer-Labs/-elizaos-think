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
import { ethers } from "ethers";

interface RegistrationContent extends Content {
    capabilities: string[];
    stake: string;
    metadata?: {
        description?: string;
        model?: string;
        version?: string;
        tags?: string[];
    };
}

function isRegistrationContent(content: any): content is RegistrationContent {
    elizaLogger.log("Content for registerAgent", content);
    return Array.isArray(content.capabilities) && 
           typeof content.stake === "string" &&
           (!content.metadata || typeof content.metadata === "object");
}

const registrationTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "capabilities": ["pattern_matching", "knowledge_retrieval", "data_analysis"],
    "stake": "1.0",
    "metadata": {
        "description": "General purpose agent with focus on data analysis",
        "model": "claude-3",
        "version": "1.0.0",
        "tags": ["analysis", "general", "data"]
    }
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the agent registration:
- Agent capabilities (array of strings)
- Stake amount in ETH
- Optional metadata about the agent (description, model, version, tags)`;

export default {
    name: "REGISTER_THINK_AGENT",
    similes: ["JOIN_THINK", "CONNECT_TO_THINK", "ENROLL_AGENT", "INITIALIZE_AGENT"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const requiredSettings = [
            "THINK_CONTRACT_ADDRESS",
            "THINK_RPC_URL",
            "THINK_PRIVATE_KEY"
        ];
        
        return requiredSettings.every(setting => !!runtime.getSetting(setting));
    },
    description: "Register an agent with the THINK protocol network with specified capabilities and stake",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting REGISTER_THINK_AGENT handler...");

        try {
            // Get or update state
            if (!state) {
                state = await runtime.composeState(message);
            } else {
                state = await runtime.updateRecentMessageState(state);
            }

            // Generate registration content
            const registrationContext = composeContext({
                state,
                template: registrationTemplate,
            });

            const content = await generateObjectDeprecated({
                runtime,
                context: registrationContext,
                modelClass: ModelClass.LARGE,
            });

            if (!isRegistrationContent(content)) {
                elizaLogger.error("Invalid registration content", content);
                if (callback) {
                    callback({
                        text: "Unable to process registration request. Invalid content provided.",
                        content: { error: "Invalid registration content" },
                    });
                }
                return false;
            }

            // Initialize blockchain connection
            const provider = new ethers.providers.JsonRpcProvider(
                runtime.getSetting("THINK_RPC_URL")
            );
            const signer = new ethers.Wallet(
                runtime.getSetting("THINK_PRIVATE_KEY"),
                provider
            );
            
            const contractAddress = runtime.getSetting("THINK_CONTRACT_ADDRESS");
            const contract = new ethers.Contract(
                contractAddress,
                [
                    "function registerAgent(bytes32 agentId, string capabilities, string metadata, uint256 stake) payable",
                    "event AgentRegistered(bytes32 indexed agentId, string capabilities, uint256 stake, uint256 timestamp)"
                ],
                signer
            );

            // Prepare registration data
            const agentId = ethers.utils.formatBytes32String(runtime.agentId);
            const capabilitiesString = content.capabilities.join(",");
            const metadataString = JSON.stringify({
                ...content.metadata,
                lastUpdate: new Date().toISOString()
            });
            const stakeAmount = ethers.utils.parseEther(content.stake);

            // Execute registration
            const tx = await contract.registerAgent(
                agentId,
                capabilitiesString,
                metadataString,
                stakeAmount,
                { value: stakeAmount }
            );

            const receipt = await tx.wait();
            
            // Store registration in memory
            const memoryManager = runtime.getMemoryManager("think_registrations");
            await memoryManager.createMemory({
                id: tx.hash,
                content: JSON.stringify({
                    capabilities: content.capabilities,
                    stake: content.stake,
                    metadata: content.metadata,
                    transaction: {
                        hash: tx.hash,
                        blockNumber: receipt.blockNumber,
                        timestamp: new Date().toISOString()
                    }
                }),
                roomId: message.roomId,
                userId: runtime.agentId,
                timestamp: Date.now(),
                type: "think_registration",
                metadata: {
                    txHash: tx.hash,
                    stake: content.stake
                }
            });

            elizaLogger.log(`Successfully registered agent with THINK protocol: ${tx.hash}`);

            if (callback) {
                callback({
                    text: `Successfully registered with the THINK network. Staked ${content.stake} ETH with ${content.capabilities.length} capabilities.`,
                    content: {
                        success: true,
                        txHash: tx.hash,
                        registration: {
                            capabilities: content.capabilities,
                            stake: content.stake,
                            metadata: content.metadata
                        }
                    },
                });
            }
            return true;

        } catch (error) {
            elizaLogger.error("Error during agent registration:", error);
            if (callback) {
                callback({
                    text: `Error registering agent: ${error.message}`,
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
                    text: "Register this agent with pattern matching and data analysis capabilities, staking 1 ETH",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll register the agent with the THINK protocol now...",
                    action: "REGISTER_THINK_AGENT",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully registered with the THINK network. Staked 1 ETH with 2 capabilities.",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Connect to THINK network as an AI analysis agent specializing in market data",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll register as a specialized market analysis agent...",
                    action: "REGISTER_THINK_AGENT",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully registered with the THINK network. Staked 2 ETH with 3 capabilities.",
                },
            },
        ]
    ] as ActionExample[][],
} satisfies Action;