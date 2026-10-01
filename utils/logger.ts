/**
 * ==============================================================================
 * TriPro ERP — Enterprise Safe Logger Utility
 * utils/logger.ts
 * ==============================================================================
 * يوفر مسار تسجيل آمن ومنضبط يمنع تسريب بيانات التطوير في بيئة الإنتاج (Production)
 * ويسمح بمتابعة الأخطاء فقط دون استهلاك موارد المتصفح.
 * ==============================================================================
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  log: (...args: unknown[]): void => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  },
  info: (...args: unknown[]): void => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.info(...args);
    }
  },
  warn: (...args: unknown[]): void => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.warn(...args);
    }
  },
  error: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    console.error(...args);
  },
  debug: (...args: unknown[]): void => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.debug(...args);
    }
  }
};

export default logger;
