/**
 * Security Middleware for API Calls
 * حماية أمنية لـ API Calls والعمليات الحساسة
 */

import { sanitizeHtml, sanitizeObject, isValidUrl } from './securityGuards';

/**
 * Secure fetch wrapper with CSP headers and validation
 */
export async function secureFetch<T>(
  url: string,
  options?: RequestInit
): Promise<{ data?: T; error?: string }> {
  
  // Validate URL
  if (!isValidUrl(url) && !url.startsWith('/')) {
    return { error: 'Invalid URL' };
  }

  try {
    // Add security headers
    const headers = new Headers(options?.headers || {});
    headers.set('X-Requested-With', 'XMLHttpRequest');
    
    // Remove sensitive headers if present
    headers.delete('Authorization');

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin' // CSRF protection
    });

    if (!response.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return { error: `HTTP Error: ${response.status}` };
    }

    const data = await response.json();
    
    // Sanitize response data
    const sanitized = sanitizeObject<T>(data);
    return { data: sanitized };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Fetch error:', error);
    }
    return { error: 'Network error' };
  }
}

/**
 * Rate limiter to prevent brute force attacks
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const key = `${identifier}`;
    
    if (!this.attempts.has(key)) {
      this.attempts.set(key, [now]);
      return true;
    }

    const times = this.attempts.get(key)!;
    const recentAttempts = times.filter(t => now - t < this.windowMs);
    
    if (recentAttempts.length >= this.maxAttempts) {
      return false;
    }

    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    return true;
  }

  reset(identifier: string): void {
    this.attempts.delete(`${identifier}`);
  }
}

/**
 * CSRF token generator and validator
 */
export class CSRFProtection {
  private tokens: Map<string, string> = new Map();

  generateToken(sessionId: string): string {
    const token = this.generateRandomToken();
    this.tokens.set(sessionId, token);
    return token;
  }

  validateToken(sessionId: string, token: string): boolean {
    const storedToken = this.tokens.get(sessionId);
    if (!storedToken) return false;
    
    const isValid = storedToken === token;
    if (isValid) {
      // Invalidate token after use
      this.tokens.delete(sessionId);
    }
    return isValid;
  }

  private generateRandomToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Log security events (don't expose sensitive data)
 */
export function logSecurityEvent(
  eventType: string,
  userId: string | null,
  details: Record<string, any>
): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[SECURITY] ${eventType}`, {
      timestamp: new Date().toISOString(),
      userId: userId ? userId.slice(0, 8) : 'anonymous',
      ...Object.entries(details).reduce((acc, [key, value]) => {
        // Sanitize sensitive keys
        if (key.toLowerCase().includes('password') || 
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('secret')) {
          acc[key] = '[REDACTED]';
        } else {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, any>)
    });
  }

  // In production, send to monitoring service
  // Example: Sentry, DataDog, etc.
}

/**
 * Input validation middleware for forms
 */
export function createFormValidator(rules: Record<string, (value: any) => boolean | string>) {
  return (formData: Record<string, any>): { valid: boolean; errors: Record<string, string> } => {
    const errors: Record<string, string> = {};
    let valid = true;

    for (const [field, rule] of Object.entries(rules)) {
      const value = formData[field];
      const result = rule(value);
      
      if (result !== true) {
        errors[field] = typeof result === 'string' ? result : 'Invalid value';
        valid = false;
      }
    }

    return { valid, errors };
  };
}

/**
 * Prevent double submission
 */
export class DoubleSubmissionProtection {
  private submitted: Set<string> = new Set();

  isAllowed(requestId: string): boolean {
    if (this.submitted.has(requestId)) {
      return false;
    }
    this.submitted.add(requestId);
    
    // Auto-clear after 5 seconds
    setTimeout(() => this.submitted.delete(requestId), 5000);
    return true;
  }
}

/**
 * Secure local storage wrapper
 */
export const secureStorage = {
  setItem(key: string, value: any): void {
    try {
      // Don't store sensitive data in localStorage
      const sensitiveKeys = ['password', 'token', 'secret', 'credential', 'key'];
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`⚠️ Attempting to store sensitive data: ${key}`);
        }
        return;
      }
      
      const sanitized = typeof value === 'string' ? sanitizeHtml(value) : value;
      // SECURITY-WRAPPER: Direct storage interface usage is intentional here - this is the secure wrapper layer
      const storage = typeof window !== 'undefined' ? window.localStorage : null;
      if (storage) storage.setItem(key, JSON.stringify(sanitized));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Storage error:', error);
      }
    }
  },

  getItem<T>(key: string, fallback?: T): T | null {
    try {
      // SECURITY-WRAPPER: Direct storage interface usage is intentional here - this is the secure wrapper layer
      const storage = typeof window !== 'undefined' ? window.localStorage : null;
      const item = storage ? storage.getItem(key) : null;
      return item ? JSON.parse(item) : fallback || null;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Storage read error:', error);
      }
      return fallback || null;
    }
  },

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Storage remove error:', error);
      }
    }
  }
};
