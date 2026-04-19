import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Users, Plus, Search, Edit2, Trash2, X, Phone, MapPin, FileText, CircleDollarSign, Loader2, Upload, Download, Wallet, TrendingUp, RefreshCw, Scale, Mail, FileSpreadsheet, ArrowUp, ArrowDown, Printer } from 'lucide-react';
import { useCustomers } from '../hooks/usePermissions';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { createCustomerSchema } from '../../utils/validationSchemas';
import { useNavigate } from 'react-router-dom';

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  tax_number: string;
  address: string;
  credit_limit?: number;
  opening_balance?: number;
  balance?: number; // Added for sorting and display
};

const CustomerManager = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addCustomer, updateCustomer, deleteCustomer, can, currentUser, customers: contextCustomers, addEntry, accounts, getSystemAccount, addOpeningBalanceTransaction } = useAccounting();
  const { showToast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // تأخير البحث لتقليل الطلبات على السيرفر
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // في وضع الديمو، نستخدم العملاء من السياق (الوهميين) بدلاً من جلبهم من السيرفر
  const { data: serverCustomers = [], isLoading: isServerLoading } = useCustomers(debouncedSearch);
  const customers = currentUser?.role === 'demo' ? contextCustomers : serverCustomers;
  const isLoading = currentUser?.role === 'demo' ? false : isServerLoading;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [stats, setStats] = useState<Record<string, { balance: number, totalSales: number, lastInvoice: string | null }>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'balance', direction: 'desc' });

  // جلب الإحصائيات عند تحميل العملاء
  useEffect(() => {
    if (customers.length > 0) {
        fetchStats();
    }
  }, [customers]);

  const fetchStats = async () => {
    if (currentUser?.role === 'demo') {
        setStats({
            'demo-c1': { balance: 4775, totalSales: 9775, lastInvoice: '2024-07-25' },
            'demo-c2': { balance: 0, totalSales: 4887.5, lastInvoice: '2024-07-24' },
            'demo-c3': { balance: 1500, totalSales: 1500, lastInvoice: '2024-07-25' }
        });
        return;
    }
    
    setStatsLoading(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const userOrgId = user?.user_metadata?.org_id;

        if (!userOrgId) throw new Error('Org ID missing');

        const filter = { organization_id: userOrgId };

        // Fetch invoices (debit)
        const { data: invoices } = await supabase.from('invoices').select('customer_id, total_amount, invoice_date').match(filter).neq('status', 'draft');
        // Fetch receipts (credit)
        const { data: receipts } = await supabase.from('receipt_vouchers').select('customer_id, amount').match(filter);
        // Fetch sales returns (credit)
        const { data: returns } = await supabase.from('sales_returns').select('customer_id, total_amount').match(filter).neq('status', 'draft');
        // Fetch credit notes (credit)
        const { data: creditNotes } = await supabase.from('credit_notes').select('customer_id, total_amount').match(filter);
        // Fetch collected cheques (credit)
        const { data: cheques } = await supabase.from('cheques')
            .select('party_id, amount')
            .match(filter)
            .eq('type', 'incoming')
            .eq('status', 'collected');

        const newStats: Record<string, any> = {};

        // Initialize stats
        customers.forEach(c => { newStats[c.id] = { balance: 0, totalSales: 0, lastInvoice: null }; });

        // Calculate invoices
        invoices?.forEach(inv => {
            if (!newStats[inv.customer_id]) return;
            newStats[inv.customer_id].balance += Number(inv.total_amount);
            newStats[inv.customer_id].totalSales += Number(inv.total_amount);
            if (!newStats[inv.customer_id].lastInvoice || inv.invoice_date > newStats[inv.customer_id].lastInvoice) {
                newStats[inv.customer_id].lastInvoice = inv.invoice_date;
            }
        });

        // Subtract payments and returns
        receipts?.forEach(p => { if (newStats[p.customer_id]) newStats[p.customer_id].balance -= Number(p.amount); });
        returns?.forEach(r => { if (newStats[r.customer_id]) newStats[r.customer_id].balance -= Number(r.total_amount); });
        creditNotes?.forEach(cn => { if (newStats[cn.customer_id]) newStats[cn.customer_id].balance -= Number(cn.total_amount); });
        cheques?.forEach(c => { if (newStats[c.party_id]) newStats[c.party_id].balance -= Number(c.amount); });

        setStats(newStats);
    } catch (error) { console.error("Error fetching stats", error); } finally { setStatsLoading(false); }
  };

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedCustomers = useMemo(() => {
    let sortableItems = [...customers];
    if (sortConfig) {
      sortableItems.sort((a, b) => {
        let valA: any;
        let valB: any;

        switch (sortConfig.key) {
          case 'balance':
            valA = stats[a.id]?.balance ?? 0;
            valB = stats[b.id]?.balance ?? 0;
            break;
          case 'totalSales':
            valA = stats[a.id]?.totalSales ?? 0;
            valB = stats[b.id]?.totalSales ?? 0;
            break;
          case 'credit_limit':
            valA = a.credit_limit ?? 0;
            valB = b.credit_limit ?? 0;
            break;
          case 'name':
            valA = a.name;
            valB = b.name;
            break;
          default:
            return 0;
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
      });
    }
    return sortableItems;
  }, [customers, stats, sortConfig]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // التحقق باستخدام Zod
    const validationResult = createCustomerSchema.safeParse({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        tax_number: formData.tax_number,
        address: formData.address,
        credit_limit: formData.credit_limit
    });

    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }

    try {
        let result;
        if (formData.id) {
            result = await updateCustomer(formData.id, formData);
        } else {
            result = await addCustomer(formData as any);
            
            // إنشاء حركة الرصيد الافتتاحي إذا كان موجوداً
            if (result && formData.opening_balance && Number(formData.opening_balance) !== 0) {
              await addOpeningBalanceTransaction(
                result.id,
                'customer',
                Number(formData.opening_balance),
                new Date().toISOString().split('T')[0],
                formData.name!
              );
            }
        }
        queryClient.invalidateQueries({ queryKey: ['customers'] }); // تحديث القائمة فوراً
        setIsModalOpen(false);
        showToast('تم حفظ بيانات العميل بنجاح ✅', 'success');
    } catch (error: any) {
        console.error(error);
        showToast('حدث خطأ: ' + error.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا العميل؟')) {
      const reason = prompt("الرجاء إدخال سبب الحذف (إلزامي):");
      if (reason) {
        try {
          await deleteCustomer(id, reason);
          queryClient.invalidateQueries({ queryKey: ['customers'] }); // تحديث القائمة فوراً
          showToast('تم حذف العميل بنجاح', 'success');
        } catch (error: any) {
          console.error(error);
          showToast('لا يمكن حذف العميل, قد يكون مرتبطاً بفواتير. الخطأ: ' + error.message, 'error');
        }
      }
    }
  };

  const handleExportExcel = () => {
    if (customers.length === 0) {
        showToast('لا يوجد عملاء لتصديرهم.', 'info');
        return;
    }

    const dataToExport = customers.map(customer => ({
        'الاسم': customer.name,
        'الهاتف': customer.phone || '-',
        'البريد الإلكتروني': customer.email || '-',
        'العنوان': customer.address || '-',
        'الرقم الضريبي': customer.tax_number || '-',
        'الرصيد الحالي': stats[customer.id]?.balance ?? 0,
        'إجمالي المبيعات': stats[customer.id]?.totalSales ?? 0,
        'حد الائتمان': customer.credit_limit ?? 0,
    }));

    const totalBalance = dataToExport.reduce((sum, item) => sum + item['الرصيد الحالي'], 0);
    const totalSales = dataToExport.reduce((sum, item) => sum + item['إجمالي المبيعات'], 0);

    // Add an empty row for spacing, then the total row
    dataToExport.push({} as any); 
    dataToExport.push({
        'الاسم': 'الإجمالي الكلي:',
        'الرصيد الحالي': totalBalance,
        'إجمالي المبيعات': totalSales,
    } as any);

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير العملاء");
    XLSX.writeFile(wb, `Customers_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      { 'اسم العميل': '', 'رقم الهاتف': '', 'البريد الإلكتروني': '', 'الرقم الضريبي': '', 'العنوان': '', 'حد الائتمان': '', 'الرصيد الافتتاحي': '' }
    ];
    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج العملاء");
    XLSX.writeFile(wb, "Customers_Template.xlsx");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const fileInput = e.target;
    const file = fileInput.files[0];
    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const successRecords: any[] = [];
        const failedRecords: { row: any, error: string }[] = [];

        for (const row of data as any[]) {
          const name = row['اسم العميل'] || row['Name'];
          const phone = row['رقم الهاتف'] || row['Phone'];
          const email = row['البريد الإلكتروني'] || row['Email'];
          const tax_number = row['الرقم الضريبي'] || row['Tax Number'];
          const address = row['العنوان'] || row['Address'];
          const credit_limit = row['حد الائتمان'] || row['Credit Limit'];
          const openingBalance = row['الرصيد الافتتاحي'] || row['Opening Balance'] || 0;

          if (name) {
            try {
              if (credit_limit && isNaN(Number(credit_limit))) {
                throw new Error('حد الائتمان يجب أن يكون رقماً.');
              }

              const newCustomer = await addCustomer({
                name: String(name).trim(),
                phone: phone ? String(phone).trim() : '',
                email: email ? String(email).trim() : '',
                tax_number: tax_number ? String(tax_number).trim() : '',
                address: address ? String(address).trim() : '',
                credit_limit: credit_limit ? Number(credit_limit) : 0
              } as any);
              
              if (newCustomer) {
                  successRecords.push(newCustomer);

                  // معالجة الرصيد الافتتاحي
                  if (Number(openingBalance) !== 0) {
                    const amount = Math.abs(Number(openingBalance));
                    const isDebit = Number(openingBalance) > 0; // موجب = مدين (العميل عليه فلوس)
                    const date = new Date().toISOString().split('T')[0];
                    const ref = `OB-${newCustomer.id.slice(0, 6)}`;

                    if (isDebit) {
                        // إنشاء فاتورة (للرصيد المدين)
                        await supabase.from('invoices').insert({
                            invoice_number: ref,
                            customer_id: newCustomer.id,
                            invoice_date: date,
                            total_amount: amount,
                            subtotal: amount,
                            status: 'posted',
                            notes: 'رصيد افتتاحي (استيراد)'
                        });
                    } else {
                        // إنشاء إشعار دائن (للرصيد الدائن/المقدم)
                        await supabase.from('credit_notes').insert({
                            credit_note_number: ref,
                            customer_id: newCustomer.id,
                            note_date: date,
                            total_amount: amount,
                            amount_before_tax: amount,
                            status: 'posted',
                            notes: 'رصيد افتتاحي (دائن)'
                        });
                    }

                    // إنشاء القيد المحاسبي
                    const customerAcc = getSystemAccount('CUSTOMERS') || accounts.find(a => a.code === '1221' || a.code === '10201');
                    const openingAcc = accounts.find(a => a.code === '3999') || accounts.find(a => a.code === '300');

                    if (customerAcc && openingAcc) {
                        await addEntry({
                            date: date,
                            description: `رصيد افتتاحي للعميل ${name}`,
                            reference: ref,
                            status: 'posted',
                            lines: [
                                { accountId: customerAcc.id, debit: isDebit ? amount : 0, credit: isDebit ? 0 : amount },
                                { accountId: openingAcc.id, debit: isDebit ? 0 : amount, credit: isDebit ? amount : 0 }
                            ]
                        });
                    }
                  }
              }
            } catch (err) {
              failedRecords.push({ row, error: (err as Error).message });
            }
          } else {
            if (Object.keys(row).length > 0) {
                failedRecords.push({ row, error: 'اسم العميل فارغ.' });
            }
          }
        }

        queryClient.invalidateQueries({ queryKey: ['customers'] });

        let toastMessage = `تم استيراد ${successRecords.length} عميل بنجاح.`;
        if (failedRecords.length > 0) {
            toastMessage += `\nفشل استيراد ${failedRecords.length} سجل. راجع الـ console لمزيد من التفاصيل.`;
            console.error("فشل استيراد السجلات التالية:", failedRecords);
            showToast(toastMessage, 'warning');
        } else {
            showToast(toastMessage, 'success');
        }
        
      } catch (error: any) {
        showToast('حدث خطأ أثناء قراءة الملف: ' + error.message, 'error');
      } finally {
        setIsImporting(false);
        if (fileInput) fileInput.value = ''; 
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="hidden print:block text-center mb-4">
          <h1 className="text-2xl font-bold">تقرير أرصدة العملاء</h1>
          <p className="text-sm text-slate-500">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="flex justify-between items-center print:hidden">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="text-blue-600" /> إدارة العملاء
        </h2>
        <div className="flex gap-2 mr-auto">
            <button onClick={() => navigate('/customer-statement')} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-bold">
                <Scale size={16} /> كشف حساب
            </button>
            <button onClick={fetchStats} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-bold">
                <RefreshCw size={16} className={statsLoading ? 'animate-spin' : ''} />
            </button>
            <button onClick={handleExportExcel} className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-100 text-sm font-bold">
                <FileSpreadsheet size={16} /> تصدير Excel
            </button>
            <button onClick={() => window.print()} className="bg-slate-800 text-white px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-700 text-sm font-bold">
                <Printer size={16} /> طباعة
            </button>
            <button onClick={handleDownloadTemplate} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-bold" title="تحميل نموذج Excel">
                <Download size={16} /> نموذج
            </button>
            <div className="relative">
                <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isImporting}
                />
                <button className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-100 text-sm font-bold">
                    {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    استيراد Excel
                </button>
            </div>
        {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || can('customers', 'create')) && (
            <button onClick={() => { setFormData({}); setIsModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-blue-700">
                <Plus size={18} /> إضافة عميل
            </button>
            )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={20} />
          <input type="text" placeholder="بحث عن عميل..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pr-10 pl-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto print:shadow-none print:border-none print:rounded-none">
            <table className="w-full text-right">
                <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                    <tr>
                        <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('name')}>
                            <div className="flex items-center gap-1 justify-end">
                                {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)} الاسم
                            </div>
                        </th>
                        <th className="p-4">الهاتف</th>
                        <th className="p-4">البريد الإلكتروني</th>
                        <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('balance')}>
                            <div className="flex items-center gap-1 justify-end">
                                {sortConfig.key === 'balance' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)} الرصيد الحالي
                            </div>
                        </th>
                        <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('totalSales')}>
                            <div className="flex items-center gap-1 justify-end">
                                {sortConfig.key === 'totalSales' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)} إجمالي المبيعات
                            </div>
                        </th>
                        <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('credit_limit')}>
                            <div className="flex items-center gap-1 justify-end">
                                {sortConfig.key === 'credit_limit' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)} حد الائتمان
                            </div>
                        </th>
                        <th className="p-4 text-center print:hidden">إجراءات</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {sortedCustomers.map(customer => (
                    <tr key={customer.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold text-slate-800">{customer.name}</td>
                        <td className="p-4 text-slate-600 font-mono">{customer.phone || '-'}</td>
                        <td className="p-4 text-slate-600">{customer.email || '-'}</td>
                        <td className={`p-4 font-mono font-bold ${stats[customer.id]?.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {statsLoading ? '...' : (stats[customer.id]?.balance?.toLocaleString() || '0')}
                        </td>
                        <td className="p-4 font-mono font-bold text-slate-700 print:hidden">
                        {statsLoading ? '...' : (stats[customer.id]?.totalSales?.toLocaleString() || '0')}
                        </td>
                        <td className="p-4 font-mono text-emerald-600">{customer.credit_limit?.toLocaleString() || 0}</td>
                        <td className="p-4 text-center print:hidden">
                        <div className="flex justify-center gap-2">
                            {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || can('customers', 'update')) && (
                            <button onClick={() => { setFormData(customer); setIsModalOpen(true); }} className="text-blue-500 hover:bg-blue-50 p-2 rounded-full"><Edit2 size={16} /></button>
                            )}
                            {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || can('customers', 'delete')) && (
                            <button onClick={() => handleDelete(customer.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-full"><Trash2 size={16} /></button>
                            )}
                        </div>
                        </td>
                    </tr>
                    ))}
                    {sortedCustomers.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد نتائج مطابقة للبحث.</td></tr>
                    )}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <tr>
                        <td colSpan={3} className="p-4 text-left">الإجمالي:</td>
                        <td className="p-4 text-red-700 font-mono print:hidden">{Object.values(stats).reduce((acc, s) => acc + (s.balance || 0), 0).toLocaleString()}</td>
                        <td className="p-4 text-slate-800 font-mono">{Object.values(stats).reduce((acc, s) => acc + (s.totalSales || 0), 0).toLocaleString()}</td>
                        <td colSpan={2}></td>
                    </tr>
                </tfoot>
            </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl">{formData.id ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-bold mb-1">اسم العميل</label><input required type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">رقم الهاتف</label><input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">البريد الإلكتروني</label><input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">الرقم الضريبي</label><input type="text" value={formData.tax_number || ''} onChange={e => setFormData({...formData, tax_number: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">العنوان</label><input type="text" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">حد الائتمان</label><input type="number" step="any" value={formData.credit_limit || ''} onChange={e => setFormData({...formData, credit_limit: Number(e.target.value)})} className="w-full border rounded-lg p-2" placeholder="0" /></div>
              {!formData.id && <div><label className="block text-sm font-bold mb-1">الرصيد الافتتاحي (مدين)</label><input type="number" step="any" value={formData.opening_balance || ''} onChange={e => setFormData({...formData, opening_balance: Number(e.target.value)})} className="w-full border rounded-lg p-2" placeholder="0.00" /></div>}
              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 mt-4">حفظ البيانات</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerManager;
