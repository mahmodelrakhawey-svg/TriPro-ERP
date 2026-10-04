/**
 * Security Utilities for TriPro ERP
 * Password hashing, rate limiting, CSRF protection, etc.
 */

import crypto from 'crypto';

// ============== PASSWORD SECURITY ==============

/**
 * Hash password using PBKDF2-SHA512
 * @security Uses 310,000 iterations per NIST SP 800-132 (2024 minimum recommendation)
 * For client-side use, consider using bcryptjs or Argon2
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(32).toString('hex'); // 256-bit salt
  const hash = crypto
    .pbkdf2Sync(password, salt, 310_000, 64, 'sha512')
    .toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password (supports both old 1000-iteration hashes and new 310000-iteration hashes)
 */
export function verifyPassword(storedHash: string, passwordAttempt: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  
  // Try new iteration count first
  const hashNew = crypto
    .pbkdf2Sync(passwordAttempt, salt, 310_000, 64, 'sha512')
    .toString('hex');
  if (hashNew === originalHash) return true;

  // Backward compatibility: try old iteration count
  const hashOld = crypto
    .pbkdf2Sync(passwordAttempt, salt, 1_000, 64, 'sha512')
    .toString('hex');
  return hashOld === originalHash;
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
  changes: Record<string, { from: unknown; to: unknown }>;
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
  changes: Record<string, { from: unknown; to: unknown }>,
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

/**
 * Persist audit log to Supabase security_audit_logs table
 * يحفظ سجل المراجعة الأمني في قاعدة البيانات بشكل فعلي
 */
export async function persistAuditLog(
  log: AuditLog,
  supabaseClient: { rpc: Function }
): Promise<void> {
  try {
    await supabaseClient.rpc('log_security_event', {
      p_action: log.action,
      p_resource: log.resource,
      p_resource_id: (log as any).resourceId ?? null,
      p_changes: log.changes ?? null,
      p_status: log.status,
      p_error_message: log.errorMessage ?? null,
    });
  } catch {
    // Silent fail — audit logging must never crash the main flow
    if (process.env.NODE_ENV !== 'production') console.warn('[AuditLog] Failed to persist audit log to DB:', log.action);
  }
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
export function maskSensitiveData<T>(data: T): T {
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'ssn'];

  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const masked = { ...(data as Record<string, unknown>) };

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

  return masked as unknown as T;
}
