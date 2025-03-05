import { Action, AgentRuntime } from '../types';
import { ThinkContractService } from '../services/contract-service';
import { EnvironmentManager } from '../environment';
import { ThinkAuthService } from '../services/auth-service';
import { ThinkRelayerService } from '../services/relayer-service';

/**
 * Creates actions for managing agent communication profiles
 * @param contractService The THINK contract service
 * @returns Array of communication-related actions
 */
export function createCommunicationActions(contractService: ThinkContractService): Action[] {
  return [
    // Set basic communication profile
    {
      name: 'think:setCommProfile',
      description: 'Set or update an agent\'s communication profile',
      execute: async (args: any, runtime: AgentRuntime) => {
        const { agentId, agentAddress, chainId, publicKey } = args;
        
        if (!agentId) {
          throw new Error('Agent ID is required');
        }
        
        runtime.logger.info(`Setting communication profile for agent ${agentId}`);
        
        await contractService.setCommProfile(
          Number(agentId),
          agentAddress || '',
          chainId || runtime.getSetting('CHAIN_ID'),
          publicKey || ''
        );
        
        return { success: true, message: 'Communication profile set successfully' };
      }
    },
    
    // Add skill to communication profile
    {
      name: 'think:addSkill',
      description: 'Add a skill to an agent\'s communication profile',
      execute: async (args: any, runtime: AgentRuntime) => {
        const {
          agentId,
          name,
          version,
          reputationScore,
          usageDescription,
          embeddings,
          feelingsTokenAddress,
          ratePerUse
        } = args;
        
        if (!agentId || !name) {
          throw new Error('Agent ID and skill name are required');
        }
        
        runtime.logger.info(`Adding skill '${name}' to agent ${agentId}`);
        
        const skillIndex = await contractService.addSkill(
          Number(agentId),
          {
            name,
            version: version || '1.0.0',
            reputationScore: Number(reputationScore || 0),
            usageDescription: usageDescription || '',
            embeddings: embeddings || [],
            rate: {
              feelingsTokenAddress: feelingsTokenAddress || '0x0000000000000000000000000000000000000000',
              ratePerUse: Number(ratePerUse || 0)
            }
          }
        );
        
        return {
          success: true,
          message: `Skill '${name}' added successfully`,
          skillIndex
        };
      }
    },
    
    // Get communication profile
    {
      name: 'think:getCommProfile',
      description: 'Get an agent\'s communication profile',
      execute: async (args: any, runtime: AgentRuntime) => {
        const { agentId } = args;
        
        if (!agentId) {
          throw new Error('Agent ID is required');
        }
        
        runtime.logger.info(`Getting communication profile for agent ${agentId}`);
        
        const profile = await contractService.getCommProfile(Number(agentId));
        
        if (!profile) {
          return {
            success: false,
            message: `No communication profile found for agent ${agentId}`
          };
        }
        
        return {
          success: true,
          profile
        };
      }
    },
    
    // Create a transaction for using a skill
    {
      name: 'think:createCommTransaction',
      description: 'Create a transaction for using an agent\'s skill',
      execute: async (args: any, runtime: AgentRuntime) => {
        const { agentId, skillIndex, amount } = args;
        
        // Client defaults to the signer's address
        const client = args.client || await contractService['signer']?.getAddress();
        
        if (!agentId || skillIndex === undefined || !amount) {
          throw new Error('Agent ID, skill index, and amount are required');
        }
        
        if (!client) {
          throw new Error('Client address is required or a signer must be provided');
        }
        
        runtime.logger.info(`Creating transaction for agent ${agentId}, skill ${skillIndex}`);
        
        // This calls the comm contract's createTransaction function
        // Note: The implementation will need to be updated to match the actual contract call once available
        // For now, this is a placeholder
        // const transactionId = await contractService.commContract.createTransaction(agentId, client, skillIndex, amount);
        
        // Placeholder return until we implement the actual call
        return {
          success: true,
          message: 'Transaction created successfully',
          transactionId: 0 // Will be replaced with actual transaction ID
        };
      }
    }
  ];
}

/**
 * Factory function to create communication actions
 * @param runtime The agent runtime
 * @returns Array of communication-related actions
 */
export function createCommunicationActionsFromRuntime(runtime: AgentRuntime): Action[] {
  const environmentManager = new EnvironmentManager(runtime);
  const config = environmentManager.getConfig();
  const authService = new ThinkAuthService(runtime);
  const relayerService = config.AUTH_MODE === 'jwt' && config.RELAYER_URL 
    ? new ThinkRelayerService(config.RELAYER_URL, authService, runtime) 
    : undefined;
  const contractService = new ThinkContractService(config, runtime, authService, relayerService);
  
  return createCommunicationActions(contractService);
} 