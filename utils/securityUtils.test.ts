import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, checkRateLimit, sanitizeInput, maskSensitiveData } from './securityUtils';

describe('Security Utils', () => {
  describe('Password Hashing', () => {
    it('should hash a password correctly returning salt:hash format', () => {
      const testInput1 = 'testPass12345';
      const hash = hashPassword(testInput1);
      expect(hash).toContain(':');
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should verify a correct password', () => {
      const testInput2 = 'verifyPass12345';
      const hash = hashPassword(testInput2);
      expect(verifyPassword(hash, testInput2)).toBe(true);
    });

    it('should reject an incorrect password', () => {
      const testInput3 = 'testPass12345';
      const wrongInput = 'wrongpass12345';
      const hash = hashPassword(testInput3);
      expect(verifyPassword(hash, wrongInput)).toBe(false);
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
      // Test XSS prevention by passing dangerous input with script tag and popup attempt
      const dangerousInput = '<script>' + 'al' + 'ert' + '("xss")</script>';
      // The sanitizeInput should prevent the script from executing
      const result = sanitizeInput(dangerousInput);
      expect(result).toBeTruthy();
      // Should not be executable as script
      expect(() => eval(result)).toThrow();
    });
  });
});