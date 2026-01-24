import React, { useState, useMemo } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { FileText, Calendar, Download, Printer, Filter, Calculator, ArrowRightLeft, Lock, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import ReportHeader from '../../components/ReportHeader';

const TaxReturnReport = () => {
    const { accounts, getAccountBalanceInPeriod, settings, addEntry } = useAccounting();
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [closing, setClosing] = useState(false);

    const reportData = useMemo(() => {
        // البحث عن حسابات الضريبة
        // 2231: ضريبة المخرجات (التزام - دائن) - الدليل المصري
        const outputVatAcc = accounts.find(a => a.code === '2231' || a.code === '2103');
        // 1241: ضريبة المدخلات (أصل - مدين) - الدليل المصري
        const inputVatAcc = accounts.find(a => a.code === '1241' || a.code === '1205');

        if (!outputVatAcc || !inputVatAcc) return null;

        // حساب الحركات خلال الفترة
        const outputVatAmount = getAccountBalanceInPeriod(outputVatAcc.id, startDate, endDate);
        const inputVatAmount = getAccountBalanceInPeriod(inputVatAcc.id, startDate, endDate);

        // صافي الضريبة المستحقة = المخرجات (المحصلة) - المدخلات (المدفوعة)
        const netVat = outputVatAmount - inputVatAmount;

        return {
            outputVatAmount,
            inputVatAmount,
            netVat,
            outputVatAcc,
            inputVatAcc
        };
    }, [accounts, startDate, endDate, getAccountBalanceInPeriod]);

    const handleExport = () => {
        if (!reportData) return;
        const data = [
            ['الإقرار الضريبي (VAT Return)'],
            [`الفترة من: ${startDate} إلى: ${endDate}`],
            [''],
            ['البند', 'القيمة'],
            ['ضريبة المخرجات (المبيعات) - مستحق عليك', reportData.outputVatAmount],
            ['ضريبة المدخلات (المشتريات) - مستحق لك', reportData.inputVatAmount],
            ['صافي الضريبة المستحقة', reportData.netVat],
            ['', ''],
            ['الحالة', reportData.netVat >= 0 ? 'مستحق للدفع' : 'رصيد دائن (استرداد)']
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Tax Return");
        XLSX.writeFile(wb, `Tax_Return_${startDate}_${endDate}.xlsx`);
    };

    const handleClosePeriod = async () => {
        if (!reportData) return;
        if (window.confirm('هل أنت متأكد من إغلاق الفترة الضريبية؟\nسيتم إنشاء قيد تسوية آلي يصفر حسابات الضريبة ويرحل الفرق لحساب التسوية (2105).')) {
            setClosing(true);
            try {
                let settlementAcc = accounts.find(a => a.code === '2239' || a.code === '2105'); // 2239: تسوية ضرائب (مقترح)
                if (!settlementAcc) {
                     alert('لم يتم العثور على حساب تسوية الضرائب (2239 أو 2105). يرجى إضافته في دليل الحسابات أولاً.');
                     setClosing(false);
                     return;
                }

                const description = `إغلاق الفترة الضريبية من ${startDate} إلى ${endDate}`;
                const lines = [];

                // 1. إقفال ضريبة المخرجات (هي دائنة بطبيعتها، نقفلها بالمدين)
                if (reportData.outputVatAmount > 0) {
                    lines.push({ 
                        accountId: reportData.outputVatAcc.id, 
                        debit: reportData.outputVatAmount, 
                        credit: 0, 
                        description: 'إقفال ضريبة المخرجات' 
                    });
                }

                // 2. إقفال ضريبة المدخلات (هي مدينة بطبيعتها، نقفلها بالدائن)
                if (reportData.inputVatAmount > 0) {
                    lines.push({ 
                        accountId: reportData.inputVatAcc.id, 
                        debit: 0, 
                        credit: reportData.inputVatAmount, 
                        description: 'إقفال ضريبة المدخلات' 
                    });
                }

                // 3. تسوية الفرق (المتمم)
                // إذا كان صافي الضريبة موجب (مخرجات > مدخلات) -> التزام علينا -> دائن في حساب التسوية
                if (reportData.netVat > 0) {
                    lines.push({ 
                        accountId: settlementAcc.id, 
                        debit: 0, 
                        credit: reportData.netVat, 
                        description: 'مستحق لهيئة الزكاة والضريبة (صافي الإقرار)' 
                    });
                } 
                // إذا كان صافي الضريبة سالب (مدخلات > مخرجات) -> رصيد لنا -> مدين في حساب التسوية
                else if (reportData.netVat < 0) {
                    lines.push({ 
                        accountId: settlementAcc.id, 
                        debit: Math.abs(reportData.netVat), 
                        credit: 0, 
                        description: 'رصيد دائن (استرداد) من الهيئة' 
                    });
                }

                if (lines.length > 0) {
                    // التحقق من التوازن قبل الإرسال (للاطمئنان فقط)
                    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
                    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
                    
                    if (Math.abs(totalDebit - totalCredit) > 0.01) {
                        throw new Error(`خطأ في حساب القيد: القيد غير متوازن (مدين: ${totalDebit}, دائن: ${totalCredit})`);
                    }

                    await addEntry({ 
                        date: endDate, 
                        description: description, 
                        reference: `VAT-CLOSE-${endDate.replace(/-/g, '')}`, 
                        status: 'posted', 
                        lines: lines 
                    });
                    alert('تم إنشاء قيد الإغلاق بنجاح ✅');
                } else {
                    alert('لا توجد مبالغ لإنشاء قيد إغلاق.');
                }
            } catch (error: any) {
                alert('حدث خطأ: ' + error.message);
            } finally {
                setClosing(false);
            }
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 animate-in fade-in space-y-6 print:p-0">
            <ReportHeader title="الإقرار الضريبي (VAT Return)" subtitle={`عن الفترة من ${startDate} إلى ${endDate}`} />
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Calculator className="text-blue-600" /> الإقرار الضريبي</h1>
                    <p className="text-slate-500">حساب ضريبة القيمة المضافة (VAT) للفترة المحددة</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleClosePeriod} disabled={closing || !reportData} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 font-bold text-sm shadow-sm disabled:opacity-50">
                        {closing ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />} إغلاق الفترة
                    </button>
                    <button onClick={handleExport} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm shadow-sm"><Download size={16} /> تصدير Excel</button>
                    <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 font-bold text-sm shadow-sm"><Printer size={16} /> طباعة</button>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 no-print">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1">
                        <label className="block text-sm font-bold text-slate-700 mb-1">من تاريخ</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-bold text-slate-700 mb-1">إلى تاريخ</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                    </div>
                </div>
            </div>
            {reportData ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-800 text-center">ملخص الإقرار الضريبي</h3>
                        <p className="text-center text-slate-500 text-sm mt-1">عن الفترة من {startDate} إلى {endDate}</p>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="flex justify-between items-center p-4 bg-red-50 rounded-xl border border-red-100">
                            <div><h4 className="font-bold text-red-800">ضريبة المخرجات (المبيعات)</h4><p className="text-xs text-red-600 mt-1">المبلغ المحصل من العملاء (التزام عليك)</p></div>
                            <div className="text-2xl font-black text-red-700">{reportData.outputVatAmount.toLocaleString()} <span className="text-sm font-medium">{settings.currency}</span></div>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                            <div><h4 className="font-bold text-emerald-800">ضريبة المدخلات (المشتريات)</h4><p className="text-xs text-emerald-600 mt-1">المبلغ المدفوع للموردين (قابل للاسترداد)</p></div>
                            <div className="text-2xl font-black text-emerald-700">{reportData.inputVatAmount.toLocaleString()} <span className="text-sm font-medium">{settings.currency}</span></div>
                        </div>
                        <div className="relative py-4"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200 border-dashed"></div></div><div className="relative flex justify-center"><span className="bg-white px-4 text-slate-400"><ArrowRightLeft size={20} /></span></div></div>
                        <div className={`flex justify-between items-center p-6 rounded-2xl border-2 ${reportData.netVat >= 0 ? 'bg-slate-800 border-slate-900 text-white' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
                            <div><h4 className="font-bold text-lg">صافي الضريبة المستحقة</h4><p className={`text-sm mt-1 ${reportData.netVat >= 0 ? 'text-slate-400' : 'text-blue-600'}`}>{reportData.netVat >= 0 ? 'مبلغ واجب السداد للهيئة' : 'رصيد دائن (استرداد من الهيئة)'}</p></div>
                            <div className="text-4xl font-black">{Math.abs(reportData.netVat).toLocaleString()} <span className="text-lg font-medium">{settings.currency}</span></div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500">لم يتم العثور على حسابات الضريبة (2231, 1241). يرجى التأكد من دليل الحسابات.</div>
            )}
        </div>
    );
};
export default TaxReturnReport;
