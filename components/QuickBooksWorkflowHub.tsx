import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';
import { 
  Building2, ShoppingCart, Truck, Package, Users, Landmark, 
  BarChart3, FileText, Plus, Wallet, Banknote, Scale, 
  Calendar, Clock, RotateCcw, ShieldCheck, Layers, Scissors, 
  HardHat, CreditCard, ChevronLeft, ArrowLeft, ArrowDown, 
  ArrowUp, Sparkles, CheckCircle2, AlertCircle, TrendingUp, 
  DollarSign, Receipt, ChevronRight, Activity, Search,
  ExternalLink, FileSpreadsheet, Eye, RefreshCw
} from 'lucide-react';

interface WorkflowNodeProps {
  title: string;
  subTitle?: string;
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  colorClass: string;
  badge?: number | string;
  badgeColor?: string;
  primary?: boolean;
}

const WorkflowNode: React.FC<WorkflowNodeProps> = ({
  title,
  subTitle,
  to,
  icon: Icon,
  colorClass,
  badge,
  badgeColor = 'bg-blue-600',
  primary = false
}) => {
  return (
    <Link
      to={to}
      className={`
        group relative flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-200
        ${primary 
          ? 'bg-white border-2 border-slate-200/90 hover:border-blue-500 shadow-sm hover:shadow-md hover:-translate-y-0.5' 
          : 'bg-white/80 hover:bg-white border border-slate-200/70 hover:border-slate-300 shadow-2xs hover:shadow-xs'}
        min-w-[90px] max-w-[130px] flex-1 text-center cursor-pointer select-none
      `}
      title={`${title} ${subTitle ? `(${subTitle})` : ''}`}
    >
      {/* الشارة الرقمية للعمليات المعلقة إن وجدت */}
      {badge !== undefined && badge !== 0 && (
        <span className={`absolute -top-1.5 -right-1.5 ${badgeColor} text-white text-[10px] font-black px-1.5 py-0.2 rounded-full shadow-sm animate-pulse`}>
          {badge}
        </span>
      )}

      {/* حاوية الأيقونة */}
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-1.5 transition-transform group-hover:scale-110 shadow-2xs ${colorClass}`}>
        <Icon size={22} />
      </div>

      {/* العنوان العربي */}
      <span className="text-xs font-black text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-1 leading-tight">
        {title}
      </span>

      {/* العنوان الفرعي الإنجليزي */}
      {subTitle && (
        <span className="text-[10px] font-semibold text-slate-600 font-mono mt-0.5 truncate max-w-full">
          {subTitle}
        </span>
      )}
    </Link>
  );
};

// مكون السهم الأفقي الرابط بين المحطات
const FlowArrow: React.FC<{ label?: string }> = ({ label }) => {
  return (
    <div className="flex flex-col items-center justify-center px-1 text-slate-500 shrink-0">
      {label && <span className="text-[9px] font-bold text-slate-600 mb-0.5">{label}</span>}
      <div className="flex items-center">
        <div className="w-4 sm:w-6 h-[2px] bg-slate-400"></div>
        <ChevronLeft size={16} className="-mr-1 text-slate-500" />
      </div>
    </div>
  );
};

interface QuickBooksWorkflowHubProps {
  stats?: {
    monthSales?: number;
    monthPurchases?: number;
    receivables?: number;
    payables?: number;
    lowStockCount?: number;
  };
  onSwitchToAnalytics?: () => void;
}

export const QuickBooksWorkflowHub: React.FC<QuickBooksWorkflowHubProps> = ({
  stats,
  onSwitchToAnalytics
}) => {
  const { accounts, organization, invoices, purchaseInvoices, refreshData } = useAccounting();
  const { can } = useAuth();
  const navigate = useNavigate();

  // حساب الأرصدة اللحظية للخزائن والبنوك
  const liveBalances = useMemo(() => {
    let cashTotal = 0;
    let bankTotal = 0;

    (accounts || []).forEach(acc => {
      const code = String(acc.code || '');
      const name = String(acc.name || '');
      const bal = Number(acc.current_balance || acc.balance || 0);

      if (code.startsWith('123') || code.startsWith('10101') || name.includes('خزينة') || name.includes('صندوق') || name.includes('عهدة')) {
        cashTotal += bal;
      } else if (code.startsWith('121') || code.startsWith('10102') || name.includes('بنك') || name.includes('Bank')) {
        bankTotal += bal;
      }
    });

    return { cashTotal, bankTotal };
  }, [accounts]);

  // إحصائيات المعاملات المعلقة
  const draftInvoicesCount = useMemo(() => {
    return (invoices || []).filter(i => i.status === 'draft').length;
  }, [invoices]);

  const draftBillsCount = useMemo(() => {
    return (purchaseInvoices || []).filter(b => b.status === 'draft').length;
  }, [purchaseInvoices]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200" dir="rtl">
      
      {/* 🧭 ترويسة الواجهة العلوية مع زر التبديل والبيانات السريعة */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
            <Layers className="text-white w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">خريطة العمليات المتكاملة</h1>
              <span className="text-xs bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full border border-blue-400/30 font-bold">
                QuickBooks Style
              </span>
            </div>
            <p className="text-slate-300 text-xs sm:text-sm mt-0.5">
              مخطط دورة العمل اليومية، تدفق الفواتير، وحركات النقدية والمخازن — {organization?.name || 'TriPro ERP'}
            </p>
          </div>
        </div>

        {/* أزرار التبديل والإجراءات السريعة */}
        <div className="flex items-center gap-2 flex-wrap">
          {onSwitchToAnalytics && (
            <button
              type="button"
              onClick={onSwitchToAnalytics}
              className="bg-white/10 hover:bg-white/20 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/10 shadow-xs cursor-pointer"
              title="التبديل إلى لوحة المؤشرات والرسوم البيانية"
            >
              <BarChart3 size={15} className="text-sky-300" />
              <span>لوحة التحليلات والرسوم</span>
            </button>
          )}

          <Link
            to="/general-journal?new=1"
            className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
          >
            <Plus size={15} />
            <span>قيد يومية سريع</span>
          </Link>

          <button
            type="button"
            onClick={() => refreshData()}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 transition-colors cursor-pointer"
            title="تحديث البيانات اللحظية"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* 🧩 تقسيم الشاشة الرئيسي: مسارات العمل (يمين/وسط) + لوحة المؤشرات السريعة (يسار) */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        
        {/* 🗺️ لوحة المربعات والمستطيلات التفاعلية (QuickBooks Canvas) */}
        <div className="xl:col-span-3 space-y-6">

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* المستطيل 1: دورة الموردين والمشتريات (Vendors & Payables Flow)     */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <Truck size={18} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">الموردون والمشتريات</h2>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Vendors & Payables</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link 
                  to="/suppliers"
                  className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1"
                >
                  <Users size={13} />
                  <span>دليل الموردين</span>
                </Link>
                <Link 
                  to="/supplier-statement"
                  className="text-xs text-slate-600 hover:text-slate-800 font-semibold"
                >
                  كشف الحساب
                </Link>
              </div>
            </div>

            {/* مسار التدفق الرئيسي بالأسهم */}
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2 no-scrollbar">
              <WorkflowNode 
                title="أمر شراء"
                subTitle="Purchase Order"
                to="/purchase-orders-list"
                icon={Plus}
                colorClass="bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="إذن استلام"
                subTitle="Receive Goods (GRN)"
                to="/goods-receipt"
                icon={Package}
                colorClass="bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="فاتورة شراء"
                subTitle="Enter Bill"
                to="/purchase-invoices-list"
                icon={FileText}
                colorClass="bg-amber-100 text-amber-800 group-hover:bg-amber-600 group-hover:text-white"
                badge={draftBillsCount}
                badgeColor="bg-amber-600"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="سداد المورد"
                subTitle="Pay Bill"
                to="/payment-vouchers-list"
                icon={Banknote}
                colorClass="bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white"
                primary
              />
            </div>

            {/* العمليات الفرعية للمشتريات */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-slate-600 font-bold text-[11px]">عمليات تكميلية:</span>
              <Link 
                to="/purchase-invoice"
                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <Plus size={12} /> فاتورة شراء جديدة
              </Link>
              <Link 
                to="/purchase-return"
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <RotateCcw size={12} /> مرتجع مشتريات
              </Link>
              <Link 
                to="/supplier-reconciliation"
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <Scale size={12} /> مطابقة أرصدة الموردين
              </Link>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* المستطيل 2: دورة العملاء والمبيعات (Customers & Receivables Flow)    */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">العملاء والمبيعات</h2>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Customers & Sales</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link 
                  to="/customers"
                  className="text-xs text-blue-700 hover:text-blue-800 font-bold flex items-center gap-1"
                >
                  <Users size={13} />
                  <span>دليل العملاء</span>
                </Link>
                <Link 
                  to="/customer-statement"
                  className="text-xs text-slate-600 hover:text-slate-800 font-semibold"
                >
                  كشف الحساب
                </Link>
              </div>
            </div>

            {/* مسار التدفق الرئيسي بالأسهم */}
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2 no-scrollbar">
              <WorkflowNode 
                title="عرض أسعار"
                subTitle="Estimate / Quote"
                to="/quotations-list"
                icon={FileText}
                colorClass="bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="أمر بيع"
                subTitle="Sales Order"
                to="/sales-orders-list"
                icon={Plus}
                colorClass="bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="فاتورة مبيعات"
                subTitle="Create Invoice"
                to="/invoices-list"
                icon={Receipt}
                colorClass="bg-blue-100 text-blue-800 group-hover:bg-blue-600 group-hover:text-white"
                badge={draftInvoicesCount}
                badgeColor="bg-blue-600"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="سند قبض"
                subTitle="Receive Payment"
                to="/receipt-vouchers-list"
                icon={Banknote}
                colorClass="bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="إيداع بنكي"
                subTitle="Record Deposit"
                to="/banking"
                icon={Landmark}
                colorClass="bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white"
                primary
              />
            </div>

            {/* العمليات الفرعية ونقاط البيع */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-slate-600 font-bold text-[11px]">نقاط البيع والفواتير:</span>
              <Link 
                to="/sales-invoice"
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <Plus size={12} /> فاتورة بيع جديدة
              </Link>
              <Link 
                to="/retail-pos"
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors inline-flex items-center gap-1 shadow-2xs"
              >
                <ShoppingCart size={12} /> كاشير المحلات (POS)
              </Link>
              <Link 
                to="/pos"
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-colors inline-flex items-center gap-1 shadow-2xs"
              >
                <Receipt size={12} /> كاشير المطاعم
              </Link>
              <Link 
                to="/eta-invoices"
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <Landmark size={12} /> الفاتورة الإلكترونية (ETA)
              </Link>
              <Link 
                to="/sales-return"
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <RotateCcw size={12} /> مرتجع مبيعات
              </Link>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* المستطيل 3: الشركة والمخازن والتصنيع (Inventory & Manufacturing)   */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Package size={18} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">الشركة والمخازن والتصنيع</h2>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Company, Items & Production</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link 
                  to="/products"
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1"
                >
                  <Package size={13} />
                  <span>دليل الأصناف</span>
                </Link>
                <Link 
                  to="/stock-card"
                  className="text-xs text-slate-600 hover:text-slate-800 font-semibold"
                >
                  كارت الصنف
                </Link>
              </div>
            </div>

            {/* مسار التدفق الرئيسي بالأسهم */}
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2 no-scrollbar">
              <WorkflowNode 
                title="دليل الحسابات"
                subTitle="Chart of Accounts"
                to="/accounts"
                icon={Landmark}
                colorClass="bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="كروت الأصناف"
                subTitle="Items & Services"
                to="/products"
                icon={Package}
                colorClass="bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="معادلات التصنيع"
                subTitle="BOM / Recipes"
                to="/mfg/boms"
                icon={Scissors}
                colorClass="bg-teal-50 text-teal-700 group-hover:bg-teal-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="أوامر الإنتاج"
                subTitle="Work Orders"
                to="/mfg/work-orders"
                icon={HardHat}
                colorClass="bg-teal-100 text-teal-800 group-hover:bg-teal-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="التحويل المخزني"
                subTitle="Stock Transfer"
                to="/stock-transfers-list"
                icon={Truck}
                colorClass="bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white"
                primary
              />
            </div>

            {/* العمليات الفرعية */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-slate-600 font-bold text-[11px]">عمليات داعمة:</span>
              <Link 
                to="/inventory-dashboard"
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <Layers size={12} /> أرصدة وجرد المخازن
              </Link>
              <Link 
                to="/assets"
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <Landmark size={12} /> الأصول الثابتة والإهلاك
              </Link>
              <Link 
                to="/uom"
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <Scale size={12} /> وحدات القياس (UOM)
              </Link>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* المستطيل 4: الموارد البشرية والرواتب (Employees & Payroll Flow)    */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                  <Users size={18} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">الموارد البشرية والرواتب</h2>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Employees & Payroll</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link 
                  to="/hr/employees"
                  className="text-xs text-purple-700 hover:text-purple-800 font-bold flex items-center gap-1"
                >
                  <Users size={13} />
                  <span>دليل الموظفين</span>
                </Link>
                <Link 
                  to="/hr/advances"
                  className="text-xs text-slate-600 hover:text-slate-800 font-semibold"
                >
                  سلف الموظفين
                </Link>
              </div>
            </div>

            {/* مسار التدفق الرئيسي بالأسهم */}
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2 no-scrollbar">
              <WorkflowNode 
                title="سجل الموظفين"
                subTitle="Employee Master"
                to="/hr/employees"
                icon={Users}
                colorClass="bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="حضور وانصراف"
                subTitle="Time & Shifts"
                to="/hr/attendance"
                icon={Clock}
                colorClass="bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="سلف الموظفين"
                subTitle="Advances"
                to="/hr/advances"
                icon={Banknote}
                colorClass="bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="مسير الرواتب"
                subTitle="Run Payroll"
                to="/hr/payroll"
                icon={FileText}
                colorClass="bg-purple-100 text-purple-800 group-hover:bg-purple-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="صرف الرواتب"
                subTitle="Disbursement"
                to="/hr/disbursement"
                icon={Wallet}
                colorClass="bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white"
                primary
              />
            </div>

            {/* العمليات الفرعية */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-slate-600 font-bold text-[11px]">شؤون العمل:</span>
              <Link 
                to="/hr/leaves"
                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <Calendar size={12} /> إدارة الإجازات
              </Link>
              <Link 
                to="/hr/end-of-service"
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <Scale size={12} /> مكافأة نهاية الخدمة
              </Link>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* المستطيل 5: البنوك والخزينة والقيود (Banking & General Ledger)       */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                  <Landmark size={18} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">البنوك والخزينة وقيود اليومية</h2>
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Banking, Cash & Ledger</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link 
                  to="/general-journal"
                  className="text-xs text-rose-700 hover:text-rose-800 font-bold flex items-center gap-1"
                >
                  <FileText size={13} />
                  <span>دفتر اليومية العامة</span>
                </Link>
                <Link 
                  to="/trial-balance-advanced"
                  className="text-xs text-slate-600 hover:text-slate-800 font-semibold"
                >
                  ميزان المراجعة
                </Link>
              </div>
            </div>

            {/* مسار التدفق الرئيسي بالأسهم */}
            <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2 no-scrollbar">
              <WorkflowNode 
                title="الخزائن النقدية"
                subTitle="Cash On Hand"
                to="/treasury"
                icon={Wallet}
                colorClass="bg-rose-50 text-rose-700 group-hover:bg-rose-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="دفتر الشيكات"
                subTitle="Cheque Register"
                to="/cheques"
                icon={CreditCard}
                colorClass="bg-rose-50 text-rose-700 group-hover:bg-rose-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="الحسابات البنكية"
                subTitle="Bank Accounts"
                to="/banking"
                icon={Landmark}
                colorClass="bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="تسوية البنك"
                subTitle="Reconciliation"
                to="/bank-reconciliation"
                icon={Scale}
                colorClass="bg-rose-50 text-rose-700 group-hover:bg-rose-600 group-hover:text-white"
                primary
              />

              <FlowArrow />

              <WorkflowNode 
                title="قيود اليومية"
                subTitle="Journal Entries"
                to="/general-journal"
                icon={FileText}
                colorClass="bg-rose-100 text-rose-800 group-hover:bg-rose-600 group-hover:text-white"
                primary
              />
            </div>

            {/* القوائم الختامية */}
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-slate-600 font-bold text-[11px]">القوائم المالية:</span>
              <Link 
                to="/income-statement"
                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <BarChart3 size={12} /> قائمة الدخل (P&L)
              </Link>
              <Link 
                to="/balance-sheet"
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <Landmark size={12} /> الميزانية العمومية
              </Link>
              <Link 
                to="/internal-transfer"
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-colors inline-flex items-center gap-1"
              >
                <RotateCcw size={12} /> تحويل مالي داخلي
              </Link>
            </div>
          </div>

        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* اللوحة الجانبية السريعة (Quick Insights & Balances Dock)             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="xl:col-span-1 space-y-4">

          {/* 1. أرصدة الحسابات النقدية والبنكية اللحظية */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Wallet size={15} className="text-emerald-600" />
                <span>أرصدة الخزائن والبنوك</span>
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>

            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-emerald-800 block">نقدية الخزائن والصناديق</span>
                  <span className="text-xs text-emerald-600 font-medium">Cash On Hand</span>
                </div>
                <span className="text-sm font-black text-emerald-700">
                  {liveBalances.cashTotal.toLocaleString()} ج.م
                </span>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-blue-800 block">الحسابات البنكية</span>
                  <span className="text-xs text-blue-600 font-medium">Bank Accounts</span>
                </div>
                <span className="text-sm font-black text-blue-700">
                  {liveBalances.bankTotal.toLocaleString()} ج.م
                </span>
              </div>

              {stats && (
                <>
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-100 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-amber-800 block">مديونيات العملاء</span>
                      <span className="text-xs text-amber-600 font-medium">Receivables (A/R)</span>
                    </div>
                    <span className="text-sm font-black text-amber-700">
                      {(stats.receivables || 0).toLocaleString()} ج.م
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-100 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-rose-800 block">مستحقات الموردين</span>
                      <span className="text-xs text-rose-600 font-medium">Payables (A/P)</span>
                    </div>
                    <span className="text-sm font-black text-rose-700">
                      {(stats.payables || 0).toLocaleString()} ج.م
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 2. مهام وتنبيهات تنتظر الإجراء (Reminders & Alerts) */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <AlertCircle size={15} className="text-amber-600" />
                <span>مهام وتنبيهات معلقة</span>
              </span>
              <span className="text-[10px] font-bold text-slate-500">تحديث فوري</span>
            </div>

            <div className="space-y-2 text-xs">
              <Link
                to="/invoices-list"
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-slate-700 font-bold">فواتير بيع مسودة</span>
                </div>
                <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {draftInvoicesCount}
                </span>
              </Link>

              <Link
                to="/purchase-invoices-list"
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-slate-100"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span className="text-slate-700 font-bold">فواتير شراء مسودة</span>
                </div>
                <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  {draftBillsCount}
                </span>
              </Link>

              {stats && (stats.lowStockCount || 0) > 0 && (
                <Link
                  to="/products"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/60 hover:bg-rose-100/60 transition-colors border border-rose-100"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                    <span className="text-rose-800 font-bold">أصناف قاربت النفاد</span>
                  </div>
                  <span className="font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                    {stats.lowStockCount}
                  </span>
                </Link>
              )}
            </div>
          </div>

          {/* 3. اختصارات الشاشات الأكثر استخداماً */}
          <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-4 shadow-sm space-y-3">
            <span className="text-xs font-black flex items-center gap-1.5 text-sky-300">
              <Sparkles size={14} />
              <span>إنشاء سريع ومباشر</span>
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <Link
                to="/sales-invoice"
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors font-bold text-center block"
              >
                + فاتورة بيع
              </Link>
              <Link
                to="/purchase-invoice"
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors font-bold text-center block"
              >
                + فاتورة شراء
              </Link>
              <Link
                to="/receipt-voucher"
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors font-bold text-center block"
              >
                + سند قبض
              </Link>
              <Link
                to="/payment-voucher"
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors font-bold text-center block"
              >
                + سند صرف
              </Link>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

export default QuickBooksWorkflowHub;
