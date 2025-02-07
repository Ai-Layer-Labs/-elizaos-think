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
import { ActionMatcher, MatchScore } from '../matching-utils';

interface FilterOptions {
    agentIds?: string[];
    pluginNames?: string[];
    capabilities?: string[];
    keywords?: string[];
    contextTerms?: string[];
    timeRange?: {
        start: number;
        end: number;
    };
    matchOptions?: {
        minScore?: number;
        maxResults?: number;
        requireAllCapabilities?: boolean;
        fuzzyMatching?: boolean;
    };
}

interface DiscoverContent extends Content {
    filters: FilterOptions;
}

function isDiscoverContent(content: any): content is DiscoverContent {
    elizaLogger.log("Content for action discovery", content);
    return content.filters && typeof content.filters === 'object';
}

const filterTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json 
{
    "filters": {
        "agentIds": ["agent1", "agent2"],
        "pluginNames": ["finance", "trading"],
        "capabilities": ["data_analysis", "prediction"],
        "keywords": ["market", "stock"],
        "contextTerms": ["realtime", "automated"],
        "timeRange": {
            "start": 1706745600,
            "end": 1707350400
        },
        "matchOptions": {
            "minScore": 0.3,
            "maxResults": 20,
            "requireAllCapabilities": true,
            "fuzzyMatching": true
        }
    }
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract any filtering and matching criteria for action discovery:
- Specific agent IDs to query
- Plugin names to filter by
- Required capabilities
- Keywords to search for
- Context terms for semantic matching
- Time range for the search (in Unix timestamp)
- Matching options (minimum score, max results, etc)`;

export default {
    name: "DISCOVER_ACTIONS",
    similes: ["FIND_ACTIONS", "GET_NETWORK_ACTIONS", "LIST_AGENT_CAPABILITIES", "SEARCH_ACTIONS", "MATCH_CAPABILITIES"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return !!(runtime.getSetting("THINK_CONTRACT_ADDRESS"));
    },
    description: "Discover and match available actions from other agents using advanced matching algorithms",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting DISCOVER_ACTIONS handler with advanced matching...");

        // Parse filtering options from message
        let filters: FilterOptions = {
            matchOptions: {
                minScore: 0.3,
                maxResults: 20,
                requireAllCapabilities: false,
                fuzzyMatching: true
            }
        };

        try {
            if (!state) {
                state = await runtime.composeState(message);
            } else {
                state = await runtime.updateRecentMessageState(state);
            }

            const filterContext = composeContext({
                state,
                template: filterTemplate,
            });

            const content = await generateObjectDeprecated({
                runtime,
                context: filterContext,
                modelClass: ModelClass.LARGE,
            });

            if (isDiscoverContent(content)) {
                filters = {
                    ...filters,
                    ...content.filters,
                    matchOptions: {
                        ...filters.matchOptions,
                        ...content.filters.matchOptions
                    }
                };
            }
        } catch (error) {
            elizaLogger.warn("Error parsing filters, proceeding with default options:", error);
        }

        try {
            const provider = new ethers.providers.JsonRpcProvider(
                runtime.getSetting("THINK_RPC_URL")
            );
            
            const contractAddress = runtime.getSetting("THINK_CONTRACT_ADDRESS");
            const contract = new ethers.Contract(
                contractAddress,
                [
                    "event ActionsPublished(bytes32 indexed agentId, string actionsJson, uint256 timestamp)",
                ],
                provider
            );

            // Get events within time range or default to last 1000 blocks
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = filters.timeRange?.start ? 
                await provider.getBlock(filters.timeRange.start) :
                currentBlock - 1000;
            const toBlock = filters.timeRange?.end ?
                await provider.getBlock(filters.timeRange.end) :
                currentBlock;

            const events = await contract.queryFilter(
                contract.filters.ActionsPublished(),
                fromBlock,
                toBlock
            );

            // Collect all actions for ranking
            const allActions = [];
            events.forEach(event => {
                const agentId = ethers.utils.parseBytes32String(event.args.agentId);
                const actions = JSON.parse(event.args.actionsJson);
                const timestamp = event.args.timestamp.toNumber();

                // Apply basic filters first
                if (filters.agentIds && !filters.agentIds.includes(agentId)) {
                    return;
                }

                if (filters.pluginNames) {
                    actions.forEach(action => {
                        if (filters.pluginNames.includes(action.pluginName)) {
                            allActions.push({
                                ...action,
                                agentId,
                                timestamp
                            });
                        }
                    });
                } else {
                    actions.forEach(action => {
                        allActions.push({
                            ...action,
                            agentId,
                            timestamp
                        });
                    });
                }
            });

            // Use advanced matching to rank actions
            const rankedActions = await ActionMatcher.rankActions(
                allActions,
                {
                    keywords: filters.keywords,
                    capabilities: filters.capabilities,
                    contextTerms: filters.contextTerms
                },
                filters.matchOptions
            );

            // Group by agent for response
            const agentActions = new Map();
            rankedActions.forEach(({ action, score }) => {
                const existing = agentActions.get(action.agentId) || {
                    actions: [],
                    timestamp: action.timestamp,
                    totalScore: 0,
                    matchCount: 0
                };

                existing.actions.push({
                    ...action,
                    matchScore: score
                });
                existing.totalScore += score.score;
                existing.matchCount++;

                agentActions.set(action.agentId, existing);
            });

            // Convert to final response format
            const discoveredActions = Array.from(agentActions.entries()).map(([agentId, data]) => ({
                agentId,
                actions: data.actions,
                lastUpdate: new Date(data.timestamp * 1000).toISOString(),
                averageMatchScore: data.totalScore / data.matchCount
            })).sort((a, b) => b.averageMatchScore - a.averageMatchScore);

            // Store discovery results
            const memoryManager = runtime.getMemoryManager("think_discoveries");
            await memoryManager.createMemory({
                id: crypto.randomUUID(),
                content: JSON.stringify({
                    discoveredActions,
                    appliedFilters: filters,
                    matchingStats: {
                        totalActionsProcessed: allActions.length,
                        matchedActions: rankedActions.length,
                        averageScore: rankedActions.reduce((sum, { score }) => 
                            sum + score.score, 0) / rankedActions.length,
                        topScore: rankedActions[0]?.score.score || 0,
                        matchedAgents: discoveredActions.length
                    }
                }),
                roomId: message.roomId,
                userId: runtime.agentId,
                timestamp: Date.now(),
                type: "think_discovery",
                metadata: {
                    agentCount: discoveredActions.length,
                    blockRange: `${fromBlock}-${toBlock}`,
                    filters: filters,
                    matchQuality: rankedActions[0]?.score.score || 0
                }
            });

            // Prepare human-readable response
            const topMatches = discoveredActions.slice(0, 3);
            const matchSummary = topMatches.map(agent => ({
                agentId: agent.agentId,
                topActions: agent.actions
                    .slice(0, 2)
                    .map(a => a.name)
                    .join(", "),
                matchScore: Math.round(agent.averageMatchScore * 100) + "%"
            }));

            const responseText = filters.keywords || filters.capabilities ?
                `Found ${discoveredActions.length} agents with matching actions (top match: ${matchSummary[0]?.matchScore} relevant). Top capabilities: ${matchSummary.map(m => m.topActions).join("; ")}` :
                `Found ${discoveredActions.length} agents with published actions on the network`;

            elizaLogger.log(`Discovery complete: ${discoveredActions.length} agents matched criteria`);

            if (callback) {
                callback({
                    text: responseText,
                    content: {
                        success: true,
                        agentCount: discoveredActions.length,
                        discoveries: discoveredActions,
                        appliedFilters: filters,
                        matchingStats: {
                            totalProcessed: allActions.length,
                            matched: rankedActions.length,
                            topScore: rankedActions.length > 0 ? rankedActions[0].score.score : 0
                        },
                        topMatches: matchSummary
                    },
                });
            }
            return true;

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            elizaLogger.error("Error discovering actions:", error);
            if (callback) {
                callback({
                    text: `Error discovering actions: ${errorMessage}`,
                    content: { error: errorMessage },
                });
            }
            return false;
        }
    },
    examples: JSON.stringify([
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Find agents that are good at market analysis and real-time trading",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Searching for market analysis and trading capabilities...",
                    action: "DISCOVER_ACTIONS",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Found 3 agents with matching actions (top match: 92% relevant). Top capabilities: MARKET_ANALYSIS, REALTIME_TRADING; PRICE_PREDICTION, PORTFOLIO_MANAGEMENT",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Show me agents that can help with both data processing and visualization",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Looking for agents with data processing and visualization capabilities...",
                    action: "DISCOVER_ACTIONS",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Found 2 agents with matching actions (top match: 87% relevant). Top capabilities: DATA_PROCESSING, DATA_VISUALIZATION; ANALYTICS_PIPELINE, CHART_GENERATION",
                },
            },
        ]
    ]) as unknown as ActionExample[][],
} satisfies Action;