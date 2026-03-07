import { supabase } from '../src/supabaseClient';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * This function acts as a simple cron job endpoint.
 * Vercel will call this endpoint based on the schedule in vercel.json.
 * Its purpose is to send a minimal query to the Supabase database
 * to prevent it from being paused due to inactivity on the free tier.
 */
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  try {
    // A very simple and fast query to a small table.
    const { error } = await supabase.from('company_settings').select('id').limit(1);
    if (error) throw error;

    response.status(200).send('Supabase database has been successfully pinged. It will not sleep.');
  } catch (error: any) {
    response.status(500).send(`Error pinging Supabase: ${error.message}`);
  }
}