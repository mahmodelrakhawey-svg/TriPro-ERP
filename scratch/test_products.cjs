const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env', 'utf-8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL\s*=\s*(.*)/);
const keyMatch = envContent.match(/VITE_SUPABASE_KEY\s*=\s*(.*)/);

if (!urlMatch || !keyMatch) {
    console.error("Supabase credentials not found in .env");
    process.exit(1);
}

const supabaseUrl = urlMatch[1].replace(/["']/g, "").trim();
const supabaseKey = keyMatch[1].replace(/["']/g, "").trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    try {
        const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email: 'malak@gmail.com', password: '12345678' });
        console.log("Logged in user:", auth?.user?.email, "Error:", authErr);

        const checkNumbers = ['VAN-735375', 'VAN-162626', 'VAN-069467', 'VAN-295340', 'VAN-425149'];
        for (const num of checkNumbers) {
            const { data: ent } = await supabase
                .from('journal_entries')
                .select('id, reference, status, is_posted')
                .eq('reference', num);
            console.log(`Invoice ${num}: Journal entry =`, ent);
        }
        return;
        const { data: allEntries, error: allErr } = await supabase
            .from('journal_entries')
            .select('id, reference, description, status, is_posted, transaction_date');

        console.log(`Total entries in system: ${allEntries?.length || 0}`);

        let unbalancedCount = 0;
        const unbalancedList = [];

        // Fetch lines in chunks or iterate
        for (let i = 0; i < (allEntries || []).length; i += 50) {
            const chunk = (allEntries || []).slice(i, i + 50);
            const chunkIds = chunk.map(e => e.id);

            const { data: allLines } = await supabase
                .from('journal_lines')
                .select('journal_entry_id, debit, credit, accounts(code, name)')
                .in('journal_entry_id', chunkIds);

            for (const ent of chunk) {
                const lines = (allLines || []).filter(l => l.journal_entry_id === ent.id);
                const d = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                const c = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

                if (Math.abs(d - c) > 0.01) {
                    unbalancedCount++;
                    unbalancedList.push({
                        ref: ent.reference,
                        desc: ent.description,
                        debit: d,
                        credit: c,
                        diff: d - c
                    });
                }
            }
        }

        console.log(`\nUnbalanced entries found: ${unbalancedCount}`);
        if (unbalancedList.length > 0) {
            console.table(unbalancedList);
        } else {
            console.log('✅ ALL JOURNAL ENTRIES IN SYSTEM ARE 100% BALANCED!');
        }
    } catch (e) {
        console.error('Exception:', e);
    }
}
test();
