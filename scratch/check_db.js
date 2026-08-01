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
  console.log('Signing in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'demo@demo.com',
    password: '123456'
  });

  if (authError) {
    console.error('Sign-in failed:', authError.message);
    return;
  }

  console.log('Signed in successfully! Session user ID:', authData.user?.id);

  console.log('Fetching customers matching Egypt or Al-Saad...');
  const { data: customers, error: custError } = await supabase
    .from('customers')
    .select('*')
    .or('name.ilike.%مصر%,name.ilike.%السعد%');
  
  if (custError) {
    console.error('Error fetching customers:', custError);
  } else {
    console.log(`Found ${customers?.length || 0} customers:`);
    for (const c of customers || []) {
      console.log(`ID: ${c.id}`);
      console.log(`  Name: ${c.name}`);
      console.log(`  Type: ${c.customer_type}`);
      console.log(`  GL Account ID: ${c.gl_account_id}`);
      console.log('-'.repeat(40));
    }
  }

  console.log('Fetching hims_billing...');
  const { data: bills, error: billError } = await supabase
    .from('hims_billing')
    .select('*, hims_patients(full_name), insurance_provider:insurance_provider_id(name)');
  
  if (billError) {
    console.error('Error fetching billing:', billError);
  } else {
    console.log(`Found ${bills?.length || 0} bills:`);
    for (const bill of bills || []) {
      console.log(`Bill ID: ${bill.id}`);
      console.log(`  Patient: ${bill.hims_patients?.full_name}`);
      console.log(`  Insurance: ${bill.insurance_provider?.name || 'None'}`);
      console.log(`  Total Amount: ${bill.total_amount}`);
      console.log(`  Insurance Covered: ${bill.insurance_covered_amount}`);
      console.log(`  Patient Paid: ${bill.patient_paid_amount}`);
      console.log(`  Related Journal Entry: ${bill.related_journal_entry_id}`);
      
      if (bill.related_journal_entry_id) {
        const { data: lines } = await supabase
          .from('journal_lines')
          .select('*, accounts(code, name)')
          .eq('journal_entry_id', bill.related_journal_entry_id);
        
        if (lines) {
          for (const line of lines) {
            console.log(`    Line - Account: ${line.accounts?.code} (${line.accounts?.name}), Debit: ${line.debit}, Credit: ${line.credit}`);
          }
        }
      }
      console.log('-'.repeat(40));
    }
  }
}

run();
