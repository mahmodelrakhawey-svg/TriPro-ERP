import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env values");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});
async function run() {
  console.log('Signing in as malak@gmail.com...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'malak@gmail.com',
    password: '12345678'
  });
  if (authError) {
    console.error('Sign-in error:', authError.message);
    return;
  }

  // Update user_metadata to super_admin
  const { data: updateRes, error: updateResErr } = await supabase.auth.updateUser({
    data: { role: 'super_admin' }
  });
  console.log('User metadata updated:', updateResErr || 'Success');

  // Also update profiles
  await supabase.from('profiles').update({ role: 'super_admin' }).eq('id', authData.user.id);

  const halawanyOrgId = '2d9b24d6-f5cf-4bd9-b8b6-0a85d1c9c967';
  const { data: org } = await supabase.from('organizations').select('id, name').eq('id', halawanyOrgId).single();
  const { data: whs } = await supabase.from('warehouses').select('name, type').eq('organization_id', halawanyOrgId);
  const { data: wcs } = await supabase.from('mfg_work_centers').select('name, hourly_rate').eq('organization_id', halawanyOrgId);
  const { data: prods } = await supabase.from('products').select('name, product_type, unit, sales_price').eq('organization_id', halawanyOrgId);
  const { data: routings } = await supabase.from('mfg_routings').select('name, products(name)').eq('organization_id', halawanyOrgId);
  
  console.log('--- VERIFICATION ---');
  console.log('Org:', org?.name);
  console.log(`Warehouses (${whs?.length}):`, whs?.map(w => w.name));
  console.log(`Work Centers (${wcs?.length}):`, wcs?.map(w => `${w.name} (${w.hourly_rate} ج/س)`));
  console.log(`Products (${prods?.length}):`, prods?.slice(0, 5).map(p => `${p.name} [${p.product_type}]`));
  console.log(`Routings (${routings?.length}):`, routings?.map(r => `${r.name} -> ${r.products?.name}`));
}

run();
