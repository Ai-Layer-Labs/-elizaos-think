/**
 * Common interfaces and types for the THINK Protocol plugin
 */

// ElizaOS plugin interfaces
export interface AgentRuntime {
  getSetting(key: string): string;
  logger: {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
  };
}

export interface Action {
  name: string;
  description: string;
  execute: (args: Record<string, any>, runtime: AgentRuntime) => Promise<any>;
}

export interface Plugin {
  name: string;
  description: string;
  actions?: Action[];
  initialize?(runtime: AgentRuntime): Promise<void>;
}

// THINK Protocol specific types

// Agent types
export enum TokenState {
  UNREVEALED = 0,
  PENDING_REVEAL = 1,
  REVEALED = 2
}

export interface ThinkAgent {
  tokenId: number;
  owner: string;
  state: TokenState;
  genomeData?: string;
  feelingsToken?: string;
}

// Communication profile types
export interface Rate {
  feelingsTokenAddress: string;
  ratePerUse: number;
}

export interface Parameter {
  paramName: string;
  paramType: string;
  required: boolean;
  description: string;
}

export interface ResponseDetails {
  responseSchema: string;
  possibleErrors: string[];
}

export interface ResponseFormat {
  respName: string;
  responseType: string;
  details: ResponseDetails;
}

export interface Skill {
  name: string;
  version: string;
  reputationScore: number;
  usageDescription: string;
  embeddings: number[];
  rate: Rate;
  apiParameters: Parameter[];
  responseFormats: ResponseFormat[];
}

export interface AgentCommProfile {
  agentAddress: string;
  chainId: string;
  publicKey: string;
  supportedSkills: Skill[];
}

// Escrow transaction types
export interface Transaction {
  id: number;
  client: string;
  provider: string;
  token: string;
  amount: number;
  isActive: boolean;
  isDisputed: boolean;
  isDelivered: boolean;
}

// Plugin specific types
export interface ElizaAction {
  name: string;
  description: string;
  plugin: string;
  execute: (args: Record<string, any>, runtime: AgentRuntime) => Promise<any>;
}

export interface ThinkActionRegistry {
  actions: ElizaAction[];
  getActions(): ElizaAction[];
  getActionByName(name: string): ElizaAction | undefined;
}

export interface AgentRegistration {
  agentId: number;
  name: string;
  description: string;
  skills: string[];
  publicKey: string;
  apiEndpoint: string;
}

// API response interfaces
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
} 