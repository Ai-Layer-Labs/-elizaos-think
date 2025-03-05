import { Action, AgentRuntime, AgentRegistration } from '../types';
import { ThinkContractService } from '../services/contract-service';
import { ThinkApiService } from '../services/api-service';
import { EnvironmentManager } from '../environment';
import { ThinkAuthService } from '../services/auth-service';
import { ThinkRelayerService } from '../services/relayer-service';

/**
 * Creates actions for managing THINK agents
 * @param contractService The THINK contract service
 * @param apiService The THINK API service
 * @returns Array of agent-related actions
 */
export function createAgentActions(
  contractService: ThinkContractService,
  apiService: ThinkApiService
): Action[] {
  return [
    // Get list of THINK agents from the blockchain
    {
      name: 'think:getAgentsOnChain',
      description: 'Get a list of THINK agents from the blockchain',
      execute: async (args: any, runtime: AgentRuntime) => {
        runtime.logger.info('Getting list of THINK agents from the blockchain');
        
        try {
          const agents = await contractService.getAgentList();
          
          return {
            success: true,
            agents,
            count: agents.length
          };
        } catch (error) {
          runtime.logger.error('Failed to get THINK agents from blockchain:', error);
          throw new Error('Failed to get THINK agents from blockchain');
        }
      }
    },
    
    // Get list of THINK agents from the API
    {
      name: 'think:getAgentsFromApi',
      description: 'Get a list of THINK agents from the API',
      execute: async (args: any, runtime: AgentRuntime) => {
        runtime.logger.info('Getting list of THINK agents from the API');
        
        try {
          const agents = await apiService.getAvailableAgents();
          
          return {
            success: true,
            agents,
            count: agents.length
          };
        } catch (error) {
          runtime.logger.error('Failed to get THINK agents from API:', error);
          throw new Error('Failed to get THINK agents from API');
        }
      }
    },
    
    // Register the plugin as a THINK agent
    {
      name: 'think:registerAsAgent',
      description: 'Register this ElizaOS plugin as a THINK agent',
      execute: async (args: any, runtime: AgentRuntime) => {
        const {
          agentId,
          name,
          description,
          skills = [],
          publicKey,
          apiEndpoint
        } = args;
        
        if (!agentId || !name) {
          throw new Error('Agent ID and name are required');
        }
        
        runtime.logger.info(`Registering agent ${name} (ID: ${agentId})`);
        
        // Create registration payload
        const registration: AgentRegistration = {
          agentId: Number(agentId),
          name,
          description: description || `THINK Agent powered by ElizaOS`,
          skills: Array.isArray(skills) ? skills : [],
          publicKey: publicKey || '',
          apiEndpoint: apiEndpoint || ''
        };
        
        try {
          const success = await apiService.registerAgent(registration);
          
          if (!success) {
            return {
              success: false,
              message: 'Agent registration failed'
            };
          }
          
          return {
            success: true,
            message: 'Agent registered successfully',
            registration
          };
        } catch (error) {
          runtime.logger.error('Failed to register agent:', error);
          throw new Error('Failed to register agent');
        }
      }
    }
  ];
}

/**
 * Factory function to create agent actions
 * @param runtime The agent runtime
 * @returns Array of agent-related actions
 */
export function createAgentActionsFromRuntime(runtime: AgentRuntime): Action[] {
  const environmentManager = new EnvironmentManager(runtime);
  const config = environmentManager.getConfig();
  const authService = new ThinkAuthService(runtime);
  const relayerService = config.AUTH_MODE === 'jwt' && config.RELAYER_URL 
    ? new ThinkRelayerService(config.RELAYER_URL, authService, runtime) 
    : undefined;
  const contractService = new ThinkContractService(config, runtime, authService, relayerService);
  const apiService = new ThinkApiService();
  
  return createAgentActions(contractService, apiService);
} 