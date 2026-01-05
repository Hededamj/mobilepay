import axios, { AxiosError } from 'axios';
import mobilePayConfig from '../../config/mobilepay';
import logger from '../../config/logger';
import { AccessTokenResponse } from '../../types/mobilepay.types';

class AccessTokenService {
  private accessToken: string | null = null;
  private tokenExpiry: number | null = null;
  private readonly tokenBuffer = 300; // Refresh 5 minutes before expiry

  /**
   * Get a valid access token (cached or fetch new)
   */
  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.isTokenValid()) {
      logger.debug('Using cached access token');
      return this.accessToken;
    }

    // Fetch new token
    logger.info('Fetching new access token from MobilePay');
    await this.refreshToken();

    if (!this.accessToken) {
      throw new Error('Failed to obtain access token');
    }

    return this.accessToken;
  }

  /**
   * Force refresh the access token
   */
  async refreshToken(): Promise<void> {
    try {
      const response = await axios.post<AccessTokenResponse>(
        `${mobilePayConfig.baseUrl}/accesstoken/get`,
        {},
        {
          headers: {
            'client_id': mobilePayConfig.clientId,
            'client_secret': mobilePayConfig.clientSecret,
            'Ocp-Apim-Subscription-Key': mobilePayConfig.subscriptionKey,
            'Merchant-Serial-Number': mobilePayConfig.merchantSerialNumber,
            'Content-Type': 'application/json',
          },
        }
      );

      const { access_token, expires_in } = response.data;

      this.accessToken = access_token;
      this.tokenExpiry = Date.now() + expires_in * 1000;

      logger.info('Successfully obtained new access token', {
        expiresIn: expires_in,
        expiryTime: new Date(this.tokenExpiry).toISOString(),
      });
    } catch (error) {
      logger.error('Failed to fetch access token', {
        error: error instanceof AxiosError ? error.response?.data : error,
      });

      // Clear cached token on error
      this.accessToken = null;
      this.tokenExpiry = null;

      throw new Error('Failed to obtain MobilePay access token');
    }
  }

  /**
   * Check if current token is still valid
   */
  private isTokenValid(): boolean {
    if (!this.tokenExpiry) {
      return false;
    }

    // Consider token invalid if it expires within the buffer time
    const now = Date.now();
    const bufferTime = this.tokenBuffer * 1000;

    return this.tokenExpiry - now > bufferTime;
  }

  /**
   * Clear cached token (useful for testing)
   */
  clearToken(): void {
    this.accessToken = null;
    this.tokenExpiry = null;
    logger.debug('Access token cache cleared');
  }
}

// Export singleton instance
export default new AccessTokenService();
