import { Plugin, Action, AgentRuntime } from './types';
import { ThinkPluginConfig, EnvironmentManager } from './environment';
import { ThinkContractService } from './services/contract-service';
import { ThinkApiService } from './services/api-service';
import { ActionRegistry } from './services/action-registry';
import { ThinkAuthService, AuthMode, JwtAuthConfig } from './services/auth-service';
import { ThinkRelayerService } from './services/relayer-service';

import { 
  createCommunicationActions,
  createCommunicationActionsFromRuntime 
} from './actions/communication-actions';
import { 
  createEscrowActions,
  createEscrowActionsFromRuntime
} from './actions/escrow-actions';
import { 
  createAgentActions,
  createAgentActionsFromRuntime 
} from './actions/agent-actions';

/**
 * Main plugin class for the THINK Protocol integration
 */
class ThinkProtocolPlugin implements Plugin {
  name = 'think';
  description = 'THINK Protocol integration for ElizaOS';

  // Services
  private actionRegistry: ActionRegistry = new ActionRegistry();
  private environmentManager?: EnvironmentManager;
  private authService?: ThinkAuthService;
  private relayerService?: ThinkRelayerService;
  private contractService?: ThinkContractService;
  private apiService?: ThinkApiService;

  // Plugin actions
  actions: Action[] = [];

  /**
   * Initialize the plugin with the provided runtime
   */
  async initialize(runtime: AgentRuntime): Promise<void> {
    try {
      runtime.logger.info('Initializing THINK Protocol plugin');
      
      // Initialize environment manager
      this.environmentManager = new EnvironmentManager(runtime);
      
      // Get configuration
      const config = this.environmentManager.getConfig();
      
      // Initialize auth service
      this.authService = new ThinkAuthService(runtime);
      
      // Set up authentication based on config
      await this.setupAuthentication(runtime, config);
      
      // Set up relayer service if using JWT auth
      if (this.environmentManager.hasValidRelayerConfig(config) && 
          config.AUTH_MODE === 'jwt' && 
          config.RELAYER_URL) {
        this.relayerService = new ThinkRelayerService(
          config.RELAYER_URL,
          this.authService,
          runtime
        );
      }
      
      // Initialize contract service
      this.contractService = new ThinkContractService(
        config,
        runtime,
        this.authService,
        this.relayerService
      );
      
      // Initialize API service
      this.apiService = new ThinkApiService();
      
      // Initialize action registry
      await this.actionRegistry.collectActions(runtime);
      
      // Create plugin actions
      if (this.contractService && this.apiService) {
        this.actions = this.getThinkActions();
      }
      
      runtime.logger.info('THINK Protocol plugin initialized successfully');
    } catch (error) {
      runtime.logger.error('Failed to initialize THINK Protocol plugin', error);
      throw new Error(`Failed to initialize THINK Protocol plugin: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Set up authentication based on config
   */
  private async setupAuthentication(runtime: AgentRuntime, config: ThinkPluginConfig): Promise<void> {
    if (!this.authService) {
      throw new Error('Auth service not initialized');
    }
    
    if (config.AUTH_MODE === 'jwt') {
      // Set up JWT authentication
      if (this.environmentManager?.hasValidJwtConfig(config)) {
        const jwtConfig: JwtAuthConfig = {
          auth_url: config.JWT_AUTH_URL!,
          client_id: config.JWT_CLIENT_ID!,
          client_secret: config.JWT_CLIENT_SECRET,
          username: config.JWT_USERNAME,
          password: config.JWT_PASSWORD,
          refresh_token: config.JWT_REFRESH_TOKEN
        };
        
        const success = await this.authService.initializeWithJwt(jwtConfig);
        if (!success) {
          runtime.logger.warn('Failed to authenticate with JWT, falling back to read-only mode');
        } else {
          runtime.logger.info('Successfully authenticated with JWT');
        }
      } else {
        runtime.logger.warn('Invalid JWT configuration, falling back to read-only mode');
      }
    } else if (config.AUTH_MODE === 'private_key' && config.THINK_PROVIDER_PRIVATE_KEY) {
      // Set up private key authentication
      this.authService.initializeWithPrivateKey(config.THINK_PROVIDER_PRIVATE_KEY);
      runtime.logger.info('Using private key authentication');
    } else {
      runtime.logger.info('No authentication configured, running in read-only mode');
    }
  }

  /**
   * Get all THINK actions
   */
  getThinkActions(): Action[] {
    if (!this.contractService || !this.apiService) {
      return [];
    }
    
    // Create actions
    const communicationActions = createCommunicationActions(this.contractService);
    const escrowActions = createEscrowActions(this.contractService);
    const agentActions = createAgentActions(this.contractService, this.apiService);
    
    // Return all actions
    return [
      ...communicationActions,
      ...escrowActions,
      ...agentActions,
      // Registry action to get all available actions
      {
        name: 'getAvailableActions',
        description: 'Get all available THINK actions from loaded plugins',
        execute: async () => {
          return this.actionRegistry.getActions();
        }
      }
    ];
  }
}

// Export plugin
export default new ThinkProtocolPlugin(); 