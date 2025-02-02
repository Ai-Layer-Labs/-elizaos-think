import { elizaLogger } from "@elizaos/core";
import { Coinbase, Wallet, Token } from "@coinbase/coinbase-sdk";
import { ThinkCrypto } from './crypto-utils';

export interface WalletConfig {
    networkId?: string;
    initialBalance?: number;
    isSponsored?: boolean;
}

export class CDPWalletManager {
    private static instance: CDPWalletManager;
    private walletCache: Map<string, Wallet> = new Map();

    private constructor() {
        // Private constructor for singleton
    }

    static getInstance(): CDPWalletManager {
        if (!this.instance) {
            this.instance = new CDPWalletManager();
        }
        return this.instance;
    }

    async initialize(apiKeyPath: string) {
        try {
            await Coinbase.configureFromJson({ filePath: apiKeyPath });
            elizaLogger.info("CDP initialized successfully");
        } catch (error) {
            elizaLogger.error("Error initializing CDP:", error);
            throw error;
        }
    }

    async createWallet(config?: WalletConfig): Promise<Wallet> {
        try {
            const wallet = await Wallet.create({
                networkId: config?.networkId || "base-sepolia",
            });

            // If initial balance is specified and on testnet, request from faucet
            if (config?.initialBalance && config.networkId === "base-sepolia") {
                await wallet.faucet();
            }

            this.walletCache.set(await wallet.getDefaultAddress(), wallet);
            return wallet;
        } catch (error) {
            elizaLogger.error("Error creating wallet:", error);
            throw error;
        }
    }

    async importWallet(exportedData: any): Promise<Wallet> {
        try {
            const wallet = await Wallet.import(exportedData);
            this.walletCache.set(await wallet.getDefaultAddress(), wallet);
            return wallet;
        } catch (error) {
            elizaLogger.error("Error importing wallet:", error);
            throw error;
        }
    }

    async deployToken(
        wallet: Wallet,
        params: {
            name: string;
            symbol: string;
            totalSupply: number;
            type: 'ERC20' | 'ERC721' | 'ERC1155';
            metadata?: {
                baseURI?: string;
                contractURI?: string;
            };
        }
    ): Promise<any> {
        try {
            switch (params.type) {
                case 'ERC20':
                    return await wallet.deployToken({
                        name: params.name,
                        symbol: params.symbol,
                        totalSupply: params.totalSupply
                    });

                case 'ERC721':
                    return await wallet.deployNFT({
                        name: params.name,
                        symbol: params.symbol,
                        baseURI: params.metadata?.baseURI || ''
                    });

                case 'ERC1155':
                    return await wallet.deployMultiToken({
                        uri: params.metadata?.baseURI || ''
                    });

                default:
                    throw new Error(`Unsupported token type: ${params.type}`);
            }
        } catch (error) {
            elizaLogger.error("Error deploying token:", error);
            throw error;
        }
    }

    async getTokenList(wallet: Wallet): Promise<Token[]> {
        try {
            const tokens = await wallet.listTokens();
            return tokens;
        } catch (error) {
            elizaLogger.error("Error getting token list:", error);
            throw error;
        }
    }

    async getTokenBalance(wallet: Wallet, tokenAddress: string): Promise<string> {
        try {
            const balance = await wallet.getBalance(tokenAddress);
            return balance.toString();
        } catch (error) {
            elizaLogger.error("Error getting token balance:", error);
            throw error;
        }
    }

    async createTransfer(
        wallet: Wallet,
        params: {
            tokenAddress: string;
            amount: string;
            recipient: string;
            isGasless?: boolean;
        }
    ) {
        try {
            const transfer = await wallet.createTransfer({
                amount: params.amount,
                assetId: params.tokenAddress,
                destination: params.recipient,
                gasless: params.isGasless || false
            });

            await transfer.wait();
            return transfer;
        } catch (error) {
            elizaLogger.error("Error creating transfer:", error);
            throw error;
        }
    }

    async signMessage(wallet: Wallet, message: string) {
        try {
            const { hashMessage } = await import("@coinbase/coinbase-sdk");
            const signature = await wallet.createPayloadSignature(hashMessage(message));
            await signature.wait();
            return signature.toString();
        } catch (error) {
            elizaLogger.error("Error signing message:", error);
            throw error;
        }
    }

    async signTypedData(
        wallet: Wallet,
        domain: any,
        types: any,
        value: any
    ) {
        try {
            const { hashTypedData } = await import("@coinbase/coinbase-sdk");
            const signature = await wallet.createPayloadSignature(
                hashTypedData({
                    domain,
                    types,
                    primaryType: Object.keys(types)[0],
                    message: value
                })
            );
            await signature.wait();
            return signature.toString();
        } catch (error) {
            elizaLogger.error("Error signing typed data:", error);
            throw error;
        }
    }

    // Integration with existing ThinkCrypto
    async generateThinkCredentials(wallet: Wallet): Promise<{
        walletAddress: string;
        thinkKeys: any;
    }> {
        try {
            const address = await wallet.getDefaultAddress();
            const thinkKeys = await ThinkCrypto.generateKeyPair();

            return {
                walletAddress: address,
                thinkKeys
            };
        } catch (error) {
            elizaLogger.error("Error generating Think credentials:", error);
            throw error;
        }
    }
}