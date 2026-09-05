import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AccountingProvider, useAccounting } from './context/AccountingContext';
import { Landmark, X, Info } from 'lucide-react';
import { ToastProvider } from './context/ToastContext';
import NotificationScheduler from './services/NotificationScheduler';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import WorkspaceTabsBar from './components/WorkspaceTabsBar';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

// 📊 لوحات التحكم والأدوات الإدارية (Lazy Loaded)
const AdminTestDashboard = lazy(() => import('./components/AdminTestDashboard'));
const Quotations = lazy(() => import('./components/Quotations'));
const DraftJournalsList = lazy(() => import('./components/DraftJournalsList'));

// 🏛️ المحاسبة والقيود والتقارير المالية (Accounting & Journal - Lazy Loaded)
const GeneralJournal = lazy(() => import('./modules/accounting/GeneralJournal'));
const GeneralLedger = lazy(() => import('./modules/accounting/GeneralLedger'));
const JournalEntryForm = lazy(() => import('./modules/accounting/JournalEntryForm'));
const IncomeStatement = lazy(() => import('./modules/accounting/IncomeStatement'));
const BalanceSheet = lazy(() => import('./modules/accounting/BalanceSheet'));
const CashFlowStatement = lazy(() => import('./modules/accounting/CashFlowStatement'));
const CashFlowReport = lazy(() => import('./modules/accounting/CashFlowReport'));
const AccountingDashboard = lazy(() => import('./modules/accounting/AccountingDashboard'));
const JournalEntriesExport = lazy(() => import('./modules/accounting/JournalEntriesExport'));
const AccountList = lazy(() => import('./modules/accounting/AccountList'));
const TrialBalanceAdvanced = lazy(() => import('./modules/accounting/TrialBalanceAdvanced'));
const BudgetManager = lazy(() => import('./modules/accounting/BudgetManager'));
const BudgetVarianceReport = lazy(() => import('./modules/accounting/BudgetVarianceReport'));
const FiscalYearClosing = lazy(() => import('./modules/accounting/FiscalYearClosing'));
const FiscalPeriodManager = lazy(() => import('./modules/accounting/FiscalPeriodManager').then(m => ({ default: m.FiscalPeriodManager })));

// 📈 المبيعات والعملاء (Sales & Customers - Lazy Loaded)
const SalesInvoiceForm = lazy(() => import('./modules/sales/SalesInvoiceForm'));
const InvoiceList = lazy(() => import('./modules/sales/InvoiceList'));
const SalesReturnForm = lazy(() => import('./modules/sales/SalesReturnForm'));
const SalesReturnsList = lazy(() => import('./modules/sales/SalesReturnsList'));
const SalesOrders = lazy(() => import('./modules/sales/SalesOrders'));
const SalesOrderForm = lazy(() => import('./modules/sales/SalesOrderForm'));
const QuotationForm = lazy(() => import('./modules/sales/QuotationForm'));
const QuotationList = lazy(() => import('./modules/sales/QuotationList'));
const CreditNoteForm = lazy(() => import('./modules/sales/CreditNoteForm'));
const CreditNoteList = lazy(() => import('./modules/sales/CreditNoteList'));
const CustomerManager = lazy(() => import('./modules/sales/CustomerManager'));
const CustomerStatement = lazy(() => import('./modules/sales/CustomerStatement'));
const CustomerAgingReport = lazy(() => import('./modules/sales/CustomerAgingReport'));
const CustomerBalanceReconciliation = lazy(() => import('./modules/sales/CustomerBalanceReconciliation'));
const MultiUomStockReport = lazy(() => import('./modules/sales/MultiUomStockReport'));

// 📦 المشتريات والموردين (Purchases & Suppliers - Lazy Loaded)
const PurchaseInvoiceForm = lazy(() => import('./modules/purchases/PurchaseInvoiceForm'));
const PurchaseInvoiceList = lazy(() => import('./modules/purchases/PurchaseInvoiceList'));
const PurchaseReturnForm = lazy(() => import('./modules/purchases/PurchaseReturnForm'));
const PurchaseReturnsList = lazy(() => import('./modules/purchases/PurchaseReturnsList'));
const DebitNoteForm = lazy(() => import('./modules/purchases/DebitNoteForm'));
const DebitNoteList = lazy(() => import('./modules/purchases/DebitNoteList'));
const PurchaseOrderForm = lazy(() => import('./modules/purchases/PurchaseOrderForm'));
const PurchaseOrderList = lazy(() => import('./modules/purchases/PurchaseOrderList'));
const SupplierManager = lazy(() => import('./modules/purchases/SupplierManager'));
const SupplierStatement = lazy(() => import('./modules/purchases/SupplierStatement'));
const SupplierAgingReport = lazy(() => import('./modules/purchases/SupplierAgingReport'));
const SupplierBalanceReconciliation = lazy(() => import('./modules/purchases/SupplierBalanceReconciliation'));

// 🏢 المخزون والمستودعات (Inventory - Lazy Loaded)
const StockAdjustmentForm = lazy(() => import('./modules/inventory/StockAdjustmentForm'));
const InventoryCountForm = lazy(() => import('./modules/inventory/InventoryCountForm'));
const InventoryCountList = lazy(() => import('./modules/inventory/InventoryCountList'));
const StockCard = lazy(() => import('./modules/inventory/StockCard'));
const OpeningInventory = lazy(() => import('./modules/inventory/OpeningInventory'));
const ProductManager = lazy(() => import('./modules/inventory/ProductManager'));
const WarehouseManager = lazy(() => import('./modules/inventory/WarehouseManager'));
const InventoryRevaluation = lazy(() => import('./modules/inventory/InventoryRevaluation'));
const StockMovementCostReport = lazy(() => import('./modules/inventory/StockMovementCostReport'));
const WastageManager = lazy(() => import('./modules/inventory/WastageManager'));
const InventoryDashboard = lazy(() => import('./modules/inventory/InventoryDashboard'));
const StockTransfer = lazy(() => import('./modules/inventory/StockTransfer'));
const StockTransferList = lazy(() => import('./modules/inventory/StockTransferList'));
const ItemMovementReport = lazy(() => import('./modules/inventory/ItemMovementReport'));
const TopSellingReport = lazy(() => import('./modules/inventory/TopSellingReport'));
const SlowMovingReport = lazy(() => import('./modules/inventory/SlowMovingReport'));
const ItemProfitReport = lazy(() => import('./modules/inventory/ItemProfitReport'));

// 💳 المالية والبنوك والمقبوضات (Finance & Banking - Lazy Loaded)
const ReceiptVoucherForm = lazy(() => import('./modules/finance/components/ReceiptVoucherForm'));
const ReceiptVoucherList = lazy(() => import('./modules/finance/reports/ReceiptVoucherList'));
const PaymentVoucherForm = lazy(() => import('./modules/finance/components/PaymentVoucherForm'));
const PaymentVoucherList = lazy(() => import('./modules/finance/reports/PaymentVoucherList'));
const ExpenseVoucherForm = lazy(() => import('./modules/finance/components/ExpenseVoucherForm'));
const CustomerDepositForm = lazy(() => import('./modules/finance/components/CustomerDepositForm'));
const TransferForm = lazy(() => import('./modules/finance/components/TransferForm'));
const CashClosingForm = lazy(() => import('./modules/finance/components/CashClosingForm'));
const PaymentGatewaySettings = lazy(() => import('./modules/finance/components/PaymentGatewaySettings').then(m => ({ default: m.PaymentGatewaySettings })));
const BankReconciliationForm = lazy(() => import('./modules/finance/components/BankReconciliationForm'));
const ChequesPage = lazy(() => import('./modules/banking/ChequesPage').then(m => ({ default: m.ChequesPage })));
const LettersOfGuaranteePage = lazy(() => import('./modules/banking/LettersOfGuaranteePage'));
const LettersOfCreditPage = lazy(() => import('./modules/banking/LettersOfCreditPage'));

// 🛡️ الأصول والإدارة العامة (Assets & Admin - Lazy Loaded)
const AssetManager = lazy(() => import('./modules/assets/AssetManager'));
const UserManager = lazy(() => import('./components/UserManager'));
const Settings = lazy(() => import('./components/Settings'));

// 👥 الموارد البشرية الأساسية (HR Core - Lazy Loaded)
const EmployeeManager = lazy(() => import('./modules/hr/components/EmployeeManager'));
const PayrollRun = lazy(() => import('./modules/hr/components/PayrollRun'));
const EmployeeAdvances = lazy(() => import('./modules/hr/components/EmployeeAdvances'));
const PayrollReport = lazy(() => import('./modules/hr/reports/PayrollReport'));
const EmployeeStatement = lazy(() => import('./modules/hr/reports/EmployeeStatement'));
const EmployeeReports = lazy(() => import('./modules/hr/reports/EmployeeReports'));

// 📑 التقارير الإحصائية والتحليلية (Reports - Lazy Loaded)
const ImportantReports = lazy(() => import('./modules/reports/ImportantReports'));
const SalesReports = lazy(() => import('./modules/sales/SalesReports'));
const Reports = lazy(() => import('./modules/reports/Reports'));
const PurchaseReports = lazy(() => import('./modules/purchases/PurchaseReports'));
const DeficitReport = lazy(() => import('./modules/reports/DeficitReport'));
const FinancialRatios = lazy(() => import('./modules/reports/FinancialRatios'));
const NetPurchasesReport = lazy(() => import('./modules/purchases/NetPurchasesReport'));
const ExpenseAnalysisReport = lazy(() => import('./modules/reports/ExpenseAnalysisReport'));
const ItemSalesAnalysis = lazy(() => import('./modules/reports/ItemSalesAnalysis'));
const PurchaseAnalysisReport = lazy(() => import('./modules/purchases/PurchaseAnalysisReport'));
// 🏭 مديول التصنيع (Manufacturing - Lazy Loaded)
const WorkOrderManager = lazy(() => import('./modules/manufacturing/components/WorkOrderManager'));
const ProductionCostAnalysis = lazy(() => import('./modules/manufacturing/reports/ProductionCostAnalysis'));
const UnitCostDrillDown = lazy(() => import('./modules/manufacturing/reports/UnitCostDrillDown'));
const ManufacturingAlertsLog = lazy(() => import('./modules/manufacturing/reports/ManufacturingAlertsLog'));
const CostClosingDashboard = lazy(() => import('./modules/manufacturing/components/CostClosingDashboard'));
const MachineOeeTracker = lazy(() => import('./modules/manufacturing/components/MachineOeeTracker'));
const MachineryMaintenanceManager = lazy(() => import('./modules/manufacturing/components/MachineryMaintenanceManager'));
const CapacityPlanningDashboard = lazy(() => import('./modules/manufacturing/components/CapacityPlanningDashboard'));
const ProductionGanttScheduler = lazy(() => import('./modules/manufacturing/components/ProductionGanttScheduler'));
const SecurityLogs = lazy(() => import('./components/SecurityLogs'));

// 🏗️ مديول المقاولات (Construction - Lazy Loaded)
const ProjectManager = lazy(() => import('./modules/construction/components/ProjectManager'));
const ConstructionDashboard = lazy(() => import('./modules/construction/components/ConstructionDashboard'));
const LaborCostReport = lazy(() => import('./modules/construction/reports/LaborCostReport'));
const SubcontractorManager = lazy(() => import('./modules/construction/components/SubcontractorManager'));
const SubcontractorContractsManager = lazy(() => import('./modules/construction/components/SubcontractorContractsManager'));
const SubcontractorBillingManager = lazy(() => import('./modules/construction/components/SubcontractorBillingManager'));
const SubcontractorAnalytics = lazy(() => import('./modules/construction/reports/SubcontractorAnalytics'));
const SubcontractorStatement = lazy(() => import('./modules/construction/components/SubcontractorStatement'));
const SiteDailyLogsManager = lazy(() => import('./modules/construction/components/SiteDailyLogsManager'));
const RfiSubmittalManager = lazy(() => import('./modules/construction/components/RfiSubmittalManager'));
const WorkInspectionManager = lazy(() => import('./modules/construction/components/WorkInspectionManager'));
const MaterialWasteAnalytics = lazy(() => import('./modules/construction/components/MaterialWasteAnalytics'));
const PriceEscalationCalculator = lazy(() => import('./modules/construction/components/PriceEscalationCalculator'));

// 👥 مديول الموارد البشرية (HR - Lazy Loaded)
const LeaveManager = lazy(() => import('./modules/hr/components/LeaveManager'));
const EndOfServiceCalculator = lazy(() => import('./modules/hr/components/EndOfServiceCalculator'));
const AttendanceManager = lazy(() => import('./modules/hr/components/AttendanceManager'));
const HrDashboard = lazy(() => import('./modules/hr/components/HrDashboard'));
const BiometricDeviceManager = lazy(() => import('./modules/hr/components/BiometricDeviceManager'));
const ShiftManager = lazy(() => import('./modules/hr/components/ShiftManager'));
const PenaltiesAndRewards = lazy(() => import('./modules/hr/components/PenaltiesAndRewards'));
const PermissionsManager = lazy(() => import('./modules/admin/PermissionsManager'));
const Maintenance = lazy(() => import('./components/Maintenance'));
const TaxReturnReport = lazy(() => import('./modules/reports/TaxReturnReport'));
const PerformanceComparisonReport = lazy(() => import('./modules/reports/PerformanceComparisonReport'));
// 🛠️ مديول الإدارة وأدوات النظام (Admin Tools - Lazy Loaded)
const RecycleBin = lazy(() => import('./modules/admin/RecycleBin'));
const SaasAdmin = lazy(() => import('./modules/admin/SaaSAdmin'));
const DataMigrationCenter = lazy(() => import('./modules/admin/DataMigrationCenter'));
const SystemStressTest = lazy(() => import('./modules/admin/SystemStressTest'));
const MultiCurrencyStatement = lazy(() => import('./modules/reports/MultiCurrencyStatement'));
const PaymentMethodReport = lazy(() => import('./modules/reports/PaymentMethodReport'));
const UserGuide = lazy(() => import('./components/UserGuide'));
const AttachmentsReport = lazy(() => import('./modules/reports/AttachmentsReport'));
const DetailedStockMovementReport = lazy(() => import('./modules/inventory/DetailedStockMovementReport'));

// 🏭 مديول التصنيع المتقدم (Advanced Manufacturing - Lazy Loaded)
const ManufacturingDashboard = lazy(() => import('./modules/manufacturing/components/ManufacturingDashboard'));
const BatchOrderManager = lazy(() => import('./modules/manufacturing/components/BatchOrderManager'));
const ShopFloorManager = lazy(() => import('./modules/manufacturing/components/ShopFloorManager'));
const QualityControlManager = lazy(() => import('./modules/manufacturing/components/QualityControlManager'));
const BOMVarianceReport = lazy(() => import('./modules/manufacturing/reports/BOMVarianceReport'));
const GenealogyViewer = lazy(() => import('./modules/manufacturing/reports/GenealogyViewer'));
const ProductionProfitabilityReport = lazy(() => import('./modules/manufacturing/reports/ProductionProfitabilityReport'));
const RoutingBOMManager = lazy(() => import('./modules/manufacturing/components/RoutingBOMManager'));
const MaterialRequestsList = lazy(() => import('./modules/manufacturing/components/MaterialRequestsList'));
const RawMaterialsTurnover = lazy(() => import('./modules/manufacturing/reports/RawMaterialsTurnover').then(m => ({ default: m.RawMaterialsTurnover })));
const WIPMonthlySummaryReport = lazy(() => import('./modules/manufacturing/reports/WIPMonthlySummaryReport'));
const UserProfile = lazy(() => import('./components/UserProfile'));
import { DemoTour } from './components/DemoTour';
import LandingPage from './components/LandingPage';
const UnitsOfMeasureManager = lazy(() => import('./components/UnitsOfMeasureManager'));
const RecurringInvoicesManager = lazy(() => import('./modules/sales/RecurringInvoicesManager'));
const OfferBeneficiariesReport = lazy(() => import('./modules/sales/OfferBeneficiariesReport'));
const FreeReturnsReport = lazy(() => import('./modules/sales/FreeReturnsReport'));
const WastageReport = lazy(() => import('./modules/inventory/WastageReport'));
const GuestMenuLayout = lazy(() => import('./modules/restaurant/components/GuestMenuLayout'));
const ChequeMovementReport = lazy(() => import('./modules/banking/ChequeMovementReport'));
const ReturnedChequesReport = lazy(() => import('./modules/banking/ReturnedChequesReport'));
const About = lazy(() => import('./components/About'));
const SupplierBalancesReport = lazy(() => import('./modules/purchases/SupplierBalancesReport'));

// 🛒 مديول التجزئة ونقاط البيع (Retail & POS - Lazy Loaded)
const PosScreen = lazy(() => import('./modules/restaurant/components/POS/PosScreen'));
const RetailPosScreen = lazy(() => import('./modules/retail/components/POS/RetailPosScreen'));
const PriceCheckerKiosk = lazy(() => import('./modules/retail/components/PriceCheckerKiosk'));
const CustomerFacingScreen = lazy(() => import('./modules/retail/components/CustomerDisplay/CustomerFacingScreen'));
const PromotionsManager = lazy(() => import('./modules/retail/components/Promotions/PromotionsManager'));
const VendorContractsManager = lazy(() => import('./modules/purchases/VendorContractsManager'));
const RfqBiddingManager = lazy(() => import('./modules/purchases/RfqBiddingManager'));
const GoodsReceiptManager = lazy(() => import('./modules/inventory/GoodsReceiptManager'));
const MobilePdaStocktaking = lazy(() => import('./modules/inventory/MobilePdaStocktaking'));
const ExpiryClearanceRadar = lazy(() => import('./modules/inventory/ExpiryClearanceRadar'));
const ShelfRestockReport = lazy(() => import('./modules/inventory/ShelfRestockReport'));
const HypermarketReplenishment = lazy(() => import('./modules/inventory/HypermarketReplenishment'));
const BinLocationManager = lazy(() => import('./modules/inventory/BinLocationManager'));
const InTransitTransfersManager = lazy(() => import('./modules/inventory/InTransitTransfersManager'));

// 🍽️ مديول المطاعم والمطبخ (Restaurant & KDS - Lazy Loaded)
const KdsScreen = lazy(() => import('./modules/restaurant/components/KDS/KdsScreen'));
const KitchenEndDayCount = lazy(() => import('./modules/restaurant/components/Management/KitchenEndDayCount'));
const ButcheringYieldManager = lazy(() => import('./modules/restaurant/components/Management/ButcheringYieldManager'));
const ExpoScreen = lazy(() => import('./modules/restaurant/components/KDS/ExpoScreen'));
const KitchenStationManager = lazy(() => import('./modules/restaurant/components/Management/KitchenStationManager'));
const DriverDispatchManager = lazy(() => import('./modules/restaurant/components/Management/DriverDispatchManager'));
const HappyHourManager = lazy(() => import('./modules/restaurant/components/Management/HappyHourManager'));
const DeliveryAggregatorManager = lazy(() => import('./modules/restaurant/components/Management/DeliveryAggregatorManager'));
const TipsPoolManager = lazy(() => import('./modules/restaurant/components/Management/TipsPoolManager'));
const MultiChannelPricingManager = lazy(() => import('./modules/restaurant/components/Management/MultiChannelPricingManager'));
const CustomerWinBackManager = lazy(() => import('./modules/restaurant/components/Management/CustomerWinBackManager'));
const AutoReorderManager = lazy(() => import('./modules/restaurant/components/Management/AutoReorderManager'));
const RestaurantSalesReport = lazy(() => import('./modules/restaurant/reports/RestaurantSalesReport'));
const SalesByUserReport = lazy(() => import('./modules/restaurant/reports/SalesByUserReport'));
const WastageAnalysisReport = lazy(() => import('./modules/restaurant/reports/WastageAnalysisReport'));
const RestaurantProfitReport = lazy(() => import('./modules/restaurant/reports/RestaurantProfitReport'));
const RestaurantAnalytics = lazy(() => import('./services/RestaurantAnalytics'));
import { OfflineSyncProvider } from './components/OfflineSyncProvider';
const CustomerDisplay = lazy(() => import('./modules/restaurant/components/POS/CustomerDisplay'));
const MobileWaiterScreen = lazy(() => import('./modules/restaurant/components/POS/MobileWaiterScreen'));
const ThermalPrintersManager = lazy(() => import('./modules/restaurant/components/Management/ThermalPrintersManager'));
const LoyaltyProgramManager = lazy(() => import('./modules/restaurant/components/Management/LoyaltyProgramManager'));
const SelfOrderingKiosk = lazy(() => import('./modules/restaurant/components/Kiosk/SelfOrderingKiosk'));

// 🏥 مديول المستشفيات والخدمات الطبية (HIMS - Lazy Loaded)
const PatientManager = lazy(() => import('./modules/hims/pages/PatientManager'));
const DoctorDesktop = lazy(() => import('./modules/hims/pages/DoctorDesktop').then(m => ({ default: m.DoctorDesktop })));
const MedicalBilling = lazy(() => import('./modules/hims/pages/MedicalBilling'));
const LabDashboard = lazy(() => import('./modules/hims/pages/LabDashboard').then(m => ({ default: m.LabDashboard })));
const BloodBankManager = lazy(() => import('./modules/hims/pages/BloodBankDashboard').then(m => ({ default: m.BloodBankDashboard })));
const NurseStation = lazy(() => import('./modules/hims/pages/NurseStation').then(m => ({ default: m.NurseStation })));
const RadiologyDashboard = lazy(() => import('./modules/hims/pages/RadiologyDashboard').then(m => ({ default: m.RadiologyDashboard })));
const LabSpecimenTracking = lazy(() => import('./modules/hims/pages/LabSpecimenTracking').then(m => ({ default: m.LabSpecimenTracking })));
const ERTriageBoard = lazy(() => import('./modules/hims/pages/ERTriageBoard').then(m => ({ default: m.ERTriageBoard })));
const PharmacyDashboard = lazy(() => import('./modules/hims/pages/PharmacyDashboard').then(m => ({ default: m.PharmacyDashboard })));
const AdmissionManager = lazy(() => import('./modules/hims/pages/AdmissionManager').then(m => ({ default: m.AdmissionManager })));
const WardBedManager = lazy(() => import('./modules/hims/components/WardBedManager').then(m => ({ default: m.WardBedManager })));
const SurgeryScheduler = lazy(() => import('./modules/hims/pages/SurgeryScheduler').then(m => ({ default: m.SurgeryScheduler })));
const OperatingTheaterManager = lazy(() => import('./modules/hims/pages/OperatingTheaterManager'));
const StaffRosterManager = lazy(() => import('./modules/hims/pages/StaffRosterManager'));
const DoctorManager = lazy(() => import('./modules/hims/pages/DoctorManager'));
const DoctorKPIs = lazy(() => import('./modules/hims/pages/DoctorKPIs').then(m => ({ default: m.DoctorKPIs })));
const HIMSExecutiveDashboard = lazy(() => import('./modules/hims/pages/HIMSExecutiveDashboard').then(m => ({ default: m.HIMSExecutiveDashboard })));
const HIMSProfitabilityReports = lazy(() => import('./modules/hims/pages/HIMSProfitabilityReports').then(m => ({ default: m.HIMSProfitabilityReports })));
const HIMSServicesManager = lazy(() => import('./modules/hims/pages/HIMSServicesManager').then(m => ({ default: m.HIMSServicesManager })));
const AppointmentManager = lazy(() => import('./modules/hims/pages/AppointmentManager').then(m => ({ default: m.AppointmentManager })));
const PatientPortal = lazy(() => import('./modules/hims/pages/PatientPortal'));
const InsuranceClaimsManager = lazy(() => import('./modules/hims/pages/InsuranceClaimsManager').then(m => ({ default: m.InsuranceClaimsManager })));
const InpatientDashboard = lazy(() => import('./modules/hims/pages/InpatientDashboard').then(m => ({ default: m.InpatientDashboard })));

// 🏟️ مديول الاستاد والمنشآت الرياضية (Stadium - Lazy Loaded)
const StadiumDashboard = lazy(() => import('./modules/stadium/components/StadiumDashboard'));
const MemberManager = lazy(() => import('./modules/stadium/components/MemberManager'));
const FacilityManager = lazy(() => import('./modules/stadium/components/FacilityManager'));
const BookingManager = lazy(() => import('./modules/stadium/components/BookingManager'));
const RentalManager = lazy(() => import('./modules/stadium/components/RentalManager'));
const TrainingProgramManager = lazy(() => import('./modules/stadium/components/TrainingProgramManager'));
const CoachManager = lazy(() => import('./modules/stadium/components/CoachManager'));
const DisbursementManager = lazy(() => import('./modules/stadium/components/DisbursementManager'));
const StadiumCustodyManager = lazy(() => import('./modules/stadium/components/StadiumCustodyManager'));
const GateScanner = lazy(() => import('./modules/stadium/components/GateScanner'));
const FacilityMaintenanceManager = lazy(() => import('./modules/stadium/components/FacilityMaintenanceManager'));
const StadiumBudgetManager = lazy(() => import('./modules/stadium/components/StadiumBudgetManager'));
const TournamentManager = lazy(() => import('./modules/stadium/components/TournamentManager'));
const StadiumRevenueReport = lazy(() => import('./modules/stadium/reports/StadiumRevenueReport'));
const StadiumExpenseReport = lazy(() => import('./modules/stadium/reports/StadiumExpenseReport'));
const StadiumPnLReport = lazy(() => import('./modules/stadium/reports/StadiumPnLReport'));
const OccupancyReport = lazy(() => import('./modules/stadium/reports/OccupancyReport'));
const MemberAgingReport = lazy(() => import('./modules/stadium/reports/MemberAgingReport'));
const ProgramProfitReport = lazy(() => import('./modules/stadium/reports/ProgramProfitReport'));



// إنشاء عميل React Query
const queryClient = new QueryClient(); // Keep this line

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
                    <h2 className="text-2xl font-black mb-2 relative z-10">مرحباً بك في النسخة التجريبية 👋</h2> {/* Keep this line */}
                    <p className="opacity-90 text-sm font-medium relative z-10">استكشف نظام TriPro ERP بكل حرية</p>
                </div>
                <div className="p-8 space-y-6">
                    <p className="text-slate-600 font-medium leading-relaxed text-center text-sm">
                        هذه نسخة مخصصة للتجربة. يمكنك إضافة فواتير، قيود، وعملاء، ولكن يرجى الانتباه للقيود التالية:
                    </p>
                    <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex items-start gap-3 text-sm text-slate-700"> {/* Keep this line */}
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
                {message || "يرجى التواصل مع إدارة TriPro ERP لتفعيل اشتراككم والعودة للعمل."} {/* Keep this line */}
            </p>
            <button onClick={() => supabase.auth.signOut()} className="w-full bg-slate-100 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">تسجيل الخروج</button>
        </div>
    </div>
);

const ModuleGuard = ({ module, children }: { module: string, children: React.ReactNode }) => {
    const { organization, currentUser, isLoading, can } = useAccounting();
    
    // إذا كان هناك تحميل، لا نترك الشاشة بيضاء بل نعرض مؤشر التحميل
    if (isLoading && !currentUser) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-bold text-slate-500">جاري تحميل البيانات...</span>
                </div>
            </div>
        );
    }

    const role = currentUser?.role || '';
    const isSuperAdminUser = role === 'super_admin' || role === 'demo';
    const isPrivileged = role === 'super_admin' || role === 'admin' || role === 'owner' || role === 'manager' || role === 'demo';
    const allowedModules = (organization as any)?.allowed_modules || [];
    
    const expiryDate = (organization as any)?.subscription_expiry;
    const isExpired = expiryDate && expiryDate < new Date().toISOString().split('T')[0];

    if (organization && ((organization as any).is_active === false || isExpired) && !isPrivileged) {
        const message = (organization as any).suspension_reason || (isExpired ? "لقد انتهت فترة اشتراككم. يرجى التجديد للمتابعة." : undefined);
        return <SuspendedScreen message={message} />;
    }

    const normalizedModule = module === 'mfg' ? 'manufacturing' : module;
    
    // 🛡️ فحص دقيق لاشتراك المنشأة في الموديول
    let isAllowedByOrg = true;
    if (Array.isArray(allowedModules) && allowedModules.length > 0) {
      if (module === 'restaurant' || module === 'pos' || module === 'kitchen') {
        isAllowedByOrg = allowedModules.includes('restaurant') || allowedModules.includes('pos');
      } else if (module === 'retail') {
        isAllowedByOrg = allowedModules.includes('retail');
      } else if (module === 'construction') {
        isAllowedByOrg = allowedModules.includes('construction');
      } else if (module === 'hims') {
        isAllowedByOrg = allowedModules.includes('hims');
      } else if (module === 'stadium') {
        isAllowedByOrg = allowedModules.includes('stadium');
      } else if (module === 'manufacturing' || module === 'mfg') {
        isAllowedByOrg = allowedModules.includes('manufacturing') || allowedModules.includes('mfg');
      } else {
        isAllowedByOrg = allowedModules.includes(module) || allowedModules.includes(normalizedModule);
      }
    }

    const hasPermission = can ? (
      can(module, 'view') || 
      can(normalizedModule, 'view') || 
      can(module, 'manage') || 
      can(module, '*') || 
      can(normalizedModule, '*') ||
      can(module, 'pos') ||
      can(module, 'kitchen') ||
      can('accounting', 'view')
    ) : true;

    const isAllowed = isPrivileged || (isAllowedByOrg && hasPermission);

    if (!isAllowed) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

/** 🏗️ مكون وسيط لإدارة تدفق شاشات المقاولين عند الدخول من القائمة الجانبية **/
const SubcontractorStandalone = () => {
  const [view, setView] = useState<{type: 'list' | 'contracts' | 'billings' | 'statement', id: string}>({ type: 'list', id: '' });

  if (view.type === 'contracts') {
    return <SubcontractorContractsManager 
      subcontractorId={view.id} 
      onBack={() => setView({ type: 'list', id: '' })} 
      onViewBillings={(contractId) => setView({ type: 'billings', id: contractId })}
    />;
  }

  if (view.type === 'billings') {
    return <SubcontractorBillingManager 
      contractId={view.id} 
      onBack={() => setView({ type: 'list', id: '' })} // العودة للقائمة الرئيسية للتبسيط
    />;
  }

  if (view.type === 'statement') {
    return <SubcontractorStatement 
      subcontractorId={view.id} 
      onBack={() => setView({ type: 'list', id: '' })} 
    />;
  }

  return <SubcontractorManager 
    onBack={() => window.history.back()} 
    onViewContracts={(id) => setView({ type: 'contracts', id })} 
    onViewStatement={(id) => setView({ type: 'statement', id })}
  />;
};

const LazyLoadingFallback = () => (
    <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-bold text-slate-500">جاري تحميل الشاشة...</span>
        </div>
    </div>
);

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
                    <WorkspaceTabsBar />
                </div>
                {/* إضافة هوامش للطباعة لتجنب تداخل المحتوى مع الترويسة والتذييل */}
                <main className="flex-1 p-8 overflow-y-scroll bg-slate-50 print:bg-white print:p-0 print:overflow-visible print:h-auto print:mt-24 print:mb-12">
                    <div className="max-w-7xl mx-auto print:max-w-none print:w-full print:px-4">
                        <Suspense fallback={<LazyLoadingFallback />}>
                        <Routes>
                {/* المسارات الأساسية */}
                <Route
                  path="/"
                  element={
                    (currentUser?.role as string) === 'chef' || (currentUser?.role as string) === 'restaurant_cook'
                      ? <Navigate to="/kds" replace />
                      : (currentUser?.role as string) === 'restaurant_cashier' || (currentUser?.role as string) === 'cashier'
                      ? <Navigate to="/pos" replace />
                      : (currentUser?.role as string) === 'restaurant_waiter'
                      ? <Navigate to="/restaurant/waiter" replace />
                      : (currentUser?.role as string) === 'restaurant_driver'
                      ? <Navigate to="/restaurant/driver-dispatch" replace />
                      : <Dashboard />
                  }
                />

                {/* 2. مديول التصنيع (Manufacturing) */}
                {/* 🏥 مديول المستشفيات (HIMS) */}
                <Route path="/hims/*" element={
                  <ModuleGuard module="hims">
                    <Routes>
                      <Route path="patients" element={<PatientManager />} />
                      <Route path="appointments" element={<AppointmentManager />} />
                      <Route path="doctors" element={<DoctorManager />} />
                      <Route path="doctor-desktop" element={<DoctorDesktop />} />
                      <Route path="billing" element={<MedicalBilling />} />
                      <Route path="lab" element={<LabDashboard />} />
                      <Route path="lab-tracking" element={<LabSpecimenTracking />} />
                      <Route path="blood-bank" element={<BloodBankManager />} />
                      <Route path="radiology" element={<RadiologyDashboard />} />
                      <Route path="nurse-station" element={<NurseStation />} />
                      <Route path="er-triage" element={<ERTriageBoard />} />
                      <Route path="pharmacy" element={<PharmacyDashboard />} />
                      <Route path="admissions" element={<AdmissionManager />} />
                      <Route path="wards-management" element={<WardBedManager />} />
                      <Route path="surgeries" element={<SurgeryScheduler />} />
                      <Route path="operating-theater" element={<OperatingTheaterManager />} />
                      <Route path="staff-roster" element={<StaffRosterManager />} />
                      <Route path="doctor-kpis" element={<DoctorKPIs />} />
                      <Route path="services" element={<HIMSServicesManager />} />
                      <Route path="admin" element={<HIMSExecutiveDashboard />} />
                      <Route path="profitability" element={<HIMSProfitabilityReports />} />
                      <Route path="insurance-claims" element={<InsuranceClaimsManager />} />
                      <Route path="inpatient-board" element={<InpatientDashboard />} />
                    </Routes>
                  </ModuleGuard>
                } />

                {/* 🏟️ مديول الاستاد الرياضي ومركز التنمية الشبابية */}
                <Route path="/stadium/*" element={
                  <ModuleGuard module="stadium">
                    <Routes>
                      <Route index element={<StadiumDashboard />} />
                      <Route path="gate-scanner" element={<GateScanner />} />
                      <Route path="members" element={<MemberManager />} />
                      <Route path="facilities" element={<FacilityManager />} />
                      <Route path="maintenance" element={<FacilityMaintenanceManager />} />
                      <Route path="bookings" element={<BookingManager />} />
                      <Route path="rentals" element={<RentalManager />} />
                      <Route path="programs" element={<TrainingProgramManager />} />
                      <Route path="tournaments" element={<TournamentManager />} />
                      <Route path="coaches" element={<CoachManager />} />
                      <Route path="budget" element={<StadiumBudgetManager />} />
                      <Route path="disbursements" element={<DisbursementManager />} />
                      <Route path="custodies" element={<StadiumCustodyManager />} />
                      <Route path="reports/revenue" element={<StadiumRevenueReport />} />
                      <Route path="reports/expenses" element={<StadiumExpenseReport />} />
                      <Route path="reports/pnl" element={<StadiumPnLReport />} />
                      <Route path="reports/occupancy" element={<OccupancyReport />} />
                      <Route path="reports/member-aging" element={<MemberAgingReport />} />
                      <Route path="reports/program-profit" element={<ProgramProfitReport />} />

                    </Routes>

                  </ModuleGuard>
                } />


                <Route path="/mfg/*" element={
                  <ModuleGuard module="manufacturing">
                    <Routes>
                      <Route path="dashboard" element={<ManufacturingDashboard />} />
                      <Route path="orders" element={<WorkOrderManager />} />
                      <Route path="batch-orders" element={<BatchOrderManager />} />
                      <Route path="shop-floor" element={<ShopFloorManager />} />
                      <Route path="quality-control" element={<QualityControlManager />} />
                      <Route path="profitability" element={<ProductionProfitabilityReport />} />
                      <Route path="variance-report" element={<BOMVarianceReport />} />
                      <Route path="genealogy" element={<GenealogyViewer />} />
                      <Route path="routing-bom" element={<RoutingBOMManager />} />
                      <Route path="material-requests" element={<MaterialRequestsList />} />
                      <Route path="production-cost-analysis" element={<ProductionCostAnalysis />} />
                      <Route path="unit-cost-drilldown" element={<UnitCostDrillDown />} />
                      <Route path="oee-tracker" element={<MachineOeeTracker />} />
                      <Route path="maintenance" element={<MachineryMaintenanceManager />} />
                      <Route path="capacity-planning" element={<CapacityPlanningDashboard />} />
                      <Route path="gantt-schedule" element={<ProductionGanttScheduler />} />
                      <Route path="alerts-log" element={<ManufacturingAlertsLog />} />
                      <Route path="closing" element={<CostClosingDashboard />} />
                      <Route path="raw-materials-turnover" element={<RawMaterialsTurnover />} />
                      <Route path="wip-monthly-summary" element={<WIPMonthlySummaryReport />} />
                    </Routes>
                  </ModuleGuard>
                } />

                {/* 3. باقي المسارات (المحاسبة والتقارير) */}
                <Route path="/financial-ratios" element={<ModuleGuard module="accounting"><FinancialRatios /></ModuleGuard>} />
                <Route path="/expense-analysis" element={<ModuleGuard module="accounting"><ExpenseAnalysisReport /></ModuleGuard>} />
                <Route path="/budget-setup" element={<ModuleGuard module="accounting"><BudgetManager /></ModuleGuard>} />
                <Route path="/budget-report" element={<ModuleGuard module="accounting"><BudgetVarianceReport /></ModuleGuard>} />
                <Route path="/budget-variance" element={<ModuleGuard module="accounting"><BudgetVarianceReport /></ModuleGuard>} />
                <Route path="/fiscal-year-closing" element={<ModuleGuard module="accounting"><FiscalYearClosing /></ModuleGuard>} />
                <Route path="/fiscal-periods" element={<ModuleGuard module="accounting"><FiscalPeriodManager /></ModuleGuard>} />
                {/* 💰 مديول الخزينة والبنوك */}
                <Route path="/receipt-voucher" element={<ModuleGuard module="accounting"><ReceiptVoucherForm /></ModuleGuard>} />
                <Route path="/receipt-vouchers-list" element={<ModuleGuard module="accounting"><ReceiptVoucherList /></ModuleGuard>} />
                <Route path="/payment-voucher" element={<ModuleGuard module="accounting"><PaymentVoucherForm /></ModuleGuard>} />
                <Route path="/payment-vouchers-list" element={<ModuleGuard module="accounting"><PaymentVoucherList /></ModuleGuard>} />
                <Route path="/expense-voucher" element={<ModuleGuard module="accounting"><ExpenseVoucherForm /></ModuleGuard>} />
                <Route path="/transfer" element={<ModuleGuard module="accounting"><TransferForm /></ModuleGuard>} />
                <Route path="/customer-deposit" element={<ModuleGuard module="accounting"><CustomerDepositForm /></ModuleGuard>} />
                <Route path="/cheques" element={<ModuleGuard module="accounting"><ChequesPage /></ModuleGuard>} />
                <Route path="/letters-of-guarantee" element={<ModuleGuard module="accounting"><LettersOfGuaranteePage /></ModuleGuard>} />
                <Route path="/letters-of-credit" element={<ModuleGuard module="accounting"><LettersOfCreditPage /></ModuleGuard>} />
                <Route path="/cheque-movement-report" element={<ModuleGuard module="accounting"><ChequeMovementReport /></ModuleGuard>} />
                <Route path="/returned-cheques-report" element={<ModuleGuard module="accounting"><ReturnedChequesReport /></ModuleGuard>} />
                <Route path="/bank-reconciliation" element={<ModuleGuard module="accounting"><BankReconciliationForm /></ModuleGuard>} />
                <Route path="/cash-closing" element={<ModuleGuard module="accounting"><CashClosingForm /></ModuleGuard>} />
                <Route path="/payment-gateways" element={<ModuleGuard module="accounting"><PaymentGatewaySettings /></ModuleGuard>} />
                <Route path="/deficit-report" element={<ModuleGuard module="accounting"><DeficitReport /></ModuleGuard>} />
                
                {/* 🛒 مديول المبيعات والعملاء */}
                <Route path="/sales-invoice" element={<ModuleGuard module="sales"><SalesInvoiceForm /></ModuleGuard>} />
                <Route path="/invoices-list" element={<ModuleGuard module="sales"><InvoiceList /></ModuleGuard>} />
                <Route path="/recurring-invoices" element={<ModuleGuard module="sales"><RecurringInvoicesManager /></ModuleGuard>} />
                <Route path="/quotations-new" element={<ModuleGuard module="sales"><QuotationForm /></ModuleGuard>} />
                <Route path="/quotations-list" element={<ModuleGuard module="sales"><QuotationList /></ModuleGuard>} />
                <Route path="/sales-order-new" element={<ModuleGuard module="sales"><SalesOrderForm /></ModuleGuard>} />
                <Route path="/sales-orders" element={<ModuleGuard module="sales"><SalesOrders /></ModuleGuard>} />
                <Route path="/sales-return" element={<ModuleGuard module="sales"><SalesReturnForm /></ModuleGuard>} />
                <Route path="/sales-returns-list" element={<ModuleGuard module="sales"><SalesReturnsList /></ModuleGuard>} />
                <Route path="/free-returns-report" element={<ModuleGuard module="sales"><FreeReturnsReport /></ModuleGuard>} />
                <Route path="/credit-note" element={<ModuleGuard module="sales"><CreditNoteForm /></ModuleGuard>} />
                <Route path="/credit-notes-list" element={<ModuleGuard module="sales"><CreditNoteList /></ModuleGuard>} />
                <Route path="/offer-beneficiaries" element={<ModuleGuard module="sales"><OfferBeneficiariesReport /></ModuleGuard>} />
                <Route path="/customers" element={<ModuleGuard module="sales"><CustomerManager /></ModuleGuard>} />
                <Route path="/customer-statement" element={<ModuleGuard module="sales"><CustomerStatement /></ModuleGuard>} />
                <Route path="/customer-reconciliation" element={<ModuleGuard module="sales"><CustomerBalanceReconciliation /></ModuleGuard>} />
                <Route path="/customer-aging" element={<ModuleGuard module="sales"><CustomerAgingReport /></ModuleGuard>} />
                <Route path="/item-sales-analysis" element={<ModuleGuard module="sales"><ItemSalesAnalysis /></ModuleGuard>} />
                <Route path="/sales-reports" element={<ModuleGuard module="sales"><SalesReports /></ModuleGuard>} />
                
                {/* 🚚 مديول المشتريات والموردين */}
                <Route path="/purchases/rfq" element={<ModuleGuard module="purchases"><RfqBiddingManager /></ModuleGuard>} />
                <Route path="/purchase-invoice" element={<ModuleGuard module="purchases"><PurchaseInvoiceForm /></ModuleGuard>} />
                <Route path="/purchase-invoices-list" element={<ModuleGuard module="purchases"><PurchaseInvoiceList /></ModuleGuard>} />
                <Route path="/purchase-order-new" element={<ModuleGuard module="purchases"><PurchaseOrderForm /></ModuleGuard>} />
                <Route path="/purchase-order-list" element={<ModuleGuard module="purchases"><PurchaseOrderList /></ModuleGuard>} />
                <Route path="/purchase-return" element={<ModuleGuard module="purchases"><PurchaseReturnForm /></ModuleGuard>} />
                <Route path="/purchase-returns-list" element={<ModuleGuard module="purchases"><PurchaseReturnsList /></ModuleGuard>} />
                <Route path="/debit-note" element={<ModuleGuard module="purchases"><DebitNoteForm /></ModuleGuard>} />
                <Route path="/debit-notes-list" element={<ModuleGuard module="purchases"><DebitNoteList /></ModuleGuard>} />
                <Route path="/net-purchases-report" element={<ModuleGuard module="purchases"><NetPurchasesReport /></ModuleGuard>} />
                <Route path="/supplier-reconciliation" element={<ModuleGuard module="purchases"><SupplierBalanceReconciliation /></ModuleGuard>} />
                <Route path="/supplier-balances" element={<ModuleGuard module="purchases"><SupplierBalancesReport /></ModuleGuard>} />
                <Route path="/suppliers" element={<ModuleGuard module="purchases"><SupplierManager /></ModuleGuard>} />
                <Route path="/supplier-statement" element={<ModuleGuard module="purchases"><SupplierStatement /></ModuleGuard>} />
                <Route path="/supplier-aging" element={<ModuleGuard module="purchases"><SupplierAgingReport /></ModuleGuard>} />
                <Route path="/purchases/vendor-contracts" element={<ModuleGuard module="purchases"><VendorContractsManager /></ModuleGuard>} />
                <Route path="/purchase-analysis" element={<ModuleGuard module="purchases"><PurchaseAnalysisReport /></ModuleGuard>} />
                <Route path="/purchase-reports" element={<ModuleGuard module="purchases"><PurchaseReports /></ModuleGuard>} />
                
                {/* 📦 مديول المخازن والأصناف */}
                <Route path="/products" element={<ModuleGuard module="inventory"><ProductManager /></ModuleGuard>} />
                <Route path="/multi-uom-report" element={<ModuleGuard module="inventory"><MultiUomStockReport /></ModuleGuard>} />
                <Route path="/units-of-measure" element={<ModuleGuard module="inventory"><UnitsOfMeasureManager /></ModuleGuard>} />
                <Route path="/inventory/goods-receipt" element={<ModuleGuard module="inventory"><GoodsReceiptManager /></ModuleGuard>} />
                <Route path="/inventory/replenishment" element={<ModuleGuard module="inventory"><HypermarketReplenishment /></ModuleGuard>} />
                <Route path="/inventory-dashboard" element={<ModuleGuard module="inventory"><InventoryDashboard /></ModuleGuard>} />
                <Route path="/warehouses" element={<ModuleGuard module="inventory"><WarehouseManager /></ModuleGuard>} />
                <Route path="/inventory/bins" element={<ModuleGuard module="inventory"><BinLocationManager /></ModuleGuard>} />
                <Route path="/stock-transfer" element={<ModuleGuard module="inventory"><StockTransfer /></ModuleGuard>} />
                <Route path="/inventory/in-transit-transfers" element={<ModuleGuard module="inventory"><InTransitTransfersManager /></ModuleGuard>} />
                <Route path="/stock-transfer-list" element={<ModuleGuard module="inventory"><StockTransferList /></ModuleGuard>} />
                <Route path="/inventory-count" element={<ModuleGuard module="inventory"><InventoryCountForm /></ModuleGuard>} />
                <Route path="/inventory-history" element={<ModuleGuard module="inventory"><InventoryCountList /></ModuleGuard>} />
                <Route path="/stock-adjustment" element={<ModuleGuard module="inventory"><StockAdjustmentForm /></ModuleGuard>} />
                <Route path="/wastage" element={<ModuleGuard module="inventory"><WastageManager /></ModuleGuard>} />
                <Route path="/wastage-report" element={<ModuleGuard module="inventory"><WastageReport /></ModuleGuard>} />
                <Route path="/inventory-revaluation" element={<ModuleGuard module="inventory"><InventoryRevaluation /></ModuleGuard>} />
                <Route path="/stock-movement-cost" element={<ModuleGuard module="inventory"><StockMovementCostReport /></ModuleGuard>} />
                <Route path="/slow-moving" element={<ModuleGuard module="inventory"><SlowMovingReport /></ModuleGuard>} />
                <Route path="/opening-inventory" element={<ModuleGuard module="inventory"><OpeningInventory /></ModuleGuard>} />
                <Route path="/stock-card" element={<ModuleGuard module="inventory"><StockCard /></ModuleGuard>} />
                <Route path="/item-movement" element={<ModuleGuard module="inventory"><ItemMovementReport /></ModuleGuard>} />
                <Route path="/top-selling" element={<ModuleGuard module="inventory"><TopSellingReport /></ModuleGuard>} />
                <Route path="/item-profit" element={<ModuleGuard module="inventory"><ItemProfitReport /></ModuleGuard>} />
                <Route path="/detailed-stock-movement" element={<ModuleGuard module="inventory"><DetailedStockMovementReport /></ModuleGuard>} />

                <Route path="/construction/analytics" element={<ModuleGuard module="construction"><ConstructionDashboard /></ModuleGuard>} />
                <Route path="/construction/labor-reports" element={<ModuleGuard module="construction"><LaborCostReport /></ModuleGuard>} />
                <Route path="/construction" element={<ModuleGuard module="construction"><ProjectManager /></ModuleGuard>} />
                <Route path="/construction/site-logs" element={<ModuleGuard module="construction"><SiteDailyLogsManager /></ModuleGuard>} />
                <Route path="/construction/rfis-submittals" element={<ModuleGuard module="construction"><RfiSubmittalManager /></ModuleGuard>} />
                <Route path="/construction/inspections" element={<ModuleGuard module="construction"><WorkInspectionManager /></ModuleGuard>} />
                <Route path="/construction/waste-analytics" element={<ModuleGuard module="construction"><MaterialWasteAnalytics /></ModuleGuard>} />
                <Route path="/construction/price-escalation" element={<ModuleGuard module="construction"><PriceEscalationCalculator /></ModuleGuard>} />
                <Route path="/subcontractors" element={<ModuleGuard module="construction"><SubcontractorStandalone /></ModuleGuard>} />
                <Route path="/construction/subcontractor-analytics" element={<ModuleGuard module="construction"><SubcontractorAnalytics /></ModuleGuard>} />
                <Route path="/hr/dashboard" element={<ModuleGuard module="hr"><HrDashboard /></ModuleGuard>} />
                <Route path="/hr" element={<Navigate to="/hr/dashboard" replace />} />
                <Route path="/employees" element={<ModuleGuard module="hr"><EmployeeManager /></ModuleGuard>} />
                <Route path="/hr/biometrics" element={<ModuleGuard module="hr"><BiometricDeviceManager /></ModuleGuard>} />
                <Route path="/hr/shifts" element={<ModuleGuard module="hr"><ShiftManager /></ModuleGuard>} />
                <Route path="/hr/attendance" element={<ModuleGuard module="hr"><AttendanceManager /></ModuleGuard>} />
                <Route path="/hr/leaves" element={<ModuleGuard module="hr"><LeaveManager /></ModuleGuard>} />
                <Route path="/hr/penalties" element={<ModuleGuard module="hr"><PenaltiesAndRewards /></ModuleGuard>} />
                <Route path="/payroll-run" element={<ModuleGuard module="hr"><PayrollRun /></ModuleGuard>} />
                <Route path="/hr/payroll" element={<Navigate to="/payroll-run" replace />} />
                <Route path="/employee-advances" element={<ModuleGuard module="hr"><EmployeeAdvances /></ModuleGuard>} />
                <Route path="/hr/end-of-service" element={<ModuleGuard module="hr"><EndOfServiceCalculator /></ModuleGuard>} />
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
                <Route path="/restaurant-analytics" element={<ModuleGuard module="restaurant"><RestaurantAnalytics /></ModuleGuard>} />
                <Route path="/assets" element={<ModuleGuard module="accounting"><AssetManager /></ModuleGuard>} />
                <Route path="/important-reports" element={<ModuleGuard module="accounting"><ImportantReports /></ModuleGuard>} />
                <Route path="/reports/restaurant-sales" element={<ModuleGuard module="restaurant"><RestaurantSalesReport /></ModuleGuard>} />
                <Route path="/reports/sales-by-user" element={<ModuleGuard module="restaurant"><SalesByUserReport /></ModuleGuard>} />
                <Route path="/reports/wastage-analysis" element={<ModuleGuard module="restaurant"><WastageAnalysisReport /></ModuleGuard>} />
                <Route path="/reports/restaurant-profit" element={<ModuleGuard module="restaurant"><RestaurantProfitReport /></ModuleGuard>} />
                <Route path="/users" element={<UserManager />} />
                <Route path="/security-logs" element={<SecurityLogs />} /> 
                <Route path="/permissions" element={<PermissionsManager />} />
                <Route path="/recycle-bin" element={<RecycleBin />} />
                <Route path="/data-migration" element={<DataMigrationCenter />} />
                <Route path="/stress-test" element={<SystemStressTest />} />
                <Route path="/admin/test-dashboard" element={<ModuleGuard module="admin"><AdminTestDashboard /></ModuleGuard>} />
                <Route path="/saas-admin" element={currentUser?.role === 'super_admin' ? <SaasAdmin /> : <Navigate to="/" replace />} />
                <Route path="/profile" element={<UserProfile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/pos" element={<ModuleGuard module="restaurant"><PosScreen /></ModuleGuard>} /> 
                <Route path="/retail-pos" element={<ModuleGuard module="retail"><RetailPosScreen /></ModuleGuard>} /> 
                <Route path="/retail/price-checker" element={<ModuleGuard module="retail"><PriceCheckerKiosk /></ModuleGuard>} /> 
                <Route path="/price-checker" element={<Navigate to="/retail/price-checker" replace />} /> 
                <Route path="/retail/customer-display" element={<CustomerFacingScreen />} />
                <Route path="/retail/promotions" element={<ModuleGuard module="retail"><PromotionsManager /></ModuleGuard>} />
                <Route path="/promotions" element={<Navigate to="/retail/promotions" replace />} />
                <Route path="/inventory/pda-stocktaking" element={<ModuleGuard module="inventory"><MobilePdaStocktaking /></ModuleGuard>} />
                <Route path="/pda-stocktaking" element={<Navigate to="/inventory/pda-stocktaking" replace />} />
                <Route path="/inventory/expiry-radar" element={<ModuleGuard module="inventory"><ExpiryClearanceRadar /></ModuleGuard>} /> 
                <Route path="/expiry-radar" element={<Navigate to="/inventory/expiry-radar" replace />} /> 
                <Route path="/inventory/shelf-restock" element={<ModuleGuard module="inventory"><ShelfRestockReport /></ModuleGuard>} /> 
                <Route path="/shelf-restock" element={<Navigate to="/inventory/shelf-restock" replace />} /> 
                <Route path="/replenishment" element={<Navigate to="/inventory/replenishment" replace />} /> 
                <Route path="/goods-receipt" element={<Navigate to="/inventory/goods-receipt" replace />} /> 
                <Route path="/vendor-contracts" element={<Navigate to="/purchases/vendor-contracts" replace />} /> 
                <Route path="/kds" element={<ModuleGuard module="restaurant"><KdsScreen /></ModuleGuard>} /> 
                <Route path="/restaurant/expo" element={<ModuleGuard module="restaurant"><ExpoScreen /></ModuleGuard>} /> 
                <Route path="/expo" element={<Navigate to="/restaurant/expo" replace />} /> 
                <Route path="/restaurant/stations" element={<ModuleGuard module="restaurant"><KitchenStationManager /></ModuleGuard>} /> 
                <Route path="/kitchen-stations" element={<Navigate to="/restaurant/stations" replace />} /> 
                <Route path="/restaurant/aggregators" element={<ModuleGuard module="restaurant"><DeliveryAggregatorManager /></ModuleGuard>} /> 
                <Route path="/aggregators" element={<Navigate to="/restaurant/aggregators" replace />} /> 
                <Route path="/restaurant/channel-pricing" element={<ModuleGuard module="restaurant"><MultiChannelPricingManager /></ModuleGuard>} /> 
                <Route path="/channel-pricing" element={<Navigate to="/restaurant/channel-pricing" replace />} /> 
                <Route path="/restaurant/driver-dispatch" element={<ModuleGuard module="restaurant"><DriverDispatchManager /></ModuleGuard>} /> 
                <Route path="/driver-dispatch" element={<Navigate to="/restaurant/driver-dispatch" replace />} /> 
                <Route path="/restaurant/tips-pool" element={<ModuleGuard module="restaurant"><TipsPoolManager /></ModuleGuard>} /> 
                <Route path="/tips-pool" element={<Navigate to="/restaurant/tips-pool" replace />} /> 
                <Route path="/restaurant/win-back" element={<ModuleGuard module="restaurant"><CustomerWinBackManager /></ModuleGuard>} /> 
                <Route path="/win-back" element={<Navigate to="/restaurant/win-back" replace />} /> 
                <Route path="/restaurant/auto-reorder" element={<ModuleGuard module="restaurant"><AutoReorderManager /></ModuleGuard>} /> 
                <Route path="/auto-reorder" element={<Navigate to="/restaurant/auto-reorder" replace />} /> 
                <Route path="/restaurant/happy-hours" element={<ModuleGuard module="restaurant"><HappyHourManager /></ModuleGuard>} /> 
                <Route path="/happy-hours" element={<Navigate to="/restaurant/happy-hours" replace />} /> 
                <Route path="/kitchen-end-day" element={<ModuleGuard module="restaurant"><KitchenEndDayCount /></ModuleGuard>} /> 
                <Route path="/restaurant/butchering-yield" element={<ModuleGuard module="restaurant"><ButcheringYieldManager /></ModuleGuard>} /> 
                <Route path="/butchering-yield" element={<Navigate to="/restaurant/butchering-yield" replace />} /> 
                <Route path="/restaurant/waiter" element={<ModuleGuard module="restaurant"><MobileWaiterScreen /></ModuleGuard>} /> 
                <Route path="/waiter" element={<Navigate to="/restaurant/waiter" replace />} /> 
                <Route path="/restaurant/printers" element={<ModuleGuard module="restaurant"><ThermalPrintersManager /></ModuleGuard>} /> 
                <Route path="/printers" element={<Navigate to="/restaurant/printers" replace />} /> 
                <Route path="/restaurant/loyalty" element={<ModuleGuard module="restaurant"><LoyaltyProgramManager /></ModuleGuard>} /> 
                <Route path="/loyalty" element={<Navigate to="/restaurant/loyalty" replace />} /> 
                <Route path="/restaurant/kiosk" element={<SelfOrderingKiosk />} /> 
                <Route path="/kiosk" element={<Navigate to="/restaurant/kiosk" replace />} /> 

                {/* 🔗 مسارات التوجيه السريع والتوافق */}
                <Route path="/sales" element={<Navigate to="/invoices-list" replace />} />
                <Route path="/purchases" element={<Navigate to="/purchase-invoices-list" replace />} />
                <Route path="/vouchers" element={<Navigate to="/receipt-vouchers-list" replace />} />
                <Route path="/manufacturing" element={<Navigate to="/mfg/dashboard" replace />} />
                <Route path="/hims" element={<Navigate to="/hims/patients" replace />} />
                
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>
                <PrintFooter />
            </div>
        </div>
    );
};

// 🛡️ مكون حماية المسارات (ProtectedRoute)
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  if (!currentUser) {
    // إذا لم يكن مسجلاً، يظهر صفحة الهبوط (LandingPage) التي تحتوي على خيار الدخول
    return <LandingPage />;
  }
  return <>{children}</>;
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
      <Suspense fallback={<LazyLoadingFallback />}>
        <Routes>
          {/* 1. المسارات العامة (متاحة للجميع دون تسجيل دخول) */}
          <Route path="/customer-display" element={<CustomerDisplay />} />
          <Route path="/menu/:qrKey" element={<GuestMenuLayout />} />
          <Route path="/menu" element={<GuestMenuLayout />} />
          <Route path="/restaurant/kiosk" element={<SelfOrderingKiosk />} />
          <Route path="/kiosk" element={<SelfOrderingKiosk />} />
          <Route path="/public/hims/visit/:visitId" element={<PatientPortal />} />

          {/* 2. المسارات المحمية (تتطلب حساب موظف) */}
          <Route path="/*" element={<ProtectedRoute><MainLayout /></ProtectedRoute>} />
        </Routes>
      </Suspense>
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
