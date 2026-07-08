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
        const { data: products, error: pError } = await supabase.from('products').select('id, name, category_id, product_type');
        const { data: menuCats, error: mError } = await supabase.from('menu_categories').select('id, name');
        const { data: itemCats, error: iError } = await supabase.from('item_categories').select('id, name');

        console.log("Products count:", products?.length);
        console.log("Menu Categories count:", menuCats?.length);
        console.log("Item Categories count:", itemCats?.length);

        console.log("\nProducts sample:");
        console.log(products?.slice(0, 10));

        console.log("\nMenu Categories sample:");
        console.log(menuCats?.slice(0, 10));

        console.log("\nItem Categories sample:");
        console.log(itemCats?.slice(0, 10));

        // Check if there are any products that have category_id matching any menu category
        const matchCount = products?.filter(p => menuCats?.some(c => c.id === p.category_id)).length;
        console.log("\nProducts with matching category_id count:", matchCount);
    } catch (e) {
        console.error(e);
    }
}

test();
