import * as XLSX from 'xlsx';
import { supabase } from '../../../supabaseClient';

export const downloadProductsTemplate = () => {
  const headers = [
    { 
      'اسم الصنف': 'صنف تجريبي 1', 
      'الكود (SKU)': 'SKU-001', 
      'الباركود': '6221234567890', 
      'التصنيف': 'عام', 
      'نوع الصنف': 'مخزوني', 
      'الوحدة': 'قطعة', 
      'الكمية الافتتاحية': 100, 
      'سعر الشراء': 20, 
      'سعر البيع': 25, 
      'الوصف': 'وصف تجريبي للصنف' 
    }
  ];
  const ws = XLSX.utils.json_to_sheet(headers);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "نموذج المنتجات");
  XLSX.writeFile(wb, "Products_Template.xlsx");
};

export const downloadRecipeTemplate = () => {
  const headers = [
    { 'كود الوجبة (SKU)': '', 'اسم الوجبة': '', 'كود المكون (SKU)': '', 'اسم المكون': '', 'الكمية المطلوبة': '', 'الوحدة': '' }
  ];
  const ws = XLSX.utils.json_to_sheet(headers);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "نموذج الوصفات");
  XLSX.writeFile(wb, "Recipes_Template.xlsx");
};

export const exportProductsToExcel = async ({
  targetOrgId,
  categories,
  queryModifier,
  showToast,
  setIsExporting,
}: {
  targetOrgId?: string | null;
  categories: any[];
  queryModifier: (query: any) => any;
  showToast: (msg: string, type?: string) => void;
  setIsExporting: (val: boolean) => void;
}) => {
  setIsExporting(true);
  showToast('جاري جلب وتجهيز كافة الأصناف للتصدير...', 'info');
  try {
    const CHUNK_SIZE = 1000;
    let allItems: any[] = [];
    let from = 0;

    while (true) {
      let query = supabase.from('products').select('*');
      if (targetOrgId) {
        query = query.eq('organization_id', targetOrgId);
      }
      query = query.is('deleted_at', null);
      query = queryModifier(query);
      query = query.order('id', { ascending: true }).range(from, from + CHUNK_SIZE - 1);

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) break;
      allItems = allItems.concat(data);
      if (data.length < CHUNK_SIZE) break;
      from += CHUNK_SIZE;
    }

    if (allItems.length === 0) {
      showToast('لا توجد أصناف لتصديرها وفق الفلاتر الحالية.', 'info');
      return;
    }

    const dataToExport = allItems.map(item => {
      const categoryName = categories.find(c => c.id === item.category_id)?.name || (item as any).category || '-';
      const pType = String(item.product_type || item.item_type || '').toUpperCase();
      const mType = String((item as any).mfg_type || '').toLowerCase();
      let typeLabel = 'مخزوني';
      if (pType === 'RAW_MATERIAL' || mType === 'raw') typeLabel = 'مادة خام';
      else if (pType === 'INTERMEDIATE_PRODUCT' || mType === 'intermediate' || mType === 'subassembly') typeLabel = 'منتج وسيط';
      else if (pType === 'MANUFACTURED' || mType === 'standard' || item.item_type === 'MANUFACTURED') typeLabel = 'منتج تام';
      else if (pType === 'SERVICE' || item.item_type === 'SERVICE') typeLabel = 'خدمي';

      return {
        'اسم الصنف': item.name,
        'الكود (SKU)': item.sku || '-',
        'الباركود': item.barcode || (item as any).barcode2 || '-',
        'التصنيف': categoryName,
        'النوع': typeLabel,
        'الوحدة': item.unit || '-',
        'الرصيد الحالي': Number(item.stock || 0),
        'سعر الشراء': Number(item.purchase_price || 0),
        'متوسط التكلفة': Number(item.weighted_average_cost || item.purchase_price || 0),
        'سعر البيع': Number(item.sales_price || 0),
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "قائمة الأصناف");
    XLSX.writeFile(wb, `Products_List_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast(`تم تصدير ${allItems.length} صنف بنجاح إلى Excel ✅`, 'success');
  } catch (err: any) {
    showToast('فشل التصدير: ' + err.message, 'error');
  } finally {
    setIsExporting(false);
  }
};

export const exportScalePLUToExcel = async (showToast: (msg: string, type?: string) => void) => {
  showToast('جاري تجهيز ملف أصناف الموازين (PLU Export)...', 'info');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userOrgId = session?.user?.user_metadata?.org_id;
    if (!userOrgId) return;

    const { data: scaleItems, error } = await supabase
      .from('products')
      .select('*, item_categories(name)')
      .eq('organization_id', userOrgId)
      .eq('is_active', true)
      .eq('is_scale_item', true)
      .order('name');

    if (error) throw error;

    if (!scaleItems || scaleItems.length === 0) {
      showToast('لم يتم العثور على أي صنف ميزان! قم بتعديل كارت الصنف (مثل الأجبان واللحوم والخضار) وتفعيل خيار "صنف ميزان (Scale Item)" أولاً.', 'info');
      return;
    }

    const pluData = (scaleItems || []).map((item: any, idx: number) => {
      const rawCode = (item.sku || '').replace(/\D/g, '');
      const pluNumber = item.plu_number || (rawCode ? parseInt(rawCode, 10) : (idx + 1));
      const paddedPlu = String(pluNumber).padStart(5, '0');
      const prefix = item.scale_prefix || '22';

      return {
        'رقم الميزان (PLU)': pluNumber,
        'كود الصنف (Item Code)': paddedPlu,
        'اسم الصنف (Name)': item.name,
        'سعر الكيلو (Price/KG)': item.sales_price,
        'وحدة الوزن (Unit)': item.unit || 'كجم',
        'بادئة الباركود (Prefix)': prefix,
        'الباركود الكامل (Sample Barcode)': `${prefix}${paddedPlu}010000`,
        'القسم (Department)': item.item_categories?.name || item.category || 'أجبان / لحوم / خضار',
        'نوع الصنف بالميزان (Scale Type)': 'وزن (Weight)',
      };
    });

    const ws = XLSX.utils.json_to_sheet(pluData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scale_PLU_List");
    XLSX.writeFile(wb, `Scale_PLU_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast(`تم تصدير ${pluData.length} صنف ميزان بنجاح ✅ جاهز للرفع على برامج الموازين`, 'success');
  } catch (err: any) {
    showToast('فشل تصدير ملف الموازين: ' + err.message, 'error');
  }
};

export const importRecipesFromExcel = async ({
  file,
  currentUser,
  getSystemAccount,
  refresh,
  setAutoCreatedProducts,
  setIsReportModalOpen,
  showToast,
  setIsRecipeImporting,
}: {
  file: File;
  currentUser: any;
  getSystemAccount: (key: string) => any;
  refresh: () => void;
  setAutoCreatedProducts: (list: any[]) => void;
  setIsReportModalOpen: (open: boolean) => void;
  showToast: (msg: string, type?: string) => void;
  setIsRecipeImporting: (val: boolean) => void;
}) => {
  setIsRecipeImporting(true);

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);

      const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      const defaultInventory = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || null;
      const defaultCogs = getSystemAccount('COGS')?.id || null;
      const defaultSales = getSystemAccount('SALES_REVENUE')?.id || null;

      const { data: allProducts } = await supabase.from('products').select('id, name, sku, unit');
      const productMap = new Map();
      const productDetailsMap = new Map();
      
      allProducts?.forEach(p => {
        productDetailsMap.set(p.id, p);
        if (p.sku) productMap.set(String(p.sku).trim().toLowerCase(), p.id);
        if (p.name) productMap.set(String(p.name).trim().toLowerCase(), p.id);
      });

      let successCount = 0;
      let failCount = 0;
      const bomInserts: any[] = [];
      const unitUpdates = new Map<string, string>();
      const createdList: any[] = [];

      const getConversionFactor = (fromUnit: string, toUnit: string) => {
        const normalize = (u: string) => {
          if (!u) return '';
          u = u.toLowerCase().trim();
          u = u.replace(/[0-9.()]/g, '').trim();
          if (['kg', 'kilo', 'kilogram', 'kgs', 'كجم', 'كيلو', 'كيلوجرام'].includes(u)) return 'kg';
          if (['g', 'gm', 'gram', 'gr', 'grams', 'جرام', 'جم'].includes(u)) return 'g';
          if (['l', 'liter', 'litre', 'liters', 'لتر'].includes(u)) return 'l';
          if (['ml', 'milli', 'milliliter', 'milliliters', 'مل', 'ملل', 'مللي'].includes(u)) return 'ml';
          if (['piece', 'pcs', 'pc', 'unit', 'قطعة', 'حبه', 'حبة', 'عدد', 'وحدة'].includes(u)) return 'piece';
          if (['dozen', 'doz', 'dz', 'دسته', 'دستة'].includes(u)) return 'dozen';
          if (['carton', 'ctn', 'box', 'pack', 'crate', 'كرتونة', 'كرتون', 'علبة', 'باكيت', 'صندوق'].includes(u)) return 'carton';
          if (['pallet', 'pl', 'plt', 'بالتة', 'بالته', 'طبلية'].includes(u)) return 'pallet';
          return u;
        };

        const extractNumber = (str: string) => {
          if (!str) return 1;
          const match = str.match(/(\d+(\.\d+)?)/);
          return match ? parseFloat(match[0]) : 1;
        };

        const nFrom = normalize(fromUnit);
        const nTo = normalize(toUnit);
        const fromFactor = extractNumber(fromUnit);
        const toFactor = extractNumber(toUnit);

        if (nFrom === nTo) {
          if (nFrom === 'carton' || nFrom === 'pallet') return fromFactor / toFactor;
          return 1;
        }
        
        if (nFrom === 'g' && nTo === 'kg') return 0.001;
        if (nFrom === 'kg' && nTo === 'g') return 1000;
        if (nFrom === 'ml' && nTo === 'l') return 0.001;
        if (nFrom === 'l' && nTo === 'ml') return 1000;

        let fromBase = 1;
        if (nFrom === 'dozen') fromBase = 12;
        else if (nFrom === 'carton') fromBase = fromFactor > 1 ? fromFactor : 1;
        else if (nFrom === 'pallet') fromBase = fromFactor > 1 ? fromFactor : 1;

        let toBase = 1;
        if (nTo === 'dozen') toBase = 12;
        else if (nTo === 'carton') toBase = toFactor > 1 ? toFactor : 1;
        else if (nTo === 'pallet') toBase = toFactor > 1 ? toFactor : 1;

        if ((nFrom === 'piece' || nFrom === 'dozen' || nFrom === 'carton' || nFrom === 'pallet') && 
            (nTo === 'piece' || nTo === 'dozen' || nTo === 'carton' || nTo === 'pallet')) {
          return fromBase / toBase;
        }

        return 1;
      };

      for (const rawRow of data as any[]) {
        const row: any = {};
        Object.keys(rawRow).forEach(key => {
          row[key.trim()] = rawRow[key];
        });

        const pSku = row['كود الوجبة (SKU)'] || row['كود الوجبة'];
        const pName = row['اسم الوجبة'] || row['اسم المنتج التام'];
        const mSku = row['كود المكون (SKU)'] || row['كود المكون'] || row['كود الصنف'];
        const mName = row['اسم المكون'] || row['المكونات'] || row['اسم الصنف'];
        const qty = row['الكمية المطلوبة'] || row['الكمية'];
        const unit = row['الوحدة'] || row['الوحدات'];

        const pKeySku = pSku ? String(pSku).trim().toLowerCase() : '';
        const pKeyName = pName ? String(pName).trim().toLowerCase() : '';
        const mKeySku = mSku ? String(mSku).trim().toLowerCase() : '';
        const mKeyName = mName ? String(mName).trim().toLowerCase() : '';

        let productId = (pKeySku && productMap.get(pKeySku)) || (pKeyName && productMap.get(pKeyName));
        let materialId = (mKeySku && productMap.get(mKeySku)) || (mKeyName && productMap.get(mKeyName));

        if (!productId && pName) {
          try {
            const { data: newProduct, error: createError } = await supabase.from('products').insert({
              name: String(pName).trim(),
              sku: pSku ? String(pSku).trim() : null,
              product_type: 'MANUFACTURED',
              item_type: 'MANUFACTURED',
              sales_price: 0,
              purchase_price: 0,
              cost: 0,
              p_stock: 0,
              p_org_id: orgId,
              organization_id: orgId,
              inventory_account_id: defaultInventory,
              cogs_account_id: defaultCogs,
              sales_account_id: defaultSales,
              is_active: true
            }).select('id, name, sku').single();

            if (!createError && newProduct) {
              productId = newProduct.id;
              if (newProduct.sku) productMap.set(String(newProduct.sku).trim().toLowerCase(), newProduct.id);
              productMap.set(String(newProduct.name).trim().toLowerCase(), newProduct.id);
              createdList.push({ name: newProduct.name, sku: newProduct.sku, type: 'وجبة (Meal)' });
            }
          } catch (err) {
            console.error("Failed to auto-create meal:", err);
          }
        }

        if (!materialId && mName) {
          try {
            const { data: newMaterial, error: createMatError } = await supabase.from('products').insert({
              name: String(mName).trim(),
              sku: mSku ? String(mSku).trim() : null,
              product_type: 'RAW_MATERIAL',
              item_type: 'RAW_MATERIAL',
              sales_price: 0,
              purchase_price: 0,
              cost: 0,
              p_stock: 0,
              p_org_id: orgId,
              organization_id: orgId,
              inventory_account_id: defaultInventory,
              cogs_account_id: defaultCogs,
              sales_account_id: defaultSales,
              is_active: true,
              unit: unit ? String(unit).trim() : 'kg'
            }).select('id, name, sku, unit').single();

            if (!createMatError && newMaterial) {
              materialId = newMaterial.id;
              if (newMaterial.sku) productMap.set(String(newMaterial.sku).trim().toLowerCase(), newMaterial.id);
              productMap.set(String(newMaterial.name).trim().toLowerCase(), newMaterial.id);
              productDetailsMap.set(newMaterial.id, newMaterial);
              createdList.push({ name: newMaterial.name, sku: newMaterial.sku, type: 'مادة خام (Raw Material)' });
            }
          } catch (err) {
            console.error("Failed to auto-create raw material:", err);
          }
        }

        if (productId && materialId && qty && Number(qty) > 0) {
          if (productId !== materialId) {
            const material = productDetailsMap.get(materialId);
            const baseUnit = material?.unit;
            const recipeUnit = unit ? String(unit).trim() : '';
            
            const factor = (baseUnit && recipeUnit) ? getConversionFactor(recipeUnit, baseUnit) : 1;
            const finalQty = Number(qty) * factor;

            bomInserts.push({
              product_id: productId,
              raw_material_id: materialId,
              quantity_required: finalQty
            });

            if (material && !material.unit && recipeUnit) {
              const newUnit = recipeUnit;
              unitUpdates.set(materialId, newUnit);
              material.unit = newUnit;
            }

            successCount++;
          }
        } else {
          failCount++;
        }
      }

      if (bomInserts.length > 0) {
        const { error } = await supabase.from('bill_of_materials').upsert(bomInserts, { onConflict: 'product_id,raw_material_id' });
        if (error) throw error;

        const uniqueProductIds = Array.from(new Set(bomInserts.map(b => b.product_id)));
        for (const pId of uniqueProductIds) {
          try {
            let { data: routing } = await supabase
              .from('mfg_routings')
              .select('id')
              .eq('product_id', pId)
              .eq('is_default', true)
              .maybeSingle();

            if (!routing) {
              const pName = productDetailsMap.get(pId)?.name || 'مسار تصنيع';
              const { data: newRouting } = await supabase.from('mfg_routings').insert({
                product_id: pId,
                name: `مسار تصنيع ${pName}`,
                organization_id: orgId,
                is_default: true
              }).select('id').single();
              routing = newRouting;
            }

            if (routing) {
              let { data: step } = await supabase
                .from('mfg_routing_steps')
                .select('id')
                .eq('routing_id', routing.id)
                .eq('step_order', 1)
                .maybeSingle();

              if (!step) {
                const { data: newStep } = await supabase.from('mfg_routing_steps').insert({
                  routing_id: routing.id,
                  step_order: 1,
                  operation_name: 'مرحلة التجهيز والتصنيع',
                  standard_time_minutes: 15,
                  organization_id: orgId
                }).select('id').single();
                step = newStep;
              }

              if (step) {
                const stepMaterials = bomInserts
                  .filter(b => b.product_id === pId)
                  .map(b => ({
                    step_id: step.id,
                    raw_material_id: b.raw_material_id,
                    quantity_required: b.quantity_required,
                    organization_id: orgId
                  }));

                await supabase.from('mfg_step_materials').delete().eq('step_id', step.id);
                if (stepMaterials.length > 0) {
                  await supabase.from('mfg_step_materials').insert(stepMaterials);
                }
              }
            }
          } catch (mfgErr) {
            console.warn('Could not sync to mfg_routings:', mfgErr);
          }
        }
      }

      if (unitUpdates.size > 0) {
        const updates = Array.from(unitUpdates.entries()).map(([id, newUnit]) => 
          supabase.from('products').update({ unit: newUnit }).eq('id', id)
        );
        await Promise.all(updates);
        refresh();
      }

      if (createdList.length > 0) {
        setAutoCreatedProducts(createdList);
        setIsReportModalOpen(true);
      }

      showToast(`تم استيراد ${successCount} وصفة بنجاح.${failCount > 0 ? ` فشل ${failCount} صف.` : ''}`, 'success');
    } catch (error: any) {
      console.error(error);
      showToast('فشل استيراد الوصفات: ' + error.message, 'error');
    } finally {
      setIsRecipeImporting(false);
    }
  };
  reader.readAsBinaryString(file);
};

export const importProductsFromExcel = async ({
  file,
  currentUser,
  currentSelectedOrgId,
  importWarehouseId,
  warehouses,
  categories,
  contextAccounts,
  getSystemAccount,
  addEntry,
  queryClient,
  refreshData,
  showToast,
  setIsImporting,
}: {
  file: File;
  currentUser: any;
  currentSelectedOrgId: string | null;
  importWarehouseId: string;
  warehouses: any[];
  categories: any[];
  contextAccounts: any[];
  getSystemAccount: (key: string) => any;
  addEntry: (entry: any) => Promise<any>;
  queryClient: any;
  refreshData: () => Promise<void>;
  showToast: (msg: string, type?: string) => void;
  setIsImporting: (val: boolean) => void;
}) => {
  setIsImporting(true);

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const content = evt.target?.result;
      let data: any[] = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        data = JSON.parse(content as string);
      } else {
        const wb = XLSX.read(content, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        data = XLSX.utils.sheet_to_json(ws);
      }

      let successCount = 0;
      let failCount = 0;

      const orgId = currentSelectedOrgId || (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;

      const defaultInventory = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || getSystemAccount('INVENTORY')?.id || contextAccounts.find(a => a.code === '10302' || a.code === '1213' || a.code === '103' || a.name?.includes('مخزون'))?.id || null;
      const defaultCogs = getSystemAccount('COGS')?.id || contextAccounts.find(a => a.code === '511' || a.code === '311' || a.name?.includes('تكلفة'))?.id || null;
      const defaultSales = getSystemAccount('SALES_REVENUE')?.id || contextAccounts.find(a => a.code === '411' || a.name?.includes('مبيعات'))?.id || null;
      const equityAcc = getSystemAccount('OPENING_BALANCES')?.id || 
                        getSystemAccount('RETAINED_EARNINGS')?.id || 
                        contextAccounts.find(a => a.code === '3999' || a.code === '313' || a.code?.startsWith('39') || a.code?.startsWith('300') || a.name?.includes('أرصدة افتتاحية') || a.name?.includes('افتتاحي'))?.id;
      const targetWarehouseId = importWarehouseId || (warehouses.length > 0 ? warehouses[0].id : null);

      const categoryNamesInFile = [...new Set(data
        .filter(row => row['التصنيف'] || row['القسم'] || row['المجموعة'] || row['Category'] || row['category'])
        .map(row => String(row['التصنيف'] || row['القسم'] || row['المجموعة'] || row['Category'] || row['category']).trim())
      )];

      for (const catName of categoryNamesInFile) {
        const exists = categories.find(c => c.name.trim().toLowerCase() === catName.toLowerCase());
        if (!exists) {
          await supabase.from('item_categories').insert({ name: catName, organization_id: orgId });
        }
      }

      const { data: allCats } = await supabase.from('item_categories').select('id, name');
      const catMap = new Map(allCats?.map(c => [c.name.trim().toLowerCase(), c.id]));

      const normalizeUnit = (u: string): string => {
        if (!u) return 'piece';
        const val = u.trim().toLowerCase();
        const unitMap: Record<string, string> = {
          'كجم': 'kg', 'كيلو': 'kg', 'كيلوجرام': 'kg', 'kg': 'kg',
          'جرام': 'g', 'جم': 'g', 'g': 'g',
          'لتر': 'l', 'l': 'l',
          'مل': 'ml', 'مللي': 'ml', 'ملل': 'ml', 'ml': 'ml',
          'قطعة': 'piece', 'حبة': 'piece', 'حبه': 'piece', 'عدد': 'piece', 'piece': 'piece',
          'كرتون': 'box', 'علبة': 'box', 'صندوق': 'box', 'box': 'box',
          'متر': 'm', 'm': 'm',
          'بالتة': 'pallet', 'بالته': 'pallet', 'pallet': 'pallet',
          'درزن': 'dozen', 'دسته': 'dozen', 'dozen': 'dozen'
        };
        return unitMap[val] || val;
      };

      for (const row of data as any[]) {
        const name = row['اسم الصنف'] || row['اسم المنتج'] || row['الاسم'] || row['الصنف'] || row['Name'] || row['name'] || row['item_name'];
        const sku = row['الكود (SKU)'] || row['الكود'] || row['كود الصنف'] || row['SKU'] || row['sku'] || row['code'];
        const barcode = row['الباركود'] || row['باركود'] || row['Barcode'] || row['barcode'];
        const purchase_price = row['سعر الشراء'] || row['سعر الشراء (التكلفة)'] || row['التكلفة'] || row['سعر التكلفة'] || row['Purchase Price'] || row['Cost'] || row['cost'];
        const sales_price = row['سعر البيع'] || row['البيع'] || row['Sales Price'] || row['Price'] || row['price'];
        const stock = row['الكمية الافتتاحية'] || row['الرصيد الحالي'] || row['الرصيد'] || row['الكمية'] || row['Stock'] || row['stock'] || 0;
        const rawType = row['نوع الصنف'] || row['نوع المنتج'] || row['النوع'] || row['Type'] || row['type'] || row['item_type'];
        const unit = row['الوحدة'] || row['وحدة القياس'] || row['Unit'] || row['unit'] || row['uom'];
        const categoryName = row['التصنيف'] || row['القسم'] || row['المجموعة'] || row['Category'] || row['category'];
        const description = row['الوصف'] || row['ملاحظات'] || row['Description'] || row['description'];
        const avgCost = row['متوسط التكلفة'] || row['متوسط تكلفة'] || row['Average Cost'] || purchase_price;

        const categoryId = categoryName ? catMap.get(String(categoryName).trim().toLowerCase()) : null;
        
        const isService = (String(rawType || '').includes('خدم') || String(rawType || '').toLowerCase().includes('serv'));
        const isRaw = (String(rawType || '').includes('خام') || String(rawType || '').toLowerCase().includes('raw'));
        const isIntermediate = (String(rawType || '').includes('وسيط') || String(rawType || '').toLowerCase().includes('interm'));
        const isManufactured = (String(rawType || '').includes('تام') || String(rawType || '').includes('مصنع') || String(rawType || '').toLowerCase().includes('manuf'));

        const productType = isService 
          ? 'SERVICE' 
          : isRaw 
          ? 'RAW_MATERIAL' 
          : isIntermediate 
          ? 'INTERMEDIATE_PRODUCT' 
          : isManufactured 
          ? 'MANUFACTURED' 
          : 'STOCK';

        const mfgType = isRaw ? 'raw' : isIntermediate ? 'intermediate' : isManufactured ? 'standard' : null;
        const rawMaterialAcc = getSystemAccount('INVENTORY_RAW_MATERIALS')?.id || contextAccounts.find(a => a.code === '10301' || a.code === '1211' || a.name?.includes('خامات'))?.id;
        const itemInvAcc = productType === 'RAW_MATERIAL' ? (rawMaterialAcc || defaultInventory) : defaultInventory;

        if (name) {
          try {
            const { data: newProduct, error: prodError } = await supabase.from('products').insert({
              name: String(name).trim(),
              sku: sku ? String(sku).trim() : null,
              barcode: barcode ? String(barcode).trim() : null,
              sales_price: sales_price ? Number(sales_price) : 0,
              purchase_price: purchase_price ? Number(purchase_price) : 0,
              cost: purchase_price ? Number(purchase_price) : 0,
              weighted_average_cost: avgCost ? Number(avgCost) : (purchase_price ? Number(purchase_price) : 0),
              stock: stock ? Number(stock) : 0,
              opening_balance: stock ? Number(stock) : 0,
              description: description ? String(description).trim() : null,
              category_id: categoryId,
              unit: normalizeUnit(String(unit || '')),
              organization_id: orgId,
              item_type: productType,
              product_type: productType,
              mfg_type: mfgType,
              inventory_account_id: itemInvAcc,
              cogs_account_id: defaultCogs,
              sales_account_id: defaultSales,
              is_active: true
            }).select().single();

            if (prodError) throw prodError;

            if (newProduct && stock && Number(stock) > 0 && targetWarehouseId) {
              const { error: opErr } = await supabase.from('opening_inventories').insert({
                product_id: newProduct.id,
                warehouse_id: targetWarehouseId,
                quantity: Number(stock),
                cost: Number(purchase_price) || 0,
                organization_id: orgId,
                created_by: currentUser?.id
              });
              if (opErr) console.error("Error creating opening inventory:", opErr);

              const totalValue = Number(stock) * (Number(purchase_price) || 0);
              if (totalValue > 0 && itemInvAcc && equityAcc) {
                const ref = `IMP-OP-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;
                const lineDesc = productType === 'RAW_MATERIAL' ? `مخزون مواد خام افتتاحي - ${newProduct.name}` : `مخزون افتتاحي - ${newProduct.name}`;

                await addEntry({
                  date: new Date().toISOString().split('T')[0],
                  description: `رصيد افتتاحي (استيراد) - ${newProduct.name}`.substring(0, 255),
                  reference: ref,
                  status: 'posted',
                  p_org_id: orgId,
                  lines: [
                    { accountId: itemInvAcc, debit: totalValue, credit: 0, description: lineDesc },
                    { accountId: equityAcc, debit: 0, credit: totalValue, description: `أرصدة افتتاحية - ${newProduct.name}` }
                  ]
                });
              }
            }

            successCount++;
          } catch (err) {
            console.error("Error adding product:", name, err);
            failCount++;
          }
        } else {
          failCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['products'] });
      if (orgId && successCount > 0) {
        try {
          await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
        } catch (e) {
          console.error('Failed to recalculate balances after bulk import', e);
        }
      }
      await refreshData();
      showToast(`تمت العملية:\n✅ تم استيراد: ${successCount} منتج\n❌ فشل: ${failCount}`, 'success');
      
    } catch (error: any) {
      showToast('حدث خطأ أثناء قراءة الملف: ' + error.message, 'error');
    } finally {
      setIsImporting(false);
    }
  };
  reader.readAsBinaryString(file);
};
