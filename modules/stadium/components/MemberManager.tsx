import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/supabaseClient';
import { useAccounting } from '@/context/AccountingContext';
import toast from 'react-hot-toast';
import {
  Users,
  UserPlus,
  RefreshCw,
  Eye,
  Calendar,
  Phone,
  CreditCard,
  Search,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Clock,
  Printer,
  Share2,
  QrCode,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import * as XLSX from 'xlsx';
import {
  StadiumMember,
  StadiumSubscription,
  MEMBERSHIP_CATEGORY_LABELS,
} from '../stadium.types';
import {
  getMemberStatusColor,
  uploadStadiumImage,
  calcSubscriptionEndDate,
  createSubscriptionJournalEntry,
  getTreasuryAccounts,
  TreasuryAccountOption,
  generateWhatsAppRenewalUrl,
} from '../stadiumHelpers';
import { MemberCardModal } from './MemberCardModal';
import { ReceiptModal, ReceiptData } from './ReceiptModal';


const BATCH_SIZE = 500;


export const MemberManager: React.FC = () => {
  const { currentUser } = useAccounting();
  const orgId = (currentUser as any)?.organization_id;

  const [members, setMembers] = useState<StadiumMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMembersCount, setTotalMembersCount] = useState(0);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StadiumMember | null>(null);

  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [renewingMember, setRenewingMember] = useState<StadiumMember | null>(null);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccountOption[]>([]);

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [memberHistory, setMemberHistory] = useState<StadiumSubscription[]>([]);

  // Smart ID Card & Receipt Modals
  const [selectedCardMember, setSelectedCardMember] = useState<StadiumMember | null>(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [receiptModalData, setReceiptModalData] = useState<ReceiptData | null>(null);

  // Bulk Import State

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importedSuccessCount, setImportedSuccessCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset } = useForm();
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const { register: registerRenew, handleSubmit: handleSubmitRenew, reset: resetRenew } = useForm();

  const fetchMembers = async () => {
    if (!orgId) return;
    setLoading(true);

    let query = supabase
      .from('stadium_members')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .range((page - 1) * 25, page * 25 - 1)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,national_id.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, count, error } = await query;
    if (error) {
      toast.error('حدث خطأ أثناء جلب الأعضاء');
    } else {
      setMembers(data || []);
      setTotalMembersCount(count || 0);
      setTotalPages(Math.ceil((count || 0) / 25));
    }
    setLoading(false);
  };

  /**
   * تحديث تلقائي لحالة الأعضاء المنتهية العضوية:
   * يبحث عن جميع الأعضاء النشطين الذين انتهت عضويتهم ويحدّث حالتهم إلى 'expired'.
   * يُشغَّل مرة واحدة عند تحميل الصفحة.
   */
  const autoExpireMembers = async () => {
    if (!orgId) return;
    const today = new Date().toISOString().split('T')[0];
    try {
      const { data: expired, error } = await supabase
        .from('stadium_members')
        .select('id, full_name, end_date')
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .lt('end_date', today);

      if (error || !expired || expired.length === 0) return;

      const ids = expired.map((m: any) => m.id);
      const { error: updateErr } = await supabase
        .from('stadium_members')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .in('id', ids);

      if (!updateErr && expired.length > 0) {
        toast(`تم تحديث ${expired.length} عضوية منتهية تلقائياً`, { icon: '🔄' });
        fetchMembers();
      }
    } catch (e) {
      console.error('autoExpireMembers error:', e);
    }
  };

  useEffect(() => {
    if (orgId) {
      getTreasuryAccounts(orgId).then(setTreasuryAccounts);
      autoExpireMembers(); // تشغيل التحديث التلقائي عند فتح صفحة الأعضاء
    }
  }, [orgId]);

  useEffect(() => {
    fetchMembers();
  }, [page, orgId, search, statusFilter]);

  const onSaveMember = async (data: any) => {
    if (!orgId) return;
    let photo_url = editingMember?.photo_url;
    if (photoFile) {
      photo_url = await uploadStadiumImage(photoFile, 'members');
    }

    const memberData = {
      organization_id: orgId,
      full_name: data.full_name?.trim(),
      national_id: data.national_id?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      dob: data.dob ? data.dob : null,
      gender: data.gender || 'male',
      membership_type: data.membership_type || 'individual',
      notes: data.notes?.trim() || null,
      photo_url: photo_url || null,
    };

    if (editingMember) {
      const { error } = await supabase
        .from('stadium_members')
        .update(memberData)
        .eq('id', editingMember.id);
      if (error) {
        toast.error('حدث خطأ أثناء تحديث العضو');
      } else {
        toast.success('تم تحديث العضو بنجاح');
        setIsAddModalOpen(false);
        fetchMembers();
      }
    } else {
      const { error } = await supabase
        .from('stadium_members')
        .insert([{ ...memberData, status: 'active' }]);
      if (error) {
        toast.error('حدث خطأ أثناء إضافة العضو');
      } else {
        toast.success('تمت إضافة العضو بنجاح');
        setIsAddModalOpen(false);
        fetchMembers();
      }
    }
  };

  const onRenewSubscription = async (data: any) => {
    if (!orgId || !renewingMember) return;
    const today = new Date().toISOString().split('T')[0];
    const endDate = calcSubscriptionEndDate(today, data.duration);
    const amount = parseFloat(data.amount_paid) || 0;

    if (data.payment_method === 'cheque') {
      if (!data.cheque_number?.trim()) {
        toast.error('يرجى إدخال رقم الشيك');
        return;
      }
      if (!data.bank_name?.trim()) {
        toast.error('يرجى إدخال اسم البنك المسحوب عليه');
        return;
      }
    }

    const chequeDetails = data.payment_method === 'cheque' ? {
      cheque_number: data.cheque_number?.trim() || '',
      bank_name: data.bank_name?.trim() || '',
      due_date: data.due_date || today,
      party_name: renewingMember.full_name,
      notes: `اشتراك عضو — ${renewingMember.full_name}`,
    } : undefined;

    // 1. إنشاء القيد المحاسبي
    const jeResult = await createSubscriptionJournalEntry(
      orgId,
      amount,
      `تجديد اشتراك: ${renewingMember.full_name}`,
      today,
      data.treasury_account_id,
      data.payment_method || 'cash',
      chequeDetails
    );


    // 2. تسجيل الاشتراك
    const { error: subError } = await supabase.from('stadium_subscriptions').insert([{
      organization_id: orgId,
      member_id: renewingMember.id,
      duration: data.duration,
      start_date: today,
      end_date: endDate,
      amount_paid: amount,
      payment_method: data.payment_method || 'cash',
      status: 'active',
      journal_entry_id: jeResult.success ? jeResult.journalEntryId : null,
    }]);

    if (subError) {
      toast.error('حدث خطأ أثناء تسجيل الاشتراك');
      return;
    }

    // 3. تحديث بيانات العضو
    await supabase.from('stadium_members').update({
      status: 'active',
      end_date: endDate,
    }).eq('id', renewingMember.id);

    toast.success(
      data.payment_method === 'cheque'
        ? 'تم تجديد الاشتراك وقيد الشيك الوارد بنجاح 📜'
        : 'تم تجديد الاشتراك بنجاح'
    );
    setIsRenewModalOpen(false);
    fetchMembers();

    // Open receipt modal immediately
    setReceiptModalData({
      receiptNumber: `SUB-${Math.floor(100000 + Math.random() * 900000)}`,
      receiptDate: today,
      receiptTypeLabel: 'إيصال سداد اشتراك عضوية سنوية',
      partyName: renewingMember.full_name,
      partyId: renewingMember.national_id || undefined,
      partyPhone: renewingMember.phone || undefined,
      amount: amount,
      paymentMethod: data.payment_method || 'cash',
      facilityOrProgramName: `عضوية: ${MEMBERSHIP_CATEGORY_LABELS[renewingMember.membership_type] || renewingMember.membership_type}`,
      periodOrDuration: `ساري حتى: ${endDate}`,
      chequeNumber: data.cheque_number,
      bankName: data.bank_name,
      notes: `تجديد اشتراك ${renewingMember.full_name}`,
    });
  };


  const openEdit = (member: StadiumMember) => {
    setEditingMember(member);
    setPhotoFile(null);
    reset({
      full_name: member.full_name,
      national_id: member.national_id,
      phone: member.phone,
      email: member.email,
      dob: member.dob,
      gender: member.gender,
      membership_type: member.membership_type,
      notes: member.notes,
    });
    setIsAddModalOpen(true);
  };

  const openRenew = (member: StadiumMember) => {
    setRenewingMember(member);
    resetRenew({
      duration: 'annual',
      amount_paid: '500',
      payment_method: 'cash',
      treasury_account_id: treasuryAccounts[0]?.id || '',
    });
    setIsRenewModalOpen(true);
  };

  const openHistory = async (member: StadiumMember) => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('stadium_subscriptions')
      .select('*')
      .eq('organization_id', orgId)
      .eq('member_id', member.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('حدث خطأ أثناء جلب سجل الاشتراكات');
    } else {
      setMemberHistory(data || []);
      setIsHistoryModalOpen(true);
    }
  };

  // ─────────────────────────────────────────────
  // 📥 Bulk Import / Export Logic (Excel & CSV)
  // ─────────────────────────────────────────────

  const downloadTemplate = () => {
    const sampleData = [
      {
        'الاسم الكامل *': 'أحمد محمود السيد',
        'الرقم القومي': '29508151200114',
        'رقم الهاتف': '01012345678',
        'البريد الإلكتروني': 'ahmed@example.com',
        'تاريخ الميلاد': '1995-08-15',
        'النوع': 'ذكر',
        'نوع العضوية': 'عضوية عاملة',
        'تاريخ بداية الاشتراك': '2026-01-01',
        'تاريخ نهاية الاشتراك': '2026-12-31',
        'الحالة': 'نشط',
        'ملاحظات': 'عضو عامل مسدد للاشتراك السنوي',
      },
      {
        'الاسم الكامل *': 'سارة محمد علي',
        'الرقم القومي': '29804201200228',
        'رقم الهاتف': '01123456789',
        'البريد الإلكتروني': 'sara@example.com',
        'تاريخ الميلاد': '1998-04-20',
        'النوع': 'أنثى',
        'نوع العضوية': 'عضوية رياضية',
        'تاريخ بداية الاشتراك': '2026-06-01',
        'تاريخ نهاية الاشتراك': '2027-05-31',
        'الحالة': 'نشط',
        'ملاحظات': 'لاعبة فريق السباحة بالاستاد',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'نموذج الأعضاء');
    XLSX.writeFile(workbook, 'نموذج_استيراد_أعضاء_الاستاد.xlsx');
  };

  // دالة لتنظيف وضبط وتصحيح التواريخ تلقائياً وحمايتها من أخطاء التاريخ الخارج عن النطاق
  const sanitizeDate = (raw: any): string | null => {
    if (raw === null || raw === undefined || raw === '') return null;

    // 1. إذا كان التاريخ رقم سيريال من إكسيل (Excel serial date number)
    if (typeof raw === 'number' && !isNaN(raw)) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + raw * 86400000);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    }

    // 2. إذا كان كائن Date حقيقي
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      return raw.toISOString().split('T')[0];
    }

    const str = String(raw).trim();
    if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined' || str === '-') return null;

    // 3. فحص صيغة YYYY-MM-DD أو YYYY/MM/DD
    const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdMatch) {
      let year = parseInt(ymdMatch[1], 10);
      let month = parseInt(ymdMatch[2], 10);
      let day = parseInt(ymdMatch[3], 10);

      if (month < 1) month = 1;
      if (month > 12) month = 12;

      // حساب أقصى عدد أيام في هذا الشهر لتجنب 32 أو 30 فبراير
      const maxDays = new Date(year, month, 0).getDate();
      if (day > maxDays) day = maxDays;
      if (day < 1) day = 1;

      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }

    // 4. فحص صيغة DD-MM-YYYY أو DD/MM/YYYY
    const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      let day = parseInt(dmyMatch[1], 10);
      let month = parseInt(dmyMatch[2], 10);
      let year = parseInt(dmyMatch[3], 10);

      if (month > 12 && day <= 12) {
        const tmp = month;
        month = day;
        day = tmp;
      }

      if (month < 1) month = 1;
      if (month > 12) month = 12;

      const maxDays = new Date(year, month, 0).getDate();
      if (day > maxDays) day = maxDays;
      if (day < 1) day = 1;

      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }

    // 5. محاولة عامة مع ضبط الحدود
    try {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    } catch {}

    return null;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          toast.error('الملف فارغ أو لا يحتوي على بيانات صالحة');
          setParsedRows([]);
          return;
        }

        // Map parsed rows with strict schema validation
        const normalized = data.map((row: any) => {
          const name = row['الاسم الكامل *'] || row['الاسم الكامل'] || row['الاسم'] || row['full_name'] || row['Name'] || '';
          const natId = String(row['الرقم القومي'] || row['national_id'] || row['National ID'] || '').trim();
          const phone = String(row['رقم الهاتف'] || row['الهاتف'] || row['phone'] || row['Phone'] || '').trim();
          const email = String(row['البريد الإلكتروني'] || row['email'] || '').trim();
          const dob = sanitizeDate(row['تاريخ الميلاد'] || row['dob'] || row['DOB']);
          
          const genderRaw = String(row['النوع'] || row['gender'] || '').trim();
          const gender = (genderRaw === 'أنثى' || genderRaw === 'انثى' || genderRaw === 'female') ? 'female' : 'male';
          
          const typeRaw = String(row['نوع العضوية'] || row['membership_type'] || '').trim();
          let membership_type: 'individual' | 'family' | 'student' | 'exempt' = 'individual';
          if (typeRaw.includes('عائل') || typeRaw.includes('family') || typeRaw.includes('تابع')) {
            membership_type = 'family';
          } else if (typeRaw.includes('طالب') || typeRaw.includes('student') || typeRaw.includes('رياض')) {
            membership_type = 'student';
          } else if (typeRaw.includes('معفى') || typeRaw.includes('معفي') || typeRaw.includes('شرف') || typeRaw.includes('exempt')) {
            membership_type = 'exempt';
          } else {
            membership_type = 'individual';
          }

          const startDate = sanitizeDate(row['تاريخ بداية الاشتراك'] || row['start_date'] || row['Start Date']);
          const endDate = sanitizeDate(row['تاريخ نهاية الاشتراك'] || row['end_date'] || row['End Date']);
          
          const statusRaw = String(row['الحالة'] || row['status'] || 'active').trim();
          let status: 'active' | 'expired' | 'suspended' | 'cancelled' = 'active';
          if (statusRaw.includes('منته') || statusRaw.includes('expired')) {
            status = 'expired';
          } else if (statusRaw.includes('موقوف') || statusRaw.includes('suspended')) {
            status = 'suspended';
          } else if (statusRaw.includes('ملغ') || statusRaw.includes('cancelled')) {
            status = 'cancelled';
          } else {
            status = 'active';
          }

          const notes = row['ملاحظات'] || row['notes'] || null;

          return {
            full_name: name ? String(name).trim() : '',
            national_id: natId || null,
            phone: phone || null,
            email: email || null,
            dob: dob || null,
            gender,
            membership_type,
            start_date: startDate || null,
            end_date: endDate || null,
            status,
            notes: notes || null,
          };
        }).filter(r => r.full_name.length > 0);

        setParsedRows(normalized);
        toast.success(`تمت قراءة ${normalized.length} عضو بنجاح وتجهيز التواريخ للاستيراد`);
      } catch (err: any) {
        console.error('Error parsing Excel:', err);
        toast.error('حدث خطأ أثناء قراءة ملف الإكسيل');
      }
    };
    reader.readAsBinaryString(file);
  };

  const processBulkImport = async () => {
    if (!orgId || parsedRows.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportedSuccessCount(0);

    let successCount = 0;
    const total = parsedRows.length;

    try {
      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = parsedRows.slice(i, i + BATCH_SIZE).map(item => ({
          organization_id: orgId,
          full_name: item.full_name,
          national_id: item.national_id,
          phone: item.phone,
          email: item.email,
          dob: item.dob,
          gender: item.gender,
          membership_type: item.membership_type,
          start_date: item.start_date,
          end_date: item.end_date,
          status: item.status,
          notes: item.notes,
        }));

        const { error } = await supabase.from('stadium_members').insert(batch);
        if (error) {
          console.warn('Batch insert had error, inserting row by row fallback:', error);
          // Fallback: insert row by row in this batch so good rows pass
          for (const singleItem of batch) {
            const { error: singleError } = await supabase.from('stadium_members').insert([singleItem]);
            if (!singleError) {
              successCount += 1;
            } else {
              console.error('Row failed:', singleItem.full_name, singleError);
            }
          }
        } else {
          successCount += batch.length;
        }

        const currentProgress = Math.round((Math.min(i + BATCH_SIZE, total) / total) * 100);
        setImportProgress(currentProgress);
        setImportedSuccessCount(successCount);
      }

      toast.success(`تم استيراد ${successCount} عضو بنجاح إلى قاعدة البيانات 🎉`);
      setIsImportModalOpen(false);
      setParsedRows([]);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchMembers();
    } catch (err: any) {
      console.error(err);
      toast.error('حدث خطأ أثناء عملية الاستيراد');
    } finally {
      setIsImporting(false);
    }
  };


  const exportAllMembersToExcel = async () => {
    if (!orgId) return;
    const toastId = toast.loading('جاري تجهيز وتصدير سجل الأعضاء...');
    try {
      const { data, error } = await supabase
        .from('stadium_members')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data || []).map(m => ({
        'الاسم الكامل': m.full_name,
        'الرقم القومي': m.national_id || '—',
        'رقم الهاتف': m.phone || '—',
        'البريد الإلكتروني': m.email || '—',
        'النوع': m.gender === 'female' ? 'أنثى' : 'ذكر',
        'نوع العضوية': MEMBERSHIP_CATEGORY_LABELS[m.membership_type] || m.membership_type,
        'تاريخ الانتهاء': m.end_date || '—',
        'الحالة': m.status === 'active' ? 'نشط' : m.status === 'expired' ? 'منتهي' : 'موقوف',
        'ملاحظات': m.notes || '—',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'سجل الأعضاء');
      XLSX.writeFile(workbook, `سجل_أعضاء_الاستاد_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.dismiss(toastId);
      toast.success('تم تصدير سجل الأعضاء إلى Excel بنجاح');
    } catch (err: any) {
      console.error(err);
      toast.dismiss(toastId);
      toast.error('فشل تصدير ملف الأعضاء');
    }
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-900 rounded-lg shadow-md min-h-screen text-right" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
            <Users className="w-7 h-7 text-green-600 dark:text-green-400" />
            إدارة الأعضاء والاشتراكات الرياضية
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            إجمالي الأعضاء المسجلين: <strong className="text-green-600">{totalMembersCount.toLocaleString('ar-EG')} عضو</strong>
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50 px-3.5 py-2 rounded-lg transition font-semibold text-sm border border-emerald-300 dark:border-emerald-700 shadow-sm"
            title="تحميل ملف الإكسيل النموذجي لتعبئة بيانات الأعضاء"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            تحميل نموذج Excel (Template)
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 rounded-lg transition font-medium text-sm shadow-sm"
          >
            <Upload className="w-4 h-4" />
            استيراد الأعضاء من Excel بالآلاف
          </button>

          <button
            onClick={exportAllMembersToExcel}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-3.5 py-2 rounded-lg transition text-sm font-medium border border-gray-300 dark:border-gray-600"
          >
            <Download className="w-4 h-4" />
            تصدير إلى Excel
          </button>

          <button
            onClick={() => {
              setEditingMember(null);
              reset();
              setPhotoFile(null);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition font-medium text-sm shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            إضافة عضو جديد
          </button>
        </div>

      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 absolute right-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="بحث بالاسم، رقم الهاتف، أو الرقم القومي..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pr-10 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700 text-sm"
        >
          <option value="">جميع الحالات</option>
          <option value="active">نشط</option>
          <option value="expired">منتهي</option>
          <option value="suspended">موقوف</option>
        </select>
      </div>

      {/* Members Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">جاري تحميل سجل الأعضاء...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-b">
                <th className="p-3 font-semibold">العضو</th>
                <th className="p-3 font-semibold">الرقم القومي</th>
                <th className="p-3 font-semibold">نوع العضوية</th>
                <th className="p-3 font-semibold">الحالة</th>
                <th className="p-3 font-semibold">تاريخ الانتهاء</th>
                <th className="p-3 font-semibold">الهاتف</th>
                <th className="p-3 font-semibold text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-500">
                    لا يوجد أعضاء مسجلين حالياً
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="p-3 flex items-center gap-3">
                      {member.photo_url ? (
                        <img src={member.photo_url} alt="" className="w-9 h-9 rounded-full object-cover border" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 flex items-center justify-center font-bold">
                          {member.full_name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{member.full_name}</div>
                        {member.email && <div className="text-xs text-gray-400">{member.email}</div>}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs text-gray-600 dark:text-gray-400">{member.national_id || '—'}</td>
                    <td className="p-3 text-xs">
                      <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {MEMBERSHIP_CATEGORY_LABELS[member.membership_type] || member.membership_type}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getMemberStatusColor(member.status)}`}>
                        {member.status === 'active' ? 'نشط' : member.status === 'expired' ? 'منتهي' : 'موقوف'}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">{member.end_date || '—'}</td>
                    <td className="p-3 font-mono text-xs">{member.phone || '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-1.5 justify-center">
                        <button
                          onClick={() => {
                            setSelectedCardMember(member);
                            setIsCardModalOpen(true);
                          }}
                          title="طباعة بطاقة الكارنيه الذكية (Smart ID Card)"
                          className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        {member.phone && (
                          <a
                            href={generateWhatsAppRenewalUrl(member.phone, member.full_name, member.end_date || '')}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="إرسال تذكير عبر WhatsApp"
                            className="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-md inline-flex items-center"
                          >
                            <Share2 className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => openRenew(member)}
                          title="تجديد الاشتراك"
                          className="p-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-md"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openHistory(member)}
                          title="سجل الاشتراكات"
                          className="p-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-md"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(member)}
                          title="تعديل البيانات"
                          className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md"
                        >
                          تعديل
                        </button>
                      </div>

                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4 pt-3 border-t">
              <span className="text-xs text-gray-500">صفحة {page} من {totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs disabled:opacity-50"
                >
                  السابق
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs disabled:opacity-50"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* 📥 Bulk Import Modal (استيراد الأعضاء بالآلاف) */}
      {/* ───────────────────────────────────────────── */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto text-right">
            <div className="flex justify-between items-center mb-4 pb-3 border-b dark:border-gray-800">
              <h3 className="text-xl font-bold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <FileSpreadsheet className="w-6 h-6" />
                استيراد الأعضاء والمشتركين من ملف Excel / CSV
              </h3>
              <button
                onClick={() => { setIsImportModalOpen(false); setParsedRows([]); setImportFile(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Instruction & Download Template */}
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-5">
              <h4 className="font-bold text-emerald-900 dark:text-emerald-200 text-sm mb-1 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> تعليمات الاستيراد السريع بالآلاف:
              </h4>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed mb-3">
                يمكنك رفع ملف Excel يحتوي على آلاف الأعضاء مع أرقامهم القومية وتواريخ اشتراكاتهم.
                لضمان تطابق الأعمدة بدقة، يُرجى تحميل النموذج القياسي المعتمد أدناه.
              </p>
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <Download className="w-3.5 h-3.5" />
                تحميل نموذج Excel الجاهز (Template)
              </button>
            </div>

            {/* File Upload Zone */}
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-6 text-center hover:border-emerald-500 transition mb-5">
              <Upload className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                اختر أو اسحب ملف Excel (.xlsx, .xls) أو CSV هنا
              </p>
              <p className="text-xs text-gray-400 mb-4">يدعم الملفات الكبيرة حتى عشرات الآلاف من الأعضاء</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
                id="excel-file-input"
              />
              <label
                htmlFor="excel-file-input"
                className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-xs font-medium cursor-pointer inline-block"
              >
                استعراض الملف من جهازك
              </label>
            </div>

            {/* Parsed Preview */}
            {parsedRows.length > 0 && (
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    عدد الأعضاء المكتشفين في الملف:
                  </span>
                  <span className="text-base font-bold text-emerald-600">
                    {parsedRows.length.toLocaleString('ar-EG')} عضو
                  </span>
                </div>

                {/* Progress Bar while importing */}
                {isImporting && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                      <span>جاري معالجة وحفظ البيانات على دفعات...</span>
                      <span className="font-bold">{importProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-emerald-600 h-3 transition-all duration-300 rounded-full"
                        style={{ width: `${importProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-center text-gray-500">
                      تم حفظ {importedSuccessCount.toLocaleString('ar-EG')} من {parsedRows.length.toLocaleString('ar-EG')}...
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-3 border-t dark:border-gray-800">
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => { setIsImportModalOpen(false); setParsedRows([]); }}
                    className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    disabled={isImporting || parsedRows.length === 0}
                    onClick={processBulkImport}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow transition flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isImporting ? 'جاري الاستيراد...' : `تأكيد استيراد ${parsedRows.length} عضو الآن`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">
              {editingMember ? 'تعديل بيانات عضو' : 'إضافة عضو جديد'}
            </h3>
            <form onSubmit={handleSubmit(onSaveMember)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">الاسم الكامل *</label>
                <input
                  {...register('full_name', { required: true })}
                  className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">الرقم القومي</label>
                  <input
                    {...register('national_id')}
                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">رقم الهاتف</label>
                  <input
                    {...register('phone')}
                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    {...register('email')}
                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">تاريخ الميلاد</label>
                  <input
                    type="date"
                    {...register('dob')}
                    className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">النوع</label>
                  <select {...register('gender')} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700">
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">نوع العضوية</label>
                  <select {...register('membership_type')} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700">
                    {Object.entries(MEMBERSHIP_CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">الصورة الشخصية</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                  className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ملاحظات</label>
                <textarea
                  {...register('notes')}
                  rows={2}
                  className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
                ></textarea>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border rounded text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium"
                >
                  حفظ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Renew Subscription Modal */}
      {isRenewModalOpen && renewingMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">
              تجديد اشتراك: {renewingMember.full_name}
            </h3>
            <form onSubmit={handleSubmitRenew(onRenewSubscription)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">مدة الاشتراك</label>
                <select {...registerRenew('duration')} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700">
                  <option value="monthly">شهري (1 شهر)</option>
                  <option value="quarterly">ربع سنوي (3 أشهر)</option>
                  <option value="semi_annual">نصف سنوي (6 أشهر)</option>
                  <option value="annual">سنوي (12 شهر)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">المبلغ المسدد (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  {...registerRenew('amount_paid', { required: true })}
                  className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700 font-bold text-green-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">طريقة السداد</label>
                <select {...registerRenew('payment_method')} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700">
                  <option value="cash">نقداً (خزينة)</option>
                  <option value="cheque">شيك بنكي وارد</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="card">بطاقة دفع إلكتروني</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">حساب الخزينة / البنك المودع به</label>
                <select {...registerRenew('treasury_account_id')} className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700">
                  {treasuryAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsRenewModalOpen(false)}
                  className="px-4 py-2 border rounded text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium"
                >
                  تأكيد التجديد وقيد الإيراد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">سجل الاشتراكات السابقة</h3>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-gray-500 hover:text-gray-800">إغلاق</button>
            </div>
            {memberHistory.length === 0 ? (
              <p className="text-center py-4 text-gray-500">لا يوجد سجل اشتراكات سابق لهذا العضو.</p>
            ) : (
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className="p-2 border-b">المدة</th>
                    <th className="p-2 border-b">تاريخ البدء</th>
                    <th className="p-2 border-b">تاريخ الانتهاء</th>
                    <th className="p-2 border-b">المبلغ المسدد</th>
                  </tr>
                </thead>
                <tbody>
                  {memberHistory.map(sub => (
                    <tr key={sub.id}>
                      <td className="p-2 border-b">
                        {sub.duration === 'monthly' ? 'شهري' : sub.duration === 'quarterly' ? 'ربع سنوي' : sub.duration === 'semi_annual' ? 'نصف سنوي' : 'سنوي'}
                      </td>
                      <td className="p-2 border-b">{new Date(sub.start_date).toLocaleDateString('ar-EG')}</td>
                      <td className="p-2 border-b">{new Date(sub.end_date).toLocaleDateString('ar-EG')}</td>
                      <td className="p-2 border-b font-bold text-green-600">{sub.amount_paid} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Member Smart ID Card Modal */}
      <MemberCardModal
        isOpen={isCardModalOpen}
        onClose={() => setIsCardModalOpen(false)}
        member={selectedCardMember}
      />

      {/* Receipt Printable Modal */}
      <ReceiptModal
        isOpen={Boolean(receiptModalData)}
        onClose={() => setReceiptModalData(null)}
        data={receiptModalData}
      />
    </div>
  );
};

export default MemberManager;

