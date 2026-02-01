
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAccounting, SYSTEM_ACCOUNTS } from '../context/AccountingContext';
import { Save, AlertTriangle, Download, Upload, RotateCcw, Building2, CreditCard, ShieldCheck, Archive, ToggleLeft, ToggleRight, ChevronDown, Link as LinkIcon, Landmark, Database, Trash2 } from 'lucide-react';

const ACCOUNT_LABELS: Record<string, string> = {
  CASH: 'النقدية (الصندوق الرئيسي)',
  CUSTOMERS: 'العملاء',
  NOTES_RECEIVABLE: 'أوراق القبض (شيكات واردة)',
  INVENTORY: 'المخزون العام',
  INVENTORY_RAW_MATERIALS: 'مخزون المواد الخام',
  INVENTORY_FINISHED_GOODS: 'مخزون المنتج التام',
  ACCUMULATED_DEPRECIATION: 'مجمع الإهلاك',
  SUPPLIERS: 'الموردين',
  VAT: 'ضريبة القيمة المضافة (مخرجات)',
  VAT_INPUT: 'ضريبة القيمة المضافة (مدخلات)',
  CUSTOMER_DEPOSITS: 'تأمينات العملاء',
  NOTES_PAYABLE: 'أوراق الدفع (شيكات صادرة)',
  SALES_REVENUE: 'إيراد المبيعات',
  OTHER_REVENUE: 'إيرادات أخرى',
  SALES_DISCOUNT: 'خصم مسموح به',
  COGS: 'تكلفة البضاعة المباعة',
  SALARIES_EXPENSE: 'مصروف الرواتب والأجور',
  DEPRECIATION_EXPENSE: 'مصروف الإهلاك',
  INVENTORY_ADJUSTMENTS: 'تسويات المخزون (عجز/زيادة)',
  RETAINED_EARNINGS: 'الأرباح المبقاة',
  EMPLOYEE_BONUSES: 'مكافآت الموظفين',
  EMPLOYEE_DEDUCTIONS: 'جزاءات وخصومات الموظفين',
  BANK_CHARGES: 'مصروفات بنكية',
  BANK_INTEREST_INCOME: 'فوائد بنكية (دائنة)',
  TAX_AUTHORITY: 'مصلحة الضرائب',
  SOCIAL_INSURANCE: 'التأمينات الاجتماعية',
  WITHHOLDING_TAX: 'ضريبة الخصم والتحصيل',
  EMPLOYEE_ADVANCES: 'سلف الموظفين',
};

const Settings = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'financial' | 'system' | 'mapping' | 'demo'>('general');
  const [formData, setFormData] = useState({ 
      companyName: '', taxNumber: '', phone: '', address: '', footerText: '', vatRate: 0.14, currency: '', logoUrl: '', 
      enableTax: true, allowNegativeStock: false, preventPriceModification: false, maxCashDeficitLimit: 500, decimalPlaces: 2,
      accountMappings: {} as Record<string, string>
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { closeFinancialYear, exportData, currentUser, accounts, createMissingSystemAccounts } = useAccounting();
  const currentUserRole = currentUser?.role || '';

  const currencies = [
    { code: 'EGP', label: 'جنيه مصري (EGP)' },
    { code: 'SAR', label: 'ريال سعودي (SAR)' },
    { code: 'USD', label: 'دولار أمريكي (USD)' },
    { code: 'AED', label: 'درهم إماراتي (AED)' },
    { code: 'KWD', label: 'دينار كويتي (KWD)' },
    { code: 'QAR', label: 'ريال قطري (QAR)' },
    { code: 'OMR', label: 'ريال عماني (OMR)' },
    { code: 'BHD', label: 'دينار بحريني (BHD)' },
    { code: 'JOD', label: 'دينار أردني (JOD)' },
    { code: 'EUR', label: 'يورو (EUR)' },
    { code: 'GBP', label: 'جنيه إسترليني (GBP)' },
  ];
  const navigate = useNavigate();

  useEffect(() => {
    // جلب إعدادات الشركة
    const fetchSettings = async () => {
        const { data, error } = await supabase
            .from('company_settings')
            .select('*')
            .limit(1)
            .maybeSingle();
        
        if (data) {
            setSettingsId(data.id);
            setFormData({
                companyName: data.company_name || '',
                taxNumber: data.tax_number || '',
                phone: data.phone || '',
                address: data.address || '',
                footerText: data.footer_text || '',
                vatRate: data.vat_rate !== undefined ? data.vat_rate : 0.14,
                currency: data.currency || '',
                logoUrl: data.logo_url || '',
                enableTax: data.enable_tax !== undefined ? data.enable_tax : true,
                allowNegativeStock: data.allow_negative_stock !== undefined ? data.allow_negative_stock : false,
                preventPriceModification: data.prevent_price_modification !== undefined ? data.prevent_price_modification : false,
                maxCashDeficitLimit: data.max_cash_deficit_limit !== undefined ? data.max_cash_deficit_limit : 500,
                decimalPlaces: data.decimal_places !== undefined ? data.decimal_places : 2,
                accountMappings: data.account_mappings || {}
            });
        }
        setLoading(false);
    };
    fetchSettings();
  }, []);

  // Security Check
  if (!loading && ((currentUserRole as string) !== 'super_admin' && (currentUserRole as string) !== 'admin' || (currentUserRole as string) === 'demo')) {
      return (
          <div className="p-8 text-center bg-red-50 m-4 rounded-xl border border-red-200">
              <h2 className="text-2xl font-bold text-red-600 mb-2 flex items-center justify-center gap-2">
                  <ShieldCheck /> {currentUserRole === 'demo' ? 'الإعدادات غير متاحة في النسخة التجريبية' : 'غير مصرح لك بالوصول'}
              </h2>
              <p className="text-slate-600">
                  {currentUserRole === 'demo' 
                    ? 'للحفاظ على استقرار النسخة التجريبية، تم تعطيل تعديل إعدادات النظام.' 
                    : 'صفحة الإعدادات متاحة فقط لمدير النظام (Admin) للحفاظ على أمان البيانات.'}
              </p>
          </div>
      );
  }

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (currentUserRole === 'demo') {
          alert("تم حفظ الإعدادات بنجاح ✅ (محاكاة - لن يتم حفظ التغييرات)");
          return;
      }

      try {
        const payload = {
            company_name: formData.companyName,
            tax_number: formData.taxNumber,
            phone: formData.phone,
            address: formData.address,
            footer_text: formData.footerText,
            vat_rate: formData.vatRate,
            currency: formData.currency,
            logo_url: formData.logoUrl,
            allow_negative_stock: formData.allowNegativeStock,
            enable_tax: formData.enableTax,
            prevent_price_modification: formData.preventPriceModification,
            max_cash_deficit_limit: formData.maxCashDeficitLimit,
            decimal_places: formData.decimalPlaces,
            updated_at: new Date().toISOString(),
            account_mappings: formData.accountMappings
        };

        let error;
        if (settingsId) {
            ({ error } = await supabase.from('company_settings').update(payload).eq('id', settingsId));
        } else {
            ({ error } = await supabase.from('company_settings').insert(payload));
        }

        if (error) throw error;
        alert("تم حفظ الإعدادات بنجاح ✅");
      } catch (err: any) {
        alert("فشل الحفظ: " + err.message);
      }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    if (currentUserRole === 'demo') {
        alert('تم رفع الشعار بنجاح! لا تنس حفظ الإعدادات. (محاكاة)');
        return;
    }
    
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `company-logo-${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    try {
      setLoading(true);
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('logos').getPublicUrl(filePath);
      
      setFormData(prev => ({ ...prev, logoUrl: data.publicUrl }));
      alert('تم رفع الشعار بنجاح! لا تنس حفظ الإعدادات.');
    } catch (error: any) {
      alert('فشل رفع الشعار: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if(!file) return;

      if(window.confirm('تحذير: استيراد البيانات سيؤدي إلى استبدال البيانات الحالية بالكامل. هل أنت متأكد؟')) {
          const reader = new FileReader();
          reader.onload = (evt) => {
              alert("تم تعطيل الاستيراد مؤقتاً.");
          };
          reader.readAsText(file);
      }
      if(fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFactoryReset = () => {
      const confirm1 = window.confirm("تحذير شديد: هل أنت متأكد تماماً من رغبتك في إعادة ضبط المصنع؟");
      if(confirm1) {
          const confirm2 = window.prompt("هذا الإجراء سيحذف جميع الفواتير، العملاء، المنتجات، والقيود. لا يمكن التراجع. \n\nللتأكيد، اكتب 'حذف الكل' في المربع أدناه:");
          if(confirm2 === 'حذف الكل') {
              showToast('تم تعطيل إعادة الضبط مؤقتاً', 'info');
          }
      }
  };

  const handleResetDemoData = async () => {
      if (currentUserRole === 'demo') {
          if (window.confirm("هل أنت متأكد من إعادة ضبط بيانات الديمو؟ (محاكاة)")) {
              setLoading(true);
              setTimeout(() => {
                  showToast("تم إعادة ضبط بيانات الديمو بنجاح", 'success');
                  setLoading(false);
                  window.location.reload();
              }, 1000);
          }
          return;
      }
      if (window.confirm("هل أنت متأكد من إعادة ضبط بيانات الديمو؟\nسيتم مسح جميع الفواتير والقيود والعودة للوضع الافتراضي.")) {
          try {
              setLoading(true);
              // محاولة استخدام RPC أولاً
              const { error: rpcError } = await supabase.rpc('reset_demo_data');
              
              if (rpcError) {
                  console.warn("RPC failed, trying manual delete...", rpcError);
                  // الحذف اليدوي مع شرط لتجاوز "DELETE requires a WHERE clause"
                  // نستخدم neq('id', '00000000-0000-0000-0000-000000000000') كشرط عام (أو أي شرط صحيح دائماً)
                  await supabase.from('journal_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  await supabase.from('journal_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  await supabase.from('invoice_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  await supabase.from('receipt_vouchers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  await supabase.from('payment_vouchers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              }

              alert("تم إعادة ضبط بيانات الديمو بنجاح ✅");
              window.location.href = '/'; // إعادة التوجيه للرئيسية لتحديث البيانات
          } catch (err: any) {
              alert("فشل إعادة الضبط: " + err.message);
          } finally {
              setLoading(false);
          }
      }
  };

  const handleCloseYear = async () => {
      if (currentUserRole === 'demo') {
          alert("تم إغلاق السنة المالية بنجاح ✅ (محاكاة)");
          return;
      }

      const confirm1 = window.confirm("هل أنت متأكد من إقفال السنة المالية؟\n\nسيقوم النظام بـ:\n1. ترحيل صافي الربح/الخسارة إلى الأرباح المبقاة.\n2. إنشاء قيد إقفال للمصروفات والإيرادات.\n\nملاحظة: هذا الإجراء محاسبي ولا يقوم بمسح البيانات.");
      if (confirm1) {
          const confirm2 = window.prompt("للتأكيد، يرجى كتابة 'اقفال السنة' في المربع أدناه:");
          if (confirm2 === 'اقفال السنة') {
              const year = new Date().getFullYear() - 1; // افتراضياً نقفل السنة الماضية
              const closingDate = `${year}-12-31`;
              const success = await closeFinancialYear(year, closingDate);
              if (success) {
                  navigate('/general-journal', { state: { initialSearch: `CLOSE-${year}` } });
                  // تحديث تاريخ الإقفال في الإعدادات
                  await supabase
                    .from('company_settings')
                    .update({ last_closed_date: closingDate })
                    .eq('id', settingsId);
              }
          }
      }
  };

  const handleCreateMissingAccounts = async () => {
      if (currentUserRole === 'demo') {
          alert("تم فحص وإنشاء الحسابات المفقودة بنجاح. ✅ (محاكاة)");
          return;
      }

      if (!window.confirm('سيقوم النظام بفحص الحسابات المفقودة وإنشائها تلقائياً. هل تريد الاستمرار؟')) return;
      
      setLoading(true);
      try {
          const result = await createMissingSystemAccounts();
          alert(result.message + (result.created.length > 0 ? `\n\nتم إنشاء:\n${result.created.join('\n')}` : ''));
      } catch (e: any) {
          alert('حدث خطأ: ' + e.message);
      } finally {
          setLoading(false);
      }
  };

  const handleFixDatabaseSchema = async () => {
      if (currentUserRole === 'demo') {
          alert("تم فحص وإصلاح قاعدة البيانات بنجاح. ✅ (محاكاة)");
          return;
      }

      if (!window.confirm('سيقوم النظام بفحص وإصلاح هيكل جداول قاعدة البيانات (خاصة المرتجعات). هل تريد الاستمرار؟')) return;
      
      setLoading(true);
      try {
          const { data, error } = await supabase.rpc('fix_returns_schema');
          if (error) throw error;
          alert(data || 'تم الفحص بنجاح.');
      } catch (e: any) {
          alert('حدث خطأ أثناء الصيانة: ' + e.message);
      } finally {
          setLoading(false);
      }
  };

  const handleClearDemoData = async () => {
      if (currentUserRole === 'demo') {
          if (!window.confirm('⚠️ تحذير هام جداً: سيتم حذف جميع البيانات التشغيلية (فواتير، منتجات، عملاء)! (محاكاة)')) return;
          const confirmation = window.prompt('للتأكيد النهائي، يرجى كتابة كلمة "حذف" في المربع أدناه: (محاكاة)');
          if (confirmation !== 'حذف') {
              alert('تم إلغاء العملية.');
              return;
          }
          alert('تم تنظيف البيانات التجريبية بنجاح. النظام جاهز للعمل الفعلي. ✅ (محاكاة)');
          window.location.reload();
          return;
      }

      if (!window.confirm('⚠️ تحذير هام جداً: سيتم حذف جميع البيانات التشغيلية (فواتير، منتجات، عملاء)!\n\nسيتم الاحتفاظ فقط بالإعدادات ودليل الحسابات.\n\nهل أنت متأكد من رغبتك في تنظيف النظام للبدء الفعلي؟')) return;
      
      const confirmation = window.prompt('للتأكيد النهائي، يرجى كتابة كلمة "حذف" في المربع أدناه:');
      if (confirmation !== 'حذف') {
          alert('تم إلغاء العملية.');
          return;
      }

      setLoading(true);
      try {
          const { error } = await supabase.rpc('clear_demo_data');
          if (error) throw error;
          
          alert('تم تنظيف البيانات التجريبية بنجاح. النظام جاهز للعمل الفعلي. ✅');
          window.location.reload();
      } catch (e: any) {
          alert('حدث خطأ أثناء التنظيف: ' + e.message);
      } finally {
          setLoading(false);
      }
  };

  const handleMappingChange = (key: string, accountId: string) => {
      setFormData(prev => ({ ...prev, accountMappings: { ...prev.accountMappings, [key]: accountId } }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
          <h2 className="text-2xl font-bold text-slate-800">إعدادات النظام والحماية</h2>
          <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full font-bold border border-indigo-200">Admin Only</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
              <button 
                onClick={() => setActiveTab('general')}
                className={`flex-1 py-4 font-bold transition-colors flex items-center justify-center gap-2 ${activeTab === 'general' ? 'text-blue-900 border-b-2 border-blue-900 bg-blue-50' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <Building2 size={18} /> بيانات المنشأة
              </button>
              <button 
                onClick={() => setActiveTab('financial')}
                className={`flex-1 py-4 font-bold transition-colors flex items-center justify-center gap-2 ${activeTab === 'financial' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <CreditCard size={18} /> الإعدادات المالية
              </button>
              <button 
                onClick={() => setActiveTab('system')}
                className={`flex-1 py-4 font-bold transition-colors flex items-center justify-center gap-2 ${activeTab === 'system' ? 'text-red-600 border-b-2 border-red-600 bg-red-50' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <ShieldCheck size={18} /> الحماية والإقفال
              </button>
              <button 
                onClick={() => setActiveTab('mapping')}
                className={`flex-1 py-4 font-bold transition-colors flex items-center justify-center gap-2 ${activeTab === 'mapping' ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <LinkIcon size={18} /> ربط الحسابات
              </button>
              <button 
                onClick={() => setActiveTab('demo')}
                className={`flex-1 py-4 font-bold transition-colors flex items-center justify-center gap-2 ${activeTab === 'demo' ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <RotateCcw size={18} /> إدارة الديمو
              </button>
          </div>

          <div className="p-8">
              {activeTab === 'general' && (
                  <form onSubmit={handleSave} className="space-y-6 max-w-2xl animate-in fade-in">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="md:col-span-2">
                              <label className="block text-sm font-medium text-slate-700 mb-2">شعار المنشأة</label>
                              <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                  {formData.logoUrl ? (
                                      <img src={formData.logoUrl} alt="Logo" className="w-20 h-20 object-contain bg-white rounded-lg border border-slate-200 p-1" />
                                  ) : (
                                      <div className="w-20 h-20 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                                          <Landmark size={32} />
                                      </div>
                                  )}
                                  <div className="flex-1">
                                      <input 
                                        type="file" 
                                        accept="image/*"
                                        onChange={handleLogoUpload}
                                        className="block w-full text-sm text-slate-500
                                          file:mr-4 file:py-2 file:px-4
                                          file:rounded-full file:border-0
                                          file:text-sm file:font-bold
                                          file:bg-blue-50 file:text-blue-900
                                          hover:file:bg-blue-200
                                          cursor-pointer
                                        "
                                      />
                                      <p className="text-xs text-slate-500 mt-2">يفضل استخدام صورة بخلفية شفافة (PNG) وحجم مربع.</p>
                                  </div>
                              </div>
                          </div>
                          <div className="md:col-span-2">
                              <label className="block text-sm font-medium text-slate-700 mb-1">اسم المنشأة</label>
                              <input 
                                type="text" 
                                required
                                value={formData.companyName}
                                onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-900 outline-none"
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">الرقم الضريبي</label>
                              <input 
                                type="text" 
                                value={formData.taxNumber}
                                onChange={(e) => setFormData({...formData, taxNumber: e.target.value})}
                                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-900 outline-none"
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">رقم الهاتف</label>
                              <input 
                                type="text" 
                                value={formData.phone}
                                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-900 outline-none"
                              />
                          </div>
                          <div className="md:col-span-2">
                              <label className="block text-sm font-medium text-slate-700 mb-1">العنوان</label>
                              <input 
                                type="text" 
                                value={formData.address}
                                onChange={(e) => setFormData({...formData, address: e.target.value})}
                                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-900 outline-none"
                              />
                          </div>
                          <div className="md:col-span-2">
                              <label className="block text-sm font-medium text-slate-700 mb-1">تذييل الفاتورة (Footer Text)</label>
                              <textarea 
                                rows={2}
                                value={formData.footerText}
                                onChange={(e) => setFormData({...formData, footerText: e.target.value})}
                                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-blue-900 outline-none"
                                placeholder="نص يظهر أسفل الفواتير والسندات..."
                              ></textarea>
                          </div>
                      </div>
                      <div className="pt-4 text-left">
                          <button type="submit" className="bg-blue-900 text-white px-8 py-2.5 rounded-lg hover:bg-blue-800 font-bold shadow-md">
                              حفظ التغييرات
                          </button>
                      </div>
                  </form>
              )}

              {activeTab === 'financial' && (
                  <form onSubmit={handleSave} className="space-y-6 max-w-2xl animate-in fade-in">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="md:col-span-2 flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
                              <div>
                                  <label className="block text-sm font-bold text-slate-700">تفعيل ضريبة القيمة المضافة</label>
                                  <p className="text-xs text-slate-500 mt-1">تفعيل أو تعطيل حساب الضريبة في الفواتير</p>
                              </div>
                              <button 
                                  type="button" 
                                  onClick={() => setFormData({...formData, enableTax: !formData.enableTax})}
                                  className={`text-3xl transition-colors ${formData.enableTax ? 'text-emerald-600' : 'text-slate-300'}`}
                              >
                                  {formData.enableTax ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
                              </button>
                          </div>
                          <div className="md:col-span-2 flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
                              <div>
                                  <label className="block text-sm font-bold text-slate-700">السماح بالبيع بدون رصيد</label>
                                  <p className="text-xs text-slate-500 mt-1">يسمح بإنشاء فواتير حتى لو كانت الكمية غير متوفرة (غير مستحسن)</p>
                              </div>
                              <button 
                                  type="button" 
                                  onClick={() => setFormData({...formData, allowNegativeStock: !formData.allowNegativeStock})}
                                  className={`text-3xl transition-colors ${formData.allowNegativeStock ? 'text-red-600' : 'text-slate-300'}`}
                              >
                                  {formData.allowNegativeStock ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
                              </button>
                          </div>
                          <div className="md:col-span-2 flex items-center justify-between bg-slate-50 p-4 rounded-lg border border-slate-200">
                              <div>
                                  <label className="block text-sm font-bold text-slate-700">منع تعديل الأسعار في الفاتورة</label>
                                  <p className="text-xs text-slate-500 mt-1">عند التفعيل، لن يتمكن البائعون من تغيير سعر بيع الصنف المحدد مسبقاً</p>
                              </div>
                              <button 
                                  type="button" 
                                  onClick={() => setFormData({...formData, preventPriceModification: !formData.preventPriceModification})}
                                  className={`text-3xl transition-colors ${formData.preventPriceModification ? 'text-emerald-600' : 'text-slate-300'}`}
                              >
                                  {formData.preventPriceModification ? <ToggleRight size={40} /> : <ToggleLeft size={40} />}
                              </button>
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">الحد الأقصى للعجز المسموح به (للموظفين)</label>
                              <div className="relative">
                                  <input 
                                    type="number" 
                                    min="0"
                                    value={formData.maxCashDeficitLimit}
                                    onChange={(e) => setFormData({...formData, maxCashDeficitLimit: parseFloat(e.target.value)})}
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none"
                                  />
                              </div>
                              <p className="text-xs text-slate-500 mt-1">لن يتمكن الموظف من إقفال الصندوق إذا تجاوز العجز هذا المبلغ.</p>
                          </div>
                          <div className={`transition-opacity duration-200 ${!formData.enableTax ? 'opacity-50 pointer-events-none' : ''}`}>
                              <label className="block text-sm font-medium text-slate-700 mb-1">نسبة ضريبة القيمة المضافة (VAT)</label>
                              <div className="relative">
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    value={formData.vatRate}
                                    onChange={(e) => setFormData({...formData, vatRate: parseFloat(e.target.value)})}
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none text-left"
                                    placeholder="0.14"
                                    disabled={!formData.enableTax}
                                  />
                                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm">% (عشري)</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">أدخل 0.14 لنسبة 14% (مصر)</p>
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">العملة الافتراضية</label>
                              <div className="relative">
                                <select 
                                    value={formData.currency}
                                    onChange={(e) => setFormData({...formData, currency: e.target.value})}
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none appearance-none bg-white"
                                >
                                    <option value="">اختر العملة...</option>
                                    {currencies.map(c => (
                                        <option key={c.code} value={c.code}>{c.label}</option>
                                    ))}
                                    {!currencies.some(c => c.code === formData.currency) && formData.currency && (
                                        <option value={formData.currency}>{formData.currency}</option>
                                    )}
                                </select>
                                <div className="absolute left-3 top-3 pointer-events-none text-slate-400">
                                    <ChevronDown size={16} />
                                </div>
                              </div>
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">عدد الكسور العشرية</label>
                              <div className="relative">
                                  <input 
                                    type="number" 
                                    min="0"
                                    max="4"
                                    value={formData.decimalPlaces}
                                    onChange={(e) => setFormData({...formData, decimalPlaces: parseInt(e.target.value)})}
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-emerald-500 outline-none"
                                  />
                              </div>
                              <p className="text-xs text-slate-500 mt-1">عدد الأرقام بعد العلامة العشرية (مثال: 2 لـ 10.50)</p>
                          </div>
                      </div>
                      <div className="pt-4 text-left">
                          <button type="submit" className="bg-emerald-600 text-white px-8 py-2.5 rounded-lg hover:bg-emerald-700 font-bold shadow-md">
                              حفظ الإعدادات المالية
                          </button>
                      </div>
                  </form>
              )}

              {activeTab === 'system' && (
                  <div className="space-y-8 animate-in fade-in">
                      {/* Close Year Section */}
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-6 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-100 rounded-bl-full -mr-8 -mt-8"></div>
                          <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2 relative z-10">
                              <Archive size={20} /> إقفال السنة المالية
                          </h3>
                          <p className="text-sm text-amber-800 mb-6 max-w-2xl leading-relaxed">
                              تستخدم هذه الميزة عند انتهاء السنة المالية. سيقوم النظام بحساب الأرباح والخسائر، ترحيلها لحقوق الملكية، وإنشاء قيد إقفال لتصفير حسابات النتيجة (الإيرادات والمصروفات).
                          </p>
                          <button 
                            onClick={handleCloseYear}
                            className="flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 font-bold shadow-md transition-all"
                          >
                              <Archive size={18} /> إقفال السنة وفتح سنة جديدة
                          </button>
                      </div>

                      {/* System Health Section */}
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6">
                          <h3 className="text-lg font-bold text-indigo-800 mb-4 flex items-center gap-2">
                              <ShieldCheck size={20} /> فحص وإصلاح حسابات النظام
                          </h3>
                          <p className="text-sm text-indigo-700 mb-6">
                              يقوم هذا الإجراء بفحص دليل الحسابات للتأكد من وجود جميع الحسابات الأساسية اللازمة لعمل النظام (مثل النقدية، المبيعات، الضريبة، إلخ) وإنشائها تلقائياً في حال فقدانها.
                          </p>
                          <div className="flex flex-wrap gap-3">
                              <button 
                                onClick={handleCreateMissingAccounts}
                                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 font-bold shadow-md transition-all"
                              >
                                  <RotateCcw size={18} /> فحص وإنشاء الحسابات المفقودة
                              </button>
                              <button 
                                onClick={handleFixDatabaseSchema}
                                className="flex items-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 font-bold shadow-md transition-all"
                              >
                                  <Database size={18} /> صيانة وإصلاح قاعدة البيانات
                              </button>
                          </div>
                      </div>



                      {/* Clear Demo Data Section */}
                      <div className="bg-orange-50 border border-orange-100 rounded-xl p-6">
                          <h3 className="text-lg font-bold text-orange-800 mb-4 flex items-center gap-2">
                              <RotateCcw size={20} /> تنظيف البيانات التجريبية (بدء التشغيل)
                          </h3>
                          <p className="text-sm text-orange-700 mb-6">
                              استخدم هذا الخيار عند الانتهاء من تجربة النظام والرغبة في البدء الفعلي. سيتم حذف جميع الفواتير، المنتجات، والعملاء، مع الاحتفاظ بالإعدادات ودليل الحسابات.
                          </p>
                          <button 
                            onClick={handleClearDemoData}
                            className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 font-bold shadow-md transition-all"
                          >
                              <Trash2 size={18} /> حذف البيانات التجريبية
                          </button>
                      </div>

                      {/* Data Backup Section */}
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-100 rounded-bl-full -mr-8 -mt-8"></div>
                          <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2 relative z-10">
                              <Archive size={20} /> إقفال السنة المالية
                          </h3>
                          <p className="text-sm text-amber-800 mb-6 max-w-2xl leading-relaxed">
                              تستخدم هذه الميزة عند انتهاء السنة المالية. سيقوم النظام بحساب الأرباح والخسائر، ترحيلها لحقوق الملكية، وإنشاء قيد إقفال لتصفير حسابات النتيجة (الإيرادات والمصروفات).
                          </p>
                          <button 
                            onClick={handleCloseYear}
                            className="flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 font-bold shadow-md transition-all"
                          >
                              <Archive size={18} /> إقفال السنة وفتح سنة جديدة
                          </button>
                      </div>

                      {/* Data Backup Section */}
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                          <h3 className="text-lg font-bold text-blue-800 mb-4 flex items-center gap-2">
                              <Download size={20} /> النسخ الاحتياطي واستعادة البيانات
                          </h3>
                          <p className="text-sm text-blue-600 mb-6">
                              حفاظاً على حقوقك وملكية البيانات، يمكنك تحميل نسخة كاملة من قاعدة البيانات بصيغة JSON والاحتفاظ بها على جهازك الشخصي، أو استعادتها عند الحاجة.
                          </p>
                          
                          <div className="flex gap-4">
                              <button 
                                onClick={exportData}
                                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-bold shadow-md transition-all"
                              >
                                  <Download size={18} /> تصدير قاعدة البيانات
                              </button>
                              
                              <div className="relative">
                                  <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    accept=".json"
                                    onChange={handleImport}
                                    className="hidden"
                                  />
                                  <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-2 bg-white text-blue-700 border border-blue-300 px-6 py-3 rounded-lg hover:bg-blue-50 font-bold shadow-sm transition-all"
                                  >
                                      <Upload size={18} /> استيراد نسخة محفوظة
                                  </button>
                              </div>
                          </div>
                      </div>

                      {/* Danger Zone */}
                      <div className="bg-red-50 border border-red-100 rounded-xl p-6">
                          <h3 className="text-lg font-bold text-red-800 mb-4 flex items-center gap-2">
                              <AlertTriangle size={20} /> منطقة الخطر (إعادة ضبط المصنع)
                          </h3>
                          <p className="text-sm text-red-600 mb-6">
                              هذا الإجراء سيقوم بمسح جميع البيانات (العملاء، الموردين، الفواتير، الحسابات) وإعادة النظام إلى حالته الأولية. لا يمكن التراجع عن هذا الإجراء.
                          </p>
                          
                          <button 
                            onClick={handleFactoryReset}
                            className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 font-bold shadow-md transition-all"
                          >
                              <RotateCcw size={18} /> إعادة ضبط المصنع (مسح الكل)
                          </button>
                      </div>
                  </div>
              )}

              {activeTab === 'mapping' && (
                  <form onSubmit={handleSave} className="space-y-6 max-w-3xl animate-in fade-in">
                      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6">
                          <h3 className="font-bold text-purple-800 mb-2">توجيه الحسابات الآلي</h3>
                          <p className="text-sm text-purple-700">
                              هنا يمكنك تحديد الحسابات التي سيستخدمها النظام تلقائياً عند إنشاء الفواتير والسندات. 
                              إذا لم يتم تحديد حساب، سيستخدم النظام الكود الافتراضي.
                          </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {Object.entries(SYSTEM_ACCOUNTS).map(([key, defaultCode]) => (
                              <div key={key}>
                                  <label className="block text-sm font-bold text-slate-700 mb-1">
                                      {ACCOUNT_LABELS[key] || key.replace(/_/g, ' ')} <span className="text-xs font-normal text-slate-400" dir="ltr">({defaultCode})</span>
                                  </label>
                                  <select 
                                      value={formData.accountMappings[key] || ''}
                                      onChange={(e) => handleMappingChange(key, e.target.value)}
                                      className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:border-purple-500 outline-none bg-white"
                                  >
                                      <option value="">-- الافتراضي ({defaultCode}) --</option>
                                      {accounts.filter(a => !a.isGroup).map(acc => (
                                          <option key={acc.id} value={acc.id}>
                                              {acc.code} - {acc.name}
                                          </option>
                                      ))}
                                  </select>
                              </div>
                          ))}
                      </div>
                      <div className="pt-4 text-left">
                          <button type="submit" className="bg-purple-600 text-white px-8 py-2.5 rounded-lg hover:bg-purple-700 font-bold shadow-md">
                              حفظ التعيينات
                          </button>
                      </div>
                  </form>
              )}

              {activeTab === 'demo' && (
                  <div className="space-y-6 animate-in fade-in">
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-6">
                          <h3 className="text-lg font-bold text-amber-800 mb-4 flex items-center gap-2">
                              <RotateCcw size={20} /> إعادة ضبط بيانات الديمو
                          </h3>
                          <p className="text-sm text-amber-700 mb-6">
                              استخدم هذا الزر لإعادة قاعدة البيانات إلى حالتها الافتراضية (حذف جميع الفواتير والقيود والعملاء الجدد) مع الاحتفاظ بالإعدادات الأساسية. مفيد لتنظيف النسخة التجريبية.
                          </p>
                          <button 
                            onClick={handleResetDemoData}
                            className="bg-amber-600 text-white px-6 py-3 rounded-lg hover:bg-amber-700 font-bold shadow-md transition-all flex items-center gap-2"
                          >
                              <RotateCcw size={18} /> تنفيذ إعادة الضبط الآن
                          </button>
                      </div>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};

export default Settings;
