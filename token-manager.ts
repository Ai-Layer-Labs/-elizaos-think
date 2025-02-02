import { elizaLogger } from "@elizaos/core";
import { Wallet, Token } from "@coinbase/coinbase-sdk";
import { CDPWalletManager } from './cdp-utils';

export interface TokenMetadata {
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
    owner: string;
    implementations?: string[];
    version?: string;
    lastUpdate?: number;
}

export interface TokenPermissions {
    canMint: boolean;
    canBurn: boolean;
    canPause: boolean;
    canUpgrade: boolean;
    allowsGaslessTransfers: boolean;
}

export class TokenManager {
    private walletManager: CDPWalletManager;
    private tokenCache: Map<string, TokenMetadata> = new Map();

    constructor() {
        this.walletManager = CDPWalletManager.getInstance();
    }

    async deployTokenWithFeatures(
        wallet: Wallet,
        params: {
            name: string;
            symbol: string;
            totalSupply: number;
            type: 'ERC20' | 'ERC721' | 'ERC1155';
            features: {
                mintable?: boolean;
                burnable?: boolean;
                pausable?: boolean;
                upgradeable?: boolean;
                gasless?: boolean;
            };
            metadata?: {
                baseURI?: string;
                contractURI?: string;
                version?: string;
            };
        }
    ) {
        try {
            // Deploy base token
            const token = await this.walletManager.deployToken(wallet, {
                name: params.name,
                symbol: params.symbol,
                totalSupply: params.totalSupply,
                type: params.type,
                metadata: params.metadata
            });

            // Store metadata
            const metadata: TokenMetadata = {
                name: params.name,
                symbol: params.symbol,
                decimals: 18, // Standard for ERC20
                totalSupply: params.totalSupply.toString(),
                owner: await wallet.getDefaultAddress(),
                version: params.metadata?.version || '1.0.0',
                lastUpdate: Date.now()
            };

            const permissions: TokenPermissions = {
                canMint: params.features.mintable || false,
                canBurn: params.features.burnable || false,
                canPause: params.features.pausable || false,
                canUpgrade: params.features.upgradeable || false,
                allowsGaslessTransfers: params.features.gasless || false
            };

            this.tokenCache.set(token.address, metadata);

            return {
                token,
                metadata,
                permissions
            };
        } catch (error) {
            elizaLogger.error("Error deploying token with features:", error);
            throw error;
        }
    }

    async setupTokenSwapPool(
        wallet: Wallet,
        params: {
            tokenA: string;
            tokenB: string;
            amountA: string;
            amountB: string;
        }
    ) {
        try {
            const trade = await wallet.createTrade({
                amount: params.amountA,
                fromAssetId: params.tokenA,
                toAssetId: params.tokenB
            });

            await trade.wait();
            return trade;
        } catch (error) {
            elizaLogger.error("Error setting up token swap pool:", error);
            throw error;
        }
    }

    async enableGaslessTransfers(
        wallet: Wallet,
        tokenAddress: string
    ) {
        try {
            // Invoke contract to enable gasless transfers
            await wallet.invokeContract({
                contractAddress: tokenAddress,
                method: "enableGaslessTransfers",
                args: {},
                abi: [
                    {
                        inputs: [],
                        name: "enableGaslessTransfers",
                        outputs: [],
                        stateMutability: "nonpayable",
                        type: "function"
                    }
                ]
            });

            // Update metadata
            const metadata = this.tokenCache.get(tokenAddress);
            if (metadata) {
                this.tokenCache.set(tokenAddress, {
                    ...metadata,
                    lastUpdate: Date.now()
                });
            }
        } catch (error) {
            elizaLogger.error("Error enabling gasless transfers:", error);
            throw error;
        }
    }

    async addTokenToRegistry(
        wallet: Wallet,
        tokenAddress: string,
        metadata?: TokenMetadata
    ) {
        try {
            const contractAbi = [
                {
                    inputs: [
                        { name: "tokenAddress", type: "address" },
                        { name: "metadata", type: "string" }
                    ],
                    name: "registerToken",
                    outputs: [],
                    stateMutability: "nonpayable",
                    type: "function"
                }
            ];

            await wallet.invokeContract({
                contractAddress: process.env.THINK_REGISTRY_ADDRESS || '',
                method: "registerToken",
                args: {
                    tokenAddress,
                    metadata: JSON.stringify(metadata)
                },
                abi: contractAbi
            });

            if (metadata) {
                this.tokenCache.set(tokenAddress, metadata);
            }
        } catch (error) {
            elizaLogger.error("Error adding token to registry:", error);
            throw error;
        }
    }

    async updateTokenMetadata(
        wallet: Wallet,
        tokenAddress: string,
        updates: Partial<TokenMetadata>
    ) {
        try {
            const currentMetadata = this.tokenCache.get(tokenAddress);
            if (!currentMetadata) {
                throw new Error("Token metadata not found");
            }

            const updatedMetadata = {
                ...currentMetadata,
                ...updates,
                lastUpdate: Date.now()
            };

            await this.addTokenToRegistry(wallet, tokenAddress, updatedMetadata);
            return updatedMetadata;
        } catch (error) {
            elizaLogger.error("Error updating token metadata:", error);
            throw error;
        }
    }

    async getTokenMetadata(tokenAddress: string): Promise<TokenMetadata | null> {
        return this.tokenCache.get(tokenAddress) || null;
    }

    async setupTokenVesting(
        wallet: Wallet,
        params: {
            tokenAddress: string;
            beneficiary: string;
            amount: string;
            vestingDuration: number;
            cliff: number;
        }
    ) {
        try {
            const vestingContractAbi = [
                {
                    inputs: [
                        { name: "token", type: "address" },
                        { name: "beneficiary", type: "address" },
                        { name: "amount", type: "uint256" },
                        { name: "duration", type: "uint256" },
                        { name: "cliff", type: "uint256" }
                    ],
                    name: "createVestingSchedule",
                    outputs: [],
                    stateMutability: "nonpayable",
                    type: "function"
                }
            ];

            await wallet.invokeContract({
                contractAddress: process.env.VESTING_CONTRACT_ADDRESS || '',
                method: "createVestingSchedule",
                args: {
                    token: params.tokenAddress,
                    beneficiary: params.beneficiary,
                    amount: params.amount,
                    duration: params.vestingDuration,
                    cliff: params.cliff
                },
                abi: vestingContractAbi
            });
        } catch (error) {
            elizaLogger.error("Error setting up token vesting:", error);
            throw error;
        }
    }

    async createTokenAirdrop(
        wallet: Wallet,
        params: {
            tokenAddress: string;
            recipients: string[];
            amounts: string[];
        }
    ) {
        try {
            // First approve airdrop contract
            const tokenAbi = [
                {
                    inputs: [
                        { name: "spender", type: "address" },
                        { name: "amount", type: "uint256" }
                    ],
                    name: "approve",
                    outputs: [{ name: "", type: "bool" }],
                    stateMutability: "nonpayable",
                    type: "function"
                }
            ];

            const totalAmount = params.amounts.reduce(
                (sum, amount) => sum + BigInt(amount),
                BigInt(0)
            );

            await wallet.invokeContract({
                contractAddress: params.tokenAddress