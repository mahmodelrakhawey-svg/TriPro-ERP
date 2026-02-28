import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, checkRateLimit, sanitizeInput, maskSensitiveData } from './securityUtils';

describe('Security Utils', () => {
  describe('Password Hashing', () => {
    it('should hash a password correctly returning salt:hash format', () => {
      const password = 'password123';
      const hash = hashPassword(password);
      expect(hash).toContain(':');
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should verify a correct password', () => {
      const password = 'mySecretPassword';
      const hash = hashPassword(password);
      expect(verifyPassword(hash, password)).toBe(true);
    });

    it('should reject an incorrect password', () => {
      const password = 'password123';
      const hash = hashPassword(password);
      expect(verifyPassword(hash, 'wrongpassword')).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within limit', () => {
      const key = 'test-user-1';
      const limit = 2;
      // المحاولة الأولى
      let result = checkRateLimit(key, limit, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);

      // المحاولة الثانية
      result = checkRateLimit(key, limit, 1000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('should block requests exceeding limit', () => {
      const key = 'test-user-block';
      const limit = 1;
      checkRateLimit(key, limit, 1000); // استهلاك الحد
      const result = checkRateLimit(key, limit, 1000); // تجاوز الحد
      expect(result.allowed).toBe(false);
    });
  });

  describe('Input Sanitization', () => {
    it('should remove HTML tags and dangerous characters', () => {
      // sanitizeInput removes <, >, ;, ', "
      const input = '<script>alert("xss")</script>';
      // المتوقع: إزالة الأقواس وعلامات التنصيص
      const expected = 'scriptalert(xss)/script'; 
      expect(sanitizeInput(input)).toBe(expected);
    });
  });
});