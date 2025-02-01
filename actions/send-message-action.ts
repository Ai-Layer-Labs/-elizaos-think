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
import { ThinkCrypto } from './crypto-utils';

interface MessageContent extends Content {
    recipientId: string;
    message: string;
    isEncrypted: boolean;
    metadata?: {
        type?: string;
        priority?: number;
        replyTo?: string;
        tags?: string[];
    };
}

interface SessionInfo {
    recipientId: string;
    sessionKey: string;
    established: number;
    lastUsed: number;
}

function isMessageContent(content: any): content is MessageContent {
    elizaLogger.log("Content for sendMessage", content);
    return typeof content.recipientId === "string" &&
           typeof content.message === "string" &&
           typeof content.isEncrypted === "boolean" &&
           (!content.metadata || typeof content.metadata === "object");
}

export default {
    name: "SEND_THINK_MESSAGE",
    // ... previous similes and validation ...

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting SEND_THINK_MESSAGE handler with encryption...");

        try {
            // Load our keys
            const keys = await ThinkCrypto.loadKeys(runtime);

            // Get or generate message content
            const content = await generateMessageContent(runtime, message, state);
            if (!isMessageContent(content)) {
                throw new Error("Invalid message content");
            }

            // Check for existing session or establish new one
            const sessionManager = runtime.getMemoryManager("think_sessions");
            let session = await findExistingSession(sessionManager, content.recipientId);

            if (!session || isSessionExpired(session)) {
                session = await establishNewSession(
                    runtime,
                    sessionManager,
                    content.recipientId,
                    keys
                );
            }

            // Prepare and encrypt message
            const encryptedMessage = await ThinkCrypto.encryptMessage(
                JSON.stringify({
                    content: content.message,
                    metadata: content.metadata,
                    timestamp: Date.now()
                }),
                session.sessionKey
            );

            // Send through THINK protocol
            const { contract, tx } = await sendThroughProtocol(
                runtime,
                content.recipientId,
                encryptedMessage,
                session
            );

            // Update session last used time
            await updateSession(sessionManager, session);

            // Store in memory system
            await storeMessage(runtime, content, tx, session);

            // Generate user feedback
            const feedback = await generateFeedback(runtime, content, tx.hash);
            
            if (callback) {
                callback({
                    text: feedback,
                    content: {
                        success: true,
                        txHash: tx.hash,
                        message: {
                            recipientId: content.recipientId,
                            encrypted: true,
                            metadata: content.metadata
                        }
                    },
                });
            }
            return true;

        } catch (error) {
            elizaLogger.error("Error sending encrypted message:", error);
            if (callback) {
                callback({
                    text: `Error sending message: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    // ... previous examples ...
} satisfies Action;

// Helper functions

async function generateMessageContent(
    runtime: IAgentRuntime,
    message: Memory,
    state: State
): Promise<MessageContent> {
    if (!state) {
        state = await runtime.composeState(message);
    } else {
        state = await runtime.updateRecentMessageState(state);
    }

    const messageContext = composeContext({
        state,
        template: messageTemplate,
    });

    return await generateObjectDeprecated({
        runtime,
        context: messageContext,
        modelClass: ModelClass.LARGE,
    });
}

async function findExistingSession(
    sessionManager: any,
    recipientId: string
): Promise<SessionInfo | null> {
    const sessions = await sessionManager.getMemories({
        recipientId,
        type: "session",
        count: 1
    });

    if (sessions.length > 0) {
        return JSON.parse(sessions[0].content);
    }
    return null;
}

function isSessionExpired(session: SessionInfo): boolean {
    const SESSION_TIMEOUT = 1000 * 60 * 60; // 1 hour
    return Date.now() - session.lastUsed > SESSION_TIMEOUT;
}

async function establishNewSession(
    runtime: any,
    sessionManager: any,
    recipientId: string,
    keys: { publicKey: string; privateKey: string }
): Promise<SessionInfo> {
    // Get recipient's public key from THINK network
    const contract = getThinkContract(runtime);
    const recipientKey = await contract.getAgentPublicKey(recipientId);

    // Generate session key and handshake
    const sessionKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    const handshake = await ThinkCrypto.createHandshake(
        keys.privateKey,
        recipientKey,
        sessionKey
    );

    // Send handshake through THINK network
    const tx = await contract.sendHandshake(recipientId, handshake);
    await tx.wait();

    // Store session
    const session: SessionInfo = {
        recipientId,
        sessionKey,
        established: Date.now(),
        lastUsed: Date.now()
    };

    await sessionManager.createMemory({
        id: crypto.randomUUID(),
        content: JSON.stringify(session),
        type: "session",
        metadata: { recipientId }
    });

    return session;
}

function getThinkContract(runtime: any) {
    const provider = new ethers.providers.JsonRpcProvider(
        runtime.getSetting("THINK_RPC_URL")
    );
    const signer = new ethers.Wallet(
        runtime.