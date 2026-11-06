import { describe, it, expect } from 'vitest';
import { offsiteBackupService } from '../services/offsiteBackupService';

describe('Offsite Backup AES-256-GCM Encryption (تشفير النسخ الاحتياطية)', () => {
  it('يجب تشفير وفك تشفير حمولة النسخة الاحتياطية بنجاح وتطابق المحتوى 100%', async () => {
    const rawData = JSON.stringify({
      organization: 'TriPro Enterprise Group',
      fiscalYear: 2026,
      ledgerEntriesCount: 15420,
      totalAssets: 95400210.50,
      secretKeys: ['sec-key-1', 'sec-key-2']
    });

    const passphrase = 'SuperSecretEncryptionPassword@2026!';

    // 1. التشفير
    const { encryptedBase64, ivHex } = await offsiteBackupService.encryptPayload(rawData, passphrase);

    expect(encryptedBase64).toBeDefined();
    expect(encryptedBase64.length).toBeGreaterThan(50);
    expect(ivHex).toBeDefined();
    expect(ivHex.length).toBe(24); // 12 bytes = 24 hex characters
    expect(encryptedBase64).not.toContain('TriPro Enterprise Group'); // لا تظهر البيانات كنص صريح

    // 2. فك التشفير بكلمة المرور الصحيحة
    const decrypted = await offsiteBackupService.decryptPayload(encryptedBase64, ivHex, passphrase);
    expect(decrypted).toBe(rawData);

    const parsed = JSON.parse(decrypted);
    expect(parsed.organization).toBe('TriPro Enterprise Group');
    expect(parsed.totalAssets).toBe(95400210.50);
  });

  it('يجب أن يفشل فك التشفير عند استخدام كلمة مرور غير صحيحة', async () => {
    const rawData = 'Important Confidential Accounting Data';
    const passphrase = 'CorrectPassword123';
    const wrongPassphrase = 'WrongPassword456';

    const { encryptedBase64, ivHex } = await offsiteBackupService.encryptPayload(rawData, passphrase);

    await expect(
      offsiteBackupService.decryptPayload(encryptedBase64, ivHex, wrongPassphrase)
    ).rejects.toThrow();
  });
});
