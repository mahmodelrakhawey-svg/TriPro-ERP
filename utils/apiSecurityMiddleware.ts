/**
 * API Security Middleware
 * Handles request/response security, validation, and logging
 */

import { checkRateLimit, sanitizeInput, verifyCSRFToken, createAuditLog, maskSensitiveData } from './securityUtils';
import { handleError } from './errorHandler';
import { supabase } from '../supabaseClient';

// ============== REQUEST INTERCEPTOR ==============

export interface APIRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  retries?: number;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
  requestId: string;
}

// Generate unique request ID for tracking
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============== SECURE API FETCH ==============

/**
 * Make secure API request with automatic error handling and security checks
 */
export async function secureApiFetch<T = any>(
  request: APIRequest,
  options: {
    validateSchema?: any;
    requireAuth?: boolean;
    rateLimit?: { maxAttempts: number; windowMs: number };
    logAudit?: boolean;
    retryOnFailure?: boolean;
  } = {}
): Promise<APIResponse<T>> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    // ========== SECURITY CHECKS ==========

    // 1. Rate Limiting
    if (options.rateLimit) {
      const userId = localStorage.getItem('userId') || 'anonymous';
      const rateLimitResult = checkRateLimit(userId, options.rateLimit.maxAttempts, options.rateLimit.windowMs);

      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: `تم تجاوز حد المحاولات المسموحة. حاول مرة أخرى بعد ${Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 60000)} دقيقة`,
          timestamp: new Date(),
          requestId,
        };
      }
    }

    // 2. Authentication Check
    if (options.requireAuth) {
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        return {
          success: false,
          error: 'يرجى تسجيل الدخول أولا', // Please log in first
          timestamp: new Date(),
          requestId,
        };
      }
    }

    // 3. CSRF Token Validation (for non-GET requests)
    if (request.method !== 'GET') {
      const storedCSRFToken = sessionStorage.getItem('csrf_token');
      const requestCSRFToken = request.headers?.['X-CSRF-Token'];

      if (!storedCSRFToken || !requestCSRFToken || !verifyCSRFToken(requestCSRFToken, storedCSRFToken)) {
        return {
          success: false,
          error: 'فشل التحقق من الأمان. يرجى إعادة المحاولة', // Security verification failed
          timestamp: new Date(),
          requestId,
        };
      }
    }

    // 4. Input Sanitization
    if (request.body && typeof request.body === 'object') {
      request.body = sanitizeRequestBody(request.body);
    }

    // ========== MAKE REQUEST ==========

    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        ...request.headers,
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
    });

    // ========== HANDLE RESPONSE ==========

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));

      // Audit log for failed requests
      if (options.logAudit) {
        await logAuditEvent({
          action: 'API_REQUEST',
          resource: request.url,
          status: 'failure',
          errorMessage: errorData.message,
        });
      }

      // Retry logic
      if (options.retryOnFailure && response.status >= 500 && (request.retries || 0) < 3) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, request.retries || 0) * 1000));
        return secureApiFetch<T>(
          { ...request, retries: (request.retries || 0) + 1 },
          options
        );
      }

      return {
        success: false,
        error: errorData.message || 'حدث خطأ في الخادم', // Server error occurred
        timestamp: new Date(),
        requestId,
      };
    }

    const data = await response.json();

    // Audit log for successful requests
    if (options.logAudit) {
      await logAuditEvent({
        action: 'API_REQUEST',
        resource: request.url,
        status: 'success',
      });
    }

    return {
      success: true,
      data,
      timestamp: new Date(),
      requestId,
    };
  } catch (error) {
    handleError(error, { logToConsole: true });

    if (options.logAudit) {
      await logAuditEvent({
        action: 'API_REQUEST',
        resource: request.url,
        status: 'failure',
        errorMessage: String(error),
      });
    }

    return {
      success: false,
      error: 'خطأ في الاتصال بالخادم. يرجى المحاولة مرة أخرى', // Server connection error
      timestamp: new Date(),
      requestId,
    };
  }
}

// ============== REQUEST BODY SANITIZATION ==============

/**
 * Recursively sanitize request body
 */
function sanitizeRequestBody(body: any): any {
  if (typeof body !== 'object' || body === null) {
    return body;
  }

  const sanitized = Array.isArray(body) ? [] : {};

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeRequestBody(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ============== AUDIT LOGGING ==============

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resource: string;
  status: 'success' | 'failure';
  errorMessage?: string;
  ipAddress?: string;
}

/**
 * Log API request for audit trail
 */
export async function logAuditEvent(log: AuditLogEntry): Promise<void> {
  try {
    const session = await supabase.auth.getSession();
    const userId = session.data.session?.user?.id || 'anonymous';

    const { error } = await supabase.from('audit_logs').insert([
      {
        user_id: userId,
        action: log.action,
        resource: log.resource,
        status: log.status,
        error_message: log.errorMessage,
        ip_address: log.ipAddress,
        created_at: new Date(),
        request_metadata: maskSensitiveData({ action: log.action, resource: log.resource }),
      },
    ]);

    if (error) {
      console.error('Audit logging failed:', error);
    }
  } catch (error) {
    console.error('Error writing audit log:', error);
  }
}

// ============== BATCH API REQUESTS ==============

/**
 * Make multiple API requests with rate limiting
 */
export async function batchApiFetch<T = any>(
  requests: APIRequest[],
  options?: Parameters<typeof secureApiFetch>[1]
): Promise<APIResponse<T>[]> {
  const results: APIResponse<T>[] = [];

  for (const request of requests) {
    const result = await secureApiFetch<T>(request, options);
    results.push(result);

    // Add delay between requests to prevent overwhelming server
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

// ============== PARALLEL API REQUESTS ==============

/**
 * Make multiple API requests in parallel with concurrency control
 */
export async function parallelApiFetch<T = any>(
  requests: APIRequest[],
  concurrency: number = 3,
  options?: Parameters<typeof secureApiFetch>[1]
): Promise<APIResponse<T>[]> {
  const results: APIResponse<T>[] = [];
  const executing: Promise<any>[] = [];

  for (const request of requests) {
    const promise = secureApiFetch<T>(request, options)
      .then((result) => {
        results.push(result);
        return result;
      })
      .finally(() => {
        executing.splice(executing.indexOf(promise), 1);
      });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  // Wait for all remaining requests to complete
  await Promise.all(executing);

  return results;
}

// ============== ERROR RESPONSE STANDARDIZATION ==============

export interface StandardErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  timestamp: Date;
  requestId: string;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  requestId: string = generateRequestId(),
  details?: Record<string, any>
): StandardErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date(),
    requestId,
  };
}

// ============== RESPONSE VALIDATION ==============

/**
 * Validate API response against schema
 */
export async function validateApiResponse<T>(
  response: any,
  schema: any
): Promise<{ valid: boolean; data?: T; error?: string }> {
  try {
    const validated = await schema.parseAsync(response);
    return { valid: true, data: validated };
  } catch (error) {
    return {
      valid: false,
      error: String(error),
    };
  }
}
