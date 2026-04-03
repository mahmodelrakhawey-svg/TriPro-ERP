import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AccountingProvider, useAccounting } from './context/AccountingContext';
import { ToastProvider } from './context/ToastContext';
import NotificationScheduler from './services/NotificationScheduler';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import DraftJournalsList from './components/DraftJournalsList';
import GeneralJournal from './modules/accounting/GeneralJournal';
import GeneralLedger from './modules/accounting/GeneralLedger';
import JournalEntryForm from './modules/accounting/JournalEntryForm';
import IncomeStatement from './modules/accounting/IncomeStatement';
import BalanceSheet from './modules/accounting/BalanceSheet';
import CashFlowStatement from './modules/accounting/CashFlowStatement';
import CashFlowReport from './modules/accounting/CashFlowReport';
import AccountingDashboard from './modules/accounting/AccountingDashboard';
import JournalEntriesExport from './modules/accounting/JournalEntriesExport';
import AccountList from './modules/accounting/AccountList';
import ImportantReports from './modules/reports/ImportantReports';
import SalesReports from './modules/sales/SalesReports';
import Reports from './modules/reports/Reports';
import PurchaseReports from './modules/purchases/PurchaseReports';
import SalesInvoiceForm from './modules/sales/SalesInvoiceForm';
import InvoiceList from './modules/sales/InvoiceList';
import SalesReturnForm from './modules/sales/SalesReturnForm';
import PurchaseInvoiceForm from './modules/purchases/PurchaseInvoiceForm';
import PurchaseReturnForm from './modules/purchases/PurchaseReturnForm';
import StockAdjustmentForm from './modules/inventory/StockAdjustmentForm';
import InventoryCountForm from './modules/inventory/InventoryCountForm';
import InventoryCountList from './modules/inventory/InventoryCountList';
import StockCard from './modules/inventory/StockCard';
import CustomerManager from './modules/sales/CustomerManager';
import OpeningInventory from './modules/inventory/OpeningInventory';
import CustomerStatement from './modules/sales/CustomerStatement';
import CustomerAgingReport from './modules/sales/CustomerAgingReport';
import SupplierManager from './modules/purchases/SupplierManager';
import SupplierStatement from './modules/purchases/SupplierStatement';
import SupplierAgingReport from './modules/purchases/SupplierAgingReport';
import SupplierBalanceReconciliation from './modules/purchases/SupplierBalanceReconciliation';
import ItemMovementReport from './modules/inventory/ItemMovementReport';
import TopSellingReport from './modules/inventory/TopSellingReport';
import SlowMovingReport from './modules/inventory/SlowMovingReport';
import ItemProfitReport from './modules/inventory/ItemProfitReport';
import ProductManager from './modules/inventory/ProductManager';
import ReceiptVoucherForm from './modules/finance/ReceiptVoucherForm';
import InventoryRevaluation from './modules/inventory/InventoryRevaluation';
import StockMovementCostReport from './modules/inventory/StockMovementCostReport';
import ReceiptVoucherList from './modules/finance/ReceiptVoucherList';
import PaymentVoucherForm from './modules/finance/PaymentVoucherForm';
import WastageManager from './modules/inventory/WastageManager';
import InventoryDashboard from './modules/inventory/InventoryDashboard';
import PaymentVoucherList from './modules/finance/PaymentVoucherList';
import ExpenseVoucherForm from './modules/finance/ExpenseVoucherForm';
import CustomerDepositForm from './modules/finance/CustomerDepositForm';
import TransferForm from './modules/finance/TransferForm';
import StockTransfer from './modules/inventory/StockTransfer';
import StockTransferList from './modules/inventory/StockTransferList';
import WarehouseManager from './modules/inventory/WarehouseManager';
import BankReconciliationForm from './modules/finance/BankReconciliationForm';
import CashClosingForm from './modules/finance/CashClosingForm';
import DeficitReport from './modules/reports/DeficitReport';
import Login from './components/Login';
import UserManager from './components/UserManager';
import Settings from './components/Settings';
import { ChequesPage } from './modules/banking/ChequesPage';
import AssetManager from './modules/assets/AssetManager';
import EmployeeManager from './modules/hr/EmployeeManager';
import PayrollRun from './modules/hr/PayrollRun';
import EmployeeAdvances from './modules/hr/EmployeeAdvances';
import PayrollReport from './modules/hr/PayrollReport';
import EmployeeStatement from './modules/hr/EmployeeStatement';
import EmployeeReports from './modules/hr/EmployeeReports';
import ManufacturingManager from './modules/manufacturing/ManufacturingManager';
import QuotationForm from './modules/sales/QuotationForm';
import QuotationList from './modules/sales/QuotationList';
import CreditNoteForm from './modules/sales/CreditNoteForm';
import CreditNoteList from './modules/sales/CreditNoteList';
import DebitNoteForm from './modules/purchases/DebitNoteForm';
import DebitNoteList from './modules/purchases/DebitNoteList';
import PurchaseOrderForm from './modules/purchases/PurchaseOrderForm';
import PurchaseOrderList from './modules/purchases/PurchaseOrderList';
import PurchaseInvoiceList from './modules/purchases/PurchaseInvoiceList';
import FinancialRatios from './modules/reports/FinancialRatios';
import NetPurchasesReport from './modules/purchases/NetPurchasesReport';
import ExpenseAnalysisReport from './modules/reports/ExpenseAnalysisReport';
import BudgetManager from './modules/accounting/BudgetManager';
import BudgetVarianceReport from './modules/accounting/BudgetVarianceReport';
import FiscalYearClosing from './modules/accounting/FiscalYearClosing';
import TrialBalanceAdvanced from './modules/accounting/TrialBalanceAdvanced';
import ItemSalesAnalysis from './modules/reports/ItemSalesAnalysis';
import PurchaseAnalysisReport from './modules/purchases/PurchaseAnalysisReport';
import ProductionCostAnalysis from './modules/reports/ProductionCostAnalysis';
import SecurityLogs from './components/SecurityLogs';
import UserProfile from './components/UserProfile';
import PermissionsManager from './modules/admin/PermissionsManager';
import Maintenance from './components/Maintenance';
import TaxReturnReport from './modules/reports/TaxReturnReport';
import PerformanceComparisonReport from './modules/reports/PerformanceComparisonReport';
import RecycleBin from './modules/admin/RecycleBin';
import SaasAdmin from './components/SaasAdmin';
import DataMigrationCenter from './modules/admin/DataMigrationCenter';
import MultiCurrencyStatement from './modules/reports/MultiCurrencyStatement';
import PaymentMethodReport from './modules/reports/PaymentMethodReport';
import UserGuide from './components/UserGuide';
import AttachmentsReport from './modules/reports/AttachmentsReport';
import DetailedStockMovementReport from './modules/inventory/DetailedStockMovementReport';
import WorkOrderManager from './modules/manufacturing/WorkOrderManager';
import { Landmark, X, Info } from 'lucide-react';
import About from './components/About';
import { DemoTour } from './components/DemoTour';
import LandingPage from './components/LandingPage';
import OfferBeneficiariesReport from './modules/sales/OfferBeneficiariesReport';
import GuestMenuLayout from './components/GuestMenuLayout';
import ChequeMovementReport from './modules/banking/ChequeMovementReport';
import ReturnedChequesReport from './modules/banking/ReturnedChequesReport';
import RestaurantSalesReport from './modules/reports/RestaurantSalesReport';
import SupplierBalancesReport from './modules/purchases/SupplierBalancesReport';
import PosScreen from './components/PosScreen'; // تأكد من المسار الصحيح
import KdsScreen from './components/KdsScreen'; // إضافة شاشة المطبخ
import KitchenEndDayCount from './modules/inventory/KitchenEndDayCount'; // إضافة جرد المطبخ
import SalesByUserReport from './modules/reports/SalesByUserReport';
import WastageAnalysisReport from './modules/reports/WastageAnalysisReport'; // تأكد من أن الملف في هذا المسار
import RestaurantProfitReport from './modules/reports/RestaurantProfitReport'; // إضافة تقرير الربحية
import { OfflineSyncProvider } from './components/OfflineSyncProvider';
import CustomerDisplay from './components/CustomerDisplay';

// إنشاء عميل React Query
const queryClient = new QueryClient();

const PrintHeader = () => {
    const { settings } = useAccounting();
    return (
        <div className="hidden print:block fixed top-0 left-0 right-0 p-4 bg-white z-[100]">
            <div className="flex justify-between items-center border-b-2 border-blue-900 pb-2">
                <div className="text-right">
                    <h1 className="text-lg font-bold">{settings.companyName}</h1>
                    <p className="text-xs text-slate-500">تقرير مطبوع بتاريخ: {new Date().toLocaleDateString('ar-EG')}</p>
                </div>
                {settings.logoUrl ? (
                    <img src={settings.logoUrl} alt="Company Logo" className="w-24 h-24 object-contain" />
                ) : (
                    <img src="/logo.jpg" alt="Company Logo" className="w-24 h-24 object-contain" />
                )}
            </div>
        </div>
    );
};

const PrintFooter = () => (
    <div className="hidden print:block fixed bottom-0 left-0 right-0 p-4 bg-white text-center text-xs text-slate-400 border-t border-slate-200">
        <p>هذا المستند تم إنشاؤه بواسطة نظام TriPro ERP | الصفحة <span className="page-number"></span> من <span className="total-pages"></span></p>
    </div>
);

const DemoBanner = () => {
    const { currentUser } = useAccounting();
    if (currentUser?.role !== 'demo') return null;
    return (
        <div className="bg-amber-500 text-white text-center py-1 px-4 text-sm font-bold fixed top-0 left-0 right-0 z-[110] print:hidden">
            🚧 نسخة تجريبية – البيانات غير حقيقية – يمنع استخدامها محاسبيًا 🚧
        </div>
    );
};

const DemoWelcomeModal = () => {
    const { currentUser } = useAccounting();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (currentUser?.role === 'demo') {
            // التحقق مما إذا كان المستخدم قد رأى الرسالة في هذه الجلسة
            const hasSeen = sessionStorage.getItem('demo_welcome_seen');
            if (!hasSeen) {
                setIsOpen(true);
                sessionStorage.setItem('demo_welcome_seen', 'true');
            }
        }
    }, [currentUser]);

    const startTour = () => {
        setIsOpen(false);
        window.dispatchEvent(new Event('start-demo-tour'));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
                <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-8 text-white text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-white/10 opacity-30 transform -skew-y-12 scale-150"></div>
                    <Landmark size={48} className="mx-auto mb-4 relative z-10 opacity-90" />
                    <h2 className="text-2xl font-black mb-2 relative z-10">مرحباً بك في النسخة التجريبية 👋</h2>
                    <p className="opacity-90 text-sm font-medium relative z-10">استكشف نظام TriPro ERP بكل حرية</p>
                </div>
                <div className="p-8 space-y-6">
                    <p className="text-slate-600 font-medium leading-relaxed text-center text-sm">
                        هذه نسخة مخصصة للتجربة. يمكنك إضافة فواتير، قيود، وعملاء، ولكن يرجى الانتباه للقيود التالية:
                    </p>
                    <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex items-start gap-3 text-sm text-slate-700">
                            <div className="bg-red-100 text-red-600 p-1 rounded-full mt-0.5 shrink-0"><X size={12} /></div>
                            <span className="font-bold text-xs">حذف البيانات الأساسية معطل.</span>
                        </div>
                        <div className="flex items-start gap-3 text-sm text-slate-700">
                            <div className="bg-red-100 text-red-600 p-1 rounded-full mt-0.5 shrink-0"><X size={12} /></div>
                            <span className="font-bold text-xs">تغيير إعدادات النظام معطل.</span>
                        </div>
                        <div className="flex items-start gap-3 text-sm text-slate-700">
                            <div className="bg-blue-100 text-blue-600 p-1 rounded-full mt-0.5 shrink-0"><Info size={12} /></div>
                            <span className="font-bold text-xs">يتم إعادة ضبط البيانات كل 24 ساعة.</span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={startTour}
                            className="flex-1 bg-blue-600 text-white py-3.5 rounded-xl font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
                        >
                            ابدأ جولة تعريفية 🌟
                        </button>
                        <button 
                            onClick={() => setIsOpen(false)}
                            className="flex-1 bg-slate-100 text-slate-700 py-3.5 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95"
                        >
                            تخطي
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DemoWatermark = () => {
    const { currentUser } = useAccounting();
    if (currentUser?.role !== 'demo') return null;

    return (
        <div className="hidden print:flex fixed inset-0 z-[50] items-center justify-center pointer-events-none h-screen w-screen">
            <div className="transform -rotate-45 text-slate-500 text-[8rem] font-black opacity-10 border-8 border-slate-500 p-12 rounded-3xl select-none whitespace-nowrap">
                نسخة تجريبية
            </div>
        </div>
    );
};

const SuspendedScreen = ({ message }: { message?: string }) => (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center" dir="rtl">
        <div className="bg-white p-10 rounded-3xl shadow-xl border border-rose-100 max-w-md w-full">
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6"><X className="text-rose-600" size={40} /></div>
            <h1 className="text-2xl font-black text-slate-800 mb-2">عذراً، هذا الحساب متوقف</h1>
            <p className="text-slate-500 mb-6 font-medium">
                {message || "يرجى التواصل مع إدارة TriPro ERP لتفعيل اشتراككم والعودة للعمل."}
            </p>
            <button onClick={() => supabase.auth.signOut()} className="w-full bg-slate-100 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">تسجيل الخروج</button>
        </div>
    </div>
);

const ModuleGuard = ({ module, children }: { module: string, children: React.ReactNode }) => {
    const { organization, currentUser, isLoading } = useAccounting();
    
    // إذا كان هناك مستخدم مسجل بالفعل، لا نغلق الشاشة أثناء تحديث البيانات في الخلفية
    if (isLoading && !currentUser) return null;

    const role = currentUser?.role || '';
    const isSuperAdmin = role === 'super_admin';
    const isDemo = role === 'demo';
    const allowedModules = (organization as any)?.allowed_modules || [];
    
    const expiryDate = (organization as any)?.subscription_expiry;
    const isExpired = expiryDate && expiryDate < new Date().toISOString().split('T')[0];

    if (organization && ((organization as any).is_active === false || isExpired) && !isSuperAdmin) {
        const message = (organization as any).suspension_reason || (isExpired ? "لقد انتهت فترة اشتراككم. يرجى التجديد للمتابعة." : undefined);
        return <SuspendedScreen message={message} />;
    }

    const isAllowed = isSuperAdmin || isDemo || (organization && (allowedModules.includes(module) || allowedModules.length === 0));

    if (!isAllowed) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

const MainLayout = () => {
    const { currentUser } = useAccounting();

    useEffect(() => {
        // بدء جدول الإخطارات الذكية
        NotificationScheduler.start({
            intervalMinutes: 30, // تشغيل الفحوصات كل 30 دقيقة
            autoStart: true, // تشغيل الفحص الأول فوراً
        });

        // إيقاف جدول الإخطارات عند تفريغ المكون
        return () => {
            NotificationScheduler.stop();
        };
    }, []);

    return (
        <div className="flex min-h-screen bg-slate-50 font-sans text-right print:block print:h-auto" dir="rtl">
            <Sidebar />
            <div className="flex-1 flex flex-col h-screen print:h-auto print:block print:overflow-visible">
                <DemoBanner />
                <DemoWelcomeModal />
                <DemoTour />
                <DemoWatermark />
                <OfflineSyncProvider />
                <PrintHeader />
                <div className="print:hidden">
                    <Header />
                </div>
                {/* إضافة هوامش للطباعة لتجنب تداخل المحتوى مع الترويسة والتذييل */}
                <main className="flex-1 p-8 overflow-y-scroll bg-slate-50 print:bg-white print:p-0 print:overflow-visible print:h-auto print:mt-24 print:mb-12">
                    <div className="max-w-7xl mx-auto print:max-w-none print:w-full print:px-4">
                        <Routes>
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/" element={(currentUser?.role as string) === 'chef' ? <Navigate to="/kds" replace /> : <Dashboard />} />
                <Route path="/financial-ratios" element={<ModuleGuard module="accounting"><FinancialRatios /></ModuleGuard>} />
                <Route path="/expense-analysis" element={<ModuleGuard module="accounting"><ExpenseAnalysisReport /></ModuleGuard>} />
                  <Route path="/budget-setup" element={<ModuleGuard module="accounting"><BudgetManager /></ModuleGuard>} />
                <Route path="/budget-report" element={<ModuleGuard module="accounting"><BudgetVarianceReport /></ModuleGuard>} />
                <Route path="/fiscal-year-closing" element={<ModuleGuard module="accounting"><FiscalYearClosing /></ModuleGuard>} />
                <Route path="/receipt-voucher" element={<ModuleGuard module="accounting"><ReceiptVoucherForm /></ModuleGuard>} />
                <Route path="/receipt-vouchers-list" element={<ModuleGuard module="accounting"><ReceiptVoucherList /></ModuleGuard>} />
                <Route path="/payment-voucher" element={<ModuleGuard module="accounting"><PaymentVoucherForm /></ModuleGuard>} />
                <Route path="/payment-vouchers-list" element={<ModuleGuard module="accounting"><PaymentVoucherList /></ModuleGuard>} />
                <Route path="/expense-voucher" element={<ModuleGuard module="accounting"><ExpenseVoucherForm /></ModuleGuard>} />
                <Route path="/customer-deposit" element={<ModuleGuard module="accounting"><CustomerDepositForm /></ModuleGuard>} />
                <Route path="/transfer" element={<ModuleGuard module="accounting"><TransferForm /></ModuleGuard>} />
                <Route path="/stock-transfer" element={<ModuleGuard module="inventory"><StockTransfer /></ModuleGuard>} />
                <Route path="/stock-transfer-list" element={<ModuleGuard module="inventory"><StockTransferList /></ModuleGuard>} />
                <Route path="/bank-reconciliation" element={<BankReconciliationForm />} />
                <Route path="/deficit-report" element={<DeficitReport />} />
                <Route path="/cash-closing" element={<ModuleGuard module="accounting"><CashClosingForm /></ModuleGuard>} />
                <Route path="/cheques" element={<ModuleGuard module="accounting"><ChequesPage /></ModuleGuard>} />
                <Route path="/cheque-movement-report" element={<ModuleGuard module="accounting"><ChequeMovementReport /></ModuleGuard>} />
                <Route path="/returned-cheques-report" element={<ModuleGuard module="accounting"><ReturnedChequesReport /></ModuleGuard>} />
                <Route path="/sales-invoice" element={<ModuleGuard module="sales"><SalesInvoiceForm /></ModuleGuard>} />
                <Route path="/invoices-list" element={<ModuleGuard module="sales"><InvoiceList /></ModuleGuard>} />
                <Route path="/sales-return" element={<ModuleGuard module="sales"><SalesReturnForm /></ModuleGuard>} />
                <Route path="/customers" element={<ModuleGuard module="sales"><CustomerManager /></ModuleGuard>} />
                <Route path="/customer-statement" element={<ModuleGuard module="sales"><CustomerStatement /></ModuleGuard>} />
                <Route path="/customer-aging" element={<ModuleGuard module="sales"><CustomerAgingReport /></ModuleGuard>} />
                <Route path="/quotations-new" element={<ModuleGuard module="sales"><QuotationForm /></ModuleGuard>} />
                <Route path="/quotations-list" element={<ModuleGuard module="sales"><QuotationList /></ModuleGuard>} />
                <Route path="/credit-note" element={<ModuleGuard module="sales"><CreditNoteForm /></ModuleGuard>} />
                <Route path="/credit-notes-list" element={<ModuleGuard module="sales"><CreditNoteList /></ModuleGuard>} />
                <Route path="/debit-notes-list" element={<ModuleGuard module="purchases"><DebitNoteList /></ModuleGuard>} />
                <Route path="/purchase-order-new" element={<ModuleGuard module="purchases"><PurchaseOrderForm /></ModuleGuard>} />
                <Route path="/purchase-order-list" element={<ModuleGuard module="purchases"><PurchaseOrderList /></ModuleGuard>} />
                <Route path="/purchase-invoice" element={<ModuleGuard module="purchases"><PurchaseInvoiceForm /></ModuleGuard>} />
                <Route path="/purchase-invoices-list" element={<ModuleGuard module="purchases"><PurchaseInvoiceList /></ModuleGuard>} />
                <Route path="/net-purchases-report" element={<ModuleGuard module="purchases"><NetPurchasesReport /></ModuleGuard>} />
                <Route path="/purchase-return" element={<ModuleGuard module="purchases"><PurchaseReturnForm /></ModuleGuard>} />
                <Route path="/debit-note" element={<ModuleGuard module="purchases"><DebitNoteForm /></ModuleGuard>} />
                <Route path="/suppliers" element={<ModuleGuard module="purchases"><SupplierManager /></ModuleGuard>} />
                <Route path="/supplier-statement" element={<ModuleGuard module="purchases"><SupplierStatement /></ModuleGuard>} />
                <Route path="/supplier-aging" element={<ModuleGuard module="purchases"><SupplierAgingReport /></ModuleGuard>} />
                <Route path="/supplier-reconciliation" element={<ModuleGuard module="purchases"><SupplierBalanceReconciliation /></ModuleGuard>} />
                <Route path="/supplier-balances" element={<ModuleGuard module="purchases"><SupplierBalancesReport /></ModuleGuard>} />
                <Route path="/warehouses" element={<ModuleGuard module="inventory"><WarehouseManager /></ModuleGuard>} />
                <Route path="/inventory-dashboard" element={<ModuleGuard module="inventory"><InventoryDashboard /></ModuleGuard>} />
                <Route path="/products" element={<ModuleGuard module="inventory"><ProductManager /></ModuleGuard>} />
                <Route path="/inventory-count" element={<ModuleGuard module="inventory"><InventoryCountForm /></ModuleGuard>} />
                <Route path="/item-movement" element={<ModuleGuard module="inventory"><ItemMovementReport /></ModuleGuard>} />
                <Route path="/top-selling" element={<ModuleGuard module="inventory"><TopSellingReport /></ModuleGuard>} />
                <Route path="/slow-moving" element={<ModuleGuard module="inventory"><SlowMovingReport /></ModuleGuard>} />
                <Route path="/item-profit" element={<ModuleGuard module="inventory"><ItemProfitReport /></ModuleGuard>} />
                <Route path="/inventory-history" element={<ModuleGuard module="inventory"><InventoryCountList /></ModuleGuard>} />
                <Route path="/stock-adjustment" element={<ModuleGuard module="inventory"><StockAdjustmentForm /></ModuleGuard>} />
                <Route path="/wastage" element={<ModuleGuard module="inventory"><WastageManager /></ModuleGuard>} />
                <Route path="/stock-card" element={<ModuleGuard module="inventory"><StockCard /></ModuleGuard>} />
                <Route path="/inventory-revaluation" element={<ModuleGuard module="inventory"><InventoryRevaluation /></ModuleGuard>} />
                <Route path="/detailed-stock-movement" element={<ModuleGuard module="inventory"><DetailedStockMovementReport /></ModuleGuard>} />
                <Route path="/stock-movement-cost" element={<ModuleGuard module="inventory"><StockMovementCostReport /></ModuleGuard>} />
                <Route path="/opening-inventory" element={<ModuleGuard module="inventory"><OpeningInventory /></ModuleGuard>} />
                <Route path="/manufacturing" element={<ModuleGuard module="manufacturing"><ManufacturingManager /></ModuleGuard>} />
                <Route path="/work-orders" element={<ModuleGuard module="manufacturing"><WorkOrderManager /></ModuleGuard>} />
                <Route path="/production-cost-analysis" element={<ModuleGuard module="manufacturing"><ProductionCostAnalysis /></ModuleGuard>} />
                <Route path="/employees" element={<ModuleGuard module="hr"><EmployeeManager /></ModuleGuard>} />
                <Route path="/payroll" element={<ModuleGuard module="hr"><PayrollRun /></ModuleGuard>} />
                <Route path="/employee-advances" element={<ModuleGuard module="hr"><EmployeeAdvances /></ModuleGuard>} />
                            <Route path="/payroll-report" element={<ModuleGuard module="hr"><PayrollReport /></ModuleGuard>} />
                <Route path="/employee-statement" element={<ModuleGuard module="hr"><EmployeeStatement /></ModuleGuard>} />
                <Route path="/employee-reports" element={<ModuleGuard module="hr"><EmployeeReports /></ModuleGuard>} />
                <Route path="/journal" element={<ModuleGuard module="accounting"><JournalEntryForm /></ModuleGuard>} />
                <Route path="/draft-journals" element={<ModuleGuard module="accounting"><DraftJournalsList /></ModuleGuard>} />
                <Route path="/general-journal" element={<ModuleGuard module="accounting"><GeneralJournal /></ModuleGuard>} />
                <Route path="/ledger" element={<ModuleGuard module="accounting"><GeneralLedger /></ModuleGuard>} />
                <Route path="/trial-balance-advanced" element={<ModuleGuard module="accounting"><TrialBalanceAdvanced /></ModuleGuard>} />
                <Route path="/income-statement" element={<ModuleGuard module="accounting"><IncomeStatement /></ModuleGuard>} />
                <Route path="/balance-sheet" element={<ModuleGuard module="accounting"><BalanceSheet /></ModuleGuard>} />
                <Route path="/cash-flow" element={<ModuleGuard module="accounting"><CashFlowStatement /></ModuleGuard>} />
                <Route path="/cash-flow-report" element={<ModuleGuard module="accounting"><CashFlowReport /></ModuleGuard>} />
                <Route path="/tax-return" element={<ModuleGuard module="accounting"><TaxReturnReport /></ModuleGuard>} />
                <Route path="/performance-comparison" element={<ModuleGuard module="accounting"><PerformanceComparisonReport /></ModuleGuard>} />
                <Route path="/multi-currency-statement" element={<ModuleGuard module="accounting"><MultiCurrencyStatement /></ModuleGuard>} />
                <Route path="/payment-method-report" element={<ModuleGuard module="accounting"><PaymentMethodReport /></ModuleGuard>} />
                <Route path="/attachments-report" element={<ModuleGuard module="accounting"><AttachmentsReport /></ModuleGuard>} />
                <Route path="/user-guide" element={<UserGuide />} />
                <Route path="/accounting-dashboard" element={<ModuleGuard module="accounting"><AccountingDashboard /></ModuleGuard>} />
                <Route path="/journal-export" element={<ModuleGuard module="accounting"><JournalEntriesExport /></ModuleGuard>} />
                <Route path="/accounts" element={<ModuleGuard module="accounting"><AccountList /></ModuleGuard>} />
                <Route path="/assets" element={<ModuleGuard module="accounting"><AssetManager /></ModuleGuard>} />
                <Route path="/important-reports" element={<ModuleGuard module="accounting"><ImportantReports /></ModuleGuard>} />
                <Route path="/sales-reports" element={<ModuleGuard module="sales"><SalesReports /></ModuleGuard>} />
                <Route path="/reports/restaurant-sales" element={<ModuleGuard module="restaurant"><RestaurantSalesReport /></ModuleGuard>} />
                <Route path="/reports/sales-by-user" element={<ModuleGuard module="restaurant"><SalesByUserReport /></ModuleGuard>} />
                <Route path="/reports/wastage-analysis" element={<ModuleGuard module="restaurant"><WastageAnalysisReport /></ModuleGuard>} />
                <Route path="/reports/restaurant-profit" element={<ModuleGuard module="restaurant"><RestaurantProfitReport /></ModuleGuard>} />
                  {/*<Route path="/reports" element={<Reports />} />*/}
                <Route path="/purchase-reports" element={<ModuleGuard module="purchases"><PurchaseReports /></ModuleGuard>} />
                <Route path="/offer-beneficiaries" element={<ModuleGuard module="sales"><OfferBeneficiariesReport /></ModuleGuard>} />
                <Route path="/item-sales-analysis" element={<ModuleGuard module="sales"><ItemSalesAnalysis /></ModuleGuard>} />
                <Route path="/purchase-analysis" element={<ModuleGuard module="purchases"><PurchaseAnalysisReport /></ModuleGuard>} />
                <Route path="/users" element={<UserManager />} />
                <Route path="/security-logs" element={<SecurityLogs />} />
                <Route path="/permissions" element={<PermissionsManager />} />
                <Route path="/recycle-bin" element={<RecycleBin />} />
                <Route path="/data-migration" element={<DataMigrationCenter />} />
                <Route path="/saas-admin" element={currentUser?.role === 'super_admin' ? <SaasAdmin /> : <Navigate to="/" replace />} /> {/* <--- أضف هذا السطر */}
                <Route path="/profile" element={<UserProfile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/about" element={<About />} />
                <Route path="/pos" element={<ModuleGuard module="restaurant"><PosScreen /></ModuleGuard>} /> {/* التأكد من أن هذا السطر موجود */}
                <Route path="/kds" element={<ModuleGuard module="restaurant"><KdsScreen /></ModuleGuard>} /> {/* إضافة مسار شاشة المطبخ */}
                <Route path="/kitchen-end-day" element={<ModuleGuard module="restaurant"><KitchenEndDayCount /></ModuleGuard>} /> {/* إضافة مسار جرد المطبخ */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
                    </div>
                </main>
                <PrintFooter />
            </div>
        </div>
    );
};

const AppContent = () => {
  const [session, setSession] = useState<any>(null);
  const { isLoading: authLoading, currentUser, authInitialized } = useAuth();

  // Check for maintenance mode
  const isMaintenanceMode = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

  if (isMaintenanceMode) {
    return <Maintenance />;
  }

  // Show loading screen until authentication is initialized or data is loading for a logged-in user
  if (!authInitialized || authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50" dir="rtl">
        <div className="text-center space-y-4">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">جاري تحميل النظام...</h2>
            <p className="text-slate-500 text-sm mt-1">يرجى الانتظار قليلاً لجلب البيانات</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      {/* The single source of truth for authentication is now `currentUser` from the context */}
      <Routes>
        <Route path="/customer-display" element={<CustomerDisplay />} />
        <Route path="/menu/:qrKey" element={<GuestMenuLayout />} />
        <Route path="/*" element={currentUser ? <MainLayout /> : <LandingPage />} />
      </Routes>
    </HashRouter>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <AccountingProvider>
            <AppContent />
          </AccountingProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
