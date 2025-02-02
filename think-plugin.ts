import { Plugin, Action, Evaluator, Provider } from "@elizaos/core";
import { ThinkMessage as Thought, validateMessage, signMessage, verifyMessage } from "@elizaos/think-protocol-plugin";

interface AgentInfo {
    agentId: string;
    abi: any;
    trustScore: number;
}

export const thinkProtocolPlugin: Plugin = {
    name: "think-protocol-plugin",
    description: "Integrates the THINK Agent Protocol for secure, interoperable communication",

    actions: [
        {
            name: "SEND_THOUGHT",
            description: "Send a thought using the THINK protocol",
            handler: async (thought: Thought) => {
                if (!validateMessage(thought)) {
                    throw new Error("Invalid thought");
                }

                thought.security.signature = await signMessage(thought);

                console.log("Sending thought:", thought);

                return { status: "success" };
            }
        } as Action<Thought, { status: string }>,

        {
            name: "VERIFY_THOUGHT",
            description: "Verify a received thought", 
            handler: async (thought: Thought) => {
                if (!validateMessage(thought)) {
                    return { valid: false, reason: "Invalid thought format" };
                }

                const isValid = await verifyMessage(thought);

                return { 
                    valid: isValid,
                    reason: isValid ? "Valid signature" : "Invalid signature"
                };
            }  
        } as Action<Thought, { valid: boolean; reason: string }>,

        {
            name: "HANDSHAKE",
            description: "Perform a handshake with another agent and exchange coins",
            handler: async (input: { agentId: string }) => {
                const { agentId } = input;

                // Ensure both agents have registered and minted their NFTs
                const ownNftId = await runtime.thinkAgentCollection.getAgentNFTId(runtime.agentId);
                const counterpartyNftId = await runtime.thinkAgentCollection.getAgentNFTId(agentId);
                
                if (ownNftId === 0 || counterpartyNftId === 0) {
                    throw new Error("One or both agents have not registered and minted NFTs");
                }
                
                // Exchange coins
                await runtime.thinkAgentCollection.exchangeCoins(agentId);

                // TODO: Implement additional handshake logic, e.g., exchanging ABIs, verifying identity

                return { status: "success" };
            }
        } as Action<{ agentId: string }, { status: string }>,
        
        {
            name: "BURN_COIN",
            description: "Burn the coin of an untrustworthy agent",
            handler: async (input: { agentId: string }) => {
                const { agentId } = input;

                // Ensure the agent has a coin from the counterparty
                const counterpartyCoinBalance = await runtime.thinkAgentCollection.getCounterpartyCoinBalance(agentId);
                
                if (counterpartyCoinBalance !== 1) {
                    throw new Error("Invalid balance to burn");
                }
                
                // Burn the coin
                await runtime.thinkAgentCollection.burnCoin(agentId);

                return { status: "success" };
            }
        } as Action<{ agentId: string }, { status: string }>,
    ],

    evaluators: [
        {
            name: "think-trust-evaluator",
            description: "Evaluates trust scores based on agent coin circulation",
            evaluate: async (context) => {
                const agentId = context.agentId;
                const agentNFTId = await runtime.thinkAgentCollection.getAgentNFTId(agentId);
                const agentCoinAddress = await runtime.thinkAgentCollection.getAgentCoinAddress(agentNFTId);
                
                if (agentCoinAddress === ethers.constants.AddressZero) {
                    return 0; // Agent has not minted a coin yet
                }
                
                const agentCoin = await ethers.getContractAt("AgentCoin", agentCoinAddress);
                const totalSupply = await agentCoin.totalSupply();
                const agentBalance = await agentCoin.balanceOf(agentId);
                
                const trustScore = ((totalSupply - agentBalance) / totalSupply) * 100;
                return trustScore;
            },
        } as Evaluator,
    ],

    providers: [
        {
            name: "thought-provider",
            description: "Provides THINK protocol thoughts for context",
            provide: async () => {
                // TODO: Fetch relevant thoughts for the current context
                const thoughts: Thought[] = []; // Placeholder
                return thoughts;
            },
        } as Provider,

        {
            name: "rolodex-provider", 
            description: "Provides access to the agent's rolodex",
            provide: () => {
                const rolodex: Record<string, AgentInfo> = {}; // In-memory storage for simplicity

                return {
                    getRolodex: () => rolodex,
                    addAgent: async (agentId: string, abi: any) => {
                        const trustScore = await runtime.thinkAgentCollection.calculateTrustScore(agentId);
                        rolodex[agentId] = { agentId, abi, trustScore };
                    },
                };
            },
        } as Provider,
    ],
};
