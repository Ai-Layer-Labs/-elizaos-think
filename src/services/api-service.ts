import axios from 'axios';
import { ApiResponse, AgentRegistration } from '../types';

export class ThinkApiService {
  private readonly baseUrl: string;
  
  constructor(baseUrl: string = 'https://api.thinkagents.ai/api/v1') {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Register an agent with the THINK Protocol API
   * @param registration The agent registration details
   * @returns Promise<boolean> Whether the registration was successful
   */
  async registerAgent(registration: AgentRegistration): Promise<boolean> {
    try {
      const response = await axios.post<ApiResponse<{ success: boolean }>>(
        `${this.baseUrl}/registerAgent`,
        registration
      );
      
      if (response.data.success) {
        return true;
      }
      
      console.error('Agent registration failed:', response.data.error);
      return false;
    } catch (error) {
      console.error('Error registering agent:', error);
      return false;
    }
  }
  
  /**
   * Fetch available THINK agents from the API
   * @returns Promise<AgentRegistration[]> List of registered agents
   */
  async getAvailableAgents(): Promise<AgentRegistration[]> {
    try {
      const response = await axios.get<ApiResponse<AgentRegistration[]>>(
        `${this.baseUrl}/agents`
      );
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      }
      
      console.error('Failed to get available agents:', response.data.error);
      return [];
    } catch (error) {
      console.error('Error getting available agents:', error);
      return [];
    }
  }
  
  /**
   * Get agent details by ID
   * @param agentId The agent ID
   * @returns Promise<AgentRegistration | null> The agent details
   */
  async getAgentById(agentId: number): Promise<AgentRegistration | null> {
    try {
      const response = await axios.get<ApiResponse<AgentRegistration>>(
        `${this.baseUrl}/agents/${agentId}`
      );
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      }
      
      console.error(`Failed to get agent ${agentId}:`, response.data.error);
      return null;
    } catch (error) {
      console.error(`Error getting agent ${agentId}:`, error);
      return null;
    }
  }
} 