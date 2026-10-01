
import { logger } from '../utils/logger';
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAccounting, SYSTEM_ACCOUNTS } from '../context/AccountingContext';
import { useToast } from '../context/ToastContext';
import { secureStorage } from '../utils/securityMiddleware';
import * as XLSX from 'xlsx';
import { Building2, CreditCard, ShieldCheck, Link as LinkIcon, Landmark, RotateCcw, MonitorSmartphone } from 'lucide-react';
import { z } from 'zod';
import { runRestaurantModuleTest } from '../modules/restaurant/utils/runRestaurantFlowTest';
import { etaService } from '../services/etaService';
import { isValidUUID } from '../services/offlineService';
import {
  SettingsFormData,
  CloudBackup,
  GeneralSettingsTab,
  FinancialSettingsTab,
  SystemMaintenanceTab,
  AccountMappingTab,
  TerminalsSettingsTab,
  EtaIntegrationTab,
  DemoModeTab,
} from './settings/index';


const Settings = () => {
  const { closeFinancialYear, exportData, currentUser, accounts, createMissingSystemAccounts, recalculateAllBalances, purgeDeletedRecords, refreshSaasSchema, warehouses, refreshData, currentSelectedOrgId, organization } = useAccounting();
  const currentUserRole = currentUser?.role || '';
  const [activeTab, setActiveTab] = useState<'general' | 'financial' | 'system' | 'mapping' | 'terminals' | 'demo' | 'eta'>('general');
  const [terminalsList, setTerminalsList] = useState<any[]>([]);
  const [isTerminalsLoading, setIsTerminalsLoading] = useState(false);
  const [newTerminalData, setNewTerminalData] = useState({
    name: '',
    warehouseId: '',
    cashAccountId: ''
  });

  const fetchTerminals = async () => {
    if (!currentUser) return;
    setIsTerminalsLoading(true);
    try {
      const { data, error } = await supabase
        .from('pos_terminals')
        .select('*')
        .eq('organization_id', currentUser.organization_id);
      if (error) throw error;
      setTerminalsList(data || []);
    } catch (e) {
      logger.error(e);
    } finally {
      setIsTerminalsLoading(false);
    }
  };

  const [recalculatingWac, setRecalculatingWac] = useState(false);

  const handleRecalculateWac = async () => {
    setRecalculatingWac(true);
    showToast('جاري إعادة احتساب تكاليف المخزون (WAC) بأثر رجعي... ⏳', 'info');
    try {
      const { error } = await supabase.rpc('recalculate_all_products_wac');
      if (error) throw error;
      showToast('تم إعادة احتساب تكاليف المخزون بنجاح وتصحيح هوامش الربح! ✅', 'success');
    } catch (err) {
      showToast(`فشل الاحتساب: ${err.message}`, 'error');
    } finally {
      setRecalculatingWac(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'terminals') {
      fetchTerminals();
    }
  }, [activeTab, currentUser]);

  const handleAddTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerminalData.name.trim()) {
      showToast('الرجاء إدخال اسم الكاشير', 'error');
      return;
    }
    try {
      const { error } = await supabase
        .from('pos_terminals')
        .insert({
          name: newTerminalData.name,
          warehouse_id: newTerminalData.warehouseId || null,
          cash_account_id: newTerminalData.cashAccountId || null,
          organization_id: currentUser?.organization_id
        });
      if (error) throw error;
      showToast('تمت إضافة جهاز الكاشير بنجاح ✅', 'success');
      setNewTerminalData({ name: '', warehouseId: '', cashAccountId: '' });
      fetchTerminals();
    } catch (err) {
      showToast(err.message || 'فشل إضافة جهاز الكاشير', 'error');
    }
  };

  const handleDeleteTerminal = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف جهاز الكاشير هذا؟')) return;
    try {
      const { error } = await supabase
        .from('pos_terminals')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('تم حذف جهاز الكاشير بنجاح 🗑️', 'success');
      fetchTerminals();
    } catch (err) {
      showToast(err.message || 'فشل حذف جهاز الكاشير', 'error');
    }
  };

  const [formData, setFormData] = useState<SettingsFormData>({ 
      companyName: '', taxNumber: '', phone: '', address: '', footerText: '', vatRate: 0.14, currency: '', logoUrl: '', 
      enableTax: true, allowNegativeStock: false, preventPriceModification: false, maxCashDeficitLimit: 500, decimalPlaces: 2,
      enableServiceCharge: false, serviceChargeRate: 12,
      accountMappings: {} as Record<string, string>,
      defaultWarehouseId: '',
      defaultTreasuryId: '',
      defaultBankId: '',
      productionWarehouseId: '',
      rawMaterialsWarehouseId: '',
      etaTaxpayerId: '',
      etaClientId: '',
      etaClientSecret: '',
      etaEnvironment: 'sandbox' as 'sandbox' | 'production',
      etaIsActive: false
  });
  const [originalSettings, setOriginalSettings] = useState<any>(null);
  const [cloudBackups, setCloudBackups] = useState<CloudBackup[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enableWorkspaceTabs, setEnableWorkspaceTabs] = useState<boolean>(() => {
    try {
      const saved = secureStorage.getItem<boolean>('tripro_workspace_tabs_enabled');
      return saved !== false;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const handleTabsToggle = (e: any) => {
      const val = e.detail !== undefined ? e.detail : (secureStorage.getItem<boolean>('tripro_workspace_tabs_enabled') !== false);
      setEnableWorkspaceTabs(val);
    };
    window.addEventListener('workspace-tabs-visibility-changed', handleTabsToggle);
    window.addEventListener('storage', handleTabsToggle);
    return () => {
      window.removeEventListener('workspace-tabs-visibility-changed', handleTabsToggle);
      window.removeEventListener('storage', handleTabsToggle);
    };
  }, []);

  const handleToggleWorkspaceTabs = (enabled: boolean) => {
    setEnableWorkspaceTabs(enabled);
    try {
      secureStorage.setItem('tripro_workspace_tabs_enabled', enabled);
      window.dispatchEvent(new CustomEvent('workspace-tabs-visibility-changed', { detail: enabled }));
    } catch (e) {}
    showToast(enabled ? 'تم تفعيل شريط تبويبات مساحة العمل بنجاح 📑' : 'تم تعطيل شريط تبويبات مساحة العمل 🔕', 'info');
  };

  const navigate = useNavigate();

  useEffect(() => {
    // جلب إعدادات الشركة
    const fetchSettings = async () => {
        const orgId = (currentUser as any)?.organization_id;
        let sData: any = null;

        try {
            // 🛡️ استخدام RPC لضمان جلب إعدادات الشركة الصحيحة وتجنب مشاكل التوكن القديم
            const { data, error } = await supabase
                .rpc('get_current_company_settings', { p_org_id: orgId || null })
                .maybeSingle();
            
            if (!error && data) {
                sData = data;
            }
        } catch (err) {
            // صامت للمرور للمحاولة المباشرة
        }

        // في حالة عدم توفر RPC أو إرجاع خطأ يتم الجلب المباشر من الجدول
        if (!sData && orgId) {
            try {
                const { data: directData } = await supabase
                    .from('company_settings')
                    .select('*')
                    .eq('organization_id', orgId)
                    .maybeSingle();
                if (directData) sData = directData;
            } catch (err) {
                // صامت
            }
        }
        
        if (sData) {
            setSettingsId(sData.id);
            const loaded = {
                companyName: sData.company_name || '',
                taxNumber: sData.tax_number || '',
                phone: sData.phone || '',
                address: sData.address || '',
                footerText: sData.footer_text || '',
                vatRate: sData.vat_rate ? (sData.vat_rate <= 1 ? sData.vat_rate * 100 : sData.vat_rate) : 14,
                currency: sData.currency || '',
                logoUrl: sData.logo_url || '',
                enableTax: sData.enable_tax !== undefined ? sData.enable_tax : true,
                enableServiceCharge: sData.enable_service_charge !== undefined 
                    ? sData.enable_service_charge 
                    : (sData.account_mappings?.enable_service_charge !== undefined ? sData.account_mappings.enable_service_charge : false),
                serviceChargeRate: sData.service_charge_rate !== undefined && sData.service_charge_rate !== null 
                    ? (sData.service_charge_rate <= 1 && sData.service_charge_rate > 0 ? sData.service_charge_rate * 100 : sData.service_charge_rate) 
                    : (sData.account_mappings?.service_charge_rate !== undefined ? (sData.account_mappings.service_charge_rate <= 1 && sData.account_mappings.service_charge_rate > 0 ? sData.account_mappings.service_charge_rate * 100 : sData.account_mappings.service_charge_rate) : 12),
                allowNegativeStock: sData.allow_negative_stock !== undefined ? sData.allow_negative_stock : false,
                preventPriceModification: sData.prevent_price_modification !== undefined ? sData.prevent_price_modification : false,
                maxCashDeficitLimit: sData.max_cash_deficit_limit !== undefined ? sData.max_cash_deficit_limit : 500,
                decimalPlaces: sData.decimal_places !== undefined ? sData.decimal_places : 2,
                accountMappings: sData.account_mappings || {},
                defaultWarehouseId: sData.default_warehouse_id || sData.account_mappings?.default_warehouse_id || '',
                defaultTreasuryId: sData.default_treasury_id || sData.account_mappings?.default_treasury_id || '',
                defaultBankId: sData.default_bank_id || sData.account_mappings?.BANK || '',
                productionWarehouseId: sData.production_warehouse_id || sData.account_mappings?.production_warehouse_id || '',
                rawMaterialsWarehouseId: sData.raw_material_warehouse_id || sData.account_mappings?.raw_material_warehouse_id || '',
                etaTaxpayerId: sData.eta_taxpayer_id || sData.account_mappings?.eta_taxpayer_id || '',
                etaClientId: sData.eta_client_id || sData.account_mappings?.eta_client_id || '',
                etaClientSecret: sData.eta_client_secret || sData.account_mappings?.eta_client_secret || '',
                etaEnvironment: sData.eta_environment || sData.account_mappings?.eta_environment || 'sandbox',
                etaIsActive: sData.eta_is_active !== undefined ? sData.eta_is_active : (sData.account_mappings?.eta_is_active !== undefined ? sData.account_mappings.eta_is_active : false)
            };
            setFormData(loaded);
            setOriginalSettings(loaded);
        }
        setLoading(false);
    };

    fetchSettings();
    fetchCloudBackups();
  }, [currentUser]);

  const fetchCloudBackups = async () => {
    const orgId = (currentUser as any)?.organization_id;
    if (!orgId) return;
    const { data } = await supabase
      .from('organization_backups')
      .select('id, organization_id, file_size_kb, backup_date, notes, created_at')
      .eq('organization_id', orgId)
      .order('backup_date', { ascending: false })
      .limit(5);
    setCloudBackups(data || []);
  };

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
      
      const settingsSchema = z.object({
          companyName: z.string().min(1, 'اسم المنشأة مطلوب'),
          email: z.string().email('البريد الإلكتروني غير صحيح').optional().or(z.literal('')),
          vatRate: z.coerce.number().min(0).max(100, 'نسبة الضريبة يجب أن تكون بين 0 و 100'),
          serviceChargeRate: z.coerce.number().min(0).max(100, 'نسبة الخدمة يجب أن تكون بين 0 و 100').optional(),
          maxCashDeficitLimit: z.coerce.number().min(0, 'الحد الأقصى للعجز يجب أن يكون 0 أو أكثر'),
          decimalPlaces: z.coerce.number().min(0).max(4, 'عدد الكسور العشرية يجب أن يكون بين 0 و 4')
      });

      const validationResult = settingsSchema.safeParse(formData);
      if (!validationResult.success) {
          showToast(validationResult.error.issues[0].message, 'warning');
          return;
      }

      if (currentUserRole === 'demo') {
          showToast("تم تحديث إعدادات الجلسة الحالية بنجاح ✅", 'success');
          return;
      }

      try {
        const targetOrg = (currentSelectedOrgId && isValidUUID(currentSelectedOrgId))
            ? currentSelectedOrgId
            : ((organization?.id && isValidUUID(organization.id))
                ? organization.id
                : ((currentUser?.organization_id && isValidUUID(currentUser.organization_id)) ? currentUser.organization_id : null));

        const validDefaultWarehouseId = isValidUUID(formData.defaultWarehouseId) ? formData.defaultWarehouseId : null;
        const validDefaultTreasuryId = isValidUUID(formData.defaultTreasuryId) ? formData.defaultTreasuryId : null;
        const validProdWarehouseId = isValidUUID(formData.productionWarehouseId) ? formData.productionWarehouseId : null;
        const validRawWarehouseId = isValidUUID(formData.rawMaterialsWarehouseId) ? formData.rawMaterialsWarehouseId : null;
        const validBankId = isValidUUID(formData.defaultBankId) 
            ? formData.defaultBankId 
            : (isValidUUID((formData.accountMappings as any)?.BANK) ? (formData.accountMappings as any)?.BANK : null);

        const accountMappingsWithService = {
            ...(formData.accountMappings || {}),
            BANK: validBankId,
            enable_service_charge: formData.enableServiceCharge,
            service_charge_rate: (Number(formData.serviceChargeRate) || 0) / 100,
            default_warehouse_id: validDefaultWarehouseId,
            default_treasury_id: validDefaultTreasuryId,
            production_warehouse_id: validProdWarehouseId,
            raw_material_warehouse_id: validRawWarehouseId,
            eta_taxpayer_id: formData.etaTaxpayerId || null,
            eta_client_id: formData.etaClientId || null,
            eta_client_secret: formData.etaClientSecret || null,
            eta_environment: formData.etaEnvironment || 'sandbox',
            eta_is_active: formData.etaIsActive
        };

        const payload: any = {
            ...(targetOrg ? { organization_id: targetOrg } : {}),
            company_name: formData.companyName,
            tax_number: formData.taxNumber,
            phone: formData.phone,
            address: formData.address,
            footer_text: formData.footerText,
            vat_rate: (Number(formData.vatRate) || 0) / 100, // تخزين الضريبة ككسر عشري في قاعدة البيانات
            currency: formData.currency || 'EGP',
            logo_url: formData.logoUrl,
            allow_negative_stock: Boolean(formData.allowNegativeStock),
            enable_tax: Boolean(formData.enableTax),
            enable_service_charge: Boolean(formData.enableServiceCharge),
            service_charge_rate: (Number(formData.serviceChargeRate) || 0) / 100,
            prevent_price_modification: Boolean(formData.preventPriceModification),
            max_cash_deficit_limit: Number(formData.maxCashDeficitLimit) || 0,
            decimal_places: Number(formData.decimalPlaces) || 2,
            updated_at: new Date().toISOString(),
            account_mappings: accountMappingsWithService,
            default_warehouse_id: validDefaultWarehouseId,
            default_treasury_id: validDefaultTreasuryId,
            production_warehouse_id: validProdWarehouseId,
            raw_material_warehouse_id: validRawWarehouseId,
            eta_taxpayer_id: formData.etaTaxpayerId || null,
            eta_client_id: formData.etaClientId || null,
            eta_client_secret: formData.etaClientSecret || null,
            eta_environment: formData.etaEnvironment || 'sandbox',
            eta_is_active: Boolean(formData.etaIsActive)
        };

        let currentPayload = { ...payload };
        let saveResult = settingsId 
            ? await supabase.from('company_settings').update(currentPayload).eq('id', settingsId)
            : await supabase.from('company_settings').insert(currentPayload);

        let error = saveResult.error;
        let attempts = 0;

        // 🛡️ صمام أمان ذاتي الشفاء: في حال عدم وجود بعض الأعمدة في جدول قاعدة البيانات القديم، يتم حذفها تدريجياً وإعادة الحفظ
        while (error && attempts < 10 && (
            error.message?.includes('column') || 
            error.code === 'PGRST204' || 
            (error as any).details?.includes('column') ||
            (error as any).hint?.includes('column')
        )) {
            attempts++;
            const colMatch = error.message?.match(/column ['"]?([a-zA-Z0-9_]+)['"]?/i) 
                          || (error as any).details?.match(/column ['"]?([a-zA-Z0-9_]+)['"]?/i)
                          || error.message?.match(/Could not find the '([a-zA-Z0-9_]+)' column/i);
            
            if (colMatch && colMatch[1] && colMatch[1] in currentPayload) {
                delete currentPayload[colMatch[1]];
            } else {
                delete currentPayload.enable_service_charge;
                delete currentPayload.service_charge_rate;
                delete currentPayload.eta_taxpayer_id;
                delete currentPayload.eta_client_id;
                delete currentPayload.eta_client_secret;
                delete currentPayload.eta_environment;
                delete currentPayload.eta_is_active;
                delete currentPayload.production_warehouse_id;
                delete currentPayload.raw_material_warehouse_id;
                delete currentPayload.default_warehouse_id;
                delete currentPayload.default_treasury_id;
            }

            const retry = settingsId 
                ? await supabase.from('company_settings').update(currentPayload).eq('id', settingsId)
                : await supabase.from('company_settings').insert(currentPayload);
            error = retry.error;
        }

        if (error) throw error;

        // حساب التغييرات المحددة لتسجيلها في تفاصيل سجل الأمان
        const changes: Record<string, { from: any, to: any }> = {};
        const fieldLabels: Record<string, string> = {
            companyName: 'اسم الشركة',
            taxNumber: 'الرقم الضريبي',
            phone: 'الهاتف',
            address: 'العنوان',
            footerText: 'نص التذييل',
            vatRate: 'نسبة الضريبة',
            currency: 'العملة',
            enableTax: 'تفعيل الضريبة',
            allowNegativeStock: 'السماح بالبيع بالسالب',
            preventPriceModification: 'منع تعديل الأسعار',
            maxCashDeficitLimit: 'الحد الأقصى لعجز النقدية',
            decimalPlaces: 'الخانة العشرية',
            defaultWarehouseId: 'المخزن الافتراضي',
            defaultTreasuryId: 'الخزينة الافتراضية',
            defaultBankId: 'البنك الافتراضي للنظام',
            productionWarehouseId: 'مخزن الإنتاج',
            rawMaterialsWarehouseId: 'مخزن المواد الخام'
        };

        if (originalSettings) {
            Object.keys(formData).forEach((key) => {
                const oldValue = (originalSettings as any)[key];
                const newValue = (formData as any)[key];
                if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                    const label = fieldLabels[key] || key;
                    changes[label] = {
                        from: oldValue === null || oldValue === undefined ? 'لا يوجد' : String(oldValue),
                        to: newValue === null || newValue === undefined ? 'لا يوجد' : String(newValue)
                    };
                }
            });
        }

        // تسجيل العملية في سجلات الأمان
        try {
            await supabase.from('security_logs').insert({
                event_type: 'settings_update',
                description: `تم تحديث إعدادات المنشأة بواسطة ${(currentUser as any)?.full_name}`,
                organization_id: (currentUser as any)?.organization_id,
                metadata: { changes, performed_by: currentUser?.id }
            });
        } catch (e) {
            // صامت
        }

        // تحديث القيمة الأصلية المسجلة للتغييرات التالية
        setOriginalSettings({ ...formData });

        showToast("تم حفظ الإعدادات بنجاح ✅", 'success');
      } catch (err) {
        showToast("فشل الحفظ: " + err.message, 'error');
      }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    if (currentUserRole === 'demo') {
        showToast('تم رفع الشعار بنجاح! سيظهر في الفواتير المطبوعة خلال هذه الجلسة.', 'success');
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
      showToast('تم رفع الشعار بنجاح! لا تنس حفظ الإعدادات.', 'success');
    } catch (error) {
      showToast('فشل رفع الشعار: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const orgId = (currentUser as any)?.organization_id;
    if (!orgId) {
      showToast('فشل تحديد المنظمة. يرجى إعادة تسجيل الدخول.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target?.result as string;
        const isJson = file.name.toLowerCase().endsWith('.json');

        if (isJson) {
          let parsedData: any;
          try {
            parsedData = JSON.parse(content);
          } catch (jsonErr) {
            showToast('خطأ: الملف المرفوع ليس بصيغة JSON صالحة.', 'error');
            return;
          }

          if (!parsedData || typeof parsedData !== 'object') {
            showToast('خطأ: محتوى ملف النسخة الاحتياطية غير صالح.', 'error');
            return;
          }

          if (!window.confirm('⚠️ تحذير شديد: استعادة هذه النسخة ستؤدي لاستبدال وتحديث بيانات المنشأة الحالية ببيانات النسخة المرفوعة. هل تريد الاستمرار؟')) {
            return;
          }

          const confirmText = window.prompt('لتأكيد عملية الاستعادة، يرجى كتابة كلمة "استعادة" في المربع أدناه:');
          if (!confirmText || (confirmText.trim() !== 'استعادة' && confirmText.trim() !== 'استعاده')) {
            showToast('تم إلغاء عملية الاستعادة أو لم يتم إدخال كلمة التأكيد بشكل صحيح.', 'info');
            return;
          }

          setLoading(true);
          try {
            const { data, error } = await supabase.rpc('restore_organization_backup', {
              p_org_id: orgId,
              p_backup_data: parsedData
            });

            if (error) throw error;
            showToast(data || 'تمت استعادة البيانات بنجاح ✅', 'success');
            setTimeout(() => window.location.reload(), 1500);
          } catch (restoreErr) {
            showToast('فشل عملية الاستعادة: ' + restoreErr.message, 'error');
          } finally {
            setLoading(false);
          }
        } else { // Excel file
          showToast('لاستيراد البيانات من Excel، يرجى استخدام "مركز ترحيل البيانات" من القائمة الجانبية.', 'info');
        }
      } catch (err) {
        showToast("فشل قراءة الملف: " + err.message, 'error');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    if (file.name.toLowerCase().endsWith('.json')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const handleCreateCloudBackup = async () => {
    const orgId = (currentUser as any)?.organization_id;
    if (!orgId) {
      showToast('فشل تحديد المنظمة. يرجى إعادة تسجيل الدخول.', 'error');
      return;
    }

    if (!window.confirm('هل تريد إنشاء نسخة احتياطية كاملة لبيانات المنشأة في السحابة الآن؟')) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_organization_backup', { 
        p_org_id: orgId 
      });
      if (error) throw error;
      showToast(`تم إنشاء النسخة الاحتياطية بنجاح ✅ رقم النسخة: ${data}`, 'success');
      fetchCloudBackups();
    } catch (err) {
      showToast('فشل إنشاء النسخة الاحتياطية: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreCloudBackup = async (backup: CloudBackup) => {
    if (!window.confirm('⚠️ تحذير شديد: استعادة هذه النسخة ستمسح كافة البيانات الحالية وتستبدلها ببيانات النسخة المختارة. هل تريد الاستمرار؟')) return;
    
    const confirmText = window.prompt('لتأكيد العملية، يرجى كتابة كلمة "استعادة" في المربع أدناه:');
    if (!confirmText || (confirmText.trim() !== 'استعادة' && confirmText.trim() !== 'استعاده')) {
      showToast('تم إلغاء عملية الاستعادة أو لم يتم إدخال كلمة التأكيد بشكل صحيح', 'info');
      return;
    }

    setLoading(true);
    try {
      let rawData = backup.backup_data;
      if (!rawData) {
        const { data: record, error: fetchErr } = await supabase
          .from('organization_backups')
          .select('backup_data')
          .eq('id', backup.id)
          .single();
        if (fetchErr) throw fetchErr;
        rawData = record?.backup_data;
      }

      const payload = typeof rawData === 'string' 
        ? JSON.parse(rawData) 
        : rawData;

      const { data, error } = await supabase.rpc('restore_organization_backup', { 
        p_org_id: backup.organization_id,
        p_backup_data: payload
      });
      if (error) throw error;
      showToast(data || 'تمت استعادة البيانات بنجاح ✅', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      showToast('فشل عملية الاستعادة: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFactoryReset = () => {
      const confirm1 = window.confirm("تحذير شديد: هل أنت متأكد تماماً من رغبتك في إعادة ضبط المصنع؟");
      if(confirm1) {
          const confirm2 = window.prompt("هذا الإجراء سيحذف جميع الفواتير، العملاء، المنتجات، والقيود. لا يمكن التراجع. \n\nللتأكيد، اكتب 'حذف الكل' في المربع أدناه:");
          if(confirm2 === 'حذف الكل') {
              showToast('تم تعطيل إعادة الضبط مؤقتاً', 'warning');
          }
      }
  };

  const handleResetDemoData = async () => {
      if (currentUserRole === 'demo') {
          if (window.confirm("هل أنت متأكد من إعادة ضبط البيانات الافتراضية؟")) {
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
                  if (process.env.NODE_ENV === 'development') logger.warn("RPC failed, trying manual delete...", rpcError);
                  // الحذف اليدوي مع شرط لتجاوز "DELETE requires a WHERE clause"
                  // نستخدم neq('id', '00000000-0000-0000-0000-000000000000') كشرط عام (أو أي شرط صحيح دائماً)
                  await supabase.from('journal_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  await supabase.from('journal_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  await supabase.from('invoice_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  await supabase.from('receipt_vouchers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                  await supabase.from('payment_vouchers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              }

              showToast("تم إعادة ضبط بيانات الديمو بنجاح ✅", 'success');
              window.location.href = '/'; // إعادة التوجيه للرئيسية لتحديث البيانات
          } catch (err) {
              showToast("فشل إعادة الضبط: " + err.message, 'error');
          } finally {
              setLoading(false);
          }
      }
  };

  const handleCloseYear = async () => {
      if (currentUserRole === 'demo') {
          showToast("تم إغلاق السنة المالية وترحيل الأرصدة بنجاح ✅", 'success');
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
          showToast("تم فحص الدليل المحاسبي وإنشاء الحسابات المفقودة بنجاح. ✅", 'success');
          return;
      }

      if (!window.confirm('سيقوم النظام بفحص الحسابات المفقودة وإنشائها تلقائياً. هل تريد الاستمرار؟')) return;
      
      setLoading(true);
      try {
          const result = await createMissingSystemAccounts();
          showToast(result.message, 'success');
      } catch (e) {
          showToast('حدث خطأ: ' + e.message, 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleFixDatabaseSchema = async () => {
      if (currentUserRole === 'demo') {
          showToast("تم فحص وإصلاح جداول قاعدة البيانات بنجاح. ✅", 'success');
          return;
      }

      if (!window.confirm('سيقوم النظام بفحص وإصلاح هيكل جداول قاعدة البيانات (خاصة المرتجعات). هل تريد الاستمرار؟')) return;
      
      setLoading(true);
      try {
          const { data, error } = await supabase.rpc('fix_returns_schema');
          if (error) throw error;
          showToast(data || 'تم الفحص بنجاح.', 'success');
      } catch (e) {
          showToast('حدث خطأ أثناء الصيانة: ' + e.message, 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleCleanOrphanedOpeningEntries = async () => {
      if (currentUserRole === 'demo') {
          showToast("تم فحص وتنظيف القيود اليتيمة بنجاح ✅ (محاكاة)", 'success');
          return;
      }

      if (!window.confirm('هل تريد البحث عن وحذف قيود الأرصدة الافتتاحية (Opening Balances) الخاصة بالأصناف التي تم حذفها نهائياً؟\n\nتحذير: يعتمد هذا الفحص على تطابق اسم الصنف في شرح القيد. إذا قمت بتغيير اسم صنف بعد إنشائه، قد يتم اعتبار قيده يتيماً.')) return;

      setLoading(true);
      try {
          // 1. جلب أسماء جميع المنتجات الموجودة حالياً
          const { data: products } = await supabase.from('products').select('name');
          const productNames = new Set(products?.map(p => p.name) || []);
          
          // 2. جلب قيود الأرصدة الافتتاحية الفردية
          const { data: entries } = await supabase
              .from('journal_entries')
              .select('id, description')
              .or('reference.ilike.OPEN-IMP-%,reference.ilike.OPEN-MAN-%');

          if (!entries || entries.length === 0) {
              showToast('لا توجد قيود أرصدة افتتاحية للفحص.', 'info');
              setLoading(false);
              return;
          }

          const idsToDelete: string[] = [];

          for (const entry of entries) {
              // التنسيق المتوقع: "رصيد افتتاحي ... - اسم الصنف"
              const description = entry.description || '';
              const separatorIndex = description.lastIndexOf(' - ');
              
              if (separatorIndex !== -1) {
                  const productName = description.substring(separatorIndex + 3).trim();
                  // إذا كان اسم المنتج في القيد غير موجود في قائمة المنتجات الحالية
                  if (!productNames.has(productName)) {
                      idsToDelete.push(entry.id);
                  }
              }
          }

          if (idsToDelete.length > 0) {
              // حذف القيود (الأسطر ستحذف تلقائياً بفضل Cascade في قاعدة البيانات)
              await supabase.from('journal_lines').delete().in('journal_entry_id', idsToDelete);
              const { error } = await supabase.from('journal_entries').delete().in('id', idsToDelete);
              
              if (error) throw error;
              showToast(`تم تنظيف ${idsToDelete.length} قيد يتيم بنجاح ✅`, 'success');
          } else {
              showToast('سجل القيود نظيف. جميع قيود الأرصدة الافتتاحية مرتبطة بأصناف موجودة. ✅', 'success');
          }
      } catch (e) {
          logger.error(e);
          showToast('حدث خطأ أثناء التنظيف: ' + e.message, 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleClearDemoData = async () => {
      if (currentUserRole === 'demo') {
          if (!window.confirm('⚠️ تحذير هام جداً: سيتم حذف جميع البيانات التشغيلية (فواتير، منتجات، عملاء)!')) return;
          const confirmation = window.prompt('للتأكيد النهائي، يرجى كتابة كلمة "حذف" في المربع أدناه:');
          if (confirmation !== 'حذف') {
              showToast('تم إلغاء العملية.', 'info');
              return;
          }
          showToast('تم تنظيف البيانات التجريبية بنجاح. النظام جاهز للعمل الفعلي. ✅', 'success');
          window.location.reload();
          return;
      }

      if (!window.confirm('⚠️ تحذير هام جداً: سيتم حذف جميع البيانات التشغيلية (فواتير، منتجات، عملاء)!\n\nسيتم الاحتفاظ فقط بالإعدادات ودليل الحسابات.\n\nهل أنت متأكد من رغبتك في تنظيف النظام للبدء الفعلي؟')) return;
      
      const confirmation = window.prompt('للتأكيد النهائي، يرجى كتابة كلمة "حذف" في المربع أدناه:');
      if (confirmation !== 'حذف') {
          showToast('تم إلغاء العملية.', 'info');
          return;
      }

      setLoading(true);
      try {
          const { data: { session } } = await supabase.auth.getSession();
          const orgId = session?.user?.user_metadata?.org_id;
          if (!orgId) throw new Error("معرف المنظمة غير موجود.");
          const { error } = await supabase.rpc('clear_demo_data', { p_org_id: orgId });
          if (error) throw error;
          
          showToast('تم تنظيف البيانات التجريبية بنجاح. النظام جاهز للعمل الفعلي. ✅', 'success');
          window.location.reload();
      } catch (e) {
          showToast('حدث خطأ أثناء التنظيف: ' + e.message, 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleExportList = async (type: 'customers' | 'suppliers' | 'products') => {
      if (currentUserRole === 'demo') {
          showToast("تم تصدير الملف بنجاح ✅ (محاكاة)", 'success');
          return;
      }

      setLoading(true);
      try {
          let data: any[] = [];
          let fileName = '';
          
          const fetchAllRecords = async (table: string) => {
            const CHUNK_SIZE = 1000;
            let all: any[] = [];
            let from = 0;
            while (true) {
              const { data: chunk, error } = await supabase
                .from(table)
                .select('*')
                .is('deleted_at', null)
                .order('id', { ascending: true })
                .range(from, from + CHUNK_SIZE - 1);
              if (error) throw error;
              if (!chunk || chunk.length === 0) break;
              all = all.concat(chunk);
              if (chunk.length < CHUNK_SIZE) break;
              from += CHUNK_SIZE;
            }
            return all;
          };

          if (type === 'customers') {
              data = await fetchAllRecords('customers');
              fileName = 'Customers_List.xlsx';
          } else if (type === 'suppliers') {
              data = await fetchAllRecords('suppliers');
              fileName = 'Suppliers_List.xlsx';
          } else if (type === 'products') {
              data = await fetchAllRecords('products');
              fileName = 'Products_List.xlsx';
          }

          if (data && data.length > 0) {
              const ws = XLSX.utils.json_to_sheet(data);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, type);
              XLSX.writeFile(wb, fileName);
              showToast(`تم تصدير قائمة ${type === 'customers' ? 'العملاء' : type === 'suppliers' ? 'الموردين' : 'الأصناف'} بنجاح ✅`, 'success');
          } else {
              showToast('لا توجد بيانات للتصدير.', 'info');
          }
      } catch (err) {
          showToast('فشل التصدير: ' + err.message, 'error');
      } finally {
          setLoading(false);
      }
  };

  const handleAutoMapping = async () => {
      const orgId = (currentUser as any)?.organization_id;
      const mappingSource = {
          ...SYSTEM_ACCOUNTS, 
          CASH_SHORTAGE: '541',
          CASH_SURPLUS_ACC: '441',
          INVENTORY_RAW_MATERIALS: '10301',
          INVENTORY_WIP: '10303',
          INVENTORY_FINISHED_GOODS: '10302',
          LABOR_COST_ALLOCATED: '513',
          WASTAGE_EXPENSE: '5121',
          RETENTION_CUSTOMER: '1249',
          RETENTION_SUBCONTRACTOR: '2229',
          ADVANCE_PAYMENT_SUBCONTRACTOR: '1245',
          EQUIPMENT_INTERNAL_REVENUE: '425'
      };

      const newMappings = { ...formData.accountMappings };
      let currentAccs = [...accounts];
      let linkedCount = 0;

      // إنشاء حساب رسوم الخدمة 41104 تلقائياً إذا لم يكن مضافاً في شجرة الحسابات
      if (orgId && !currentAccs.some(acc => acc.code === '41104')) {
          try {
              const parent41 = currentAccs.find(acc => acc.code === '41') || currentAccs.find(acc => acc.code === '4');
              const { data: createdAcc, error: createErr } = await supabase.from('accounts').insert({
                  organization_id: orgId,
                  code: '41104',
                  name: 'إيرادات رسوم الخدمة (المطاعم)',
                  type: 'REVENUE',
                  is_group: false,
                  is_active: true,
                  parent_id: parent41?.id || null
              }).select().maybeSingle();

              if (!createErr && createdAcc) {
                  currentAccs.push(createdAcc);
                  await refreshData();
              }
          } catch (e) {
              logger.error('Failed to auto-create 41104 account:', e);
          }
      }

      // إنشاء حساب غطاء خطابات الضمان 1248 تلقائياً إذا لم يكن موجوداً
      if (orgId && !currentAccs.some(acc => acc.code === '1248' || acc.code?.startsWith('1248'))) {
          try {
              const parent124 = currentAccs.find(acc => acc.code === '124') || currentAccs.find(acc => acc.code === '12') || currentAccs.find(acc => acc.code === '1');
              const { data: createdAcc, error: createErr } = await supabase.from('accounts').insert({
                  organization_id: orgId,
                  code: '1248',
                  name: 'غطاء خطابات الضمان لدى البنوك',
                  type: 'ASSET',
                  is_group: false,
                  is_active: true,
                  parent_id: parent124?.id || null
              }).select().maybeSingle();
              if (!createErr && createdAcc) {
                  currentAccs.push(createdAcc);
              }
          } catch (e) {
              logger.error('Failed to auto-create 1248 account:', e);
          }
      }

      // إنشاء حساب اعتمادات مستندية 1246 تلقائياً إذا لم يكن موجوداً
      if (orgId && !currentAccs.some(acc => acc.code === '1246' || acc.code?.startsWith('1246'))) {
          try {
              const parent124 = currentAccs.find(acc => acc.code === '124') || currentAccs.find(acc => acc.code === '12') || currentAccs.find(acc => acc.code === '1');
              const { data: createdAcc, error: createErr } = await supabase.from('accounts').insert({
                  organization_id: orgId,
                  code: '1246',
                  name: 'اعتمادات مستندية لشراء بضائع',
                  type: 'ASSET',
                  is_group: false,
                  is_active: true,
                  parent_id: parent124?.id || null
              }).select().maybeSingle();
              if (!createErr && createdAcc) {
                  currentAccs.push(createdAcc);
              }
          } catch (e) {
              logger.error('Failed to auto-create 1246 account:', e);
          }
      }

      // بحث اسمي (fallback) لحسابات بنكية محددة
      const nameFallbacks: Record<string, (acc: any) => boolean> = {
          LETTER_OF_GUARANTEE_MARGIN: (acc) =>
              acc.code === '1248' || acc.code?.startsWith('1248') ||
              acc.name?.includes('غطاء خطابات ضمان') || acc.name?.includes('غطاء خطابات الضمان') || acc.name?.includes('غطاء الضمان'),
          LETTER_OF_CREDIT_GOODS: (acc) =>
              acc.code === '1246' || acc.code?.startsWith('1246') ||
              acc.name?.includes('اعتمادات مستندية') || acc.name?.includes('اعتماد مستندي') || acc.name?.includes('خطابات اعتماد'),
      };

      Object.entries(mappingSource).forEach(([key, defaultCode]) => {
          // البحث عن الحساب بالكود الافتراضي بشرط ألا يكون حساباً تجميعياً
          let matchedAccount = currentAccs.find(acc => acc.code === defaultCode && !acc.isGroup);
          // fallback بالاسم للحسابات التي لا تجد كوداً مطابقاً تماماً
          if (!matchedAccount && nameFallbacks[key]) {
              matchedAccount = currentAccs.find(acc => !acc.isGroup && nameFallbacks[key](acc));
          }
          if (matchedAccount) {
              newMappings[key] = matchedAccount.id;
              linkedCount++;
          }
      });

      setFormData(prev => ({ ...prev, accountMappings: newMappings }));
      
      if (linkedCount > 0) {
          showToast(`تم ربط ${linkedCount} حساب بنجاح بناءً على الأكواد الافتراضية ✅`, 'success');
      } else {
          showToast('لم يتم العثور على حسابات مطابقة للأكواد الافتراضية في الدليل الحالي.', 'warning');
      }
  };

  const handleMappingChange = (key: string, accountId: string) => {
      setFormData(prev => ({ ...prev, accountMappings: { ...prev.accountMappings, [key]: accountId } }));
  };

  const [testingEta, setTestingEta] = useState(false);
  const handleTestEta = async () => {
      if (!formData.etaTaxpayerId && !formData.etaClientId) {
          showToast('يرجى إدخال رقم التسجيل الضريبي أو معرف العميل أولاً.', 'warning');
          return;
      }
      setTestingEta(true);
      try {
          const res = await fetch('/api/eta-submit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  action: 'status',
                  uuid: 'TEST-PING',
                  settings: {
                      eta_client_id: formData.etaClientId,
                      eta_client_secret: formData.etaClientSecret,
                      eta_environment: formData.etaEnvironment,
                      eta_taxpayer_id: formData.etaTaxpayerId
                  }
              })
          });
          const data = await res.json();
          if (data.success) {
              showToast('الاتصال بالبوابة السحابية لمنظومة الضرائب يعمل بنجاح! 🚀', 'success');
          } else {
              showToast('تنبيه: ' + (data.error || 'فشل الاتصال بمصلحة الضرائب'), 'warning');
          }
      } catch (err) {
          showToast('خطأ في فحص الاتصال: ' + err.message, 'error');
      } finally {
          setTestingEta(false);
      }
  };

  const [localSignerStatus, setLocalSignerStatus] = useState<{ online: boolean; message: string; details?: any } | null>(null);
  const [checkingSigner, setCheckingSigner] = useState(false);
  const handleCheckLocalSigner = async () => {
      setCheckingSigner(true);
      try {
          const result = await etaService.checkLocalSignerHealth();
          setLocalSignerStatus(result);
          if (result.online) {
              showToast(result.message, 'success');
          } else {
              showToast(result.message, 'warning');
          }
      } catch (err) {
          setLocalSignerStatus({ online: false, message: err.message || 'فشل الاتصال بالمساعد المحلي' });
          showToast('تعذر فحص المساعد المحلي: ' + err.message, 'error');
      } finally {
          setCheckingSigner(false);
      }
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
                onClick={() => setActiveTab('terminals')}
                className={`flex-1 py-4 font-bold transition-colors flex items-center justify-center gap-2 ${activeTab === 'terminals' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <MonitorSmartphone size={18} /> أجهزة الكاشير
              </button>
              <button 
                onClick={() => setActiveTab('eta')}
                className={`flex-1 py-4 font-bold transition-colors flex items-center justify-center gap-2 ${activeTab === 'eta' ? 'text-cyan-600 border-b-2 border-cyan-600 bg-cyan-50' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <Landmark size={18} /> الضرائب الإلكترونية (ETA)
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
                  <GeneralSettingsTab
                      formData={formData}
                      setFormData={setFormData}
                      handleSave={handleSave}
                      handleLogoUpload={handleLogoUpload}
                      enableWorkspaceTabs={enableWorkspaceTabs}
                      handleToggleWorkspaceTabs={handleToggleWorkspaceTabs}
                  />
              )}

              {activeTab === 'financial' && (
                  <FinancialSettingsTab
                      formData={formData}
                      setFormData={setFormData}
                      handleSave={handleSave}
                      warehouses={warehouses}
                      accounts={accounts}
                  />
              )}

              {activeTab === 'system' && (
                  <SystemMaintenanceTab
                      handleCloseYear={handleCloseYear}
                      supabase={supabase}
                      showToast={showToast}
                      currentUser={currentUser}
                      recalculateAllBalances={recalculateAllBalances}
                      refreshSaasSchema={refreshSaasSchema}
                      purgeDeletedRecords={purgeDeletedRecords}
                      handleRecalculateWac={handleRecalculateWac}
                      recalculatingWac={recalculatingWac}
                      handleCreateMissingAccounts={handleCreateMissingAccounts}
                      handleFixDatabaseSchema={handleFixDatabaseSchema}
                      handleCleanOrphanedOpeningEntries={handleCleanOrphanedOpeningEntries}
                      handleClearDemoData={handleClearDemoData}
                      handleExportList={handleExportList}
                      handleCreateCloudBackup={handleCreateCloudBackup}
                      exportData={exportData}
                      cloudBackups={cloudBackups}
                      handleRestoreCloudBackup={handleRestoreCloudBackup}
                      fileInputRef={fileInputRef}
                      handleImport={handleImport}
                      handleFactoryReset={handleFactoryReset}
                  />
              )}

              {activeTab === 'mapping' && (
                  <AccountMappingTab
                      formData={formData}
                      handleSave={handleSave}
                      handleAutoMapping={handleAutoMapping}
                      handleMappingChange={handleMappingChange}
                      accounts={accounts}
                  />
              )}

              {activeTab === 'terminals' && (
                  <TerminalsSettingsTab
                      handleAddTerminal={handleAddTerminal}
                      newTerminalData={newTerminalData}
                      setNewTerminalData={setNewTerminalData}
                      warehouses={warehouses}
                      accounts={accounts}
                      fetchTerminals={fetchTerminals}
                      isTerminalsLoading={isTerminalsLoading}
                      terminalsList={terminalsList}
                      handleDeleteTerminal={handleDeleteTerminal}
                  />
              )}

              {activeTab === 'eta' && (
                  <EtaIntegrationTab
                      formData={formData}
                      setFormData={setFormData}
                      handleSave={handleSave}
                      localSignerStatus={localSignerStatus}
                      checkingSigner={checkingSigner}
                      handleCheckLocalSigner={handleCheckLocalSigner}
                      testingEta={testingEta}
                      handleTestEta={handleTestEta}
                  />
              )}

              {activeTab === 'demo' && (
                  <DemoModeTab
                      handleResetDemoData={handleResetDemoData}
                      runRestaurantModuleTest={runRestaurantModuleTest}
                  />
              )}
          </div>
      </div>
    </div>
  );
};

export default Settings;
