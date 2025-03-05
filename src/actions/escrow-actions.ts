import { Action, AgentRuntime } from '../types';
import { ThinkContractService } from '../services/contract-service';
import { EnvironmentManager } from '../environment';
import { ThinkAuthService } from '../services/auth-service';
import { ThinkRelayerService } from '../services/relayer-service';

/**
 * Creates actions for managing escrow transactions
 * @param contractService The THINK contract service
 * @returns Array of escrow-related actions
 */
export function createEscrowActions(contractService: ThinkContractService): Action[] {
  return [
    // Create an escrow transaction
    {
      name: 'think:createEscrowTransaction',
      description: 'Create a new escrow transaction between a client and provider',
      execute: async (args: any, runtime: AgentRuntime) => {
        const { client, provider, token, amount } = args;
        
        if (!client || !provider || !token || !amount) {
          throw new Error('Client address, provider address, token address, and amount are required');
        }
        
        runtime.logger.info(`Creating escrow transaction: ${client} -> ${provider} (${amount} tokens)`);
        
        try {
          const transactionId = await contractService.createEscrowTransaction(
            client,
            provider,
            token,
            Number(amount)
          );
          
          return {
            success: true,
            message: 'Escrow transaction created successfully',
            transactionId
          };
        } catch (error) {
          runtime.logger.error('Failed to create escrow transaction:', error);
          throw new Error('Failed to create escrow transaction');
        }
      }
    },
    
    // Get escrow transaction details
    {
      name: 'think:getEscrowTransaction',
      description: 'Get details of an escrow transaction',
      execute: async (args: any, runtime: AgentRuntime) => {
        const { transactionId } = args;
        
        if (!transactionId) {
          throw new Error('Transaction ID is required');
        }
        
        runtime.logger.info(`Getting details for escrow transaction ${transactionId}`);
        
        try {
          const transaction = await contractService.getEscrowTransaction(Number(transactionId));
          
          return {
            success: true,
            transaction
          };
        } catch (error) {
          runtime.logger.error(`Failed to get escrow transaction ${transactionId}:`, error);
          throw new Error('Failed to get escrow transaction');
        }
      }
    },
    
    // Deposit payment into escrow
    {
      name: 'think:depositPayment',
      description: 'Deposit payment into escrow for a transaction',
      execute: async (args: any, runtime: AgentRuntime) => {
        const { transactionId } = args;
        
        if (!transactionId) {
          throw new Error('Transaction ID is required');
        }
        
        runtime.logger.info(`Depositing payment for escrow transaction ${transactionId}`);
        
        try {
          await contractService.depositPayment(Number(transactionId));
          
          return {
            success: true,
            message: 'Payment deposited successfully'
          };
        } catch (error) {
          runtime.logger.error(`Failed to deposit payment for transaction ${transactionId}:`, error);
          throw new Error('Failed to deposit payment');
        }
      }
    },
    
    // Mark service as delivered
    {
      name: 'think:deliverService',
      description: 'Mark an escrow transaction\'s service as delivered',
      execute: async (args: any, runtime: AgentRuntime) => {
        const { transactionId } = args;
        
        if (!transactionId) {
          throw new Error('Transaction ID is required');
        }
        
        runtime.logger.info(`Marking service as delivered for escrow transaction ${transactionId}`);
        
        try {
          await contractService.deliverService(Number(transactionId));
          
          return {
            success: true,
            message: 'Service marked as delivered'
          };
        } catch (error) {
          runtime.logger.error(`Failed to mark service as delivered for transaction ${transactionId}:`, error);
          throw new Error('Failed to mark service as delivered');
        }
      }
    },
    
    // Release payment to provider
    {
      name: 'think:releasePayment',
      description: 'Release escrowed payment to the provider after service delivery',
      execute: async (args: any, runtime: AgentRuntime) => {
        const { transactionId } = args;
        
        if (!transactionId) {
          throw new Error('Transaction ID is required');
        }
        
        runtime.logger.info(`Releasing payment for escrow transaction ${transactionId}`);
        
        try {
          await contractService.releasePayment(Number(transactionId));
          
          return {
            success: true,
            message: 'Payment released successfully'
          };
        } catch (error) {
          runtime.logger.error(`Failed to release payment for transaction ${transactionId}:`, error);
          throw new Error('Failed to release payment');
        }
      }
    },
    
    // Dispute a transaction
    {
      name: 'think:disputeTransaction',
      description: 'Dispute an active escrow transaction',
      execute: async (args: any, runtime: AgentRuntime) => {
        const { transactionId } = args;
        
        if (!transactionId) {
          throw new Error('Transaction ID is required');
        }
        
        runtime.logger.info(`Disputing escrow transaction ${transactionId}`);
        
        try {
          await contractService.disputeTransaction(Number(transactionId));
          
          return {
            success: true,
            message: 'Transaction disputed successfully'
          };
        } catch (error) {
          runtime.logger.error(`Failed to dispute transaction ${transactionId}:`, error);
          throw new Error('Failed to dispute transaction');
        }
      }
    }
  ];
}

/**
 * Factory function to create escrow actions
 * @param runtime The agent runtime
 * @returns Array of escrow-related actions
 */
export function createEscrowActionsFromRuntime(runtime: AgentRuntime): Action[] {
  const environmentManager = new EnvironmentManager(runtime);
  const config = environmentManager.getConfig();
  const authService = new ThinkAuthService(runtime);
  const relayerService = config.AUTH_MODE === 'jwt' && config.RELAYER_URL 
    ? new ThinkRelayerService(config.RELAYER_URL, authService, runtime) 
    : undefined;
  const contractService = new ThinkContractService(config, runtime, authService, relayerService);
  
  return createEscrowActions(contractService);
} 