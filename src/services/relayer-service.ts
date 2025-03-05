import axios from 'axios';
import { ethers } from 'ethers';
import { ThinkAuthService } from './auth-service';
import { AgentRuntime } from '../types';
import { z } from 'zod';

/**
 * Schema for relayer transaction response
 */
export const RelayerResponseSchema = z.object({
  transaction_hash: z.string(),
  status: z.enum(['pending', 'confirmed', 'failed']),
  block_number: z.number().optional(),
  gas_used: z.number().optional(),
  error: z.string().optional()
});

export type RelayerResponse = z.infer<typeof RelayerResponseSchema>;

/**
 * Schema for transaction status response
 */
export const TransactionStatusSchema = z.object({
  transaction_hash: z.string(),
  status: z.enum(['pending', 'confirmed', 'failed']),
  block_number: z.number().optional(),
  confirmation_count: z.number().optional(),
  receipt: z.record(z.any()).optional()
});

export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

/**
 * Service to relay transactions to a THINK protocol backend
 */
export class ThinkRelayerService {
  private readonly relayerUrl: string;
  private readonly authService: ThinkAuthService;
  private readonly runtime: AgentRuntime;
  private readonly defaultGasLimit: number = 500000;
  private readonly pendingTransactions: Map<string, boolean> = new Map();

  constructor(
    relayerUrl: string,
    authService: ThinkAuthService,
    runtime: AgentRuntime
  ) {
    this.relayerUrl = relayerUrl;
    this.authService = authService;
    this.runtime = runtime;
  }

  /**
   * Submit a transaction to the relayer service
   */
  async submitTransaction(
    to: string,
    data: string,
    value: string = '0',
    gasLimit: number = this.defaultGasLimit
  ): Promise<RelayerResponse> {
    try {
      // Get auth headers
      const headers = await this.authService.getAuthHeaders();

      // Prepare transaction request
      const transactionRequest = {
        to,
        data,
        value,
        gas_limit: gasLimit
      };

      // Submit to relayer
      this.runtime.logger.debug('Submitting transaction to relayer', { to, gasLimit });
      const response = await axios.post(
        `${this.relayerUrl}/transactions`, 
        transactionRequest,
        { headers }
      );

      const relayerResponse = RelayerResponseSchema.parse(response.data);
      this.pendingTransactions.set(relayerResponse.transaction_hash, true);
      
      this.runtime.logger.info('Transaction submitted to relayer', { 
        hash: relayerResponse.transaction_hash, 
        status: relayerResponse.status 
      });
      
      return relayerResponse;
    } catch (error) {
      this.runtime.logger.error('Failed to submit transaction to relayer', error);
      throw new Error(`Transaction submission failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the status of a transaction
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    try {
      // Get auth headers
      const headers = await this.authService.getAuthHeaders();

      // Get transaction status
      const response = await axios.get(
        `${this.relayerUrl}/transactions/${txHash}`,
        { headers }
      );

      return TransactionStatusSchema.parse(response.data);
    } catch (error) {
      this.runtime.logger.error('Failed to get transaction status', error);
      throw new Error(`Transaction status check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Wait for a transaction to be confirmed
   */
  async waitForTransaction(txHash: string, confirmations: number = 1): Promise<TransactionStatus> {
    let attempts = 0;
    const maxAttempts = 20;
    const interval = 3000; // 3 seconds

    while (attempts < maxAttempts) {
      const status = await this.getTransactionStatus(txHash);
      
      if (status.status === 'confirmed' && 
          (status.confirmation_count || 0) >= confirmations) {
        this.pendingTransactions.delete(txHash);
        return status;
      }
      
      if (status.status === 'failed') {
        this.pendingTransactions.delete(txHash);
        throw new Error(`Transaction failed: ${status.receipt?.error || 'Unknown error'}`);
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Transaction ${txHash} not confirmed after ${maxAttempts} attempts`);
  }

  /**
   * Call a contract method using the relayer
   */
  async callContractMethod(
    contract: ethers.Contract,
    methodName: string,
    args: any[],
    options: { value?: string; gasLimit?: number } = {}
  ): Promise<string> {
    try {
      // Get function data for the method call
      const data = contract.interface.encodeFunctionData(methodName, args);
      const value = options.value || '0';
      const gasLimit = options.gasLimit || this.defaultGasLimit;
      
      // Submit transaction
      const response = await this.submitTransaction(
        contract.target as string,
        data,
        value,
        gasLimit
      );
      
      // Wait for transaction to be confirmed
      await this.waitForTransaction(response.transaction_hash);
      
      return response.transaction_hash;
    } catch (error) {
      this.runtime.logger.error(`Failed to call contract method ${methodName}`, error);
      throw new Error(`Contract method call failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 