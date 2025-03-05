import { ethers } from 'ethers';
import { ThinkPluginConfig } from '../environment';
import { ThinkAgent, AgentCommProfile, Skill, Transaction, TokenState, AgentRuntime } from '../types';
import { ThinkAuthService, AuthMode } from './auth-service';
import { ThinkRelayerService } from './relayer-service';

// We'll use inline ABIs instead of importing JSON files
// Define minimal ABIs for the contracts 
const ThinkAgentStartSeedABI = [
  "function totalSupply() view returns (uint256)",
  "function tokenByIndex(uint256 index) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getTokenState(uint256 tokenId) view returns (uint8)",
  "function getGenomeData(uint256 tokenId) view returns (string)",
  "function getFeelingsToken(uint256 tokenId) view returns (address)",
  "function hasFeelingsToken(uint256 tokenId) view returns (bool)",
  "event StartSeedMinted(uint256 indexed tokenId, address indexed to)"
];

const ThinkAgentCommABI = [
  "function getAgentProfile(uint256 agentId) view returns (address agentAddress, string chainId, string publicKey)",
  "function getSkillCount(uint256 agentId) view returns (uint256)",
  "function getSkillIdByIndex(uint256 agentId, uint256 index) view returns (uint256)",
  "function getSkill(uint256 agentId, uint256 skillId) view returns (string name, string version, uint256 reputationScore, string usageDescription, uint256[] embeddings, address feelingsTokenAddress, uint256 ratePerUse)",
  "function setAgentProfile(uint256 agentId, address agentAddress, string chainId, string publicKey) returns (bool)",
  "function addSkill(uint256 agentId, string name, string version, uint256 reputationScore, string usageDescription, uint256[] embeddings, address feelingsTokenAddress, uint256 ratePerUse) returns (uint256)",
  "event SkillAdded(uint256 indexed agentId, uint256 indexed skillId, string name)"
];

const ThinkAgentEscrowABI = [
  "function createTransaction(address client, address provider, address token, uint256 amount) returns (uint256)",
  "function getTransaction(uint256 transactionId) view returns (address client, address provider, address token, uint256 amount, bool isActive, bool isDisputed, bool isDelivered)",
  "function depositPayment(uint256 transactionId) payable",
  "function deliverService(uint256 transactionId)",
  "function releasePayment(uint256 transactionId)",
  "function disputeTransaction(uint256 transactionId)",
  "event TransactionCreated(uint256 indexed id, address indexed client, address indexed provider, address token, uint256 amount)"
];

/**
 * Service to interact with THINK protocol smart contracts
 */
export class ThinkContractService {
  private provider: ethers.Provider;
  private signer?: ethers.Signer;
  private startSeedContract: ethers.Contract;
  private commContract: ethers.Contract;
  private escrowContract: ethers.Contract;
  private runtime: AgentRuntime;
  private authService: ThinkAuthService;
  private relayerService?: ThinkRelayerService;
  private readonly isReadOnly: boolean;

  constructor(config: ThinkPluginConfig, runtime: AgentRuntime, authService: ThinkAuthService, relayerService?: ThinkRelayerService) {
    this.runtime = runtime;
    this.authService = authService;
    this.relayerService = relayerService;
    
    // Set up provider
    this.provider = new ethers.JsonRpcProvider(config.RPC_URL);
    
    // Determine if we're in read-only mode
    this.isReadOnly = authService.getAuthMode() === AuthMode.NONE;
    
    // Set up signer if using private key
    if (authService.getAuthMode() === AuthMode.PRIVATE_KEY) {
      const privateKey = authService.getPrivateKey();
      if (privateKey) {
        this.signer = new ethers.Wallet(privateKey, this.provider);
      }
    }
    
    // Initialize contracts
    this.startSeedContract = new ethers.Contract(
      config.THINK_AGENT_STARTSEED_ADDRESS,
      ThinkAgentStartSeedABI,
      this.signer || this.provider
    );
    
    this.commContract = new ethers.Contract(
      config.THINK_AGENT_COMM_ADDRESS,
      ThinkAgentCommABI,
      this.signer || this.provider
    );
    
    this.escrowContract = new ethers.Contract(
      config.THINK_AGENT_ESCROW_ADDRESS,
      ThinkAgentEscrowABI,
      this.signer || this.provider
    );
    
    this.runtime.logger.info('THINK Contract Service initialized');
  }

  /**
   * Execute a contract write operation
   * Uses either direct signer or relayer based on auth mode
   */
  private async executeWrite(
    contract: ethers.Contract,
    method: string,
    args: any[],
    options: { value?: string } = {}
  ): Promise<string> {
    // Check authentication mode
    const authMode = this.authService.getAuthMode();
    
    if (authMode === AuthMode.NONE) {
      throw new Error('Cannot perform write operation in read-only mode');
    }
    
    // If using private key, execute directly
    if (authMode === AuthMode.PRIVATE_KEY && this.signer) {
      // Use a type-safe approach for calling contract methods
      const connectedContract = contract.connect(this.signer);
      
      // Create transaction with proper typings
      let tx;
      if (options.value) {
        // Include value in the transaction if needed
        tx = await connectedContract.getFunction(method)(...args, { value: options.value });
      } else {
        tx = await connectedContract.getFunction(method)(...args);
      }
      
      const receipt = await tx.wait();
      return receipt.hash;
    }
    
    // If using JWT relayer, execute via relayer
    if (authMode === AuthMode.JWT && this.relayerService) {
      return await this.relayerService.callContractMethod(contract, method, args, options);
    }
    
    throw new Error('No valid authentication method for write operation');
  }

  /**
   * Get a list of all THINK agents
   */
  async getAgentList(): Promise<ThinkAgent[]> {
    try {
      this.runtime.logger.debug('Getting agent list from blockchain');
      
      // Get total supply
      const totalSupply = await this.startSeedContract.totalSupply();
      
      // Initialize empty array for agents
      const agents: ThinkAgent[] = [];
      
      // Fetch all tokens
      for (let i = 0; i < totalSupply; i++) {
        const tokenId = await this.startSeedContract.tokenByIndex(i);
        
        // Get token owner
        const owner = await this.startSeedContract.ownerOf(tokenId);
        
        // Get token state
        const state = await this.startSeedContract.getTokenState(tokenId);
        
        // Create agent object
        const agent: ThinkAgent = {
          tokenId: Number(tokenId),
          owner,
          state: Number(state)
        };
        
        // Get additional data if token is revealed
        if (Number(state) === TokenState.REVEALED) {
          // Get genome data
          const genomeData = await this.startSeedContract.getGenomeData(tokenId);
          agent.genomeData = genomeData;
          
          // Get feelings token
          const feelingsToken = await this.startSeedContract.getFeelingsToken(tokenId);
          agent.feelingsToken = feelingsToken;
        }
        
        agents.push(agent);
      }
      
      this.runtime.logger.info(`Found ${agents.length} agents on blockchain`);
      return agents;
    } catch (error) {
      this.runtime.logger.error('Failed to get agent list', error);
      throw new Error(`Failed to get agent list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get communication profile for an agent
   */
  async getCommProfile(agentId: number): Promise<AgentCommProfile | null> {
    try {
      this.runtime.logger.debug(`Getting communication profile for agent ${agentId}`);
      
      // Get profile
      const [address, chainId, publicKey] = await this.commContract.getAgentProfile(agentId);
      
      // If there is no address, return null
      if (!address || address === ethers.ZeroAddress) {
        return null;
      }
      
      // Get skill count
      const skillCount = await this.commContract.getSkillCount(agentId);
      
      // Get all skills
      const supportedSkills: Skill[] = [];
      
      for (let i = 0; i < Number(skillCount); i++) {
        const skillId = await this.commContract.getSkillIdByIndex(agentId, i);
        
        // Get skill details
        const [
          name,
          version,
          reputationScore,
          usageDescription,
          embeddings,
          feelingsTokenAddress,
          ratePerUse
        ] = await this.commContract.getSkill(agentId, skillId);
        
        // Create skill object
        const skill: Skill = {
          name,
          version,
          reputationScore: Number(reputationScore),
          usageDescription,
          embeddings: embeddings.map((e: ethers.BigNumberish) => Number(e)),
          rate: {
            feelingsTokenAddress,
            ratePerUse: Number(ratePerUse)
          },
          apiParameters: [],
          responseFormats: []
        };
        
        supportedSkills.push(skill);
      }
      
      this.runtime.logger.info(`Found profile for agent ${agentId} with ${supportedSkills.length} skills`);
      
      // Create profile object
      return {
        agentAddress: address,
        chainId: chainId.toString(),
        publicKey,
        supportedSkills
      };
    } catch (error) {
      this.runtime.logger.error(`Failed to get communication profile for agent ${agentId}`, error);
      throw new Error(`Failed to get communication profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Set communication profile for an agent
   */
  async setCommProfile(
    agentId: number,
    agentAddress: string,
    chainId: string,
    publicKey: string
  ): Promise<void> {
    try {
      this.runtime.logger.debug(`Setting communication profile for agent ${agentId}`);
      
      // Execute contract method
      await this.executeWrite(
        this.commContract,
        'setAgentProfile',
        [agentId, agentAddress, chainId, publicKey]
      );
      
      this.runtime.logger.info(`Successfully set communication profile for agent ${agentId}`);
    } catch (error) {
      this.runtime.logger.error(`Failed to set communication profile for agent ${agentId}`, error);
      throw new Error(`Failed to set communication profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add a skill to an agent's communication profile
   */
  async addSkill(
    agentId: number,
    skill: Omit<Skill, 'apiParameters' | 'responseFormats'>
  ): Promise<number> {
    try {
      this.runtime.logger.debug(`Adding skill to agent ${agentId}`);
      
      // Extract rate from skill
      const { rate, ...skillData } = skill;
      
      // Execute contract method
      const tx = await this.executeWrite(
        this.commContract,
        'addSkill',
        [
          agentId,
          skillData.name,
          skillData.version,
          skillData.reputationScore,
          skillData.usageDescription,
          skillData.embeddings,
          rate.feelingsTokenAddress,
          rate.ratePerUse
        ]
      );
      
      // Get skill ID from event logs
      const receipt = await this.provider.getTransactionReceipt(tx);
      
      if (!receipt || !receipt.logs) {
        throw new Error('Transaction receipt not found or has no logs');
      }
      
      // Parse logs to find skill ID
      const contractInterface = new ethers.Interface(ThinkAgentCommABI);
      const event = receipt.logs
        .map(log => {
          try {
            return contractInterface.parseLog({
              topics: log.topics.map(t => t.toString()),
              data: log.data
            });
          } catch {
            return null;
          }
        })
        .find(event => event && event.name === 'SkillAdded');
      
      if (!event) {
        throw new Error('SkillAdded event not found in transaction logs');
      }
      
      const skillId = Number(event.args.skillId);
      
      this.runtime.logger.info(`Successfully added skill to agent ${agentId} with ID ${skillId}`);
      return skillId;
    } catch (error) {
      this.runtime.logger.error(`Failed to add skill to agent ${agentId}`, error);
      throw new Error(`Failed to add skill: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create an escrow transaction
   */
  async createEscrowTransaction(
    client: string,
    provider: string,
    token: string,
    amount: number
  ): Promise<number> {
    try {
      this.runtime.logger.debug(`Creating escrow transaction between ${client} and ${provider}`);
      
      // Execute contract method
      const tx = await this.executeWrite(
        this.escrowContract,
        'createTransaction',
        [client, provider, token, amount]
      );
      
      // Get transaction ID from event logs
      const receipt = await this.provider.getTransactionReceipt(tx);
      
      if (!receipt || !receipt.logs) {
        throw new Error('Transaction receipt not found or has no logs');
      }
      
      // Parse logs to find transaction ID
      const contractInterface = new ethers.Interface(ThinkAgentEscrowABI);
      const event = receipt.logs
        .map(log => {
          try {
            return contractInterface.parseLog({
              topics: log.topics.map(t => t.toString()),
              data: log.data
            });
          } catch {
            return null;
          }
        })
        .find(event => event && event.name === 'TransactionCreated');
      
      if (!event) {
        throw new Error('TransactionCreated event not found in transaction logs');
      }
      
      const transactionId = Number(event.args.id);
      
      this.runtime.logger.info(`Successfully created escrow transaction ${transactionId}`);
      return transactionId;
    } catch (error) {
      this.runtime.logger.error('Failed to create escrow transaction', error);
      throw new Error(`Failed to create escrow transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get details of an escrow transaction
   */
  async getEscrowTransaction(transactionId: number): Promise<Transaction> {
    try {
      this.runtime.logger.debug(`Getting escrow transaction ${transactionId}`);
      
      // Get transaction details
      const [
        client,
        provider,
        token,
        amount,
        isActive,
        isDisputed,
        isDelivered
      ] = await this.escrowContract.getTransaction(transactionId);
      
      this.runtime.logger.info(`Retrieved escrow transaction ${transactionId}`);
      
      // Create transaction object
      return {
        id: transactionId,
        client,
        provider,
        token,
        amount: Number(amount),
        isActive,
        isDisputed,
        isDelivered
      };
    } catch (error) {
      this.runtime.logger.error(`Failed to get escrow transaction ${transactionId}`, error);
      throw new Error(`Failed to get escrow transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Deposit payment for an escrow transaction
   */
  async depositPayment(transactionId: number): Promise<void> {
    try {
      this.runtime.logger.debug(`Depositing payment for transaction ${transactionId}`);
      
      // Get transaction details first to know the amount
      const transaction = await this.getEscrowTransaction(transactionId);
      
      // Execute contract method
      await this.executeWrite(
        this.escrowContract,
        'depositPayment',
        [transactionId],
        { value: transaction.amount.toString() }
      );
      
      this.runtime.logger.info(`Successfully deposited payment for transaction ${transactionId}`);
    } catch (error) {
      this.runtime.logger.error(`Failed to deposit payment for transaction ${transactionId}`, error);
      throw new Error(`Failed to deposit payment: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Mark an escrow transaction as delivered
   */
  async deliverService(transactionId: number): Promise<void> {
    try {
      this.runtime.logger.debug(`Marking transaction ${transactionId} as delivered`);
      
      // Execute contract method
      await this.executeWrite(
        this.escrowContract,
        'deliverService',
        [transactionId]
      );
      
      this.runtime.logger.info(`Successfully marked transaction ${transactionId} as delivered`);
    } catch (error) {
      this.runtime.logger.error(`Failed to mark transaction ${transactionId} as delivered`, error);
      throw new Error(`Failed to deliver service: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Release payment for a delivered escrow transaction
   */
  async releasePayment(transactionId: number): Promise<void> {
    try {
      this.runtime.logger.debug(`Releasing payment for transaction ${transactionId}`);
      
      // Execute contract method
      await this.executeWrite(
        this.escrowContract,
        'releasePayment',
        [transactionId]
      );
      
      this.runtime.logger.info(`Successfully released payment for transaction ${transactionId}`);
    } catch (error) {
      this.runtime.logger.error(`Failed to release payment for transaction ${transactionId}`, error);
      throw new Error(`Failed to release payment: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Dispute an escrow transaction
   */
  async disputeTransaction(transactionId: number): Promise<void> {
    try {
      this.runtime.logger.debug(`Disputing transaction ${transactionId}`);
      
      // Execute contract method
      await this.executeWrite(
        this.escrowContract,
        'disputeTransaction',
        [transactionId]
      );
      
      this.runtime.logger.info(`Successfully disputed transaction ${transactionId}`);
    } catch (error) {
      this.runtime.logger.error(`Failed to dispute transaction ${transactionId}`, error);
      throw new Error(`Failed to dispute transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 