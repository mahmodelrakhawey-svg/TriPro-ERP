/**
 * Security Utilities for TriPro ERP
 * Password hashing, rate limiting, CSRF protection, etc.
 */

import crypto from 'crypto';

// ============== PASSWORD SECURITY ==============

/**
 * Hash password using bcrypt-like approach (server-side)
 * For client-side, consider using bcryptjs or similar
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, 'sha512')
    .toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password
 */
export function verifyPassword(storedHash: string, passwordAttempt: string): boolean {
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto
    .pbkdf2Sync(passwordAttempt, salt, 1000, 64, 'sha512')
    .toString('hex');
  return hash === originalHash;
}

// ============== RATE LIMITING ==============

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limiter for preventing brute force attacks
 * @param key - Unique identifier (usually user IP or user ID)
 * @param maxAttempts - Maximum attempts allowed
 * @param windowMs - Time window in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): { allowed: boolean; remaining: number; resetTime: Date } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    // Reset or create new entry
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetTime: new Date(now + windowMs),
    };
  }

  entry.count += 1;

  if (entry.count > maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: new Date(entry.resetTime),
    };
  }

  return {
    allowed: true,
    remaining: maxAttempts - entry.count,
    resetTime: new Date(entry.resetTime),
  };
}

/**
 * Clear rate limit for a key
 */
export function clearRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

// ============== INPUT SANITIZATION ==============

/**
 * Remove potentially dangerous characters
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/[;'"]/g, '') // Remove quotes and semicolons
    .replace(/\0/g, '') // Remove null bytes
    .trim();
}

/**
 * Sanitize SQL-like injection attempts
 */
export function sanitizeSQLInput(input: string): string {
  return input
    .replace(/'/g, "''") // Escape single quotes
    .replace(/"/g, '""') // Escape double quotes
    .trim();
}

/**
 * Validate and sanitize URL
 */
export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http and https
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============== CSRF PROTECTION ==============

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify CSRF token
 */
export function verifyCSRFToken(token: string, storedToken: string): boolean {
  // Use constant-time comparison to prevent timing attacks
  if (token.length !== storedToken.length) {
    return false;
  }

  let valid = 0;
  for (let i = 0; i < token.length; i++) {
    valid |= token.charCodeAt(i) ^ storedToken.charCodeAt(i);
  }

  return valid === 0;
}

// ============== DATA ENCRYPTION ==============

/**
 * Encrypt sensitive data (for PII, payment info, etc.)
 * Note: In production, use proper key management
 */
export function encryptData(data: string, encryptionKey: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'hex'), iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 */
export function decryptData(encryptedData: string, encryptionKey: string): string {
  const [ivHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'hex'), iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============== AUDIT LOGGING ==============

export interface AuditLog {
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  changes: Record<string, { from: any; to: any }>;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failure';
  errorMessage?: string;
}

/**
 * Create audit log entry
 */
export function createAuditLog(
  userId: string,
  action: string,
  resource: string,
  changes: Record<string, { from: any; to: any }>,
  status: 'success' | 'failure' = 'success',
  errorMessage?: string
): AuditLog {
  return {
    timestamp: new Date(),
    userId,
    action,
    resource,
    changes,
    status,
    errorMessage,
  };
}

// ============== PERMISSION CHECKS ==============

/**
 * Check if user has required permission
 */
export function checkPermission(
  userRole: string,
  requiredRole: string | string[]
): boolean {
  const roleHierarchy: Record<string, number> = {
    'super_admin': 5,
    'admin': 4,
    'manager': 3,
    'user': 2,
    'demo': 1,
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const required = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  return required.some((role) => {
    const requiredLevel = roleHierarchy[role] || 0;
    return userLevel >= requiredLevel;
  });
}

// ============== SENSITIVE DATA MASKING ==============

/**
 * Mask sensitive information in logs
 */
export function maskSensitiveData(data: any): any {
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'ssn'];

  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const masked = { ...data };

  for (const field of sensitiveFields) {
    if (field in masked) {
      const value = String(masked[field]);
      if (value.length > 4) {
        masked[field] = value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
      } else {
        masked[field] = '*'.repeat(value.length);
      }
    }
  }

  return masked;
}
