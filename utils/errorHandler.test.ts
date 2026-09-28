import { describe, it, expect, vi } from 'vitest';
import { AppError, handleError, handleSupabaseError, notifyUserError, validateAmount, validateDate, validateRequired } from './errorHandler';
import { registerGlobalToastListener } from '../context/ToastContext';

describe('Error Handler Utils', () => {
  describe('AppError Class', () => {
    it('should create an instance with correct properties', () => {
      const error = new AppError('Test error', 'TEST_CODE', 'high', { id: 1 });
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.severity).toBe('high');
      expect(error.context).toEqual({ id: 1 });
    });
  });

  describe('handleError Function', () => {
    it('should handle string errors and convert them to AppError', () => {
      const showNotification = vi.fn();
      const errorString = 'Simple string error';
      
      const result = handleError(errorString, { showNotification, logToConsole: false });
      
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe(errorString);
      expect(showNotification).toHaveBeenCalled();
    });

    it('should handle AppError instances correctly', () => {
      const showNotification = vi.fn();
      const originalError = new AppError('Custom error', 'CUSTOM', 'low');
      
      const result = handleError(originalError, { showNotification, logToConsole: false });
      
      expect(result).toBe(originalError);
      expect(showNotification).toHaveBeenCalledWith('Custom error', 'error');
    });
  });

  describe('handleSupabaseError', () => {
    it('should return default message if no error provided', () => {
      expect(handleSupabaseError(null, 'create')).toBe('حدث خطأ غير معروف');
    });

    it('should handle unique constraint errors', () => {
      const error = { message: 'duplicate key value violates unique constraint' };
      expect(handleSupabaseError(error, 'create')).toContain('هذا السجل موجود بالفعل');
    });

    it('should handle foreign key constraint errors', () => {
      const error = { message: 'violates foreign key constraint' };
      expect(handleSupabaseError(error, 'delete')).toContain('لا يمكن حذف هذا السجل لأنه مرتبط ببيانات أخرى');
    });
    it('should handle RLS permission errors', () => {
      const error = { code: '42501', message: 'row-level security policy violation' };
      expect(handleSupabaseError(error, 'تعديل السعر')).toContain('ليس لديك الصلاحيات الكافية');
    });

    it('should handle network disconnection errors', () => {
      const error = { message: 'Failed to fetch' };
      expect(handleSupabaseError(error, 'المزامنة')).toContain('تعذر الاتصال بالخادم');
    });
  });

  describe('Toast Notification Integration & notifyUserError', () => {
    it('handleError should automatically notify user via toastNotify if no custom showNotification is provided', () => {
      let dispatchedMessage = '';
      let dispatchedType = '';

      registerGlobalToastListener((msg, type) => {
        dispatchedMessage = msg;
        dispatchedType = type;
      });

      handleError('خطأ تجريبي عام', { logToConsole: false });

      expect(dispatchedMessage).toBe('خطأ تجريبي عام');
      expect(dispatchedType).toBe('error');

      registerGlobalToastListener(null);
    });

    it('notifyUserError should format error message and dispatch to user toast', () => {
      let dispatchedMessage = '';
      let dispatchedType = '';

      registerGlobalToastListener((msg, type) => {
        dispatchedMessage = msg;
        dispatchedType = type;
      });

      const err = new Error('duplicate key value violates unique constraint');
      notifyUserError(err, 'حفظ الفاتورة');

      expect(dispatchedMessage).toContain('هذا السجل موجود بالفعل في حفظ الفاتورة');
      expect(dispatchedType).toBe('error');

      registerGlobalToastListener(null);
    });
  });

  describe('Validation Helpers', () => {
    it('validateAmount should throw on negative numbers', () => {
      expect(() => validateAmount(-10)).toThrow('لا يمكن أن يكون سالب');
    });

    it('validateAmount should throw on zero', () => {
      expect(() => validateAmount(0)).toThrow('لا يمكن أن يكون صفر');
    });

    it('validateRequired should throw on empty strings', () => {
      expect(() => validateRequired('', 'Name')).toThrow('Name مطلوب');
    });

    it('validateDate should throw on invalid dates', () => {
      expect(() => validateDate('invalid-date')).toThrow('غير صحيح');
    });
  });
});