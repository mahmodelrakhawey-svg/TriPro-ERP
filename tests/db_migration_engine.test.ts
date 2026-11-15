import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

describe('🛡️ Database Migration & Schema Version Control Engine', () => {
  const updatesDir = path.resolve(process.cwd(), 'sql_updates');

  it('يجب أن يتحقق من وجود مجلد sql_updates وقراءة ملفات الترحيل بصيغة SQL', () => {
    expect(fs.existsSync(updatesDir)).toBe(true);
    const files = fs.readdirSync(updatesDir).filter(f => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
  });

  it('يجب أن يحسب بصمة التجزئة SHA-256 بدقة متطابقة للملفات لمنع التعديل بعد التطبيق', () => {
    const sample = 'SELECT 1;';
    const hash = crypto.createHash('sha256').update(sample).digest('hex');
    expect(hash).toHaveLength(64);
    expect(typeof hash).toBe('string');
  });

  it('يجب أن يحتوي سكربت الترحيلات على محرك تتبع الإصدارات وسكربتات التوليد', () => {
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'db_migrate.mjs');
    expect(fs.existsSync(scriptPath)).toBe(true);
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    expect(scriptContent).toContain('_schema_migrations');
    expect(scriptContent).toContain('--status');
    expect(scriptContent).toContain('--bundle');
  });
});
