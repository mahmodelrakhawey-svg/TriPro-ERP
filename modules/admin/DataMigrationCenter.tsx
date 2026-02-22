import React, { useState, useRef } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../supabaseClient';
import * as XLSX from 'xlsx';
import { 
  Upload, Download, CheckCircle, AlertCircle, 
  FileSpreadsheet, Users, Package, Truck, 
  ArrowRight, ArrowLeft, Database, Loader2,
  ShieldCheck, BookOpen
} from 'lucide-react';

const DataMigrationCenter = () => {
  const { accounts, getSystemAccount, refreshData, warehouses } = useAccounting();
  const { showToast } = useToast();
  const [activeStep, setActiveStep] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: any[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const steps = [
    { 
        id: 'accounts', 
        title: 'دليل الحسابات', 
        icon: BookOpen, 
        description: 'استيراد شجرة الحسابات. (سيتم تخطي الحسابات الموجودة مسبقاً حفاظاً على ترابط النظام).',
        templateHeaders: [
            { 'كود الحساب': '10101', 'اسم الحساب': 'خزينة الفرع الرئيسي', 'النوع': 'أصول', 'كود الحساب الرئيسي': '101' }
        ]
    },
    { 
        id: 'products', 
        title: 'الأصناف والمخزون', 
        icon: Package, 
        description: 'استيراد بيانات المنتجات والخدمات والأرصدة الافتتاحية للمخزون.',
        templateHeaders: [
            { 'اسم المنتج': 'مثال: لابتوب HP', 'الكود (SKU)': 'HP-123', 'سعر الشراء': '1000', 'سعر البيع': '1200', 'الكمية الافتتاحية': '10' }
        ]
    },
    { 
        id: 'customers', 
        title: 'العملاء', 
        icon: Users, 
        description: 'استيراد قاعدة بيانات العملاء وأرصدتهم الافتتاحية (المديونيات).',
        templateHeaders: [
            { 'اسم العميل': 'مثال: شركة الأمل', 'رقم الهاتف': '0500000000', 'البريد الإلكتروني': 'info@example.com', 'الرقم الضريبي': '3000000000', 'العنوان': 'الرياض', 'حد الائتمان': '5000', 'الرصيد الافتتاحي': '1000' }
        ]
    },
    { 
        id: 'suppliers', 
        title: 'الموردين', 
        icon: Truck, 
        description: 'استيراد بيانات الموردين والالتزامات المالية الافتتاحية.',
        templateHeaders: [
            { 'اسم المورد': 'مثال: مؤسسة التوريد', 'رقم الهاتف': '0500000000', 'البريد الإلكتروني': 'supply@example.com', 'الرقم الضريبي': '3000000000', 'العنوان': 'جدة', 'الرصيد الافتتاحي': '2000' }
        ]
    },
  ];

  const handleDownloadTemplate = () => {
    const currentStep = steps[activeStep];
    const ws = XLSX.utils.json_to_sheet(currentStep.templateHeaders);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `${currentStep.id}_template.xlsx`);
  };

  const handleDownloadAllTemplates = () => {
    steps.forEach((step, index) => {
        setTimeout(() => {
            const ws = XLSX.utils.json_to_sheet(step.templateHeaders);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Template");
            XLSX.writeFile(wb, `${step.id}_template.xlsx`);
        }, index * 500);
    });
    showToast('جاري تحميل جميع النماذج...', 'success');
  };

  const processFile = async (file: File) => {
    setIsImporting(true);
    setImportResult(null);
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        let successCount = 0;
        const failedRecords: any[] = [];
        const currentStepId = steps[activeStep].id;

        // Common Accounts
        const equityAcc = accounts.find(a => a.code === '3999' || a.name.includes('أرصدة افتتاحية'))?.id;
        const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single();
        const orgId = orgData?.id;
        const defaultWarehouseId = warehouses.length > 0 ? warehouses[0].id : null;

        // Special setup for Accounts: Pre-fetch existing accounts map
        let accountMap = new Map<string, string>();
        if (currentStepId === 'accounts') {
             const { data: existing } = await supabase.from('accounts').select('id, code');
             existing?.forEach(a => accountMap.set(a.code, a.id));
             
             // Sort data to ensure parents are processed before children (shorter codes first)
             data.sort((a: any, b: any) => {
                 const codeA = String(a['كود الحساب'] || a['Code'] || '').trim();
                 const codeB = String(b['كود الحساب'] || b['Code'] || '').trim();
                 return codeA.length - codeB.length || codeA.localeCompare(codeB);
             });
        }

        // Special setup for Products: Pre-fetch existing SKUs
        let existingSkus = new Set<string>();
        if (currentStepId === 'products') {
             const { data: existing } = await supabase.from('products').select('sku').not('sku', 'is', null);
             existing?.forEach(p => {
                 if (p.sku) existingSkus.add(String(p.sku).trim());
             });
        }

        for (const row of data as any[]) {
            try {
                if (currentStepId === 'accounts') {
                    await importAccount(row, accountMap);
                } else if (currentStepId === 'products') {
                    await importProduct(row, orgId, defaultWarehouseId, equityAcc, existingSkus);
                } else if (currentStepId === 'customers') {
                    await importCustomer(row, equityAcc);
                } else if (currentStepId === 'suppliers') {
                    await importSupplier(row, equityAcc);
                }
                successCount++;
            } catch (error: any) {
                failedRecords.push({ row, error: error.message });
            }
        }

        setImportResult({ success: successCount, failed: failedRecords.length, errors: failedRecords });
        await refreshData();
        
        if (failedRecords.length === 0) {
            showToast(`تم استيراد ${successCount} سجل بنجاح!`, 'success');
        } else {
            showToast(`تم استيراد ${successCount} سجل، وفشل ${failedRecords.length}. راجع التقرير.`, 'warning');
        }

      } catch (error: any) {
        showToast('خطأ في قراءة الملف: ' + error.message, 'error');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- Import Logic Functions ---

  const importAccount = async (row: any, accountMap: Map<string, string>) => {
      const code = String(row['كود الحساب'] || row['Code'] || '').trim();
      const name = row['اسم الحساب'] || row['Name'];
      
      if (!code || !name) throw new Error('كود الحساب واسم الحساب مطلوبان');
      
      // Safety Check: Skip if account exists to protect system links
      if (accountMap.has(code)) {
          return; 
      }

      const parentCode = String(row['كود الحساب الرئيسي'] || row['Parent Code'] || '').trim();
      let parentId = null;
      if (parentCode) {
          parentId = accountMap.get(parentCode);
          if (!parentId) {
              // Fallback check in DB
              const { data: p } = await supabase.from('accounts').select('id').eq('code', parentCode).single();
              if (p) parentId = p.id;
              else throw new Error(`الحساب الرئيسي ${parentCode} غير موجود. تأكد من وجوده في الملف أو النظام.`);
          }
      }

      const { data: newAccount, error } = await supabase.from('accounts').insert({
          code,
          name,
          type: row['النوع'] || row['Type'] || 'other',
          parent_id: parentId,
          is_group: false
      }).select().single();

      if (error) throw error;

      if (newAccount) {
          accountMap.set(code, newAccount.id);
          if (parentId) {
              // Ensure parent is marked as group
              await supabase.from('accounts').update({ is_group: true }).eq('id', parentId);
          }
      }
  };

  const importProduct = async (row: any, orgId: any, warehouseId: any, equityAcc: any, existingSkus?: Set<string>) => {
      const name = row['اسم المنتج'] || row['Name'];
      if (!name) throw new Error('اسم المنتج مفقود');

      const sku = row['الكود (SKU)'] || row['SKU'];
      const skuStr = sku ? String(sku).trim() : null;

      if (skuStr && existingSkus && existingSkus.has(skuStr)) {
          throw new Error(`كود الصنف (SKU) مكرر: ${skuStr}`);
      }

      const purchase_price = Number(row['سعر الشراء'] || row['Cost'] || 0);
      const sales_price = Number(row['سعر البيع'] || row['Price'] || 0);
      const stock = Number(row['الكمية الافتتاحية'] || row['Stock'] || 0);

      // Default Accounts
      const inventoryAcc = getSystemAccount('INVENTORY_FINISHED_GOODS')?.id || accounts.find(a => a.code === '1213')?.id;
      const cogsAcc = getSystemAccount('COGS')?.id || accounts.find(a => a.code === '511')?.id;
      const salesAcc = getSystemAccount('SALES_REVENUE')?.id || accounts.find(a => a.code === '411')?.id;

      const { data: newProduct, error } = await supabase.from('products').insert({
          name: String(name).trim(),
          sku: skuStr,
          sales_price,
          purchase_price,
          stock,
          organization_id: orgId,
          item_type: 'STOCK',
          inventory_account_id: inventoryAcc,
          cogs_account_id: cogsAcc,
          sales_account_id: salesAcc,
          is_active: true
      }).select().single();

      if (error) throw error;

      if (newProduct && skuStr && existingSkus) {
          existingSkus.add(skuStr);
      }

      if (newProduct && stock > 0 && warehouseId) {
          await supabase.from('opening_inventories').insert({
              product_id: newProduct.id,
              warehouse_id: warehouseId,
              quantity: stock,
              cost: purchase_price
          });

          const totalValue = stock * purchase_price;
          if (totalValue > 0 && inventoryAcc && equityAcc) {
              await createJournalEntry(
                  `رصيد افتتاحي (استيراد) - ${name}`,
                  [{ accountId: inventoryAcc, debit: totalValue, credit: 0 }, { accountId: equityAcc, debit: 0, credit: totalValue }]
              );
          }
      }
  };

  const importCustomer = async (row: any, equityAcc: any) => {
      const name = row['اسم العميل'] || row['Name'];
      if (!name) throw new Error('اسم العميل مفقود');

      const { data: newCustomer, error } = await supabase.from('customers').insert({
          name: String(name).trim(),
          phone: row['رقم الهاتف'] || row['Phone'],
          email: row['البريد الإلكتروني'] || row['Email'],
          tax_number: row['الرقم الضريبي'] || row['Tax Number'],
          address: row['العنوان'] || row['Address'],
          credit_limit: Number(row['حد الائتمان'] || 0)
      }).select().single();

      if (error) throw error;

      const openingBalance = Number(row['الرصيد الافتتاحي'] || 0);
      if (newCustomer && openingBalance !== 0) {
          const amount = Math.abs(openingBalance);
          const isDebit = openingBalance > 0;
          const ref = `OB-${newCustomer.id.slice(0, 6)}`;
          const date = new Date().toISOString().split('T')[0];

          // Create Invoice/Credit Note
          if (isDebit) {
              await supabase.from('invoices').insert({
                  invoice_number: ref, customer_id: newCustomer.id, invoice_date: date,
                  total_amount: amount, subtotal: amount, status: 'posted', notes: 'رصيد افتتاحي (استيراد)'
              });
          } else {
              await supabase.from('credit_notes').insert({
                  credit_note_number: ref, customer_id: newCustomer.id, note_date: date,
                  total_amount: amount, amount_before_tax: amount, status: 'posted', notes: 'رصيد افتتاحي (دائن)'
              });
          }

          // Journal Entry
          const customerAcc = getSystemAccount('CUSTOMERS')?.id;
          if (customerAcc && equityAcc) {
              await createJournalEntry(
                  `رصيد افتتاحي للعميل ${name}`,
                  [
                      { accountId: customerAcc, debit: isDebit ? amount : 0, credit: isDebit ? 0 : amount },
                      { accountId: equityAcc, debit: isDebit ? 0 : amount, credit: isDebit ? amount : 0 }
                  ]
              );
          }
      }
  };

  const importSupplier = async (row: any, equityAcc: any) => {
      const name = row['اسم المورد'] || row['Name'];
      if (!name) throw new Error('اسم المورد مفقود');

      const { data: newSupplier, error } = await supabase.from('suppliers').insert({
          name: String(name).trim(),
          phone: row['رقم الهاتف'] || row['Phone'],
          email: row['البريد الإلكتروني'] || row['Email'],
          tax_number: row['الرقم الضريبي'] || row['Tax Number'],
          address: row['العنوان'] || row['Address']
      }).select().single();

      if (error) throw error;

      const openingBalance = Number(row['الرصيد الافتتاحي'] || 0);
      if (newSupplier && openingBalance !== 0) {
          const amount = Math.abs(openingBalance);
          const isCredit = openingBalance > 0; // موجب للمورد يعني دائن (له فلوس)
          const ref = `OB-${newSupplier.id.slice(0, 6)}`;
          const date = new Date().toISOString().split('T')[0];

          // Create Purchase Invoice / Debit Note
          if (isCredit) {
              await supabase.from('purchase_invoices').insert({
                  invoice_number: ref, supplier_id: newSupplier.id, invoice_date: date,
                  total_amount: amount, subtotal: amount, status: 'posted', notes: 'رصيد افتتاحي (استيراد)'
              });
          } else {
              // Debit note logic if needed
          }

          // Journal Entry
          const supplierAcc = getSystemAccount('SUPPLIERS')?.id;
          if (supplierAcc && equityAcc) {
              await createJournalEntry(
                  `رصيد افتتاحي للمورد ${name}`,
                  [
                      { accountId: equityAcc, debit: isCredit ? amount : 0, credit: isCredit ? 0 : amount },
                      { accountId: supplierAcc, debit: isCredit ? 0 : amount, credit: isCredit ? amount : 0 }
                  ]
              );
          }
      }
  };

  const createJournalEntry = async (description: string, lines: { accountId: string, debit: number, credit: number }[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      const ref = `IMP-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;
      
      const { data: entry } = await supabase.from('journal_entries').insert({
          transaction_date: new Date().toISOString().split('T')[0],
          transaction_id: ref,
          reference: ref,
          description: description.substring(0, 255),
          status: 'posted',
          user_id: user?.id
      }).select().single();

      if (entry) {
          const journalLines = lines.map(line => ({
              journal_entry_id: entry.id,
              account_id: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: description
          }));
          await supabase.from('journal_lines').insert(journalLines);
      }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in pb-20">
      <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
            <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                <Database className="text-indigo-600 w-10 h-10" /> مركز ترحيل البيانات
            </h2>
            <p className="text-slate-500 font-medium mt-2">نقل بياناتك القديمة إلى النظام الجديد بسهولة وأمان</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
            <button 
                onClick={handleDownloadAllTemplates}
                className="flex items-center gap-2 bg-white border-2 border-slate-200 text-slate-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
            >
                <Download size={18} />
                <span>تحميل كل النماذج</span>
            </button>
            <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl font-bold text-sm">
                <ShieldCheck size={18} />
                <span>بياناتك آمنة ومشفرة</span>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Steps */}
          <div className="lg:col-span-1 space-y-4">
              {steps.map((step, idx) => {
                  const Icon = step.icon;
                  const isActive = activeStep === idx;
                  const isCompleted = activeStep > idx;
                  
                  return (
                      <button
                        key={step.id}
                        onClick={() => { setActiveStep(idx); setImportResult(null); }}
                        className={`w-full text-right p-4 rounded-2xl border-2 transition-all flex items-center gap-4 group ${
                            isActive 
                                ? 'border-indigo-600 bg-indigo-50 shadow-md' 
                                : 'border-white bg-white hover:border-slate-200 shadow-sm'
                        }`}
                      >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                              isActive ? 'bg-indigo-600 text-white' : 
                              isCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
                          }`}>
                              {isCompleted ? <CheckCircle size={20} /> : <Icon size={20} />}
                          </div>
                          <div>
                              <h4 className={`font-bold ${isActive ? 'text-indigo-900' : 'text-slate-700'}`}>{step.title}</h4>
                              <p className="text-[10px] text-slate-400 font-bold">الخطوة {idx + 1}</p>
                          </div>
                      </button>
                  );
              })}
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
              <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-8 min-h-[500px] flex flex-col">
                  <div className="flex-1">
                      <div className="flex items-center gap-4 mb-6">
                          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                              {React.createElement(steps[activeStep].icon, { size: 32 })}
                          </div>
                          <div>
                              <h3 className="text-2xl font-black text-slate-900">{steps[activeStep].title}</h3>
                              <p className="text-slate-500">{steps[activeStep].description}</p>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 hover:border-indigo-200 transition-colors group">
                              <div className="mb-4 bg-white w-12 h-12 rounded-xl flex items-center justify-center shadow-sm text-indigo-600 group-hover:scale-110 transition-transform">
                                  <FileSpreadsheet size={24} />
                              </div>
                              <h4 className="font-bold text-slate-800 mb-2">1. تحميل النموذج</h4>
                              <p className="text-sm text-slate-500 mb-4">قم بتحميل ملف Excel فارغ بالصيغة الصحيحة لتعبئة بياناتك.</p>
                              <button onClick={handleDownloadTemplate} className="text-indigo-600 font-black text-sm flex items-center gap-2 hover:underline">
                                  <Download size={16} /> تحميل النموذج الآن
                              </button>
                          </div>

                          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 hover:border-emerald-200 transition-colors group relative overflow-hidden">
                              <input 
                                type="file" 
                                accept=".xlsx, .xls" 
                                onChange={(e) => e.target.files && processFile(e.target.files[0])}
                                ref={fileInputRef}
                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                disabled={isImporting}
                              />
                              <div className="mb-4 bg-white w-12 h-12 rounded-xl flex items-center justify-center shadow-sm text-emerald-600 group-hover:scale-110 transition-transform">
                                  {isImporting ? <Loader2 className="animate-spin" size={24} /> : <Upload size={24} />}
                              </div>
                              <h4 className="font-bold text-slate-800 mb-2">2. رفع الملف</h4>
                              <p className="text-sm text-slate-500 mb-4">اختر الملف المعبأ لرفعه إلى النظام ومعالجته تلقائياً.</p>
                              <span className="text-emerald-600 font-black text-sm flex items-center gap-2">
                                  {isImporting ? 'جاري المعالجة...' : 'اضغط هنا لرفع الملف'}
                              </span>
                          </div>
                      </div>

                      {/* Results Area */}
                      {importResult && (
                          <div className="animate-in fade-in slide-in-from-bottom-4">
                              <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                  <Database size={18} className="text-slate-400" /> نتيجة الاستيراد
                              </h4>
                              <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                                  <div className="flex border-b border-slate-200">
                                      <div className="flex-1 p-4 text-center border-l border-slate-200">
                                          <span className="block text-xs font-bold text-slate-400 uppercase">ناجح</span>
                                          <span className="text-2xl font-black text-emerald-600">{importResult.success}</span>
                                      </div>
                                      <div className="flex-1 p-4 text-center">
                                          <span className="block text-xs font-bold text-slate-400 uppercase">فشل</span>
                                          <span className="text-2xl font-black text-red-600">{importResult.failed}</span>
                                      </div>
                                  </div>
                                  {importResult.errors.length > 0 && (
                                      <div className="p-4 bg-red-50/50 max-h-40 overflow-y-auto">
                                          <p className="text-xs font-bold text-red-800 mb-2 flex items-center gap-2">
                                              <AlertCircle size={14} /> تفاصيل الأخطاء:
                                          </p>
                                          <ul className="space-y-1">
                                              {importResult.errors.map((err, i) => (
                                                  <li key={i} className="text-xs text-red-600 font-mono">
                                                      • صف {JSON.stringify(err.row['اسم المنتج'] || err.row['اسم العميل'] || 'غير معروف')}: {err.error}
                                                  </li>
                                              ))}
                                          </ul>
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex justify-between mt-8 pt-8 border-t border-slate-100">
                      <button 
                        onClick={() => { setActiveStep(Math.max(0, activeStep - 1)); setImportResult(null); }}
                        disabled={activeStep === 0}
                        className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-30 flex items-center gap-2 transition-colors"
                      >
                          <ArrowRight size={18} /> السابق
                      </button>
                      
                      {activeStep < steps.length - 1 ? (
                          <button 
                            onClick={() => { setActiveStep(activeStep + 1); setImportResult(null); }}
                            className="px-8 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 flex items-center gap-2 transition-all"
                          >
                              التالي <ArrowLeft size={18} />
                          </button>
                      ) : (
                          <button 
                            onClick={() => showToast('تم الانتهاء من جميع خطوات الترحيل!', 'success')}
                            className="px-8 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200 flex items-center gap-2 transition-all"
                          >
                              إنهاء الترحيل <CheckCircle size={18} />
                          </button>
                      )}
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default DataMigrationCenter;