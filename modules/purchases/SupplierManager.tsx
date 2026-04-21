import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useAccounting } from '../../context/AccountingContext';
import { useToast } from '../../context/ToastContext';
import { Truck, Plus, Search, Edit2, Trash2, X, Phone, MapPin, FileText, CircleDollarSign, Loader2, Upload, Download, Wallet, TrendingUp, RefreshCw, Scale, Mail, FileSpreadsheet, ArrowUp, ArrowDown, Printer } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';

type Supplier = {
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

const SupplierManager = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addSupplier, updateSupplier, deleteSupplier, can, currentUser, suppliers: contextSuppliers, addEntry, accounts, getSystemAccount, addOpeningBalanceTransaction } = useAccounting();
  const { showToast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [serverSuppliers, setServerSuppliers] = useState<Supplier[]>([]);
  const [isServerLoading, setIsServerLoading] = useState(false);

  useEffect(() => {
    if (currentUser?.role === 'demo') return;
    
    const fetchSuppliers = async () => {
        setIsServerLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        const userOrgId = user?.user_metadata?.org_id;

        if (!userOrgId) {
            setIsServerLoading(false);
            return;
        }

        let query = supabase.from('suppliers').select('*').is('deleted_at', null).eq('organization_id', userOrgId);
        if (debouncedSearch) {
            query = query.ilike('name', `%${debouncedSearch}%`);
        }
        const { data, error } = await query.order('name', { ascending: true });
        if (error) {
            showToast('فشل جلب الموردين', 'error');
        } else {
            setServerSuppliers(data as Supplier[]);
        }
        setIsServerLoading(false);
    };

    fetchSuppliers();
  }, [debouncedSearch, currentUser]);

  const suppliers = (currentUser?.role === 'demo' ? contextSuppliers : serverSuppliers) as Supplier[];
  const isLoading = currentUser?.role === 'demo' ? false : isServerLoading;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Supplier>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [stats, setStats] = useState<Record<string, { balance: number, totalPurchases: number, lastInvoice: string | null }>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'balance', direction: 'desc' });

  useEffect(() => {
    if (suppliers.length > 0) {
        fetchStats();
    }
  }, [suppliers]);

  const fetchStats = async () => {
    if (currentUser?.role === 'demo') {
        setStats({
            'demo-s1': { balance: 12000, totalPurchases: 25000, lastInvoice: '2024-07-20' },
            'demo-s2': { balance: 0, totalPurchases: 18000, lastInvoice: '2024-07-22' },
        });
        return;
    }
    
    setStatsLoading(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const userOrgId = user?.user_metadata?.org_id;

        if (!userOrgId) throw new Error('Org ID missing');

        const filter = { organization_id: userOrgId };

        const { data: invoices } = await supabase.from('purchase_invoices').select('supplier_id, total_amount, paid_amount, invoice_date').match(filter).neq('status', 'draft');
        const { data: payments } = await supabase.from('payment_vouchers').select('supplier_id, amount').match(filter);
        const { data: returns } = await supabase.from('purchase_returns').select('supplier_id, total_amount').match(filter).neq('status', 'draft');
        const { data: debitNotes } = await supabase.from('debit_notes').select('supplier_id, total_amount').match(filter);
        const { data: cheques } = await supabase.from('cheques').select('party_id, amount').match(filter).eq('type', 'outgoing').eq('status', 'collected');

        const newStats: Record<string, any> = {};
        suppliers.forEach(s => { newStats[s.id] = { balance: 0, totalPurchases: 0, lastInvoice: null }; });

        invoices?.forEach(inv => {
            if (!newStats[inv.supplier_id]) return;
            newStats[inv.supplier_id].balance += (Number(inv.total_amount) - Number(inv.paid_amount || 0));
            newStats[inv.supplier_id].totalPurchases += Number(inv.total_amount);
            if (!newStats[inv.supplier_id].lastInvoice || inv.invoice_date > newStats[inv.supplier_id].lastInvoice) {
                newStats[inv.supplier_id].lastInvoice = inv.invoice_date;
            }
        });

        payments?.forEach(p => { if (newStats[p.supplier_id]) newStats[p.supplier_id].balance -= Number(p.amount); });
        returns?.forEach(r => { if (newStats[r.supplier_id]) newStats[r.supplier_id].balance -= Number(r.total_amount); });
        debitNotes?.forEach(dn => { if (newStats[dn.supplier_id]) newStats[dn.supplier_id].balance -= Number(dn.total_amount); });
        cheques?.forEach(c => { if (newStats[c.party_id]) newStats[c.party_id].balance -= Number(c.amount); });

        setStats(newStats);
    } catch (error) { if (process.env.NODE_ENV === 'development') console.error("Error fetching supplier stats", error); } finally { setStatsLoading(false); }
  };

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedSuppliers = useMemo(() => {
    let sortableItems = [...suppliers];
    if (sortConfig) {
      sortableItems.sort((a, b) => {
        let valA: any, valB: any;
        switch (sortConfig.key) {
          case 'balance': valA = stats[a.id]?.balance ?? 0; valB = stats[b.id]?.balance ?? 0; break;
          case 'totalPurchases': valA = stats[a.id]?.totalPurchases ?? 0; valB = stats[b.id]?.totalPurchases ?? 0; break;
          case 'credit_limit': valA = a.credit_limit ?? 0; valB = b.credit_limit ?? 0; break;
          case 'name': valA = a.name; valB = b.name; break;
          default: return 0;
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
  }, [suppliers, stats, sortConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supplierSchema = z.object({
        name: z.string().min(3, 'اسم المورد يجب أن يكون 3 أحرف على الأقل'),
        phone: z.string().optional(),
        email: z.string().email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
        tax_number: z.string().optional(),
        address: z.string().optional(),
        credit_limit: z.number().optional()
    });
    const validationResult = supplierSchema.safeParse(formData);
    if (!validationResult.success) {
        showToast(validationResult.error.issues[0].message, 'warning');
        return;
    }
    try {
        let result;
        if (formData.id) {
            result = await updateSupplier(formData.id, formData);
        } else {
            result = await addSupplier(formData as any);

            // إنشاء حركة الرصيد الافتتاحي إذا كان موجوداً
            if (result && formData.opening_balance && Number(formData.opening_balance) !== 0) {
              await addOpeningBalanceTransaction(
                result.id,
                'supplier',
                Number(formData.opening_balance),
                new Date().toISOString().split('T')[0],
                formData.name!
              );
            }
        }
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        setIsModalOpen(false);
        showToast('تم حفظ بيانات المورد بنجاح ✅', 'success');
    } catch (error: any) {
        showToast('حدث خطأ: ' + error.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المورد؟')) {
      const reason = prompt("الرجاء إدخال سبب الحذف (إلزامي):");
      if (reason) {
        try {
          await deleteSupplier(id, reason);
          queryClient.invalidateQueries({ queryKey: ['suppliers'] });
          showToast('تم حذف المورد بنجاح', 'success');
        } catch (error: any) {
          showToast('لا يمكن حذف المورد, قد يكون مرتبطاً بفواتير. الخطأ: ' + error.message, 'error');
        }
      }
    }
  };

  const handleExportExcel = () => {
    if (suppliers.length === 0) {
        showToast('لا يوجد موردين لتصديرهم.', 'info');
        return;
    }
    const dataToExport = sortedSuppliers.map(supplier => ({
        'الاسم': supplier.name,
        'الهاتف': supplier.phone || '-',
        'البريد الإلكتروني': supplier.email || '-',
        'العنوان': supplier.address || '-',
        'الرقم الضريبي': supplier.tax_number || '-',
        'الرصيد الحالي': stats[supplier.id]?.balance ?? 0,
        'إجمالي المشتريات': stats[supplier.id]?.totalPurchases ?? 0,
        'حد الائتمان': supplier.credit_limit ?? 0,
    }));
    const totalBalance = dataToExport.reduce((sum, item) => sum + item['الرصيد الحالي'], 0);
    const totalPurchases = dataToExport.reduce((sum, item) => sum + item['إجمالي المشتريات'], 0);
    dataToExport.push({} as any); 
    dataToExport.push({ 'الاسم': 'الإجمالي:', 'الرصيد الحالي': totalBalance, 'إجمالي المشتريات': totalPurchases } as any);
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقرير الموردين");
    XLSX.writeFile(wb, `Suppliers_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const headers = [{ 'اسم المورد': '', 'رقم الهاتف': '', 'البريد الإلكتروني': '', 'الرقم الضريبي': '', 'العنوان': '', 'حد الائتمان': '', 'الرصيد الافتتاحي': '' }];
    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموذج الموردين");
    XLSX.writeFile(wb, "Suppliers_Template.xlsx");
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
        const { data: { session } } = await supabase.auth.getSession();
        const userOrgId = session?.user?.user_metadata?.org_id;
        if (!userOrgId) throw new Error('تعذر تحديد المنظمة');

        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        let successCount = 0;
        for (const row of data as any[]) {
          const name = row['اسم المورد'] || row['Name'];
          if (name) {
            const openingBalance = row['الرصيد الافتتاحي'] || row['Opening Balance'] || 0;
            const newSupplier = await addSupplier({
              name: String(name).trim(),
              phone: String(row['رقم الهاتف'] || '').trim(),
              email: String(row['البريد الإلكتروني'] || '').trim(),
              tax_number: String(row['الرقم الضريبي'] || '').trim(),
              address: String(row['العنوان'] || '').trim(),
              credit_limit: Number(row['حد الائتمان'] || 0)
            } as any);
            if (newSupplier && Number(openingBalance) !== 0) {
              const amount = Math.abs(Number(openingBalance));
              const isCredit = Number(openingBalance) > 0;
              const date = new Date().toISOString().split('T')[0];
              const ref = `OB-SUP-${newSupplier.id.slice(0, 6)}`;
              if (isCredit) {
                await supabase.from('purchase_invoices').insert({ organization_id: userOrgId, invoice_number: ref, supplier_id: newSupplier.id, invoice_date: date, total_amount: amount, subtotal: amount, status: 'posted', notes: 'رصيد افتتاحي', created_by: session.user.id });
              } else {
                await supabase.from('debit_notes').insert({ organization_id: userOrgId, debit_note_number: ref, supplier_id: newSupplier.id, note_date: date, total_amount: amount, amount_before_tax: amount, status: 'posted', notes: 'رصيد افتتاحي' });
              }
              const supplierAcc = getSystemAccount('SUPPLIERS');
              const openingAcc = accounts.find(a => a.code === '3999');
              if (supplierAcc && openingAcc) {
                await addEntry({ date, description: `رصيد افتتاحي للمورد ${name}`, reference: ref, status: 'posted', lines: [
                    { accountId: supplierAcc.id, debit: isCredit ? 0 : amount, credit: isCredit ? amount : 0 },
                    { accountId: openingAcc.id, debit: isCredit ? amount : 0, credit: isCredit ? 0 : amount }
                ]});
              }
            }
            successCount++;
          }
        }
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        showToast(`تم استيراد ${successCount} مورد بنجاح.`, 'success');
      } catch (error: any) {
        showToast('حدث خطأ أثناء الاستيراد: ' + error.message, 'error');
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
          <h1 className="text-2xl font-bold">تقرير أرصدة الموردين</h1>
          <p className="text-sm text-slate-500">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
      </div>

      <div className="flex justify-between items-center print:hidden">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Truck className="text-blue-600" /> إدارة الموردين
        </h2>
        <div className="flex gap-2 mr-auto">
            <button onClick={() => navigate('/supplier-statement')} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 text-sm font-bold">
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
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isImporting} />
                <button className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-100 text-sm font-bold">
                    {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} استيراد
                </button>
            </div>
            {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || can('suppliers', 'create')) && (
            <button onClick={() => { setFormData({}); setIsModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-blue-700">
                <Plus size={18} /> إضافة مورد
            </button>
            )}
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div className="relative">
          <Search className="absolute right-3 top-3 text-slate-400" size={20} />
          <input type="text" placeholder="بحث عن مورد..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pr-10 pl-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto print:shadow-none print:border-none print:rounded-none">
            <table className="w-full text-right">
                <thead className="bg-slate-50 text-slate-600 font-bold text-sm">
                    <tr>
                        <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => requestSort('name')}>
                            <div className="flex items-center gap-1 justify-end">{sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)} الاسم</div>
                        </th>
                        <th className="p-4">الهاتف</th>
                        <th className="p-4">البريد الإلكتروني</th>
                        <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => requestSort('balance')}>
                            <div className="flex items-center gap-1 justify-end">{sortConfig.key === 'balance' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)} الرصيد الحالي</div>
                        </th>
                        <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => requestSort('totalPurchases')}>
                            <div className="flex items-center gap-1 justify-end">{sortConfig.key === 'totalPurchases' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)} إجمالي المشتريات</div>
                        </th>
                        <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => requestSort('credit_limit')}>
                            <div className="flex items-center gap-1 justify-end">{sortConfig.key === 'credit_limit' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)} حد الائتمان</div>
                        </th>
                        <th className="p-4 text-center print:hidden">إجراءات</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {sortedSuppliers.map(supplier => (
                    <tr key={supplier.id} className="hover:bg-slate-50/50">
                        <td className="p-4 font-bold text-slate-800">{supplier.name}</td>
                        <td className="p-4 text-slate-600 font-mono">{supplier.phone || '-'}</td>
                        <td className="p-4 text-slate-600">{supplier.email || '-'}</td>
                        <td className={`p-4 font-mono font-bold ${stats[supplier.id]?.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {statsLoading ? '...' : (stats[supplier.id]?.balance?.toLocaleString() || '0')}
                        </td>
                        <td className="p-4 font-mono font-bold text-slate-700 print:hidden">
                            {statsLoading ? '...' : (stats[supplier.id]?.totalPurchases?.toLocaleString() || '0')}
                        </td>
                        <td className="p-4 font-mono text-emerald-600">{supplier.credit_limit?.toLocaleString() || 0}</td>
                        <td className="p-4 text-center print:hidden">
                            <div className="flex justify-center gap-2">
                                {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || can('suppliers', 'update')) && (<button onClick={() => { setFormData(supplier); setIsModalOpen(true); }} className="text-blue-500 hover:bg-blue-50 p-2 rounded-full"><Edit2 size={16} /></button>)}
                                {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || can('suppliers', 'delete')) && (<button onClick={() => handleDelete(supplier.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-full"><Trash2 size={16} /></button>)}
                            </div>
                        </td>
                    </tr>
                    ))}
                    {sortedSuppliers.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">لا توجد نتائج مطابقة للبحث.</td></tr>
                    )}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <tr>
                        <td colSpan={3} className="p-4 text-left">الإجمالي:</td>
                        <td className="p-4 text-red-700 font-mono print:hidden">{Object.values(stats).reduce((acc, s) => acc + (s.balance || 0), 0).toLocaleString()}</td>
                        <td className="p-4 text-slate-800 font-mono">{Object.values(stats).reduce((acc, s) => acc + (s.totalPurchases || 0), 0).toLocaleString()}</td>
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
              <h3 className="font-bold text-xl">{formData.id ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}</h3>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-bold mb-1">اسم المورد</label><input required type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">رقم الهاتف</label><input type="text" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">البريد الإلكتروني</label><input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">الرقم الضريبي</label><input type="text" value={formData.tax_number || ''} onChange={e => setFormData({...formData, tax_number: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">العنوان</label><input type="text" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full border rounded-lg p-2" /></div>
              <div><label className="block text-sm font-bold mb-1">حد الائتمان</label><input type="number" step="any" value={formData.credit_limit || ''} onChange={e => setFormData({...formData, credit_limit: Number(e.target.value)})} className="w-full border rounded-lg p-2" placeholder="0" /></div>
              {!formData.id && <div><label className="block text-sm font-bold mb-1">الرصيد الافتتاحي (دائن)</label><input type="number" step="any" value={formData.opening_balance || ''} onChange={e => setFormData({...formData, opening_balance: Number(e.target.value)})} className="w-full border rounded-lg p-2" placeholder="0.00" /></div>}
              <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 mt-4">حفظ البيانات</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierManager;