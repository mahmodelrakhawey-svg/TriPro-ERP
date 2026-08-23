import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { BookOpen, Calendar, Filter, Loader2, Printer, CheckSquare, Edit, Trash2, Paperclip, Download, RefreshCw, AlertTriangle, User, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccounting } from '../../context/AccountingContext';
import { JournalEntry } from '../../types';
import { useToastNotification } from '../../utils/toastUtils';
import { usePagination } from '../../components/usePagination';
import * as XLSX from 'xlsx';

// دالة مساعدة لتحديد مصدر القيد بناءً على المرجع ونص البيان
const getEntrySource = (reference: string = '', description: string = '') => {
    if (!reference && !description) return { label: 'قيد يدوي', color: 'bg-slate-200 text-slate-600' };
    const ref = (reference || '').toUpperCase().trim();
    const desc = (description || '').trim();

    // 1. فواتير ومرتجعات وإشعارات المبيعات
    if (ref.startsWith('INV-')) return { label: 'فاتورة مبيعات', color: 'bg-blue-100 text-blue-700' };
    if (ref.startsWith('SR-') || ref.startsWith('SRET-')) return { label: 'مرتجع مبيعات', color: 'bg-blue-50 text-blue-600' };
    if (ref.startsWith('CN-') || desc.includes('إشعار دائن')) return { label: 'إشعار دائن', color: 'bg-cyan-100 text-cyan-800' };

    // 2. فواتير ومرتجعات وإشعارات المشتريات
    if (ref.startsWith('PUR-') || ref.startsWith('PINV-') || ref.startsWith('PI-')) return { label: 'فاتورة مشتريات', color: 'bg-purple-100 text-purple-700' };
    if (ref.startsWith('PR-') || ref.startsWith('PRET-')) return { label: 'مرتجع مشتريات', color: 'bg-purple-50 text-purple-600' };
    if (ref.startsWith('DN-') || desc.includes('إشعار مدين')) return { label: 'إشعار مدين', color: 'bg-rose-100 text-rose-800' };

    // 3. سندات القبض والصرف
    if (ref.startsWith('RCT-') || ref.startsWith('RV-')) return { label: 'سند قبض', color: 'bg-emerald-100 text-emerald-700' };
    if (ref.startsWith('PAY-') || ref.startsWith('PV-') || ref.startsWith('EXP-')) return { label: 'سند صرف', color: 'bg-orange-100 text-orange-700' };

    // 4. الشيكات والأوراق المالية
    if (ref.startsWith('CHQ-') || desc.includes('شيك وارد') || desc.includes('شيك صادر')) return { label: 'شيك', color: 'bg-indigo-50 text-indigo-600' };

    // 5. التحويلات النقدية والبنكية
    if (ref.startsWith('TRN-') || ref.startsWith('TRF-')) return { label: 'تحويل', color: 'bg-indigo-100 text-indigo-700' };

    // 6. تسويات بنكية
    if (ref.startsWith('BANK-ADJ-') || ref.startsWith('BNK-') || ref.startsWith('BADJ-')) {
        return { label: 'تسوية بنكية', color: 'bg-sky-100 text-sky-700' };
    }

    // 7. تسويات عجز وفروقات الصندوق
    if (ref.startsWith('CASH-ADJ-') || ref.startsWith('CSH-ADJ-') || ref.startsWith('CADJ-')) {
        return { label: 'تسوية فروقات صندوق', color: 'bg-amber-100 text-amber-800' };
    }

    // 8. تسويات بادئة ADJ عامة - يتم الفحص والتمييز الذكي بناءً على نص البيان
    if (ref.startsWith('ADJ-')) {
        if (desc.includes('صندوق') || desc.includes('خزينة') || desc.includes('إقفال يومي') || desc.includes('عجز') || desc.includes('زيادة في الصندوق') || desc.includes('فروقات صندوق')) {
            return { label: 'تسوية فروقات صندوق', color: 'bg-amber-100 text-amber-800' };
        }
        if (desc.includes('عمولات') || desc.includes('فوائد') || desc.includes('بنك') || desc.includes('مصروفات بنكية') || desc.includes('تسوية بنك')) {
            return { label: 'تسوية بنكية', color: 'bg-sky-100 text-sky-700' };
        }
        return { label: 'تسوية مخزنية', color: 'bg-red-100 text-red-700' };
    }
    if (ref.startsWith('STK-') || ref.startsWith('REV-') || desc.includes('تسوية مخزنية') || desc.includes('جرد مخزني')) {
        return { label: 'تسوية مخزنية', color: 'bg-red-100 text-red-700' };
    }

    // 9. الأصول الثابتة والإهلاك
    if (ref.startsWith('DEP-')) return { label: 'إهلاك/تأمين', color: 'bg-amber-100 text-amber-700' };
    if (ref.startsWith('ASSET-') || desc.includes('أصل ثابت')) return { label: 'أصل ثابت', color: 'bg-cyan-100 text-cyan-700' };

    // 10. الرواتب والإغلاقات والأنظمة الفرعية
    if (ref.startsWith('PAYROLL-') || desc.includes('رواتب')) return { label: 'رواتب', color: 'bg-pink-100 text-pink-700' };
    if (ref.startsWith('SHIFT-')) return { label: 'إغلاق وردية', color: 'bg-indigo-100 text-indigo-700' };
    if (ref.startsWith('PHARM-')) return { label: 'صرف صيدلية', color: 'bg-teal-100 text-teal-700' };
    if (ref.startsWith('HIMS-')) return { label: 'فاتورة طبية', color: 'bg-rose-100 text-rose-700' };
    if (ref.startsWith('CLOSE-')) return { label: 'إقفال سنة', color: 'bg-gray-800 text-white' };

    // 11. الأرصدة الافتتاحية
    if (ref.startsWith('OP-') || ref.startsWith('OB-') || ref.startsWith('OPENING-') || desc.includes('رصيد افتتاحي')) {
        return { label: 'رصيد افتتاحي', color: 'bg-slate-100 text-slate-700' };
    }
    if (ref.startsWith('MAN-')) {
        if (desc.includes('افتتاحي') || desc.includes('رصيد افتتاحي')) {
            return { label: 'رصيد افتتاحي', color: 'bg-slate-100 text-slate-700' };
        }
        return { label: 'قيد يدوي', color: 'bg-slate-200 text-slate-600' };
    }

    return { label: 'قيد يدوي', color: 'bg-slate-200 text-slate-600' };
};

const GeneralJournal = () => {
  const { refreshData, can, clearCache, exportJournalToCSV, users, currentUser, accounts, selectedFiscalYear, fiscalYearRange, settings } = useAccounting();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const toast = useToastNotification();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Advanced filters state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterAccountId, setFilterAccountId] = useState('');
  const [filterAmount, setFilterAmount] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [startDate, setStartDate] = useState(fiscalYearRange.startDate);
  const [endDate, setEndDate] = useState(fiscalYearRange.endDate);
  
  const [matchingEntryIds, setMatchingEntryIds] = useState<string[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  // مزامنة نطاق التواريخ تلقائياً عند تغيير السنة المالية المختارة من شريط النظام
  useEffect(() => {
    if (selectedFiscalYear) {
      setStartDate(`${selectedFiscalYear}-01-01`);
      setEndDate(`${selectedFiscalYear}-12-31`);
    }
  }, [selectedFiscalYear]);

  const supabaseUrl = 'https://pjvphxfschfllpawfewn.supabase.co';

  useEffect(() => {
    if (location.state?.initialSearch) {
        setSearchTerm(location.state.initialSearch);
    }
  }, [location.state]);

  // تأخير البحث
  useEffect(() => {
      const timer = setTimeout(() => {
          setDebouncedSearch(searchTerm);
      }, 500);
      return () => clearTimeout(timer);
  }, [searchTerm]);

  // البحث المتقدم في الحسابات والمبالغ والبيانات عبر الجداول المرتبطة
  useEffect(() => {
    const performSearch = async () => {
      // إذا لم يكن هناك كلمة بحث أو حساب أو مبلغ، فنعرض كل النتائج
      if (!debouncedSearch && !filterAccountId && !filterAmount) {
        setMatchingEntryIds(null);
        return;
      }

      setIsSearching(true);
      try {
        const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
        
        let matchingLinesQuery = supabase
          .from('journal_lines')
          .select('journal_entry_id')
          .eq('organization_id', orgId);

        const conditions: string[] = [];

        // 1. الفلترة حسب الحساب
        if (filterAccountId) {
          conditions.push(`account_id.eq.${filterAccountId}`);
        }

        // تنظيف نص البحث من الفواصل (مثل تحويل 22,800 إلى 22800)
        const cleanSearch = debouncedSearch.replace(/,/g, '').trim();

        // 2. الفلترة حسب المبلغ
        if (filterAmount) {
          const amtVal = parseFloat(filterAmount.replace(/,/g, ''));
          if (!isNaN(amtVal)) {
            conditions.push(`debit.eq.${amtVal}`, `credit.eq.${amtVal}`);
            // دعم البحث عن مبالغ تقريبية/عشرية (مثل البحث عن 799.62 للقيم 799.618)
            conditions.push(`debit.gte.${amtVal - 0.01}`, `debit.lte.${amtVal + 0.01}`);
            conditions.push(`credit.gte.${amtVal - 0.01}`, `credit.lte.${amtVal + 0.01}`);
          }
        }

        // 3. الفلترة حسب نص البحث
        if (cleanSearch) {
          // إذا كان البحث رقماً، نقارنه بالمبالغ مباشرة وبشكل تقريبي
          const numVal = parseFloat(cleanSearch);
          if (!isNaN(numVal)) {
            conditions.push(`debit.eq.${numVal}`, `credit.eq.${numVal}`);
            conditions.push(`debit.gte.${numVal - 0.01}`, `debit.lte.${numVal + 0.01}`);
            conditions.push(`credit.gte.${numVal - 0.01}`, `credit.lte.${numVal + 0.01}`);
          }

          // البحث في وصف السطر
          conditions.push(`description.ilike.%${cleanSearch}%`);

          // البحث في اسم أو كود الحساب
          const matchingAccounts = accounts.filter(acc => 
            acc.name.toLowerCase().includes(cleanSearch.toLowerCase()) || 
            acc.code.includes(cleanSearch)
          );

          // تجنب استخدام .in() مع فواصل تفادياً لمشاكل تفسير PostgREST للفاصلة كفاصل شروط
          matchingAccounts.forEach(acc => {
            conditions.push(`account_id.eq.${acc.id}`);
          });
        }

        if (conditions.length > 0) {
          matchingLinesQuery = matchingLinesQuery.or(conditions.join(','));
        }

        const { data: lines, error } = await matchingLinesQuery;
        if (error) throw error;

        // تجميع المعرفات الفريدة
        const ids = Array.from(new Set((lines || []).map(l => l.journal_entry_id)));

        // البحث أيضاً في الجدول الرئيسي للقيود (journal_entries) بمرجع القيد أو البيان
        if (cleanSearch) {
          const { data: entries, error: entriesError } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('organization_id', orgId)
            .or(`reference.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`);

          if (!entriesError && entries) {
            entries.forEach(e => ids.push(e.id));
          }
        }

        setMatchingEntryIds(Array.from(new Set(ids)));
      } catch (err) {
        console.error("Error performing search:", err);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearch, filterAccountId, filterAmount, accounts, currentUser]);

  // إعداد استعلام البيانات مع الفلترة
  const queryModifier = useCallback((query: any) => {
    // 1. تصفية حسب القيود المطابقة لبحث الحسابات والمبالغ والسطور
    if (matchingEntryIds !== null) {
        if (matchingEntryIds.length > 0) {
            query = query.in('id', matchingEntryIds);
        } else {
            query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
    }
    
    // 2. تصفية حسب المستخدم
    if (selectedUser) {
        query = query.eq('user_id', selectedUser);
    }

    // 3. تصفية حسب الحالة (مرحل / مسودة)
    if (filterStatus) {
        query = query.eq('status', filterStatus);
    }

    // 4. تصفية حسب مصدر القيد
    if (filterSource) {
        if (filterSource === 'sales_invoice') {
            query = query.like('reference', 'INV-%');
        } else if (filterSource === 'sales_return') {
            query = query.or('reference.like.SR-%,reference.like.SRET-%');
        } else if (filterSource === 'credit_note') {
            query = query.like('reference', 'CN-%');
        } else if (filterSource === 'purchase_invoice') {
            query = query.or('reference.like.PI-%,reference.like.PUR-%,reference.like.PINV-%');
        } else if (filterSource === 'purchase_return') {
            query = query.or('reference.like.PR-%,reference.like.PRET-%');
        } else if (filterSource === 'debit_note') {
            query = query.like('reference', 'DN-%');
        } else if (filterSource === 'receipt_voucher') {
            query = query.or('reference.like.RCT-%,reference.like.RV-%');
        } else if (filterSource === 'payment_voucher') {
            query = query.or('reference.like.PAY-%,reference.like.PV-%,reference.like.EXP-%');
        } else if (filterSource === 'cheque') {
            query = query.like('reference', 'CHQ-%');
        } else if (filterSource === 'asset_depreciation') {
            query = query.or('reference.like.DEP-%,reference.like.ASSET-%');
        } else if (filterSource === 'treasury_transfer') {
            query = query.or('reference.like.TRN-%,reference.like.TRF-%');
        } else if (filterSource === 'bank_adjustment') {
            query = query.or('reference.like.BANK-ADJ-%,reference.like.BNK-%,reference.like.BADJ-%');
        } else if (filterSource === 'cash_adjustment') {
            query = query.or('reference.like.CASH-ADJ-%,reference.like.CADJ-%,reference.like.CSH-%');
        } else if (filterSource === 'stock_adjustment') {
            query = query.or('reference.like.STK-ADJ-%,reference.like.ADJ-%,reference.like.REV-%');
        } else if (filterSource === 'payroll') {
            query = query.like('reference', 'PAYROLL-%');
        } else if (filterSource === 'shift_closing') {
            query = query.like('reference', 'SHIFT-%');
        } else if (filterSource === 'pharmacy') {
            query = query.like('reference', 'PHARM-%');
        } else if (filterSource === 'hims') {
            query = query.like('reference', 'HIMS-%');
        } else if (filterSource === 'opening_balance') {
            query = query.or('reference.like.OP-%,reference.like.OB-%,reference.like.OPENING-%');
        } else if (filterSource === 'manual_journal') {
            query = query
                .not('reference', 'like', 'INV-%')
                .not('reference', 'like', 'PUR-%')
                .not('reference', 'like', 'PINV-%')
                .not('reference', 'like', 'PI-%')
                .not('reference', 'like', 'RCT-%')
                .not('reference', 'like', 'RV-%')
                .not('reference', 'like', 'PAY-%')
                .not('reference', 'like', 'PV-%')
                .not('reference', 'like', 'EXP-%')
                .not('reference', 'like', 'DEP-%')
                .not('reference', 'like', 'TRN-%')
                .not('reference', 'like', 'TRF-%')
                .not('reference', 'like', 'ADJ-%')
                .not('reference', 'like', 'STK-%')
                .not('reference', 'like', 'REV-%')
                .not('reference', 'like', 'BANK-%')
                .not('reference', 'like', 'CASH-%')
                .not('reference', 'like', 'PAYROLL-%')
                .not('reference', 'like', 'CLOSE-%')
                .not('reference', 'like', 'SR-%')
                .not('reference', 'like', 'SRET-%')
                .not('reference', 'like', 'PR-%')
                .not('reference', 'like', 'PRET-%')
                .not('reference', 'like', 'DN-%')
                .not('reference', 'like', 'CN-%')
                .not('reference', 'like', 'OP-%')
                .not('reference', 'like', 'OB-%')
                .not('reference', 'like', 'ASSET-%')
                .not('reference', 'like', 'CHQ-%')
                .not('reference', 'like', 'SHIFT-%')
                .not('reference', 'like', 'PHARM-%')
                .not('reference', 'like', 'HIMS-%');
        }
    }

    // 5. تصفية حسب التواريخ
    if (startDate) {
        query = query.gte('transaction_date', startDate);
    }
    if (endDate) {
        query = query.lte('transaction_date', endDate);
    }

    return query;
  }, [matchingEntryIds, selectedUser, filterStatus, filterSource, startDate, endDate]);

  const { 
    data: serverEntries, 
    loading: serverLoading, 
    page, 
    setPage, 
    totalPages, 
    totalCount, 
    refresh 
  } = usePagination('journal_entries', {
    select: '*, journal_lines (*, accounts:account_id(id, code, name)), journal_attachments (*)',
    pageSize: 20,
    orderBy: 'transaction_date',
    ascending: false
  }, queryModifier);

  // إعادة تحميل الصفحة الأولى عند تغير الفلاتر
  useEffect(() => {
      setPage(1);
      refresh();
  }, [matchingEntryIds, selectedUser, filterStatus, filterSource, startDate, endDate, refresh]);

  // ترتيب الحسابات الفرعية
  const sortedAccounts = useMemo(() => {
    return [...accounts]
      .filter(a => !a.isGroup)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts]);

  // تنسيق البيانات وربط الحسابات
  const journalEntries = useMemo(() => {
      if (currentUser?.role === 'demo') {
          return [
            { id: 'demo-je-1', date: new Date().toISOString().split('T')[0], description: 'شراء أثاث مكتبي نقداً', reference: 'JE-DEMO-001', status: 'posted', is_posted: true, lines: [{ accountName: 'الأثاث والتجهيزات', accountCode: '1115', debit: 5000, credit: 0 }, { accountName: 'النقدية بالصندوق', accountCode: '10101', debit: 0, credit: 5000 }] },
            { id: 'demo-je-2', date: new Date().toISOString().split('T')[0], description: 'سداد فاتورة كهرباء', reference: 'JE-DEMO-002', status: 'posted', is_posted: true, lines: [{ accountName: 'كهرباء ومياه', accountCode: '50201', debit: 750, credit: 0 }, { accountName: 'النقدية بالصندوق', accountCode: '10101', debit: 0, credit: 750 }] }
          ] as any[];
      }

      return serverEntries.map((entry: any) => ({
          id: entry.id,
          date: entry.transaction_date || entry.created_at?.split('T')[0],
          description: entry.description,
          reference: entry.reference,
          status: entry.status,
          is_posted: entry.status === 'posted',
          created_at: entry.created_at,
          createdAt: entry.created_at,
          userId: entry.user_id,
          attachments: entry.journal_attachments || [],
          lines: (entry.journal_lines || []).map((line: any) => {
            const account = accounts.find((a: any) => a.id === line.account_id) || line.accounts;
            return {
              id: line.id,
              accountId: line.account_id,
              accountName: account?.name || `⚠️ حساب غير موجود (المعرف: ${line.account_id?.slice(0,8)}...)`,
              accountCode: account?.code || line.account_code || '????',
              debit: line.debit,
              credit: line.credit,
              description: line.description,
              costCenterId: line.cost_center_id
            };
          })
      }));
  }, [serverEntries, currentUser, accounts]);


  const loading = currentUser?.role === 'demo' ? false : serverLoading;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await clearCache(); // استخدام clearCache بدلاً من refreshData لضمان مسح الكاش
    refresh();
    setIsRefreshing(false);
  };

  const handlePostEntry = async (entryId: string) => {
    if (!window.confirm('هل أنت متأكد من ترحيل هذا القيد؟ لا يمكن التراجع عن هذه العملية بعد الترحيل.')) {
        return;
    }

    try {
      const { error } = await supabase
          .from('journal_entries')
          .update({ status: 'posted' })
          .eq('id', entryId);

      if (error) throw error;

      toast.success('تم ترحيل القيد بنجاح.');
      refreshData();
      refresh();
    } catch (err: any) {
      toast.error('فشل ترحيل القيد: ' + err.message);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا القيد؟ لا يمكن التراجع عن هذا الإجراء.')) {
        return;
    }
    try {
        const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
        
        // محاولة الحذف الآمن عبر دالة الـ RPC
        const { data, error: rpcError } = await supabase.rpc('delete_journal_entry_safe', {
          p_entry_id: entryId,
          p_org_id: orgId
        });

        if (rpcError) {
          // محاولة الحذف المباشر لأسطر القيد ثم رأس القيد
          await supabase.from('journal_lines').delete().eq('journal_entry_id', entryId);
          const { error } = await supabase.from('journal_entries').delete().eq('id', entryId);
          if (error) throw error;
        }

        toast.success('تم حذف القيد وتحديث الأرصدة بنجاح.');
        refreshData();
        refresh();
    } catch (err: any) {
        toast.error('فشل حذف القيد: ' + err.message);
    }
  };

  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);

  const handleCleanDuplicateChequeEntries = async () => {
    const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
    if (!orgId) return;

    if (!window.confirm('هل تريد فحص وتنظيف جميع قيود الشيكات المكررة والإبقاء على قيد واحد فقط لكل شيك؟\n\nسيتم تصحيح أرصدة البنوك وأوراق القبض/الدفع تلقائياً.')) {
      return;
    }

    setIsCleaningDuplicates(true);
    try {
      // 1. جلب جميع قيود الشيكات
      const { data: entries, error } = await supabase
        .from('journal_entries')
        .select('id, reference, description, created_at, transaction_date')
        .eq('organization_id', orgId)
        .like('reference', 'CHQ-%')
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!entries || entries.length === 0) {
        toast.info('لا توجد قيود شيكات لفحصها.');
        return;
      }

      // تجميع القيود حسب المرجع
      const groupedByRef = new Map<string, any[]>();
      for (const entry of entries) {
        const ref = entry.reference || '';
        if (!groupedByRef.has(ref)) {
          groupedByRef.set(ref, []);
        }
        groupedByRef.get(ref)!.push(entry);
      }

      const duplicateIdsToDelete: string[] = [];
      groupedByRef.forEach((list) => {
        if (list.length > 1) {
          // نترك أول قيد ونحذف باقي القيود المكررة
          for (let i = 1; i < list.length; i++) {
            duplicateIdsToDelete.push(list[i].id);
          }
        }
      });

      if (duplicateIdsToDelete.length === 0) {
        toast.success('سجل قيود الشيكات سليم ولا توجد أي قيود مكررة ✅');
        return;
      }

      // 2. حذف أسطر القيود المكررة ثم رؤوس القيود
      await supabase.from('journal_lines').delete().in('journal_entry_id', duplicateIdsToDelete);
      const { error: delErr } = await supabase.from('journal_entries').delete().in('id', duplicateIdsToDelete);
      if (delErr) throw delErr;

      // 3. إعادة احتساب أرصدة الحسابات وميزان المراجعة
      try {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: orgId });
      } catch (e) {
        console.error('Failed to recalculate balances', e);
      }

      await clearCache();
      await refreshData();
      refresh();
      toast.success(`تم بنجاح تنظيف ${duplicateIdsToDelete.length} قيد شيكات مكرر وإعادة ضبط الأرصدة ✅`);
    } catch (err: any) {
      console.error(err);
      toast.error('حدث خطأ أثناء تنظيف القيود المكررة: ' + err.message);
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      if (currentUser?.role === 'demo') {
        const flatData = journalEntries.flatMap((entry: any) => 
          (entry.lines || []).map((line: any) => ({
            'التاريخ': entry.date || '-',
            'رقم القيد': entry.reference || '-',
            'البيان الرئيسي': entry.description || '-',
            'الحالة': entry.status === 'posted' ? 'مرحل' : 'مسودة',
            'كود الحساب': line.accountCode || '-',
            'اسم الحساب': line.accountName || '-',
            'مدين': Number(line.debit) || 0,
            'دائن': Number(line.credit) || 0,
            'بيان الحركة': line.description || entry.description || '-'
          }))
        );

        if (flatData.length === 0) {
          toast.error('لا توجد بيانات لتصديرها.');
          return;
        }

        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "دفتر اليومية");
        XLSX.writeFile(wb, `General_Journal_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success('تم تصدير دفتر اليومية بنجاح ✅');
        return;
      }

      const orgId = (currentUser as any)?.organization_id || (currentUser as any)?.user_metadata?.org_id;
      let query = supabase
        .from('journal_entries')
        .select(`
          id,
          transaction_date,
          reference,
          description,
          status,
          user_id,
          created_at,
          journal_lines (
            id,
            account_id,
            debit,
            credit,
            description,
            cost_center_id
          )
        `)
        .order('transaction_date', { ascending: false });

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      // تطبيق الفلاتر الحالية نفسها
      query = queryModifier(query);

      const { data: entries, error } = await query;
      if (error) throw error;

      if (!entries || entries.length === 0) {
        toast.error('لا توجد بيانات مطابقة للفلاتر الحالية لتصديرها.');
        return;
      }

      const userMap = new Map((users || []).map((u: any) => [u.id, u.name]));
      const accountMap = new Map((accounts || []).map((a: any) => [a.id, a]));

      const flatData: any[] = [];
      entries.forEach((entry: any) => {
        const sourceInfo = getEntrySource(entry.reference, entry.description);
        const userName = userMap.get(entry.user_id) || 'النظام';
        const statusLabel = entry.status === 'posted' ? 'مرحل' : 'مسودة';
        const dateStr = entry.transaction_date || (entry.created_at ? entry.created_at.split('T')[0] : '-');

        const lines = entry.journal_lines || [];
        if (lines.length === 0) {
          flatData.push({
            'التاريخ': dateStr,
            'رقم القيد': entry.reference || '-',
            'مصدر القيد': sourceInfo.label,
            'البيان الرئيسي': entry.description || '-',
            'الحالة': statusLabel,
            'المستخدم': userName,
            'كود الحساب': '-',
            'اسم الحساب': '-',
            'مدين': 0,
            'دائن': 0,
            'بيان الحركة': '-'
          });
        } else {
          lines.forEach((line: any) => {
            const acc = accountMap.get(line.account_id);
            flatData.push({
              'التاريخ': dateStr,
              'رقم القيد': entry.reference || '-',
              'مصدر القيد': sourceInfo.label,
              'البيان الرئيسي': entry.description || '-',
              'الحالة': statusLabel,
              'المستخدم': userName,
              'كود الحساب': acc?.code || line.account_code || '-',
              'اسم الحساب': acc?.name || 'غير معروف',
              'مدين': Number(line.debit) || 0,
              'دائن': Number(line.credit) || 0,
              'بيان الحركة': line.description || entry.description || '-'
            });
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(flatData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "دفتر اليومية");

      const fileDate = startDate && endDate ? `${startDate}_to_${endDate}` : new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `General_Journal_${fileDate}.xlsx`);
      toast.success(`تم تصدير ${entries.length} قيد محاسبي إلى ملف Excel بنجاح ✅`);
    } catch (err: any) {
      console.error('Error exporting journal entries:', err);
      toast.error('حدث خطأ أثناء تصدير البيانات: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = (entry: JournalEntry) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const dateStr = entry.date || entry.transaction_date || entry.created_at;
      const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('ar-EG') : 'تاريخ غير متوفر';

      printWindow.document.write(`
        <html dir="rtl">
          <head>
            <title>سند قيد رقم ${entry.reference || entry.id.slice(0, 8)}</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
              .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
              .meta { display: flex; justify-content: space-between; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
              th { background-color: #f8f9fa; }
              .footer { margin-top: 50px; display: flex; justify-content: space-between; }
              .signature { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 10px; }
              @media print { .no-print { display: none; } }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">سند قيد يومية</div>
              <div>رقم القيد: ${entry.reference || entry.id.slice(0, 8)}</div>
            </div>
            
            <div class="meta">
              <div><strong>التاريخ:</strong> ${formattedDate}</div>
              <div><strong>الحالة:</strong> ${entry.status === 'posted' ? 'مرحّل' : 'مسودة'}</div>
            </div>
            
            <div style="margin-bottom: 20px;"><strong>البيان:</strong> ${entry.description}</div>

            <table>
              <thead>
                <tr>
                  <th>اسم الحساب</th>
                  <th>رقم الحساب</th>
                  <th>مدين</th>
                  <th>دائن</th>
                </tr>
              </thead>
              <tbody>
                ${(entry.lines || []).map(line => `
                  <tr>
                    <td>${line.accountName || '-'}</td>
                    <td>${line.accountCode || '-'}</td>
                    <td>${line.debit > 0 ? line.debit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                    <td>${line.credit > 0 ? line.credit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                  </tr>
                `).join('')}
                <tr style="font-weight: bold; background-color: #f8f9fa;">
                    <td colspan="2" style="text-align: left;">الإجمالي</td>
                    <td>${(entry.lines || []).reduce((sum, line) => sum + (line.debit || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td>${(entry.lines || []).reduce((sum, line) => sum + (line.credit || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                </tr>
              </tbody>
            </table>

            <div class="footer">
              <div class="signature">المحاسب</div>
              <div class="signature">المدير المالي</div>
              <div class="signature">المعتمد</div>
            </div>

            <script>
              window.onload = function() { window.print(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleEditEntry = (entry: JournalEntry) => {
    const source = getEntrySource(entry.reference || '', entry.description || '');
    if (source.label !== 'قيد يدوي') {
        toast.error('لا يمكن تعديل القيود التي تم إنشاؤها آلياً. يرجى تعديل المستند الأصلي (مثل الفاتورة أو السند).');
        return;
    }
    navigate('/journal', { state: { entryToEdit: entry } });
  };

  const handleViewEntry = (entryId: string) => {
    const entryIds = journalEntries.map(e => e.id);
    navigate(`/journal-entry/${entryId}`, { state: { ids: entryIds, page, searchTerm, selectedUser } });
  };


  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BookOpen className="text-blue-600" />
          دفتر اليومية العام
        </h1>
        <div className="flex gap-2">
            <div className="relative">
                <select
                    value={selectedUser}
                    onChange={(e) => { setSelectedUser(e.target.value); setPage(1); }}
                    className="pl-8 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm appearance-none bg-white transition-all h-full"
                    dir="rtl"
                >
                    <option value="">كل المستخدمين</option>
                    {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
                <div className="absolute left-2 top-2.5 text-slate-400 pointer-events-none">
                    <User size={16} />
                </div>
            </div>
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="بحث برقم القيد، المبلغ، أو البيان..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm w-64 transition-all"
                />
                <Filter className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>
            <button 
                onClick={handleCleanDuplicateChequeEntries}
                disabled={isCleaningDuplicates}
                className="flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-800 px-3.5 py-2 rounded-lg hover:bg-amber-100 disabled:opacity-60 font-bold text-sm shadow-sm transition-all"
                title="فحص وتنظيف قيود الشيكات المكررة والإبقاء على قيد واحد فقط لكل شيك"
            >
                {isCleaningDuplicates ? <Loader2 size={16} className="animate-spin text-amber-600" /> : <AlertTriangle size={16} className="text-amber-600" />}
                <span>تنظيف مكررات الشيكات</span>
            </button>
            <button 
                onClick={() => setShowAdvanced(!showAdvanced)} 
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all border ${showAdvanced ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
                <Filter size={16} />
                {showAdvanced ? 'إخفاء الفلاتر' : 'فلاتر متقدمة'}
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-bold text-sm">
                <Printer size={16} /> طباعة
            </button>
            <button 
                onClick={handleExportExcel} 
                disabled={isExporting}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-60 font-bold text-sm shadow-sm transition-all"
                title="تصدير جميع القيود المحاسبية المطابقة للفلاتر إلى ملف Excel"
            >
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {isExporting ? 'جاري التصدير...' : 'تصدير Excel'}
            </button>
            <button 
                onClick={handleRefresh} 
                className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50 font-bold text-sm transition-colors"
                title="تحديث البيانات من الخادم"
            >
                <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
            </button>
        </div>
      </div>

      {showAdvanced && (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-2 duration-200" dir="rtl">
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">الحساب المتأثر</label>
                <select
                    value={filterAccountId}
                    onChange={(e) => setFilterAccountId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
                >
                    <option value="">كل الحسابات</option>
                    {sortedAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                </select>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">المبلغ المالي</label>
                <input
                    type="number"
                    step="any"
                    placeholder="مبلغ مدين أو دائن..."
                    value={filterAmount}
                    onChange={(e) => setFilterAmount(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 text-right"
                    dir="ltr"
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">مصدر القيد</label>
                <select
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
                >
                    <option value="">كل المصادر</option>
                    <option value="manual_journal">قيد يدوي (JE/MAN)</option>
                    <option value="sales_invoice">فاتورة مبيعات (INV)</option>
                    <option value="sales_return">مرتجع مبيعات (SR)</option>
                    <option value="credit_note">إشعار دائن (CN)</option>
                    <option value="purchase_invoice">فاتورة مشتريات (PI/PUR)</option>
                    <option value="purchase_return">مرتجع مشتريات (PR)</option>
                    <option value="debit_note">إشعار مدين (DN)</option>
                    <option value="receipt_voucher">سند قبض (RCT/RV)</option>
                    <option value="payment_voucher">سند صرف (PAY/PV/EXP)</option>
                    <option value="cheque">شيكات (CHQ)</option>
                    <option value="treasury_transfer">تحويل خزينة/أموال (TRN)</option>
                    <option value="bank_adjustment">تسوية بنكية (BANK-ADJ)</option>
                    <option value="cash_adjustment">تسوية فروقات صندوق (CASH-ADJ)</option>
                    <option value="stock_adjustment">تسوية مخزنية (STK-ADJ/ADJ)</option>
                    <option value="asset_depreciation">أصول وإهلاك (DEP/ASSET)</option>
                    <option value="payroll">رواتب (PAYROLL)</option>
                    <option value="shift_closing">إغلاق وردية (SHIFT)</option>
                    <option value="pharmacy">صرف صيدلية (PHARM)</option>
                    <option value="hims">فاتورة طبية (HIMS)</option>
                    <option value="opening_balance">رصيد افتتاحي (OP/OB)</option>
                </select>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">حالة القيد</label>
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 bg-white"
                >
                    <option value="">كل الحالات</option>
                    <option value="posted">مرحّل</option>
                    <option value="draft">مسودة</option>
                </select>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
            </div>
            <div className="flex items-end md:col-span-2">
                <button
                    onClick={() => {
                        setFilterAccountId('');
                        setFilterAmount('');
                        setFilterStatus('');
                        setFilterSource('');
                        setStartDate('');
                        setEndDate('');
                        setSearchTerm('');
                    }}
                    className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-300 font-bold text-xs transition-colors"
                >
                    إعادة تعيين الفلاتر
                </button>
            </div>
        </div>
      )}

      {/* 📅 شريط السنة المالية المحددة */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/70 border border-blue-200/80 px-4 py-2.5 rounded-2xl mb-4 text-xs font-bold text-slate-700 shadow-sm animate-in fade-in">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-blue-600 shrink-0" />
          <span>عرض قيود السنة المالية:</span>
          <span className="bg-white px-2.5 py-0.5 rounded-lg border border-blue-200 text-blue-800 font-mono font-black text-sm shadow-xs">
            {selectedFiscalYear}
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${settings?.lastClosedYear && selectedFiscalYear <= settings.lastClosedYear ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
            {settings?.lastClosedYear && selectedFiscalYear <= settings.lastClosedYear ? 'سنة مغلقة 🔒' : 'سنة نشطة 🟢'}
          </span>
          {startDate && endDate && (
            <span className="text-slate-500 font-medium hidden md:inline">
              (الفترة: {startDate} إلى {endDate})
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {(startDate !== '' || endDate !== '') ? (
            <button 
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="text-blue-700 hover:text-blue-900 bg-white/80 hover:bg-white px-3 py-1 rounded-lg border border-blue-200 transition-colors text-xs"
            >
              عرض كل السنوات (إلغاء حصر السنة)
            </button>
          ) : (
            <button 
              onClick={() => { setStartDate(`${selectedFiscalYear}-01-01`); setEndDate(`${selectedFiscalYear}-12-31`); }}
              className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs hover:bg-blue-700 font-bold transition-colors"
            >
              إعادة حصر سنة {selectedFiscalYear} فقط
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {loading || isSearching ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
        ) : journalEntries.length === 0 ? (
            <div className="text-center py-10 text-slate-500">لا توجد قيود مطابقة للبحث.</div>
        ) : (
            journalEntries.map((entry) => {
              const dateStr = entry.date || entry.transaction_date || entry.created_at;
              let formattedDate = 'تاريخ غير صالح';
              if (dateStr) {
                  const d = new Date(dateStr);
                  if (!isNaN(d.getTime())) {
                      formattedDate = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
                  }
              }
              const totalDebit = (entry.lines || []).reduce((sum, line) => sum + (line.debit || 0), 0);
              const totalCredit = (entry.lines || []).reduce((sum, line) => sum + (line.credit || 0), 0);
              const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
              const source = getEntrySource(entry.reference || '', entry.description || '');

              return (
            <div key={entry.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 p-3 flex justify-between items-center text-sm gap-4">
                <div className="flex-1">
                    <div className="font-bold text-slate-700 flex items-center gap-2">
                        <span>قيد رقم: <span className="font-mono">{entry.reference || entry.id.slice(0, 8)}</span></span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${source.color}`}>{source.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 mt-1">
                    <Calendar size={14} />
                    <span>{formattedDate}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {entry.status === 'posted' ? (
                        <span className="flex items-center gap-1.5 font-bold text-emerald-600 bg-emerald-100 px-3 py-1.5 rounded-full text-xs">
                            <CheckSquare size={14} /> مرحّل
                        </span>
                    ) : (
                        <span className="flex items-center gap-1.5 font-bold text-amber-600 bg-amber-100 px-3 py-1.5 rounded-full text-xs">
                            مسودة
                        </span>
                    )}
                    {!isBalanced && (
                        <span className="flex items-center gap-1.5 font-bold text-red-600 bg-red-100 px-3 py-1.5 rounded-full text-xs" title={`غير متوازن! الفرق: ${(totalDebit - totalCredit).toFixed(2)}`}>
                            <AlertTriangle size={14} /> غير متوازن
                        </span>
                    )}
                    
                    {/* زر الترحيل يظهر فقط للمدراء وللقيود غير المرحلة */}
                    {can('journals', 'post') && entry.status !== 'posted' && (
                        <button 
                            onClick={() => handlePostEntry(entry.id)} 
                            className="bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-600 transition-colors shadow-sm"
                        >
                            ترحيل
                        </button>
                    )}
                    <button onClick={() => handleViewEntry(entry.id)} className="p-2 text-slate-400 hover:text-green-600 rounded-full hover:bg-slate-100 transition-colors" title="عرض التفاصيل">
                        <Eye size={16} />
                    </button>
                    <button onClick={() => handlePrint(entry)} className="p-2 text-slate-400 hover:text-blue-600 rounded-full hover:bg-slate-100 transition-colors" title="طباعة السند">
                        <Printer size={16} />
                    </button>
                    {source.label === 'قيد يدوي' ? (
                        <button onClick={() => handleEditEntry(entry)} className="p-2 text-slate-400 hover:text-amber-600 rounded-full hover:bg-slate-100 transition-colors" title="تعديل القيد">
                            <Edit size={16} />
                        </button>
                    ) : (
                        <span className="p-2 text-slate-300 cursor-not-allowed" title="لا يمكن تعديل القيود الآلية">
                            <Edit size={16} />
                        </span>
                    )}
                    <button onClick={() => handleDeleteEntry(entry.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-full hover:bg-slate-100 transition-colors" title="حذف القيد">
                        <Trash2 size={16} />
                    </button>
                </div>
                </div>
                <div className="p-3 text-sm text-slate-600 border-b border-slate-100">
                    <span className="font-bold">البيان:</span> {entry.description}
                </div>
                <div className="p-3 text-sm font-bold text-slate-800 border-b border-slate-100 bg-slate-50/50">قيمة القيد: {totalDebit.toLocaleString()}</div>
                {(entry.lines || []).length === 0 ? (
                    <div className="p-4 text-center text-red-500 bg-red-50 text-sm font-bold border-b border-slate-100">
                        ⚠️ تنبيه: هذا القيد لا يحتوي على تفاصيل (أسطر). قد يكون ناتجاً عن خطأ سابق في الحفظ أو بيانات تالفة.
                    </div>
                ) : (
                <table className="w-full text-sm text-right">
                <thead className="bg-slate-100 text-slate-500">
                    <tr>
                    <th className="p-2">الحساب</th>
                    <th className="p-2 text-center">مدين</th>
                    <th className="p-2 text-center">دائن</th>
                    </tr>
                </thead>
                <tbody>
                    {(entry.lines || []).map((line, index) => (
                    <tr key={index} className="border-t border-slate-100">
                        <td className="p-2 font-medium text-slate-800">{line.accountName || 'حساب غير معروف'} <span className="text-xs text-slate-400">({line.accountCode})</span></td>
                        <td className="p-2 text-center font-mono text-emerald-600">{line.debit > 0 ? line.debit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                        <td className="p-2 text-center font-mono text-red-600">{line.credit > 0 ? line.credit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                    </tr>
                    ))}
                </tbody>
                </table>
                )}

                {/* Attachments Section */}
                {entry.journal_attachments && entry.journal_attachments.length > 0 && (
                  <div className="p-3 bg-slate-50 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                      <Paperclip size={14} />
                      المرفقات ({entry.journal_attachments.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {entry.journal_attachments.map((att: any) => (
                        <a
                          key={att.id}
                          href={`${supabaseUrl}/storage/v1/object/public/documents/${att.file_path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded text-xs text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                        >
                          <Download size={12} />
                          <span className="truncate max-w-[200px]">{att.file_name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
            </div>
            )})
        )}

        {/* Pagination Controls */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between rounded-lg mt-4">
            <div className="text-xs font-bold text-slate-500">
                عرض {journalEntries.length} من أصل {totalCount} قيد
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading} className="p-2 rounded-lg hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent transition-colors">
                    <ChevronRight size={20} />
                </button>
                <span className="text-sm font-black text-slate-700">صفحة {page} من {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading} className="p-2 rounded-lg hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent transition-colors">
                    <ChevronLeft size={20} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralJournal;
