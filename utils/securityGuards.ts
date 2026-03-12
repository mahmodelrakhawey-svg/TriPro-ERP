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
export function sanitizeObject<T>(obj: any): T {
  if (!obj) return obj;
  
  if (typeof obj === 'string') {
    return sanitizeHtml(obj) as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item)) as T;
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        sanitized[key] = typeof value === 'string' 
          ? sanitizeHtml(value)
          : sanitizeObject(value);
      }
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Check if value is numeric
 */
export function isNumeric(value: any): boolean {
  return !isNaN(parseFloat(value)) && isFinite(value);
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
