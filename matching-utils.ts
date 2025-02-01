import { elizaLogger } from "@elizaos/core";

export interface MatchScore {
    score: number;
    matches: {
        name?: number;
        description?: number;
        similes?: number;
        capabilities?: number;
    };
}

export class ActionMatcher {
    // Levenshtein distance for fuzzy string matching
    private static levenshteinDistance(a: string, b: string): number {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = Array(b.length + 1).fill(null).map(() => 
            Array(a.length + 1).fill(null)
        );

        for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + cost
                );
            }
        }

        return matrix[b.length][a.length];
    }

    // Jaccard similarity for comparing sets of words
    private static jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }

    // Semantic word similarity using word embeddings
    private static async getWordSimilarity(word1: string, word2: string): Promise<number> {
        // This would ideally use a proper word embedding model
        // For now, using a simpler approach based on common prefixes and word length
        const prefix = this.longestCommonPrefix(word1.toLowerCase(), word2.toLowerCase());
        const maxLength = Math.max(word1.length, word2.length);
        return prefix.length / maxLength;
    }

    private static longestCommonPrefix(str1: string, str2: string): string {
        let i = 0;
        while (i < str1.length && i < str2.length && str1[i] === str2[i]) i++;
        return str1.substring(0, i);
    }

    // Extract key terms from text
    private static extractKeyTerms(text: string): Set<string> {
        return new Set(
            text.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(word => word.length > 2)
        );
    }

    // Calculate capability similarity
    private static async calculateCapabilitySimilarity(
        actionCapabilities: string[],
        queryCapabilities: string[]
    ): Promise<number> {
        let totalSimilarity = 0;
        let matches = 0;

        for (const queryCap of queryCapabilities) {
            let bestMatch = 0;
            for (const actionCap of actionCapabilities) {
                const similarity = await this.getWordSimilarity(queryCap, actionCap);
                bestMatch = Math.max(bestMatch, similarity);
            }
            if (bestMatch > 0.7) { // Threshold for considering it a match
                totalSimilarity += bestMatch;
                matches++;
            }
        }

        return matches > 0 ? totalSimilarity / matches : 0;
    }

    // Main matching function
    public static async calculateMatchScore(
        action: any,
        query: {
            keywords?: string[];
            capabilities?: string[];
            contextTerms?: string[];
        }
    ): Promise<MatchScore> {
        const scores: MatchScore = {
            score: 0,
            matches: {}
        };

        try {
            // Name matching
            if (query.keywords?.length > 0) {
                const nameTerms = this.extractKeyTerms(action.name);
                const queryTerms = new Set(query.keywords.map(k => k.toLowerCase()));
                scores.matches.name = this.jaccardSimilarity(nameTerms, queryTerms);
            }

            // Description matching
            if (query.keywords?.length > 0) {
                const descTerms = this.extractKeyTerms(action.description);
                const queryTerms = new Set(query.keywords.map(k => k.toLowerCase()));
                scores.matches.description = this.jaccardSimilarity(descTerms, queryTerms) * 0.8; // Slightly lower weight
            }

            // Similes matching
            if (query.keywords?.length > 0 && action.similes?.length > 0) {
                const simileTerms = this.extractKeyTerms(action.similes.join(' '));
                const queryTerms = new Set(query.keywords.map(k => k.toLowerCase()));
                scores.matches.similes = this.jaccardSimilarity(simileTerms, queryTerms) * 0.6; // Lower weight
            }

            // Capability matching
            if (query.capabilities?.length > 0) {
                const actionCapabilities = action.capabilities || 
                    this.extractKeyTerms(action.description + ' ' + action.name);
                scores.matches.capabilities = await this.calculateCapabilitySimilarity(
                    Array.from(actionCapabilities),
                    query.capabilities
                );
            }

            // Calculate final score
            const weights = {
                name: 0.4,
                description: 0.3,
                similes: 0.1,
                capabilities: 0.2
            };

            scores.score = Object.entries(scores.matches).reduce((sum, [key, value]) => {
                return sum + (value * weights[key]);
            }, 0);

        } catch (error) {
            elizaLogger.error("Error calculating match score:", error);
            scores.score = 0;
        }

        return scores;
    }

    // Batch process actions with scoring
    public static async rankActions(
        actions: any[],
        query: {
            keywords?: string[];
            capabilities?: string[];
            contextTerms?: string[];
        },
        options: {
            minScore?: number;
            maxResults?: number;
        } = {}
    ): Promise<Array<{ action: any; score: MatchScore }>> {
        const { minScore = 0.3, maxResults = 50 } = options;

        const scoredActions = await Promise.all(
            actions.map(async action => ({
                action,
                score: await this.calculateMatchScore(action, query)
            }))
        );

        return scoredActions
            .filter(({ score }) => score.score >= minScore)
            .sort((a, b) => b.score.score - a.score.score)
            .slice(0, maxResults);
    }
}
