import { z } from 'zod';
import { AgentRuntime } from './types';

/**
 * Schema for THINK plugin configuration
 */
export const ThinkPluginConfigSchema = z.object({
  THINK_AGENT_STARTSEED_ADDRESS: z.string(),
  THINK_AGENT_COMM_ADDRESS: z.string(),
  THINK_AGENT_ESCROW_ADDRESS: z.string(),
  THINK_PROVIDER_PRIVATE_KEY: z.string().optional(),
  RPC_URL: z.string(),
  CHAIN_ID: z.string(),
  // New JWT auth fields
  AUTH_MODE: z.enum(['jwt', 'private_key']).optional().default('private_key'),
  JWT_AUTH_URL: z.string().optional(),
  JWT_CLIENT_ID: z.string().optional(),
  JWT_CLIENT_SECRET: z.string().optional(),
  JWT_USERNAME: z.string().optional(),
  JWT_PASSWORD: z.string().optional(),
  JWT_REFRESH_TOKEN: z.string().optional(),
  RELAYER_URL: z.string().optional()
});

export type ThinkPluginConfig = z.infer<typeof ThinkPluginConfigSchema>;

/**
 * Class to manage environment configuration for the THINK plugin
 */
export class EnvironmentManager {
  private runtime: AgentRuntime;

  constructor(runtime: AgentRuntime) {
    this.runtime = runtime;
  }

  /**
   * Get the complete configuration from environment settings
   */
  getConfig(): ThinkPluginConfig {
    const config: Record<string, string> = {};
    const requiredKeys = [
      'THINK_AGENT_STARTSEED_ADDRESS',
      'THINK_AGENT_COMM_ADDRESS',
      'THINK_AGENT_ESCROW_ADDRESS',
      'RPC_URL',
      'CHAIN_ID'
    ];

    const optionalKeys = [
      'THINK_PROVIDER_PRIVATE_KEY',
      'AUTH_MODE',
      'JWT_AUTH_URL',
      'JWT_CLIENT_ID',
      'JWT_CLIENT_SECRET',
      'JWT_USERNAME',
      'JWT_PASSWORD',
      'JWT_REFRESH_TOKEN',
      'RELAYER_URL'
    ];

    // Get required settings
    for (const key of requiredKeys) {
      const value = this.runtime.getSetting(key);
      if (!value) {
        throw new Error(`Required setting ${key} is missing`);
      }
      config[key] = value;
    }

    // Get optional settings
    for (const key of optionalKeys) {
      const value = this.runtime.getSetting(key);
      if (value) {
        config[key] = value;
      }
    }

    // Validate the configuration
    try {
      return ThinkPluginConfigSchema.parse(config);
    } catch (error) {
      this.runtime.logger.error('Invalid THINK plugin configuration:', error);
      throw new Error(`Invalid THINK plugin configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Determine if the current configuration has valid JWT authentication settings
   */
  hasValidJwtConfig(config: ThinkPluginConfig): boolean {
    if (config.AUTH_MODE !== 'jwt') {
      return false;
    }

    // Check for required JWT fields
    if (!config.JWT_AUTH_URL || !config.JWT_CLIENT_ID) {
      return false;
    }

    // Check if we have either username/password or refresh token
    const hasUserPassAuth = !!(config.JWT_USERNAME && config.JWT_PASSWORD);
    const hasRefreshToken = !!config.JWT_REFRESH_TOKEN;

    return hasUserPassAuth || hasRefreshToken;
  }

  /**
   * Determine if the current configuration has a valid relayer URL
   */
  hasValidRelayerConfig(config: ThinkPluginConfig): boolean {
    return config.AUTH_MODE === 'jwt' && !!config.RELAYER_URL;
  }
} 