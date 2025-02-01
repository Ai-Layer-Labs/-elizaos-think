import { elizaLogger } from "@elizaos/core";
import { ethers } from "ethers";
import { subtle } from 'crypto';

export interface KeyPair {
    publicKey: string;
    privateKey: string;
}

export class ThinkCrypto {
    private static ENCRYPTION_ALGORITHM = {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
    };

    private static SIGNATURE_ALGORITHM = {
        name: "ECDSA",
        namedCurve: "P-256",
        hash: { name: "SHA-256" },
    };

    /**
     * Generate a new key pair for an agent
     */
    static async generateKeyPair(): Promise<KeyPair> {
        try {
            const keyPair = await subtle.generateKey(
                this.ENCRYPTION_ALGORITHM,
                true,
                ["encrypt", "decrypt"]
            );

            const publicKey = await subtle.exportKey(
                "spki",
                keyPair.publicKey
            );
            const privateKey = await subtle.exportKey(
                "pkcs8",
                keyPair.privateKey
            );

            return {
                publicKey: Buffer.from(publicKey).toString('base64'),
                privateKey: Buffer.from(privateKey).toString('base64')
            };
        } catch (error) {
            elizaLogger.error("Error generating key pair:", error);
            throw error;
        }
    }

    /**
     * Create a handshake message to establish secure communication
     */
    static async createHandshake(
        senderPrivateKey: string,
        recipientPublicKey: string,
        sessionKey: string
    ): Promise<string> {
        try {
            // Import keys
            const privateKey = await subtle.importKey(
                "pkcs8",
                Buffer.from(senderPrivateKey, 'base64'),
                this.SIGNATURE_ALGORITHM,
                true,
                ["sign"]
            );

            const publicKey = await subtle.importKey(
                "spki",
                Buffer.from(recipientPublicKey, 'base64'),
                this.ENCRYPTION_ALGORITHM,
                true,
                ["encrypt"]
            );

            // Create handshake payload
            const handshakeData = {
                timestamp: Date.now(),
                sessionKey,
                type: "handshake"
            };

            // Sign the handshake
            const signature = await subtle.sign(
                this.SIGNATURE_ALGORITHM,
                privateKey,
                Buffer.from(JSON.stringify(handshakeData))
            );

            // Encrypt the payload with recipient's public key
            const encryptedData = await subtle.encrypt(
                this.ENCRYPTION_ALGORITHM,
                publicKey,
                Buffer.from(JSON.stringify({
                    ...handshakeData,
                    signature: Buffer.from(signature).toString('base64')
                }))
            );

            return Buffer.from(encryptedData).toString('base64');
        } catch (error) {
            elizaLogger.error("Error creating handshake:", error);
            throw error;
        }
    }

    /**
     * Verify and process a handshake message
     */
    static async verifyHandshake(
        recipientPrivateKey: string,
        senderPublicKey: string,
        encryptedHandshake: string
    ): Promise<{ sessionKey: string; timestamp: number }> {
        try {
            // Import keys
            const privateKey = await subtle.importKey(
                "pkcs8",
                Buffer.from(recipientPrivateKey, 'base64'),
                this.ENCRYPTION_ALGORITHM,
                true,
                ["decrypt"]
            );

            const verifyKey = await subtle.importKey(
                "spki",
                Buffer.from(senderPublicKey, 'base64'),
                this.SIGNATURE_ALGORITHM,
                true,
                ["verify"]
            );

            // Decrypt handshake
            const decryptedData = await subtle.decrypt(
                this.ENCRYPTION_ALGORITHM,
                privateKey,
                Buffer.from(encryptedHandshake, 'base64')
            );

            const handshakeData = JSON.parse(
                Buffer.from(decryptedData).toString()
            );

            // Verify signature
            const isValid = await subtle.verify(
                this.SIGNATURE_ALGORITHM,
                verifyKey,
                Buffer.from(handshakeData.signature, 'base64'),
                Buffer.from(JSON.stringify({
                    timestamp: handshakeData.timestamp,
                    sessionKey: handshakeData.sessionKey,
                    type: "handshake"
                }))
            );

            if (!isValid) {
                throw new Error("Invalid handshake signature");
            }

            return {
                sessionKey: handshakeData.sessionKey,
                timestamp: handshakeData.timestamp
            };
        } catch (error) {
            elizaLogger.error("Error verifying handshake:", error);
            throw error;
        }
    }

    /**
     * Encrypt a message using a session key
     */
    static async encryptMessage(
        message: string,
        sessionKey: string
    ): Promise<string> {
        try {
            const key = await subtle.importKey(
                "raw",
                Buffer.from(sessionKey, 'base64'),
                { name: "AES-GCM" },
                false,
                ["encrypt"]
            );

            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encryptedData = await subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv
                },
                key,
                Buffer.from(message)
            );

            return Buffer.from(JSON.stringify({
                iv: Buffer.from(iv).toString('base64'),
                data: Buffer.from(encryptedData).toString('base64')
            })).toString('base64');
        } catch (error) {
            elizaLogger.error("Error encrypting message:", error);
            throw error;
        }
    }

    /**
     * Decrypt a message using a session key
     */
    static async decryptMessage(
        encryptedMessage: string,
        sessionKey: string
    ): Promise<string> {
        try {
            const { iv, data } = JSON.parse(
                Buffer.from(encryptedMessage, 'base64').toString()
            );

            const key = await subtle.importKey(
                "raw",
                Buffer.from(sessionKey, 'base64'),
                { name: "AES-GCM" },
                false,
                ["decrypt"]
            );

            const decryptedData = await subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: Buffer.from(iv, 'base64')
                },
                key,
                Buffer.from(data, 'base64')
            );

            return Buffer.from(decryptedData).toString();
        } catch (error) {
            elizaLogger.error("Error decrypting message:", error);
            throw error;
        }
    }

    /**
     * Load keys from various sources (env, vault, etc.)
     */
    static async loadKeys(runtime: any): Promise<KeyPair> {
        // Try environment variables first
        let publicKey = runtime.getSetting("THINK_PUBLIC_KEY");
        let privateKey = runtime.getSetting("THINK_PRIVATE_KEY");

        if (publicKey && privateKey) {
            return { publicKey, privateKey };
        }

        // Try vault if configured
        const vaultService = runtime.getService("vault");
        if (vaultService) {
            try {
                const keys = await vaultService.getSecrets("think-keys");
                if (keys.publicKey && keys.privateKey) {
                    return keys;
                }
            } catch (error) {
                elizaLogger.warn("Could not load keys from vault:", error);
            }
        }

        // Generate new keys if none found
        elizaLogger.info("Generating new key pair");
        const newKeys = await this.generateKeyPair();

        // Store in vault if available
        if (vaultService) {
            try {
                await vaultService.setSecrets("think-keys", newKeys);
            } catch (error) {
                elizaLogger.warn("Could not store keys in vault:", error);
            }
        }

        return newKeys;
    }
}