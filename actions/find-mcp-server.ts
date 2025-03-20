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

// MCP server interface
interface MCPServer {
    id: string;
    name: string;
    url: string;
    capabilities: string[];
    version: string;
    reliability?: number;
    latency?: number;
    cost?: string;
    description?: string;
}

// Search criteria interface for MCP servers
interface MCPSearchContent extends Content {
    capability: string;
    minReliability?: number;
    maxLatency?: number;
    preferredCost?: 'free' | 'low' | 'medium' | 'high';
    version?: string;
    prioritizeBy?: 'reliability' | 'latency' | 'cost';
}

function isMCPSearchContent(content: any): content is MCPSearchContent {
    elizaLogger.log("Content for MCP server search", content);
    return typeof content.capability === "string" && content.capability.length > 0;
}

const mcpSearchTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "capability": "image_generation",
    "minReliability": 0.95,
    "maxLatency": 2000,
    "preferredCost": "low",
    "version": "v2",
    "prioritizeBy": "reliability"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the MCP server search:
- Required capability (e.g., image_generation, text_processing, etc.)
- Minimum reliability score (0.0-1.0)
- Maximum acceptable latency in ms
- Preferred cost level (free, low, medium, high)
- Version requirements (if any)
- Prioritization preference (reliability, latency, or cost)`;

export default {
    name: "FIND_MCP_SERVER",
    similes: ["SEARCH_MCP", "GET_MCP_SERVER", "LOOKUP_MCP", "FIND_SERVER"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        // No special validation needed, this action is generally available
        return true;
    },
    description: "Find available MCP servers that match specific capability requirements using the iod.ai index",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined,
        options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting FIND_MCP_SERVER handler...");

        try {
            // Generate search criteria content
            const content = await generateSearchContent(runtime, message, state);
            if (!isMCPSearchContent(content)) {
                throw new Error("Invalid MCP server search criteria");
            }

            // Fetch data from iod.ai MCP index
            const mcpServers = await searchMCPServers(content);
            
            if (!mcpServers || mcpServers.length === 0) {
                if (callback) {
                    callback({
                        text: `No MCP servers found for capability: ${content.capability}`,
                        content: { success: false, message: "No servers found" }
                    });
                }
                return false;
            }

            // Store server results in memory for future reference
            const memoryManager = runtime.getMemoryManager("mcp_servers");
            if (!memoryManager) {
                elizaLogger.warn("Memory manager not available for mcp_servers, skipping memory storage");
            } else {
                await memoryManager.createMemory({
                    id: crypto.randomUUID(),
                    content: {
                        query: content,
                        results: mcpServers,
                        timestamp: Date.now()
                    },
                    roomId: message.roomId,
                    userId: runtime.agentId,
                    timestamp: Date.now(),
                    type: "mcp_server_search",
                    metadata: {
                        capability: content.capability,
                        count: mcpServers.length
                    }
                });
            }

            // Generate human-readable response
            const topServer = mcpServers[0];
            
            let responseText = `Found ${mcpServers.length} MCP server(s) for capability "${content.capability}".\n\n`;
            responseText += `Top recommendation:\n`;
            responseText += `- Name: ${topServer.name}\n`;
            responseText += `- URL: ${topServer.url}\n`;
            responseText += `- Reliability: ${(topServer.reliability || 0) * 100}%\n`;
            if (topServer.latency) {
                responseText += `- Latency: ${topServer.latency}ms\n`;
            }
            if (topServer.cost) {
                responseText += `- Cost: ${topServer.cost}\n`;
            }
            
            if (mcpServers.length > 1) {
                responseText += `\nAdditional servers available. Would you like details on other options?`;
            }

            if (callback) {
                callback({
                    text: responseText,
                    content: {
                        success: true,
                        servers: mcpServers,
                        query: content
                    }
                });
            }
            return true;

        } catch (error) {
            elizaLogger.error("Error finding MCP server:", error);
            if (callback) {
                callback({
                    text: `Error finding MCP server: ${error.message}`,
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
                    text: "Find an MCP server for image generation with high reliability",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll search for image generation MCP servers...",
                    action: "FIND_MCP_SERVER",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Found 3 MCP servers for capability \"image_generation\". Top recommendation: ImageMaster v2...",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I need a free text processing MCP with low latency",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Searching for text processing servers with low latency and no cost...",
                    action: "FIND_MCP_SERVER",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Found 2 MCP servers for capability \"text_processing\". Top recommendation: FastText Free...",
                },
            },
        ]
    ] as ActionExample[][],
} satisfies Action;

// Helper functions

async function generateSearchContent(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
): Promise<MCPSearchContent> {
    if (!state) {
        state = await runtime.composeState(message);
    } else {
        state = await runtime.updateRecentMessageState(state);
    }

    const searchContext = composeContext({
        state,
        template: mcpSearchTemplate,
    });

    return await generateObjectDeprecated({
        runtime,
        context: searchContext,
        modelClass: ModelClass.LARGE,
    });
}

async function searchMCPServers(criteria: MCPSearchContent): Promise<MCPServer[]> {
    try {
        // In a production environment, this would be a real API call to iod.ai
        // For now, using a mock implementation
        
        // Simulate API call with fetch in a real implementation
        // const response = await fetch('https://iod.ai/api/mcp-search', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(criteria)
        // });
        // const data = await response.json();
        // return data.servers;
        
        elizaLogger.log("Searching for MCP servers with criteria:", criteria);
        
        // Simulate delay as if making a real API call
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Return mock data based on criteria
        const mockServers: MCPServer[] = [];
        
        // Generate mock data based on requested capability
        switch(criteria.capability.toLowerCase()) {
            case 'image_generation':
                mockServers.push(
                    {
                        id: 'img-gen-1',
                        name: 'ImageMaster v2',
                        url: 'https://api.imagemaster.io',
                        capabilities: ['image_generation', 'image_editing'],
                        version: 'v2.3',
                        reliability: 0.98,
                        latency: 1200,
                        cost: 'medium',
                        description: 'High-quality image generation with advanced controls'
                    },
                    {
                        id: 'img-gen-2',
                        name: 'PixelForge',
                        url: 'https://pixelforge.ai/api',
                        capabilities: ['image_generation'],
                        version: 'v1.5',
                        reliability: 0.95,
                        latency: 800,
                        cost: 'low',
                        description: 'Fast and affordable image generation'
                    }
                );
                break;
                
            case 'text_processing':
                mockServers.push(
                    {
                        id: 'text-proc-1',
                        name: 'TextWizard Pro',
                        url: 'https://api.textwizard.com',
                        capabilities: ['text_processing', 'translation'],
                        version: 'v3.1',
                        reliability: 0.99,
                        latency: 300,
                        cost: 'high',
                        description: 'Enterprise-grade text processing with 99.9% uptime'
                    },
                    {
                        id: 'text-proc-2',
                        name: 'FastText Free',
                        url: 'https://fasttext.io/api',
                        capabilities: ['text_processing'],
                        version: 'v1.0',
                        reliability: 0.9,
                        latency: 500,
                        cost: 'free',
                        description: 'Basic text processing services at no cost'
                    }
                );
                break;
                
            case 'video_generation':
                mockServers.push(
                    {
                        id: 'vid-gen-1',
                        name: 'VideoGenius',
                        url: 'https://api.videogenius.ai',
                        capabilities: ['video_generation', 'video_editing'],
                        version: 'v2.0',
                        reliability: 0.93,
                        latency: 5000,
                        cost: 'high',
                        description: 'Advanced video generation with cinematic quality'
                    }
                );
                break;
                
            default:
                // For any other capability, provide a generic server
                mockServers.push({
                    id: 'generic-1',
                    name: `${criteria.capability.charAt(0).toUpperCase() + criteria.capability.slice(1)} Server`,
                    url: `https://api.example.com/${criteria.capability}`,
                    capabilities: [criteria.capability],
                    version: 'v1.0',
                    reliability: 0.85,
                    latency: 1000,
                    cost: 'medium',
                    description: `Generic ${criteria.capability} processing`
                });
        }
        
        // Apply filters based on criteria
        let filteredServers = [...mockServers];
        
        if (criteria.minReliability) {
            filteredServers = filteredServers.filter(server => 
                (server.reliability || 0) >= criteria.minReliability!);
        }
        
        if (criteria.maxLatency) {
            filteredServers = filteredServers.filter(server => 
                !server.latency || server.latency <= criteria.maxLatency!);
        }
        
        if (criteria.preferredCost) {
            const costPriority = { 'free': 0, 'low': 1, 'medium': 2, 'high': 3 };
            const preferredCostValue = costPriority[criteria.preferredCost];
            
            // Prioritize but don't exclude based on cost
            filteredServers.sort((a, b) => {
                const costA = costPriority[a.cost as keyof typeof costPriority] || 2;
                const costB = costPriority[b.cost as keyof typeof costPriority] || 2;
                
                return Math.abs(costA - preferredCostValue) - Math.abs(costB - preferredCostValue);
            });
        }
        
        // Sort by prioritization preference
        if (criteria.prioritizeBy) {
            switch (criteria.prioritizeBy) {
                case 'reliability':
                    filteredServers.sort((a, b) => (b.reliability || 0) - (a.reliability || 0));
                    break;
                case 'latency':
                    filteredServers.sort((a, b) => (a.latency || 9999) - (b.latency || 9999));
                    break;
                case 'cost':
                    const costValue = { 'free': 0, 'low': 1, 'medium': 2, 'high': 3 };
                    filteredServers.sort((a, b) => {
                        const aValue = costValue[a.cost as keyof typeof costValue] || 2;
                        const bValue = costValue[b.cost as keyof typeof costValue] || 2;
                        return aValue - bValue;
                    });
                    break;
            }
        }
        
        elizaLogger.log(`Found ${filteredServers.length} MCP servers matching criteria`);
        return filteredServers;
        
    } catch (error) {
        elizaLogger.error("Error searching MCP servers:", error);
        throw new Error(`Failed to search MCP servers: ${error.message}`);
    }
} 