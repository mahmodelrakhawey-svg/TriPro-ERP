import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing on serverless environment.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { action = 'backup', organizationId } = req.body || req.query || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required.' });
    }

    // Call stored procedure to create backup
    const { data: backupId, error: rpcError } = await supabase.rpc('create_organization_backup', {
      p_org_id: organizationId
    });

    if (rpcError) throw rpcError;

    return res.status(200).json({
      success: true,
      message: 'تم إنشاء النسخة الاحتياطية بنجاح.',
      backupId
    });

  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'فشلت عملية النسخ الاحتياطي السحابي'
    });
  }
}
