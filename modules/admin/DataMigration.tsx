import React, { useState, useRef } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';
import * as XLSX from 'xlsx';
import { Users, Truck, Package, MonitorSmartphone, Download, Upload, Loader2, Database } from 'lucide-react';

type ImportType = 'customers' | 'suppliers' | 'products' | 'assets';

const ImportCard = ({ title, icon, onDownload, onImport, loading }: { title: string, icon: React.ReactNode, onDownload: () => void, onImport: () => void, loading: boolean }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4 hover:shadow-md transition-shadow">
    <div className="flex items-center gap-3">
      <div className="bg-slate-100 p-3 rounded-lg">{icon}</div>
      <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
    </div>
    <p className="text-xs text-slate-500 flex-grow">
      قم بتحميل النموذج، تعبئته بالبيانات، ثم رفعه مرة أخرى للاستيراد المباشر.
    </p>
    <div className="flex flex-col gap-2 mt-auto">
      <button onClick={onDownload} className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 font-medium text-sm">
        <Download size={16} /> تحميل النموذج
      </button>
      <button onClick={onImport} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-bold text-sm disabled:opacity-50">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        استيراد من Excel
      </button>
    </div>
  </div>
);

const DataMigration = () => {
  const { addOpeningBalanceTransaction, accounts, getSystemAccount, warehouses, refreshData, categories } = useAccounting();
  const { showToast } = useToast();
  const [loading, setLoading] = useState<ImportType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentImportType, setCurrentImportType] = useState<ImportType | null>(null);

  const handleDownloadTemplate = (type: ImportType) => {
    let headers: any[] = [];
    let fileName = '';

    switch (type) {
      case 'customers':
        headers = [{ 'اسم العميل': '', 'رقم الهاتف': '', 'الرقم الضريبي': '', 'العنوان': '', 'الرصيد الافتتاحي': '' }];
        fileName = 'Customers_Template.xlsx';
        break;
      case 'suppliers':
        headers = [{ 'اسم المورد': '', 'رقم الهاتف': '', 'الرقم الضريبي': '', 'العنوان': '', 'الرصيد الافتتاحي': '' }];
        fileName = 'Suppliers_Template.xlsx';
        break;
      case 'products':
        headers = [{ 'اسم المنتج': '', 'الكود (SKU)': '', 'الباركود': '', 'سعر الشراء': '', 'سعر البيع': '', 'نوع المنتج': '', 'الوحدة': '', 'التصنيف': '', 'الوصف': '', 'الكمية الافتتاحية': '' }];
        fileName = 'Products_Template.xlsx';
        break;
      case 'assets':
        headers = [{ 'اسم الأصل': '', 'تاريخ الشراء (YYYY-MM-DD)': '', 'تكلفة الشراء': '', 'مجمع الإهلاك حتى تاريخه': '', 'كود حساب الأصل': '', 'كود حساب مجمع الإهلاك': '', 'الرقم التسلسلي': '', 'القسم': '' }];
        fileName = 'Fixed_Assets_Template.xlsx';
        break;
    }

    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, fileName);
  };

  const handleImportClick = (type: ImportType) => {
    setCurrentImportType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentImportType) return;

    setLoading(currentImportType);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target?.result;
        const wb = XLSX.read(content, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          showToast('ملف Excel فارغ أو غير صالح.', 'warning');
          return;
        }

        switch (currentImportType) {
          case 'customers': await importCustomers(data); break;
          case 'suppliers': await importSuppliers(data); break;
          case 'products': await importProducts(data); break;
          case 'assets': await importFixedAssets(data); break;
        }
      } catch (err: any) {
        showToast("فشل قراءة الملف: " + err.message, 'error');
      } finally {
        setLoading(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const importCustomers = async (data: any[]) => {
    let successCount = 0, failCount = 0;
    for (const row of data) {
      if (!row['اسم العميل']) { failCount++; continue; }
      try {
        const { data: newCustomer, error } = await supabase.from('customers').insert({
          name: String(row['اسم العميل']).trim(),
          phone: String(row['رقم الهاتف'] || '').trim(),
          tax_number: String(row['الرقم الضريبي'] || '').trim(),
          address: String(row['العنوان'] || '').trim(),
        }).select().single();
        if (error) throw error;

        const openingBalance = Number(row['الرصيد الافتتاحي'] || 0);
        if (newCustomer && openingBalance > 0) {
          await addOpeningBalanceTransaction(newCustomer.id, 'customer', openingBalance, new Date().toISOString().split('T')[0], newCustomer.name);
        }
        successCount++;
      } catch (err) { failCount++; }
    }
    await refreshData();
    showToast(`تمت العملية: ✅ ${successCount} عميل | ❌ ${failCount} فشل`, 'success');
  };

  const importSuppliers = async (data: any[]) => {
    let successCount = 0, failCount = 0;
    for (const row of data) {
      if (!row['اسم المورد']) { failCount++; continue; }
      try {
        const { data: newSupplier, error } = await supabase.from('suppliers').insert({
          name: String(row['اسم المورد']).trim(),
          phone: String(row['رقم الهاتف'] || '').trim(),
          tax_number: String(row['الرقم الضريبي'] || '').trim(),
          address: String(row['العنوان'] || '').trim(),
        }).select().single();
        if (error) throw error;

        const openingBalance = Number(row['الرصيد الافتتاحي'] || 0);
        if (newSupplier && openingBalance > 0) {
          await addOpeningBalanceTransaction(newSupplier.id, 'supplier', openingBalance, new Date().toISOString().split('T')[0], newSupplier.name);
        }
        successCount++;
      } catch (err) { failCount++; }
    }
    await refreshData();
    showToast(`تمت العملية: ✅ ${successCount} مورد | ❌ ${failCount} فشل`, 'success');
  };

  const importProducts = async (data: any[]) => {
    const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single();
    const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS') || getSystemAccount('INVENTORY');
    const cogsAcc = getSystemAccount('COGS');
    const salesAcc = getSystemAccount('SALES_REVENUE');
    const equityAcc = getSystemAccount('RETAINED_EARNINGS');
    const targetWarehouseId = warehouses.length > 0 ? warehouses[0].id : null;

    if (!inventoryAcc || !cogsAcc || !salesAcc || !equityAcc || !targetWarehouseId) {
      showToast('الحسابات الأساسية أو المستودعات غير معرفة.', 'error'); return;
    }

    // 1. التأكد من وجود كافة التصنيفات وإنشاء المفقود منها تلقائياً
    const categoryNamesInFile = [...new Set(data
      .filter(row => row['التصنيف'] || row['Category'])
      .map(row => String(row['التصنيف'] || row['Category']).trim())
    )];

    for (const catName of categoryNamesInFile) {
      const exists = categories.find(c => c.name.trim().toLowerCase() === catName.toLowerCase());
      if (!exists) {
        await supabase.from('item_categories').insert({ name: catName, organization_id: orgData?.id });
      }
    }

    // جلب القائمة النهائية للتصنيفات لضمان الحصول على المعرفات (IDs) الجديدة
    const { data: allCats } = await supabase.from('item_categories').select('id, name');
    const catMap = new Map(allCats?.map(c => [c.name.trim().toLowerCase(), c.id]));

    // دالة تطبيع الوحدات لضمان توافقها مع خيارات النظام
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
        'بالتة': 'pallet', 'بالته': 'pallet', 'pallet': 'pallet'
      };
      return unitMap[val] || val;
    };

    let totalOpeningValue = 0;
    const productsToInsert = data.filter(row => row['اسم المنتج']).map(row => {
      const purchase_price = Number(row['سعر الشراء'] || 0);
      const stock = Number(row['الكمية الافتتاحية'] || 0);
      const barcode = row['الباركود'] || row['Barcode'];
      const rawType = row['نوع المنتج'] || row['Type'] || row['type'];
      const categoryName = row['التصنيف'] || row['Category'];
      const unit = row['الوحدة'] || row['Unit'] || row['unit'];
      const description = row['الوصف'] || row['Description'] || row['description'];

      const productType = (String(rawType || '').includes('خدم') || String(rawType || '').toLowerCase().includes('serv')) ? 'SERVICE' : 'STOCK';
      
      if (stock > 0) totalOpeningValue += stock * purchase_price;
      return { name: String(row['اسم المنتج']).trim(), sku: row['الكود (SKU)'] ? String(row['الكود (SKU)']).trim() : null, barcode: barcode ? String(barcode).trim() : null, sales_price: Number(row['سعر البيع'] || 0), purchase_price, stock, opening_balance: stock, description: description ? String(description).trim() : null, organization_id: orgData?.id, item_type: productType, product_type: productType, inventory_account_id: inventoryAcc.id, cogs_account_id: cogsAcc.id, sales_account_id: salesAcc.id, category_id: catMap.get(String(categoryName || '').trim().toLowerCase()) || null, unit: normalizeUnit(String(unit || '')), is_active: true };
    });

    if (productsToInsert.length === 0) { showToast('لا توجد منتجات صالحة للاستيراد.', 'warning'); return; }

    const { data: newProducts, error: prodError } = await supabase.from('products').insert(productsToInsert).select();
    if (prodError) { showToast(`فشل إضافة المنتجات: ${prodError.message}`, 'error'); return; }

    if (newProducts) {
      const openingInventories = newProducts.filter(p => p.stock > 0).map(p => ({ product_id: p.id, warehouse_id: targetWarehouseId, quantity: p.stock, cost: p.purchase_price }));
      if (openingInventories.length > 0) await supabase.from('opening_inventories').insert(openingInventories);
    }

    if (totalOpeningValue > 0) {
      const { data: entry, error: entryError } = await supabase.from('journal_entries').insert({ transaction_date: new Date().toISOString().split('T')[0], reference: `INV-OPEN-${Date.now().toString().slice(-6)}`, description: `قيد افتتاحي للمخزون (${newProducts?.length} صنف)`, status: 'posted' }).select().single();
      if (!entryError && entry) await supabase.from('journal_lines').insert([{ journal_entry_id: entry.id, account_id: inventoryAcc.id, debit: totalOpeningValue, credit: 0 }, { journal_entry_id: entry.id, account_id: equityAcc.id, debit: 0, credit: totalOpeningValue }]);
    }
    
    await refreshData();
    showToast(`تم استيراد ${newProducts?.length || 0} منتج بنجاح.`, 'success');
  };

  const importFixedAssets = async (data: any[]) => {
    let importedCount = 0;
    const openingEntries: Record<string, { assetTotal: number, depTotal: number, assetAccId: string, depAccId: string }> = {};

    for (const item of data) {
      const assetName = item['اسم الأصل'];
      if (!assetName) continue;

      const assetAcc = accounts.find(a => a.code === String(item['كود حساب الأصل'] || '').trim());
      const depAcc = accounts.find(a => a.code === String(item['كود حساب مجمع الإهلاك'] || '').trim());

      if (!assetAcc || !depAcc) { showToast(`خطأ في حسابات الأصل "${assetName}".`, 'error'); continue; }

      const { error } = await supabase.from('assets').insert({ name: assetName, purchase_date: item['تاريخ الشراء (YYYY-MM-DD)'], purchase_cost: Number(item['تكلفة الشراء'] || 0), accumulated_depreciation: Number(item['مجمع الإهلاك حتى تاريخه'] || 0), asset_account_id: assetAcc.id, depreciation_account_id: depAcc.id, custom_fields: { serial_number: item['الرقم التسلسلي'], department: item['القسم'] } });
      if (error) { console.error(`Failed to import asset ${assetName}:`, error); continue; }

      const groupKey = `${assetAcc.id}-${depAcc.id}`;
      if (!openingEntries[groupKey]) openingEntries[groupKey] = { assetTotal: 0, depTotal: 0, assetAccId: assetAcc.id, depAccId: depAcc.id };
      openingEntries[groupKey].assetTotal += Number(item['تكلفة الشراء'] || 0);
      openingEntries[groupKey].depTotal += Number(item['مجمع الإهلاك حتى تاريخه'] || 0);
      importedCount++;
    }

    const openingEquityAcc = accounts.find(a => a.code === '3999');
    if (!openingEquityAcc) { throw new Error('حساب الأرصدة الافتتاحية (3999) غير موجود.'); }

    for (const group of Object.values(openingEntries)) {
      const netValue = group.assetTotal - group.depTotal;
      if (netValue === 0) continue;
      const { data: entry, error: entryError } = await supabase.from('journal_entries').insert({ transaction_date: new Date().toISOString().split('T')[0], reference: `ASSET-OPEN-${Date.now().toString().slice(-6)}`, description: `قيد افتتاحي لمجموعة أصول`, status: 'posted' }).select().single();
      if (entryError) throw entryError;
      await supabase.from('journal_lines').insert([{ journal_entry_id: entry.id, account_id: group.assetAccId, debit: group.assetTotal, credit: 0 }, { journal_entry_id: entry.id, account_id: group.depAccId, debit: 0, credit: group.depTotal }, { journal_entry_id: entry.id, account_id: openingEquityAcc.id, debit: 0, credit: netValue }]);
    }

    await refreshData();
    showToast(`تم استيراد ${importedCount} أصل بنجاح وإنشاء القيود الافتتاحية.`, 'success');
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex items-center gap-3">
        <Database size={32} className="text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-slate-800">مركز ترحيل البيانات</h1>
          <p className="text-slate-500">استيراد البيانات الأساسية (العملاء، الموردين، الأصناف، الأصول) من ملفات Excel.</p>
        </div>
      </div>

      <input type="file" ref={fileInputRef} accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ImportCard title="استيراد العملاء" icon={<Users className="text-blue-500" />} onDownload={() => handleDownloadTemplate('customers')} onImport={() => handleImportClick('customers')} loading={loading === 'customers'} />
        <ImportCard title="استيراد الموردين" icon={<Truck className="text-orange-500" />} onDownload={() => handleDownloadTemplate('suppliers')} onImport={() => handleImportClick('suppliers')} loading={loading === 'suppliers'} />
        <ImportCard title="استيراد الأصناف" icon={<Package className="text-emerald-500" />} onDownload={() => handleDownloadTemplate('products')} onImport={() => handleImportClick('products')} loading={loading === 'products'} />
        <ImportCard title="استيراد الأصول الثابتة" icon={<MonitorSmartphone className="text-purple-500" />} onDownload={() => handleDownloadTemplate('assets')} onImport={() => handleImportClick('assets')} loading={loading === 'assets'} />
      </div>
    </div>
  );
};

export default DataMigration;