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
import ChequeMovementReport from './modules/banking/ChequeMovementReport';
import ReturnedChequesReport from './modules/banking/ReturnedChequesReport';
import FreeReturnsReport from './modules/sales/FreeReturnsReport';
import SupplierBalancesReport from './modules/purchases/SupplierBalancesReport';

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

const MainLayout = () => {
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
                <PrintHeader />
                <div className="print:hidden">
                    <Header />
                </div>
                {/* إضافة هوامش للطباعة لتجنب تداخل المحتوى مع الترويسة والتذييل */}
                <main className="flex-1 p-8 overflow-y-auto bg-slate-50 print:bg-white print:p-0 print:overflow-visible print:h-auto print:mt-24 print:mb-12">
                    <div className="max-w-7xl mx-auto print:max-w-none print:w-full print:px-4">
                        <Routes>
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/" element={<Dashboard />} />
                <Route path="/financial-ratios" element={<FinancialRatios />} />
                <Route path="/expense-analysis" element={<ExpenseAnalysisReport />} />
                <Route path="/budget-setup" element={<BudgetManager />} />
                <Route path="/budget-report" element={<BudgetVarianceReport />} />
                <Route path="/fiscal-year-closing" element={<FiscalYearClosing />} />
                <Route path="/receipt-voucher" element={<ReceiptVoucherForm />} />
                <Route path="/receipt-vouchers-list" element={<ReceiptVoucherList />} />
                <Route path="/payment-voucher" element={<PaymentVoucherForm />} />
                <Route path="/payment-vouchers-list" element={<PaymentVoucherList />} />
                <Route path="/expense-voucher" element={<ExpenseVoucherForm />} />
                <Route path="/customer-deposit" element={<CustomerDepositForm />} />
                <Route path="/transfer" element={<TransferForm />} />
                <Route path="/stock-transfer" element={<StockTransfer />} />
                <Route path="/stock-transfer-list" element={<StockTransferList />} />
                <Route path="/bank-reconciliation" element={<BankReconciliationForm />} />
                <Route path="/deficit-report" element={<DeficitReport />} />
                <Route path="/cash-closing" element={<CashClosingForm />} />
                <Route path="/cheques" element={<ChequesPage />} />
                <Route path="/cheque-movement-report" element={<ChequeMovementReport />} />
                <Route path="/returned-cheques-report" element={<ReturnedChequesReport />} />
                <Route path="/sales-invoice" element={<SalesInvoiceForm />} />
                <Route path="/invoices-list" element={<InvoiceList />} />
                <Route path="/sales-return" element={<SalesReturnForm />} />
                <Route path="/free-returns-report" element={<FreeReturnsReport />} />
                <Route path="/customers" element={<CustomerManager />} />
                <Route path="/customer-statement" element={<CustomerStatement />} />
                <Route path="/customer-aging" element={<CustomerAgingReport />} />
                <Route path="/quotations-new" element={<QuotationForm />} />
                <Route path="/quotations-list" element={<QuotationList />} />
                <Route path="/credit-note" element={<CreditNoteForm />} />
                <Route path="/credit-notes-list" element={<CreditNoteList />} />
                <Route path="/debit-notes-list" element={<DebitNoteList />} />
                <Route path="/purchase-order-new" element={<PurchaseOrderForm />} />
                <Route path="/purchase-order-list" element={<PurchaseOrderList />} />
                <Route path="/purchase-invoice" element={<PurchaseInvoiceForm />} />
                <Route path="/purchase-invoices-list" element={<PurchaseInvoiceList />} />
                <Route path="/net-purchases-report" element={<NetPurchasesReport />} />
                <Route path="/purchase-return" element={<PurchaseReturnForm />} />
                <Route path="/debit-note" element={<DebitNoteForm />} />
                <Route path="/suppliers" element={<SupplierManager />} />
                <Route path="/supplier-statement" element={<SupplierStatement />} />
                <Route path="/supplier-aging" element={<SupplierAgingReport />} />
                <Route path="/supplier-reconciliation" element={<SupplierBalanceReconciliation />} />
                <Route path="/supplier-balances" element={<SupplierBalancesReport />} />
                <Route path="/warehouses" element={<WarehouseManager />} />
                <Route path="/inventory-dashboard" element={<InventoryDashboard />} />
                <Route path="/products" element={<ProductManager />} />
                <Route path="/inventory-count" element={<InventoryCountForm />} />
                <Route path="/item-movement" element={<ItemMovementReport />} />
                <Route path="/top-selling" element={<TopSellingReport />} />
                <Route path="/slow-moving" element={<SlowMovingReport />} />
                <Route path="/item-profit" element={<ItemProfitReport />} />
                <Route path="/inventory-history" element={<InventoryCountList />} />
                <Route path="/stock-adjustment" element={<StockAdjustmentForm />} />
                <Route path="/stock-card" element={<StockCard />} />
                <Route path="/inventory-revaluation" element={<InventoryRevaluation />} />
                <Route path="/detailed-stock-movement" element={<DetailedStockMovementReport />} />
                <Route path="/stock-movement-cost" element={<StockMovementCostReport />} />
                <Route path="/opening-inventory" element={<OpeningInventory />} />
                <Route path="/manufacturing" element={<ManufacturingManager />} />
                <Route path="/work-orders" element={<WorkOrderManager />} />
                <Route path="/production-cost-analysis" element={<ProductionCostAnalysis />} />
                <Route path="/employees" element={<EmployeeManager />} />
                <Route path="/payroll" element={<PayrollRun />} />
                <Route path="/employee-advances" element={<EmployeeAdvances />} />
                            <Route path="/payroll-report" element={<PayrollReport />} />
                <Route path="/employee-statement" element={<EmployeeStatement />} />
                <Route path="/employee-reports" element={<EmployeeReports />} />
                <Route path="/journal" element={<JournalEntryForm />} />
                <Route path="/draft-journals" element={<DraftJournalsList />} />
                <Route path="/general-journal" element={<GeneralJournal />} />
                <Route path="/ledger" element={<GeneralLedger />} />
                <Route path="/trial-balance-advanced" element={<TrialBalanceAdvanced />} />
                <Route path="/income-statement" element={<IncomeStatement />} />
                <Route path="/balance-sheet" element={<BalanceSheet />} />
                <Route path="/cash-flow" element={<CashFlowStatement />} />
                <Route path="/cash-flow-report" element={<CashFlowReport />} />
                <Route path="/tax-return" element={<TaxReturnReport />} />
                <Route path="/performance-comparison" element={<PerformanceComparisonReport />} />
                <Route path="/multi-currency-statement" element={<MultiCurrencyStatement />} />
                <Route path="/payment-method-report" element={<PaymentMethodReport />} />
                <Route path="/attachments-report" element={<AttachmentsReport />} />
                <Route path="/user-guide" element={<UserGuide />} />
                <Route path="/accounting-dashboard" element={<AccountingDashboard />} />
                <Route path="/journal-export" element={<JournalEntriesExport />} />
                <Route path="/accounts" element={<AccountList />} />
                <Route path="/assets" element={<AssetManager />} />
                <Route path="/important-reports" element={<ImportantReports />} />
                <Route path="/sales-reports" element={<SalesReports />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/purchase-reports" element={<PurchaseReports />} />
                <Route path="/offer-beneficiaries" element={<OfferBeneficiariesReport />} />
                <Route path="/item-sales-analysis" element={<ItemSalesAnalysis />} />
                <Route path="/purchase-analysis" element={<PurchaseAnalysisReport />} />
                <Route path="/users" element={<UserManager />} />
                <Route path="/security-logs" element={<SecurityLogs />} />
                <Route path="/permissions" element={<PermissionsManager />} />
                <Route path="/recycle-bin" element={<RecycleBin />} />
                <Route path="/data-migration" element={<DataMigrationCenter />} />
                <Route path="/profile" element={<UserProfile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/about" element={<About />} />
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
      {currentUser ? <MainLayout /> : <LandingPage />}
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
