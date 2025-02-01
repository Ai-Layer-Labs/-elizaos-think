import { elizaLogger } from "@elizaos/core";
import { ethers } from "ethers";

export interface GasStrategy {
    type: 'fastest' | 'fast' | 'standard' | 'economy';
    maxWaitTime?: number; // in seconds
    priorityMultiplier?: number;
}

export interface TransactionStatus {
    hash: string;
    status: 'pending' | 'confirmed' | 'failed';
    confirmations: number;
    blockNumber?: number;
    gasUsed?: string;
    effectiveGasPrice?: string;
    receipt?: ethers.providers.TransactionReceipt;
}

export class TransactionUtils {
    private static readonly CONFIRMATION_BLOCKS = 3;
    private static readonly GAS_PRICE_REFRESH_INTERVAL = 10000; // 10 seconds
    private static readonly MAX_GAS_PRICE_AGE = 30000; // 30 seconds
    
    private static lastGasPriceUpdate: number = 0;
    private static cachedGasPrices: any = null;

    /**
     * Broadcast a signed transaction to the network
     */
    static async broadcastTransaction(
        provider: ethers.providers.JsonRpcProvider,
        signedTx: string
    ): Promise<string> {
        try {
            const tx = await provider.sendTransaction(signedTx);
            elizaLogger.info(`Transaction broadcast: ${tx.hash}`);
            return tx.hash;
        } catch (error) {
            elizaLogger.error("Error broadcasting transaction:", error);
            throw error;
        }
    }

    /**
     * Monitor transaction status and return updates
     */
    static async monitorTransaction(
        provider: ethers.providers.JsonRpcProvider,
        txHash: string,
        callback?: (status: TransactionStatus) => void
    ): Promise<TransactionStatus> {
        try {
            const status: TransactionStatus = {
                hash: txHash,
                status: 'pending',
                confirmations: 0
            };

            // Initial check
            const tx = await provider.getTransaction(txHash);
            if (!tx) {
                throw new Error('Transaction not found');
            }

            // Wait for confirmation
            const receipt = await tx.wait(this.CONFIRMATION_BLOCKS);
            
            status.status = receipt.status === 1 ? 'confirmed' : 'failed';
            status.confirmations = await provider.getBlockNumber() - receipt.blockNumber + 1;
            status.blockNumber = receipt.blockNumber;
            status.gasUsed = receipt.gasUsed.toString();
            status.effectiveGasPrice = receipt.effectiveGasPrice.toString();
            status.receipt = receipt;

            if (callback) {
                callback(status);
            }

            return status;
        } catch (error) {
            elizaLogger.error(`Error monitoring transaction ${txHash}:`, error);
            throw error;
        }
    }

    /**
     * Parse and validate contract ABI
     */
    static parseContractABI(
        abi: string | any[]
    ): ethers.utils.Interface {
        try {
            // Handle string ABI
            if (typeof abi === 'string') {
                abi = JSON.parse(abi);
            }

            // Create and validate interface
            const interface = new ethers.utils.Interface(abi);
            
            // Log available functions
            const functions = Object.values(interface.functions).map(f => f.format());
            elizaLogger.info("Available contract functions:", functions);

            return interface;
        } catch (error) {
            elizaLogger.error("Error parsing contract ABI:", error);
            throw error;
        }
    }

    /**
     * Optimize gas price based on desired strategy
     */
    static async optimizeGasPrice(
        provider: ethers.providers.JsonRpcProvider,
        strategy: GasStrategy = { type: 'standard' }
    ): Promise<{
        maxFeePerGas: ethers.BigNumber;
        maxPriorityFeePerGas: ethers.BigNumber;
    }> {
        try {
            const gasPrices = await this.getGasPrices(provider);
            
            // Apply strategy multipliers
            const multipliers = {
                fastest: 2.0,
                fast: 1.5,
                standard: 1.0,
                economy: 0.8
            };

            const priorityMultiplier = strategy.priorityMultiplier || 
                multipliers[strategy.type];

            const baseFee = gasPrices.baseFeePerGas;
            const priorityFee = gasPrices.maxPriorityFeePerGas
                .mul(Math.floor(priorityMultiplier * 100))
                .div(100);

            // Calculate max fee based on strategy
            const maxFee = baseFee
                .mul(2) // Account for base fee variance
                .add(priorityFee);

            return {
                maxFeePerGas: maxFee,
                maxPriorityFeePerGas: priorityFee
            };
        } catch (error) {
            elizaLogger.error("Error optimizing gas price:", error);
            throw error;
        }
    }

    /**
     * Get current gas prices with caching
     */
    private static async getGasPrices(
        provider: ethers.providers.JsonRpcProvider
    ): Promise<{
        baseFeePerGas: ethers.BigNumber;
        maxPriorityFeePerGas: ethers.BigNumber;
    }> {
        const now = Date.now();

        // Return cached values if fresh
        if (this.cachedGasPrices && 
            now - this.lastGasPriceUpdate < this.MAX_GAS_PRICE_AGE) {
            return this.cachedGasPrices;
        }

        // Get fresh gas prices
        const [block, feeData] = await Promise.all([
            provider.getBlock('latest'),
            provider.getFeeData()
        ]);

        this.cachedGasPrices = {
            baseFeePerGas: block.baseFeePerGas || ethers.BigNumber.from(0),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 
                ethers.BigNumber.from('1500000000') // 1.5 gwei fallback
        };
        
        this.lastGasPriceUpdate = now;
        return this.cachedGasPrices;
    }

    /**
     * Estimate gas limit for a transaction with safety margin
     */
    static async estimateGasLimit(
        provider: ethers.providers.JsonRpcProvider,
        tx: {
            to: string;
            from?: string;
            data?: string;
            value?: string | ethers.BigNumber;
        }
    ): Promise<ethers.BigNumber> {
        try {
            const estimate = await provider.estimateGas(tx);
            
            // Add 20% safety margin
            return estimate.mul(120).div(100);
        } catch (error) {
            elizaLogger.error("Error estimating gas limit:", error);
            throw error;
        }
    }
}