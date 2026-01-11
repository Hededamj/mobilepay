import axios, { AxiosError } from 'axios';
import logger from '../../config/logger';

interface NewZenlerConfig {
  apiKey: string;
  accountName: string;
  baseUrl: string;
}

interface CreateUserParams {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  phone?: string;
  gdprConsent?: boolean;
}

// interface EnrollUserParams {
//   userId: string;
//   courseId: string;
//   planId?: string;
// }

interface NewZenlerUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

class NewZenlerService {
  private config: NewZenlerConfig;

  constructor() {
    this.config = {
      apiKey: process.env.NEW_ZENLER_API_KEY || '',
      accountName: process.env.NEW_ZENLER_ACCOUNT_NAME || '',
      baseUrl: 'https://api.newzenler.com/api/v1',
    };

    if (!this.config.apiKey || !this.config.accountName) {
      logger.warn('New Zenler API configuration missing - enrollment disabled');
    }
  }

  /**
   * Create a new user in New Zenler
   */
  async createUser(params: CreateUserParams): Promise<NewZenlerUser | null> {
    if (!this.isConfigured()) {
      logger.warn('New Zenler not configured - skipping user creation');
      return null;
    }

    try {
      // Generate random password if not provided
      const password = params.password || this.generateRandomPassword();

      const response = await axios.post(
        `${this.config.baseUrl}/users`,
        {
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          password: password,
          commission: 0,
          roles: ['student'], // Default role
          phone: params.phone || '',
          gdpr_consent_status: params.gdprConsent ? 1 : 0,
        },
        {
          headers: this.getHeaders(),
          timeout: 10000,
        }
      );

      logger.info('New Zenler user created', {
        userId: response.data.id,
        email: params.email,
      });

      return response.data;
    } catch (error) {
      // User might already exist
      if (error instanceof AxiosError && error.response?.status === 409) {
        logger.info('User already exists in New Zenler, fetching existing user', {
          email: params.email,
        });

        // Try to find existing user
        const existingUser = await this.getUserByEmail(params.email);
        if (existingUser) {
          return existingUser;
        }
      }

      logger.error('Failed to create New Zenler user', {
        error: error instanceof AxiosError ? error.response?.data : error,
        email: params.email,
      });

      throw new Error('Failed to create New Zenler user');
    }
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<NewZenlerUser | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await axios.get(`${this.config.baseUrl}/users`, {
        headers: this.getHeaders(),
        params: {
          search: email,
          limit: 1,
        },
      });

      if (response.data.users && response.data.users.length > 0) {
        return response.data.users[0];
      }

      return null;
    } catch (error) {
      logger.error('Failed to fetch New Zenler user', {
        error: error instanceof AxiosError ? error.response?.data : error,
        email,
      });

      return null;
    }
  }

  /**
   * Enroll user to course(s)
   */
  async enrollUserToCourses(
    userId: string,
    courseIds: string[]
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn('New Zenler not configured - skipping course enrollment');
      return false;
    }

    try {
      // Enroll to each course
      for (const courseId of courseIds) {
        await this.enrollUserToCourse(userId, courseId);
      }

      logger.info('User enrolled to courses successfully', {
        userId,
        courseCount: courseIds.length,
      });

      return true;
    } catch (error) {
      logger.error('Failed to enroll user to courses', {
        error: error instanceof AxiosError ? error.response?.data : error,
        userId,
      });

      return false;
    }
  }

  /**
   * Enroll user to a single course
   */
  private async enrollUserToCourse(
    userId: string,
    courseId: string,
    planId?: string
  ): Promise<void> {
    const payload: any = { course_id: courseId };
    if (planId) {
      payload.plan_id = planId;
    }

    await axios.post(
      `${this.config.baseUrl}/users/${userId}/enroll`,
      payload,
      {
        headers: this.getHeaders(),
        timeout: 10000,
      }
    );

    logger.info('User enrolled to course', {
      userId,
      courseId,
    });
  }

  /**
   * Unenroll user from course(s)
   */
  async unenrollUserFromCourses(
    userId: string,
    courseIds: string[]
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      for (const courseId of courseIds) {
        await axios.post(
          `${this.config.baseUrl}/users/${userId}/unenroll`,
          { course_id: courseId },
          {
            headers: this.getHeaders(),
            timeout: 10000,
          }
        );

        logger.info('User unenrolled from course', {
          userId,
          courseId,
        });
      }

      return true;
    } catch (error) {
      logger.error('Failed to unenroll user from courses', {
        error: error instanceof AxiosError ? error.response?.data : error,
        userId,
      });

      return false;
    }
  }

  /**
   * Get course IDs based on subscription plan type
   */
  getCourseIdsForPlan(_planType: 'monthly' | 'semi_annual' | 'annual'): string[] {
    // These should be configured via environment variables
    const allCoursesEnv = process.env.NEW_ZENLER_ALL_COURSES_IDS || '';

    if (!allCoursesEnv) {
      logger.warn('NEW_ZENLER_ALL_COURSES_IDS not configured');
      return [];
    }

    // Parse comma-separated course IDs
    const courseIds = allCoursesEnv.split(',').map(id => id.trim()).filter(Boolean);

    // All plan types get access to all courses
    // You can customize this logic if different plans should have different access
    return courseIds;
  }

  /**
   * Complete enrollment flow: create user and enroll to courses
   */
  async enrollCustomerToPlan(
    email: string,
    firstName: string,
    lastName: string,
    planType: 'monthly' | 'semi_annual' | 'annual',
    phone?: string
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn('New Zenler not configured - skipping enrollment');
      return false;
    }

    try {
      logger.info('Starting New Zenler enrollment', {
        email,
        planType,
      });

      // 1. Create or get user
      const user = await this.createUser({
        firstName,
        lastName,
        email,
        phone,
        gdprConsent: true,
      });

      if (!user) {
        throw new Error('Failed to create/get user');
      }

      // 2. Get courses for plan
      const courseIds = this.getCourseIdsForPlan(planType);

      if (courseIds.length === 0) {
        logger.warn('No courses configured for plan', { planType });
        return true; // User created but no courses to enroll
      }

      // 3. Enroll to courses
      const enrolled = await this.enrollUserToCourses(user.id, courseIds);

      if (!enrolled) {
        throw new Error('Failed to enroll user to courses');
      }

      logger.info('New Zenler enrollment completed successfully', {
        userId: user.id,
        email,
        planType,
        coursesEnrolled: courseIds.length,
      });

      return true;
    } catch (error) {
      logger.error('New Zenler enrollment failed', {
        error: error instanceof AxiosError ? error.response?.data : error,
        email,
        planType,
      });

      return false;
    }
  }

  /**
   * Remove customer access (when subscription is cancelled)
   */
  async removeCustomerAccess(email: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      // Get user
      const user = await this.getUserByEmail(email);
      if (!user) {
        logger.warn('User not found in New Zenler for removal', { email });
        return true; // Nothing to remove
      }

      // Get all course IDs (all plans have same access)
      const courseIds = this.getCourseIdsForPlan('monthly');

      // Unenroll from all courses
      await this.unenrollUserFromCourses(user.id, courseIds);

      logger.info('Customer access removed from New Zenler', {
        userId: user.id,
        email,
      });

      return true;
    } catch (error) {
      logger.error('Failed to remove customer access', {
        error,
        email,
      });

      return false;
    }
  }

  /**
   * Generate random password for New Zenler user
   */
  private generateRandomPassword(): string {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return password;
  }

  /**
   * Get request headers for New Zenler API
   */
  private getHeaders() {
    return {
      'X-API-Key': this.config.apiKey,
      'X-Account-Name': this.config.accountName,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  /**
   * Check if New Zenler is configured
   */
  private isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.accountName);
  }
}

export default new NewZenlerService();
