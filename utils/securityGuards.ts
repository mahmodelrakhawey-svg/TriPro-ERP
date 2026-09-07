/**
 * Security Guards - Input Validation, Sanitization & XSS Protection
 * جوارز الأمان - التحقق من المدخلات والتعقيم وحماية XSS
 */

/**
 * Remove HTML/JavaScript from strings to prevent XSS
 * إزالة الـ HTML و JavaScript من النصوص لمنع XSS
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';
  
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
    .trim();
}

/**
 * Sanitize number input - ensure it's a valid number
 */
export function sanitizeNumber(input: string | number): number {
  const num = typeof input === 'string' ? parseFloat(input) : input;
  if (isNaN(num)) return 0;
  return num;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (basic international format)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

/**
 * Sanitize object recursively to remove HTML/JS
 */
export function sanitizeObject<T>(obj: unknown): T {
  if (!obj) return obj as unknown as T;
  
  if (typeof obj === 'string') {
    return sanitizeHtml(obj) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item)) as unknown as T;
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const sanitized: Record<string, unknown> = {};
    const objRecord = obj as Record<string, unknown>;
    for (const key in objRecord) {
      if (Object.prototype.hasOwnProperty.call(objRecord, key)) {
        const value = objRecord[key];
        sanitized[key] = typeof value === 'string' 
          ? sanitizeHtml(value)
          : sanitizeObject(value);
      }
    }
    return sanitized as unknown as T;
  }
  
  return obj as unknown as T;
}

/**
 * Check if value is numeric
 */
export function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return !isNaN(value) && isFinite(value);
  if (typeof value === 'string') return !isNaN(parseFloat(value)) && isFinite(parseFloat(value));
  return false;
}

/**
 * Validate and extract safe JSON
 */
export function parseSafeJSON<T>(jsonString: string, fallback: T): T {
  try {
    const parsed = JSON.parse(jsonString);
    return sanitizeObject<T>(parsed);
  } catch {
    return fallback;
  }
}

/**
 * Encode HTML entities
 */
export function encodeHtmlEntities(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Validate URL to prevent javascript: and data: protocols
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    // Reject dangerous protocols
    if (url.protocol === 'javascript:' || url.protocol === 'data:') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize file names to prevent path traversal
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/\.\./g, '') // Remove ..
    .replace(/[/\\]/g, '') // Remove slashes
    .replace(/^\.+/, '') // Remove leading dots
    .slice(0, 255); // Limit length
}

/**
 * Prevent CSV injection
 */
export function sanitizeForCSV(value: string): string {
  const firstChar = value.charAt(0);
  if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
    return "'" + value; // Prepend single quote
  }
  return value;
}

/**
 * Create a Content Security Policy compliant string
 */
export function createSafeString(input: string): string {
  return sanitizeHtml(encodeHtmlEntities(input));
}
