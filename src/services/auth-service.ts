import axios from 'axios';
import { AgentRuntime } from '../types';
import { z } from 'zod';

/**
 * Schema for JWT auth response from server
 */
export const AuthResponseSchema = z.object({
  token: z.string(),
  expires_in: z.number(),
  token_type: z.string().default('Bearer'),
  refresh_token: z.optional(z.string())
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/**
 * Auth modes supported by the THINK protocol
 */
export enum AuthMode {
  JWT = 'jwt',
  PRIVATE_KEY = 'private_key',
  NONE = 'none'
}

/**
 * Configuration for JWT auth
 */
export interface JwtAuthConfig {
  auth_url: string;
  client_id: string;
  client_secret?: string;
  username?: string;
  password?: string;
  refresh_token?: string;
}

/**
 * Service to handle authentication with THINK protocol
 */
export class ThinkAuthService {
  private authToken?: string;
  private refreshToken?: string;
  private tokenExpiry?: Date;
  private authMode: AuthMode = AuthMode.NONE;
  private jwtConfig?: JwtAuthConfig;
  private privateKey?: string;
  private runtime: AgentRuntime;

  constructor(runtime: AgentRuntime) {
    this.runtime = runtime;
  }

  /**
   * Initialize auth service with JWT configuration
   */
  async initializeWithJwt(config: JwtAuthConfig): Promise<boolean> {
    this.jwtConfig = config;
    this.authMode = AuthMode.JWT;
    return this.authenticate();
  }

  /**
   * Initialize auth service with private key
   */
  initializeWithPrivateKey(privateKey: string): void {
    this.privateKey = privateKey;
    this.authMode = AuthMode.PRIVATE_KEY;
  }

  /**
   * Get the current authentication mode
   */
  getAuthMode(): AuthMode {
    return this.authMode;
  }

  /**
   * Get the private key if in private key mode
   */
  getPrivateKey(): string | undefined {
    if (this.authMode !== AuthMode.PRIVATE_KEY) {
      return undefined;
    }
    return this.privateKey;
  }

  /**
   * Authenticate with the THINK protocol using configured credentials
   */
  async authenticate(): Promise<boolean> {
    if (this.authMode !== AuthMode.JWT || !this.jwtConfig) {
      return false;
    }

    try {
      this.runtime.logger.debug('Authenticating with THINK protocol JWT service');

      // Determine authentication method based on available credentials
      const authPayload: Record<string, string> = {
        client_id: this.jwtConfig.client_id,
      };

      if (this.jwtConfig.client_secret) {
        authPayload.client_secret = this.jwtConfig.client_secret;
      }

      // If we have username/password, use password grant
      if (this.jwtConfig.username && this.jwtConfig.password) {
        authPayload.grant_type = 'password';
        authPayload.username = this.jwtConfig.username;
        authPayload.password = this.jwtConfig.password;
      } 
      // If we have refresh token, use refresh token grant
      else if (this.jwtConfig.refresh_token) {
        authPayload.grant_type = 'refresh_token';
        authPayload.refresh_token = this.jwtConfig.refresh_token;
      } else {
        this.runtime.logger.error('No valid credentials for JWT authentication');
        return false;
      }

      const response = await axios.post(this.jwtConfig.auth_url, authPayload);
      const authResponse = AuthResponseSchema.parse(response.data);

      this.authToken = authResponse.token;
      this.refreshToken = authResponse.refresh_token || this.refreshToken;
      
      // Set token expiry time
      this.tokenExpiry = new Date();
      this.tokenExpiry.setSeconds(this.tokenExpiry.getSeconds() + authResponse.expires_in);
      
      this.runtime.logger.info('Successfully authenticated with THINK protocol');
      return true;
    } catch (error) {
      this.runtime.logger.error('JWT authentication failed:', error);
      return false;
    }
  }

  /**
   * Check if token is expired and refresh if necessary
   */
  async ensureValidToken(): Promise<boolean> {
    if (this.authMode !== AuthMode.JWT) {
      return this.authMode === AuthMode.PRIVATE_KEY;
    }

    // If no token or expired, attempt to refresh
    if (!this.authToken || !this.tokenExpiry || new Date() >= this.tokenExpiry) {
      if (this.refreshToken && this.jwtConfig) {
        // Update config to use refresh token
        this.jwtConfig.refresh_token = this.refreshToken;
        return this.authenticate();
      } else {
        return false;
      }
    }

    return true;
  }

  /**
   * Get authorization headers for API requests
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.authMode !== AuthMode.JWT) {
      return {};
    }

    const isValid = await this.ensureValidToken();
    if (!isValid || !this.authToken) {
      throw new Error('Failed to get valid auth token');
    }

    return {
      Authorization: `Bearer ${this.authToken}`
    };
  }

  /**
   * Revoke the current token and clear auth state
   */
  async logout(): Promise<void> {
    if (this.authMode !== AuthMode.JWT || !this.jwtConfig || !this.authToken) {
      return;
    }

    try {
      // Call logout endpoint if available
      await axios.post(
        `${new URL(this.jwtConfig.auth_url).origin}/logout`, 
        { token: this.authToken },
        { headers: { Authorization: `Bearer ${this.authToken}` } }
      );
    } catch (error) {
      this.runtime.logger.warn('Error during logout:', error);
    } finally {
      // Clear auth state regardless of logout success
      this.authToken = undefined;
      this.refreshToken = undefined;
      this.tokenExpiry = undefined;
    }
  }
} 