# 🧠 ذاكرة المشروع (AI Project Context)
📅 تاريخ التحديث: ٤‏/٦‏/٢٠٢٦، ٣:٥٤:٠٩ م
ℹ️ تعليمات للذكاء الاصطناعي: هذا الملف يحتوي على هيكل المشروع الحالي وأهم الأكواد. استخدمه كمرجع قبل اقتراح أي كود جديد لتجنب التكرار.

## 1. هيكل الملفات والمجلدات (File Structure)
(هذه الملفات موجودة بالفعل، لا تقم بإنشائها مرة أخرى)

```text
📁 modules/
  📁 accounting/
    📄 AccountingDashboard.tsx
    📄 AccountList.tsx
    📄 AddAccountModal.tsx
    📄 BalanceSheet.tsx
    📄 BudgetManager.tsx
    📄 BudgetVarianceReport.tsx
    📄 CashFlowReport.tsx
    📄 CashFlowStatement.tsx
    📄 FiscalYearClosing.tsx
    📄 GeneralJournal.tsx
    📄 GeneralLedger.tsx
    📄 IncomeStatement.tsx
    📄 JournalAttachments.tsx
    📄 JournalEntriesExport.tsx
    📄 JournalEntryForm.tsx
    📄 JournalEntryView.tsx
    📄 Reports.tsx
    📄 TrialBalanceAdvanced.tsx
    📄 verify_closing.sql
  📁 admin/
    📄 auto_setup_new_org.sql
    📄 DataMigrationCenter.tsx
    📄 PermissionsManager.tsx
    📄 RecycleBin.tsx
    📄 SaaSAdmin.tsx
  📁 assets/
    📄 AssetManager.tsx
  📁 banking/
    📄 ChequeMovementReport.tsx
    📄 ChequePrint.tsx
    📄 ChequesPage.tsx
    📄 ReturnedChequesReport.tsx
  📁 construction/
    📁 components/
      📄 BillingManager.tsx
      📄 BOQManager.tsx
      📄 ChangeOrderManager.tsx
      📄 ConstructionDashboard.tsx
      📄 CustodyManager.tsx
      📄 EquipmentManager.tsx
      📄 MaterialIssueForm.tsx
      📄 ProjectChangeOrderForm.tsx
      📄 ProjectClosingForm.tsx
      📄 ProjectComprehensiveReport.tsx
      📄 ProjectForm.tsx
      📄 ProjectGanttChart.tsx
      📄 ProjectHealthGauges.tsx
      📄 ProjectManager.tsx
      📄 ProjectMilestonesManager.tsx
      📄 RetentionReleaseManager.tsx
      📄 SiteAssetsCustody.tsx
      📄 SiteAttachmentManager.tsx
      📄 SiteRequisitionManager.tsx
      📄 SubcontractorBillingManager.tsx
      📄 SubcontractorContractsManager.tsx
      📄 SubcontractorForm.tsx
      📄 SubcontractorManager.tsx
      📄 SubcontractorStatement.tsx
    📁 reports/
      📄 LaborCostReport.tsx
      📄 ProjectExecutiveReport.tsx
      📄 ProjectProfitabilityDashboard.tsx
      📄 SubcontractorAnalytics.tsx
  📁 finance/
    📁 components/
      📄 BankReconciliationForm.tsx
      📄 CashClosingForm.tsx
      📄 CustomerDepositForm.tsx
      📄 ExpenseVoucherForm.tsx
      📄 PaymentVoucherForm.tsx
      📄 ReceiptVoucherForm.tsx
      📄 TransferForm.tsx
    📁 reports/
      📄 CustomerDepositPrint.tsx
      📄 ExpenseVoucherPrint.tsx
      📄 PaymentVoucherList.tsx
      📄 PaymentVoucherPrint.tsx
      📄 ReceiptVoucherList.tsx
      📄 ReceiptVoucherPrint.tsx
    📄 ci.yml
    📄 keep-alive.ts
  📁 hims/
    📁 components/
      📄 DischargeManager.tsx
      📄 HospitalBillingEngine.tsx
      📄 OrderManagement.tsx
      📄 PatientMedicalRecord.tsx
      📄 PrescriptionForm.tsx
      📄 SurgeryBookingForm.tsx
      📄 SurgeryExecutionForm.tsx
      📄 VitalsForm.tsx
      📄 WardBedManager.tsx
    📁 pages/
      📄 AdmissionManager.tsx
      📄 AppointmentManager.tsx
      📄 BloodBankDashboard.tsx
      📄 DoctorDesktop.tsx
      📄 ERTriageBoard.tsx
      📄 HIMSExecutiveDashboard.tsx
      📄 HIMSProfitabilityReports.tsx
      📄 InpatientDashboard.tsx
      📄 InsuranceClaimsManager.tsx
      📄 LabDashboard.tsx
      📄 LabSpecimenTracking.tsx
      📄 MedicalBilling.tsx
      📄 NurseStation.tsx
      📄 PatientManager.tsx
      📄 PharmacyDashboard.tsx
      📄 RadiologyDashboard.tsx
      📄 StaffRosterManager.tsx
      📄 SurgeryScheduler.tsx
  📁 hooks/
    📄 usePermissions.ts
  📁 hr/
    📁 components/
      📄 EmployeeAdvances.tsx
      📄 EmployeeManager.tsx
      📄 PayrollRun.tsx
    📁 reports/
      📄 EmployeeReports.tsx
      📄 EmployeeStatement.tsx
      📄 PayrollReport.tsx
  📁 inventory/
    📄 DetailedStockMovementReport.tsx
    📄 InventoryCountForm.tsx
    📄 InventoryCountList.tsx
    📄 InventoryDashboard.tsx
    📄 InventoryRevaluation.tsx
    📄 ItemMovementReport.tsx
    📄 ItemProfitReport.tsx
    📄 OpeningInventory.tsx
    📄 ProductManager.tsx
    📄 SlowMovingReport.tsx
    📄 StockAdjustmentForm.tsx
    📄 StockCard.tsx
    📄 StockMovementCostReport.tsx
    📄 StockTransfer.tsx
    📄 StockTransferList.tsx
    📄 TopSellingReport.tsx
    📄 UomManager.tsx
    📄 useProducts.ts
    📄 WarehouseManager.tsx
    📄 WastageManager.tsx
    📄 WastageReport.tsx
  📁 manufacturing/
    📁 components/
      📄 BatchOrderManager.tsx
      📄 ByProductModal.tsx
      📄 CostClosingDashboard.tsx
      📄 ManufacturingDashboard.tsx
      📄 ManufacturingManager.tsx
      📄 MaterialRequestsList.tsx
      📄 QualityControlManager.tsx
      📄 RoutingBOMManager.tsx
      📄 ScrapModal.tsx
      📄 ShopFloorManager.tsx
      📄 StageLedger.tsx
      📄 WorkOrderManager.tsx
    📁 reports/
      📄 AdvancedCostingReports.tsx
      📄 BOMVarianceReport.tsx
      📄 GenealogyViewer.tsx
      📄 ManufacturingAlertsLog.tsx
      📄 ProductionCostAnalysis.tsx
      📄 ProductionProfitabilityReport.tsx
      📄 RawMaterialsTurnover.tsx
      📄 StageVarianceReport.tsx
      📄 UnitCostDrillDown.tsx
      📄 WIPMonthlySummaryReport.tsx
      📄 WorkCenterEfficiencyTable.tsx
    📁 services/
    📁 types.ts/
    📄 MFG_TEST_SCENARIO.md
  📁 purchases/
    📄 DebitNoteForm.tsx
    📄 DebitNoteList.tsx
    📄 NetPurchasesReport.tsx
    📄 PurchaseAnalysisReport.tsx
    📄 PurchaseInvoiceForm.tsx
    📄 PurchaseInvoiceList.tsx
    📄 PurchaseOrderForm.tsx
    📄 PurchaseOrderList.tsx
    📄 PurchaseReports.tsx
    📄 PurchaseReturnForm.tsx
    📄 SupplierAgingReport.tsx
    📄 SupplierBalanceReconciliation.tsx
    📄 SupplierBalancesReport.tsx
    📄 SupplierManager.tsx
    📄 SupplierStatement.tsx
  📁 reports/
    📄 AttachmentsReport.tsx
    📄 DailySalesReport.tsx
    📄 DeficitReport.tsx
    📄 ExpenseAnalysisReport.tsx
    📄 FinancialRatios.tsx
    📄 ImportantReports.tsx
    📄 ItemSalesAnalysis.tsx
    📄 MultiCurrencyStatement.tsx
    📄 PaymentMethodReport.tsx
    📄 PerformanceComparisonReport.tsx
    📄 Reports.tsx
    📄 TaxReturnReport.tsx
  📁 restaurant/
    📁 components/
      📁 KDS/
        📄 KdsScreen.tsx
        📄 KitchenTicket.tsx
      📁 Management/
        📄 KitchenEndDayCount.tsx
        📄 ModifierManagement.tsx
        📄 RecipeManagement.tsx
      📁 Modals/
        📄 BulkQRCodeModal.tsx
        📄 CopyModifiersModal.tsx
        📄 ModifierSelectionModal.tsx
        📄 PaymentModal.tsx
        📄 QRCodeModal.tsx
      📁 POS/
        📄 CustomerDisplay.tsx
        📄 OrderSummary.tsx
        📄 PendingOrdersSidebar.tsx
        📄 PosScreen.tsx
      📄 GuestMenuLayout.tsx
    📁 reports/
      📄 RestaurantProfitReport.tsx
      📄 RestaurantSalesReport.tsx
      📄 SalesByUserReport.tsx
      📄 WastageAnalysisReport.tsx
    📁 services/
      📄 modifierService.ts
      📄 posService.ts
    📁 types.ts/
    📁 utils/
      📄 runRestaurantFlowTest.ts
  📁 sales/
    📄 CreditNoteForm.tsx
    📄 CreditNoteList.tsx
    📄 CustomerAgingReport.tsx
    📄 CustomerManager.tsx
    📄 CustomerStatement.tsx
    📄 FreeReturnsReport.tsx
    📄 index.css
    📄 InvoiceList.tsx
    📄 MultiUomStockReport.tsx
    📄 OfferBeneficiariesReport.tsx
    📄 QuotationForm.tsx
    📄 QuotationList.tsx
    📄 Reports.tsx
    📄 SalesInvoiceForm.tsx
    📄 SalesInvoicePrint.tsx
    📄 SalesOrders.tsx
    📄 SalesReports.tsx
    📄 SalesReturnForm.tsx
📁 components/
  📄 _redirects
  📄 About.tsx
  📄 AdminTestDashboard.tsx
  📄 backup_service.sql
  📄 Dashboard.tsx
  📄 DashboardAlerts.tsx
  📄 DemoTour.tsx
  📄 DEPLOYMENT_STRATEGY.md
  📄 DraftJournalsList.tsx
  📄 FINAL_FEATURES_SUMMARY.md
  📄 full-flow-test.ts
  📄 Header.tsx
  📄 index.ts
  📄 IntegrityCheckScreen.tsx
  📄 InvoiceItemsList.tsx
  📄 LandingPage.tsx
  📄 Login.tsx
  📄 LuxuryReportEngine.ts
  📄 Maintenance.tsx
  📄 manufacturing_module.sql
  📄 NotificationCenter.tsx
  📄 OfflineSyncProvider.tsx
  📄 PrintableInvoice.tsx
  📄 ProductStockViewer.tsx
  📄 ProjectSCurveChart.tsx
  📄 Quotations.tsx
  📄 ReportHeader.tsx
  📄 run-flow-test.ts
  📄 search-tool.ts
  📄 SearchableSelect.tsx
  📄 SecurityLogs.tsx
  📄 Settings.tsx
  📄 setup_notifications.sql
  📄 Sidebar.tsx
  📄 SmartRiskAlerts.tsx
  📄 UnitsOfMeasureManager.tsx
  📄 usePagination.ts
  📄 UserGuide.tsx
  📄 UserManager.tsx
  📄 UserProfile.tsx
📁 services/
  📁 mfg/
  📁 migrations/
    📁 archive/
      📄 admin_platform_stats.sql
      📄 check_missing_rls.sql
      📄 check_user_status.sql
      📄 client_backup.sql
      📄 comprehensive_fix_403.sql
      📄 comprehensive_fix.sql
      📄 create_fix_schema_function.sql
      📄 debug_rls_permissions.sql
      📄 deploy_all_functionss.sql
      📄 diagnostic_auth_debug.sql
      📄 diagnostic_invoice_journal.sql
      📄 disable_all_rls.sql
      📄 ensure_returns_columns.sql
      📄 export_org_data.sql
      📄 factory_reset_complete.sql
      📄 final_fix_42501.sql
      📄 financial_rls_updates.sql
      📄 fix_all_rls_policies.sql
      📄 fix_auth_profiles.sql
      📄 fix_comprehensive_all_tables.sql
      📄 fix_customer_balance_mismatch.sql sql
      📄 fix_deficit_relationship.sql
      📄 fix_final_20_tables_rls.sql
      📄 fix_invoices_schema.sql
      📄 fix_item_categories_description.sql
      📄 fix_missing_rls.sql
      📄 fix_notification_requirements.sql
      📄 fix_notification_schema.sql
      📄 fix_null_warehouse_returns.sql
      📄 fix_opening_inventory_schema.sql
      📄 fix_orphaned_stock.sql
      📄 fix_payroll_account.sql
      📄 fix_remaining_rls_tables.sql
      📄 fix_rls_permissions.sql
      📄 fix_schema_inconsistencies.sql
      📄 fix_user_creation.sql
      📄 invoice_items_queries.sql
      📄 link_returns_to_invoices.sql
      📄 manufacturing_alerts.sql
      📄 manufacturing_functions.sql
      📄 manufacturing_qc_variance.sql
      📄 manufacturing_rls.sql
      📄 manufacturing_setup.sql
      📄 manufacturing_stabilization.sql
      📄 mfg_rls_test.sql
      📄 populate_demo_activity.sql
      📄 quick_diagnostic.sql
      📄 reset_database_clean.sql
      📄 restore_from_backup.sql
      📄 secure_tables.sql
      📄 setup_client_admin.sql
      📄 setup_complete_demo.sql
      📄 setup_demo_environment.sql
      📄 setup_demo_protection.sql
      📄 setup_new_client_db.sql
      📄 simple_debug.sql
      📄 test_approve_invoice.sql
      📄 test_clear_demo_data.sql
      📄 test_payment_voucher.sql
      📄 test_receipt_voucher_logic.sql
      📄 test_receipt_voucher_v2.sql
      📄 ultimate_data_repair.sql
      📄 verify_and_fix_returns_schema.sql
      📄 verify_closing.sql
      📄 verify_demo_security.sql
      📄 verify_frontend_integration.sql
      📄 verify_functions.sql
      📄 verify_reset.sql
      📄 verify_rls_status.sql
      📄 verify_system_health.sql
    📄 2026-01-25_create_restaurant_module.sql
    📄 2026-01-26_restaurant_functions.sql
    📄 2026-01-27_restaurant_accounting_functions.sql
    📄 2026-01-28_sales_reports.sql
    📄 2026-02-11_create_invoice_items.sql
    📄 2026-03-15_restaurant_accounting_integration.sql
    📄 2026-03-16_add_unit_to_products.sql
    📄 2026-03-16_fix_restaurant_order_ambiguity.sql
    📄 2026-03-16_update_product_type_constraint.sql
    📄 2026-03-17_inventory_consumption.sql
    📄 2026-03-18_shift_management.sql
    📄 2026-03-19_accounting_integration.sql
    📄 2026-03-21_restaurant_accounting.sql
    📄 2026-03-22_advanced_modifiers.sql
    📄 2026-03-22_products_view.sql
    📄 2026-03-25_realtime_inventory_deduction.sql
    📄 2026-03-26_wastage_management.sql
    📄 2026-03-27_wastage_analysis_report.sql
    📄 2026-03-30_fix_unbalanced_journals.sql
    📄 2026-03-31_fix_historical_unbalanced_journals.sql
    📄 2026-04-01_fix_report_account_types.sql
    📄 2026-04-03_enforce_lowercase_types.sql
    📄 2026-04-05_add_notes_to_inventory_counts.sql
    📄 2026-04-05_auto_assign_qr_orders.sql
    📄 2026-04-06_fix_sales_account_missing.sql
    📄 2026-04-10_fix_sync_role_permissions.sql
    📄 add_account_mappings.sql
    📄 add_category_image.sql
    📄 add_created_by_columns.sql
    📄 add_currency_to_vouchers.sql
    📄 add_decimal_places_column.sql
    📄 add_max_deficit_column.sql
    📄 add_original_invoice_column.sql
    📄 add_overhead_percentage.sql
    📄 add_payment_method_column.sql
    📄 add_product_costs.sql
    📄 add_product_unit.sql
    📄 approve_credit_note_rpc.sql
    📄 approve_debit_note_rpc.sql
    📄 approve_payment_voucher_rpc.sql
    📄 approve_purchase_invoice_rpc.sql
    📄 approve_purchase_return_rpc.sql
    📄 approve_receipt_voucher_rpc.sql
    📄 approve_sales_return_rpc.sql
    📄 cash_closing_setup.sql
    📄 create_missing_tables.sql
    📄 database_updates_2026-04-05.sql
    📄 egyptian_coa_full.sql
    📄 fix_missing_accounts.sql
    📄 increase_user_limit.sql
    📄 inventory_costing_setup.sql
    📄 optimize_database_performance.sql
    📄 recalculate_stock_v4.sql
    📄 rejected_closings_setup.sql
    📄 reports_functions.sql
    📄 run_period_depreciation_rpc.sql
    📄 schema.sql
    📄 secure_journals.sql
    📄 setup_notifications.sql
    📄 sync_missing_accounts.sql
    📄 system_stabilization.sql
    📄 update_products_schema_v2.sql
    📄 voucher_attachments_setup.sql
  📄 accountService.ts
  📄 ArchiveManager.tsx
  📄 backup_script.sh
  📄 BackupRestoreManager.tsx
  📄 ClinicalPharmacy.tsx
  📄 complete_manufacturing_module.sql
  📄 construction_module.sql
  📄 create-client.ts
  📄 DailyReportForm.tsx
  📄 full_unified_system.sql
  📄 geminiService.ts
  📄 hims_master_setup.sql
  📄 hims_module.sql
  📄 himsService.ts
  📄 index.ts
  📄 initialize_egyptian_coa.sql
  📄 invoiceItems.ts
  📄 master_setup.sql
  📄 mfg_advanced_costing.sql
  📄 mfg_cost_analytics.sql
  📄 NEXT_PHASE_ROADMAP.md
  📄 NotificationScheduler.ts
  📄 notificationService.ts
  📄 notificationTestUtils.ts
  📄 offlineService.ts
  📄 ProjectInsights.tsx
  📄 ReportBuilder.tsx
  📄 restaurant_analytics_views.sql
  📄 RestaurantAnalytics.tsx
  📄 setup_rls.sql
  📄 SiteAttendanceManager.tsx
  📄 SiteImageGallery.tsx
  📄 SubcontractorPaymentButton.tsx
  📄 supabaseClient.ts
  📄 unit_test_restaurant_lifecycle.sql
  📄 updated_system_stabilization.sql
  📄 UserManagement.tsx
  📄 WhatsAppButton.tsx
📁 context/
  📄 AccountingContext.tsx
  📄 AuthContext.tsx
  📄 DemoModeBanner.tsx
  📄 seed_demo_data.sql
  📄 ToastContext.tsx
  📄 useDebounce.ts
```

## 2. محتوى الملفات الحيوية (Critical Files Content)

### 📄 package.json
```json
{
  "name": "tripro-erp",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "npm run security-audit && tsc && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "demo": "vite --mode demo",
    "preview": "vite preview",
    "update-memory": "node update_memory.js",
    "security-audit": "node scripts/security-audit.js",
    "security-check": "npm audit && npm run security-audit"
  },
  "dependencies": {
    "@ant-design/icons": "^6.2.3",
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@google/genai": "^1.34.0",
    "@hookform/resolvers": "^5.4.0",
    "@supabase/supabase-js": "^2.39.0",
    "@tanstack/react-query": "^5.90.16",
    "@types/nodemailer": "^7.0.11",
    "antd": "^6.4.3",
    "date-fns": "^4.2.1",
    "dexie": "^4.3.0",
    "dexie-react-hooks": "^4.2.0",
    "html2canvas": "^1.4.1",
    "jspdf": "^4.0.0",
    "lucide-react": "^0.294.0",
    "nodemailer": "^8.0.1",
    "qrcode.react": "^4.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.76.0",
    "react-hot-toast": "^2.6.0",
    "react-router-dom": "^6.20.0",
    "react-to-print": "^3.3.0",
    "recharts": "^3.6.0",
    "uuid": "^13.0.0",
    "xlsx": "^0.18.5",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@types/uuid": "^10.0.0",
    "@vercel/node": "^5.6.11",
    "@vitejs/plugin-react": "^4.2.0",
    "@vitest/ui": "^2.0.4",
    "autoprefixer": "^10.4.16",
    "jsdom": "^24.1.1",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "typescript": "^5.2.2",
    "vite": "^5.0.0",
    "vitest": "^2.0.4"
  }
}

```

### 📄 App.tsx
```typescript
import React, { useState, useEffect } from 'react';
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
import AdminTestDashboard from './components/AdminTestDashboard';
import Quotations from './components/Quotations';
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
import BankReconciliationForm from './modules/finance/components/BankReconciliationForm';
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
import MultiUomStockReport from './modules/sales/MultiUomStockReport';
import ReceiptVoucherForm from './modules/finance/components/ReceiptVoucherForm';
import InventoryRevaluation from './modules/inventory/InventoryRevaluation';
import StockMovementCostReport from './modules/inventory/StockMovementCostReport';
import ReceiptVoucherList from './modules/finance/reports/ReceiptVoucherList';
import PaymentVoucherForm from './modules/finance/components/PaymentVoucherForm';
import WastageManager from './modules/inventory/WastageManager';
import InventoryDashboard from './modules/inventory/InventoryDashboard';
import PaymentVoucherList from './modules/finance/reports/PaymentVoucherList';
import ExpenseVoucherForm from './modules/finance/components/ExpenseVoucherForm';
import CustomerDepositForm from './modules/finance/components/CustomerDepositForm';
import TransferForm from './modules/finance/components/TransferForm';
import StockTransfer from './modules/inventory/StockTransfer';
import StockTransferList from './modules/inventory/StockTransferList';
import WarehouseManager from './modules/inventory/WarehouseManager';
import CashClosingForm from './modules/finance/components/CashClosingForm';
import DeficitReport from './modules/reports/DeficitReport';
import Login from './components/Login';
import UserManager from './components/UserManager';
import Settings from './components/Settings';
import { ChequesPage } from './modules/banking/ChequesPage';
import AssetManager from './modules/assets/AssetManager';
import EmployeeManager from './modules/hr/components/EmployeeManager';
import PayrollRun from './modules/hr/components/PayrollRun';
import EmployeeAdvances from './modules/hr/components/EmployeeAdvances';
import PayrollReport from './modules/hr/reports/PayrollReport';
import EmployeeStatement from './modules/hr/reports/EmployeeStatement';
import EmployeeReports from './modules/hr/reports/EmployeeReports';
import SalesOrders from './modules/sales/SalesOrders';
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
import WorkOrderManager from './modules/manufacturing/components/WorkOrderManager';
import ProductionCostAnalysis from './modules/manufacturing/reports/ProductionCostAnalysis';
import UnitCostDrillDown from './modules/manufacturing/reports/UnitCostDrillDown';
import ManufacturingAlertsLog from './modules/manufacturing/reports/ManufacturingAlertsLog';
import CostClosingDashboard from './modules/manufacturing/components/CostClosingDashboard';
import SecurityLogs from './components/SecurityLogs';
import ProjectManager from './modules/construction/components/ProjectManager';
import ConstructionDashboard from './modules/construction/components/ConstructionDashboard';
import LaborCostReport from './modules/construction/reports/LaborCostReport';
import SubcontractorManager from './modules/construction/components/SubcontractorManager';
import SubcontractorContractsManager from './modules/construction/components/SubcontractorContractsManager';
import SubcontractorBillingManager from './modules/construction/components/SubcontractorBillingManager';
import SubcontractorAnalytics from './modules/construction/reports/SubcontractorAnalytics';
import SubcontractorStatement from './modules/construction/components/SubcontractorStatement';
import PermissionsManager from './modules/admin/PermissionsManager';
import Maintenance from './components/Maintenance';
import TaxReturnReport from './modules/reports/TaxReturnReport';
import PerformanceComparisonReport from './modules/reports/PerformanceComparisonReport';
import RecycleBin from './modules/admin/RecycleBin';
import SaasAdmin from './modules/admin/SaaSAdmin';
import DataMigrationCenter from './modules/admin/DataMigrationCenter';
import MultiCurrencyStatement from './modules/reports/MultiCurrencyStatement'; // Re-add this import
import PaymentMethodReport from './modules/reports/PaymentMethodReport';
import UserGuide from './components/UserGuide';
import AttachmentsReport from './modules/reports/AttachmentsReport';
import DetailedStockMovementReport from './modules/inventory/DetailedStockMovementReport';
import ManufacturingDashboard from './modules/manufacturing/components/ManufacturingDashboard';
import BatchOrderManager from './modules/manufacturing/components/BatchOrderManager';
import ShopFloorManager from './modules/manufacturing/components/ShopFloorManager';
import QualityControlManager from './modules/manufacturing/components/QualityControlManager';
import BOMVarianceReport from './modules/manufacturing/reports/BOMVarianceReport';
import GenealogyViewer from './modules/manufacturing/reports/GenealogyViewer';
import ProductionProfitabilityReport from './modules/manufacturing/reports/ProductionProfitabilityReport';
import RoutingBOMManager from './modules/manufacturing/components/RoutingBOMManager';
import MaterialRequestsList from './modules/manufacturing/components/MaterialRequestsList';
import { RawMaterialsTurnover } from './modules/manufacturing/reports/RawMaterialsTurnover';
import WIPMonthlySummaryReport from './modules/manufacturing/reports/WIPMonthlySummaryReport';
import UserProfile from './components/UserProfile';
import { DemoTour } from './components/DemoTour';
import LandingPage from './components/LandingPage';
import UnitsOfMeasureManager from './components/UnitsOfMeasureManager';
import OfferBeneficiariesReport from './modules/sales/OfferBeneficiariesReport';
import GuestMenuLayout from './modules/restaurant/components/GuestMenuLayout';
import ChequeMovementReport from './modules/banking/ChequeMovementReport';
import ReturnedChequesReport from './modules/banking/ReturnedChequesReport';
import About from './components/About';
import SupplierBalancesReport from './modules/purchases/SupplierBalancesReport';
import PosScreen from './modules/restaurant/components/POS/PosScreen';
import KdsScreen from './modules/restaurant/components/KDS/KdsScreen';
import KitchenEndDayCount from './modules/restaurant/components/Management/KitchenEndDayCount';
import RestaurantSalesReport from './modules/restaurant/reports/RestaurantSalesReport';
import SalesByUserReport from './modules/restaurant/reports/SalesByUserReport';
import WastageAnalysisReport from './modules/restaurant/reports/WastageAnalysisReport';
import RestaurantProfitReport from './modules/restaurant/reports/RestaurantProfitReport';
import { OfflineSyncProvider } from './components/OfflineSyncProvider';
import CustomerDisplay from './modules/restaurant/components/POS/CustomerDisplay';
import RestaurantAnalytics from './services/RestaurantAnalytics';

// 🏥 HIMS Module Imports - Pages
import PatientManager from './modules/hims/pages/PatientManager';
import { DoctorDesktop } from './modules/hims/pages/DoctorDesktop';
import MedicalBilling from './modules/hims/pages/MedicalBilling';
import { LabDashboard } from './modules/hims/pages/LabDashboard';
import { BloodBankDashboard as BloodBankManager } from './modules/hims/pages/BloodBankDashboard';
import { NurseStation } from './modules/hims/pages/NurseStation';
import { RadiologyDashboard } from './modules/hims/pages/RadiologyDashboard';
import { LabSpecimenTracking } from './modules/hims/pages/LabSpecimenTracking';
import { ERTriageBoard } from './modules/hims/pages/ERTriageBoard';
import { PharmacyDashboard } from './modules/hims/pages/PharmacyDashboard';
import { AdmissionManager } from './modules/hims/pages/AdmissionManager';
import { WardBedManager } from './modules/hims/components/WardBedManager'; // ✅ تم تصحيح المسار من pages إلى components
import { SurgeryScheduler } from './modules/hims/pages/SurgeryScheduler';
import StaffRosterManager from './modules/hims/pages/StaffRosterManager';
import { HIMSExecutiveDashboard } from './modules/hims/pages/HIMSExecutiveDashboard';
import { HIMSProfitabilityReports } from './modules/hims/pages/HIMSProfitabilityReports';

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
                {/* المسارات الأساسية */}
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/" element={(currentUser?.role as string) === 'chef' ? <Navigate to="/kds" replace /> : <Dashboard />} />

                {/* 2. مديول التصنيع (Manufacturing) */}
                {/* 🏥 مديول المستشفيات (HIMS) */}
                <Route path="/hims/*" element={
                  <ModuleGuard module="hims">
                    <Routes>
                      <Route path="patients" element={<PatientManager />} />
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
                      <Route path="staff-roster" element={<StaffRosterManager />} />
                      <Route path="admin" element={<HIMSExecutiveDashboard />} />
                      <Route path="profitability" element={<HIMSProfitabilityReports />} />
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
                      <Route path="alerts-log" element={<ManufacturingAlertsLog />} />
                      <Route path="closing" element={<CostClosingDashboard />} />
                    </Routes>
                  </ModuleGuard>
                } />

                {/* 3. باقي المسارات (المحاسبة والتقارير) */}
                <Route path="/financial-ratios" element={<ModuleGuard module="accounting"><FinancialRatios /></ModuleGuard>} />
                <Route path="/expense-analysis" element={<ModuleGuard module="accounting"><ExpenseAnalysisReport /></ModuleGuard>} />
                <Route path="/budget-setup" element={<ModuleGuard module="accounting"><BudgetManager /></ModuleGuard>} />
                <Route path="/budget-report" element={<ModuleGuard module="accounting"><BudgetVarianceReport /></ModuleGuard>} />
                <Route path="/fiscal-year-closing" element={<ModuleGuard module="accounting"><FiscalYearClosing /></ModuleGuard>} />
                {/* 💰 مديول الخزينة والبنوك */}
                <Route path="/receipt-voucher" element={<ModuleGuard module="accounting"><ReceiptVoucherForm /></ModuleGuard>} />
                <Route path="/receipt-vouchers-list" element={<ModuleGuard module="accounting"><ReceiptVoucherList /></ModuleGuard>} />
                <Route path="/payment-voucher" element={<ModuleGuard module="accounting"><PaymentVoucherForm /></ModuleGuard>} />
                <Route path="/payment-vouchers-list" element={<ModuleGuard module="accounting"><PaymentVoucherList /></ModuleGuard>} />
                <Route path="/expense-voucher" element={<ModuleGuard module="accounting"><ExpenseVoucherForm /></ModuleGuard>} />
                <Route path="/transfer" element={<ModuleGuard module="accounting"><TransferForm /></ModuleGuard>} />
                <Route path="/customer-deposit" element={<ModuleGuard module="accounting"><CustomerDepositForm /></ModuleGuard>} />
                <Route path="/cheques" element={<ModuleGuard module="accounting"><ChequesPage /></ModuleGuard>} />
                <Route path="/cheque-movement-report" element={<ModuleGuard module="accounting"><ChequeMovementReport /></ModuleGuard>} />
                <Route path="/returned-cheques-report" element={<ModuleGuard module="accounting"><ReturnedChequesReport /></ModuleGuard>} />
                <Route path="/bank-reconciliation" element={<ModuleGuard module="accounting"><BankReconciliationForm /></ModuleGuard>} />
                <Route path="/cash-closing" element={<ModuleGuard module="accounting"><CashClosingForm /></ModuleGuard>} />
                <Route path="/deficit-report" element={<ModuleGuard module="accounting"><DeficitReport /></ModuleGuard>} />
                
                {/* 🛒 مديول المبيعات والعملاء */}
                <Route path="/sales-invoice" element={<ModuleGuard module="sales"><SalesInvoiceForm /></ModuleGuard>} />
                <Route path="/invoices-list" element={<ModuleGuard module="sales"><InvoiceList /></ModuleGuard>} />
                <Route path="/quotations-new" element={<ModuleGuard module="sales"><QuotationForm /></ModuleGuard>} />
                <Route path="/quotations-list" element={<ModuleGuard module="sales"><QuotationList /></ModuleGuard>} />
                <Route path="/sales-orders" element={<ModuleGuard module="sales"><SalesOrders /></ModuleGuard>} />
                <Route path="/sales-return" element={<ModuleGuard module="sales"><SalesReturnForm /></ModuleGuard>} />
                <Route path="/credit-note" element={<ModuleGuard module="sales"><CreditNoteForm /></ModuleGuard>} />
                <Route path="/credit-notes-list" element={<ModuleGuard module="sales"><CreditNoteList /></ModuleGuard>} />
                <Route path="/offer-beneficiaries" element={<ModuleGuard module="sales"><OfferBeneficiariesReport /></ModuleGuard>} />
                <Route path="/customers" element={<ModuleGuard module="sales"><CustomerManager /></ModuleGuard>} />
                <Route path="/customer-statement" element={<ModuleGuard module="sales"><CustomerStatement /></ModuleGuard>} />
                <Route path="/customer-aging" element={<ModuleGuard module="sales"><CustomerAgingReport /></ModuleGuard>} />
                <Route path="/item-sales-analysis" element={<ModuleGuard module="sales"><ItemSalesAnalysis /></ModuleGuard>} />
                <Route path="/sales-reports" element={<ModuleGuard module="sales"><SalesReports /></ModuleGuard>} />
                
                {/* 🚚 مديول المشتريات والموردين */}
                <Route path="/purchase-invoice" element={<ModuleGuard module="purchases"><PurchaseInvoiceForm /></ModuleGuard>} />
                <Route path="/purchase-invoices-list" element={<ModuleGuard module="purchases"><PurchaseInvoiceList /></ModuleGuard>} />
                <Route path="/purchase-order-new" element={<ModuleGuard module="purchases"><PurchaseOrderForm /></ModuleGuard>} />
                <Route path="/purchase-order-list" element={<ModuleGuard module="purchases"><PurchaseOrderList /></ModuleGuard>} />
                <Route path="/purchase-return" element={<ModuleGuard module="purchases"><PurchaseReturnForm /></ModuleGuard>} />
                <Route path="/debit-note" element={<ModuleGuard module="purchases"><DebitNoteForm /></ModuleGuard>} />
                <Route path="/debit-notes-list" element={<ModuleGuard module="purchases"><DebitNoteList /></ModuleGuard>} />
                <Route path="/net-purchases-report" element={<ModuleGuard module="purchases"><NetPurchasesReport /></ModuleGuard>} />
                <Route path="/supplier-reconciliation" element={<ModuleGuard module="purchases"><SupplierBalanceReconciliation /></ModuleGuard>} />
                <Route path="/supplier-balances" element={<ModuleGuard module="purchases"><SupplierBalancesReport /></ModuleGuard>} />
                <Route path="/suppliers" element={<ModuleGuard module="purchases"><SupplierManager /></ModuleGuard>} />
                <Route path="/supplier-statement" element={<ModuleGuard module="purchases"><SupplierStatement /></ModuleGuard>} />
                <Route path="/supplier-aging" element={<ModuleGuard module="purchases"><SupplierAgingReport /></ModuleGuard>} />
                <Route path="/purchase-analysis" element={<ModuleGuard module="purchases"><PurchaseAnalysisReport /></ModuleGuard>} />
                <Route path="/purchase-reports" element={<ModuleGuard module="purchases"><PurchaseReports /></ModuleGuard>} />
                
                {/* 📦 مديول المخازن والأصناف */}
                <Route path="/products" element={<ModuleGuard module="inventory"><ProductManager /></ModuleGuard>} />
                <Route path="/multi-uom-report" element={<ModuleGuard module="inventory"><MultiUomStockReport /></ModuleGuard>} />
                <Route path="/units-of-measure" element={<ModuleGuard module="inventory"><UnitsOfMeasureManager /></ModuleGuard>} />
                <Route path="/inventory-dashboard" element={<ModuleGuard module="inventory"><InventoryDashboard /></ModuleGuard>} />
                <Route path="/warehouses" element={<ModuleGuard module="inventory"><WarehouseManager /></ModuleGuard>} />
                <Route path="/stock-transfer" element={<ModuleGuard module="inventory"><StockTransfer /></ModuleGuard>} />
                <Route path="/stock-transfer-list" element={<ModuleGuard module="inventory"><StockTransferList /></ModuleGuard>} />
                <Route path="/inventory-count" element={<ModuleGuard module="inventory"><InventoryCountForm /></ModuleGuard>} />
                <Route path="/inventory-history" element={<ModuleGuard module="inventory"><InventoryCountList /></ModuleGuard>} />
                <Route path="/stock-adjustment" element={<ModuleGuard module="inventory"><StockAdjustmentForm /></ModuleGuard>} />
                <Route path="/wastage" element={<ModuleGuard module="inventory"><WastageManager /></ModuleGuard>} />
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
                <Route path="/subcontractors" element={<ModuleGuard module="construction"><SubcontractorStandalone /></ModuleGuard>} />
                <Route path="/construction/subcontractor-analytics" element={<ModuleGuard module="construction"><SubcontractorAnalytics /></ModuleGuard>} />
                <Route path="/employees" element={<ModuleGuard module="hr"><EmployeeManager /></ModuleGuard>} />
                <Route path="/payroll-run" element={<ModuleGuard module="hr"><PayrollRun /></ModuleGuard>} />
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
                <Route path="/admin/test-dashboard" element={<ModuleGuard module="admin"><AdminTestDashboard /></ModuleGuard>} />
                <Route path="/saas-admin" element={currentUser?.role === 'super_admin' ? <SaasAdmin /> : <Navigate to="/" replace />} />
                <Route path="/profile" element={<UserProfile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/about" element={<About />} /> 
                <Route path="/pos" element={<ModuleGuard module="restaurant"><PosScreen /></ModuleGuard>} /> 
                <Route path="/kds" element={<ModuleGuard module="restaurant"><KdsScreen /></ModuleGuard>} /> 
                <Route path="/kitchen-end-day" element={<ModuleGuard module="restaurant"><KitchenEndDayCount /></ModuleGuard>} /> 
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
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
      <Routes>
        {/* 1. المسارات العامة (متاحة للجميع دون تسجيل دخول) */}
        <Route path="/customer-display" element={<CustomerDisplay />} />
        <Route path="/menu/:qrKey" element={<GuestMenuLayout />} />
        <Route path="/menu" element={<GuestMenuLayout />} />

        {/* 2. المسارات المحمية (تتطلب حساب موظف) */}
        <Route path="/*" element={<ProtectedRoute><MainLayout /></ProtectedRoute>} />
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

```

### 📄 context/AccountingContext.tsx
```typescript
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Account, JournalEntry, JournalEntryLine, SystemSettings, UserRole, Organization } from '../types';
import { useToast } from '../context/ToastContext';

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: 'super_admin' | 'admin' | 'manager' | 'accountant' | 'viewer' | 'demo' | 'chef' | 'owner';
  organization_id: string | null;
  is_active: boolean;
  avatar_url?: string;
}

export const SYSTEM_ACCOUNTS = {
  CASH: '1231',
  CUSTOMERS: '1221',
  SUPPLIERS: '201',
  INVENTORY: '103',
  VAT: '2231',
  VAT_INPUT: '1241',
  SALES_REVENUE: '411',
  COGS: '511',
  SALARIES_EXPENSE: '531',
  RETAINED_EARNINGS: '32',
  NOTES_RECEIVABLE: '1222',
  NOTES_PAYABLE: '222',
  EMPLOYEE_ADVANCES: '1223',
  EMPLOYEE_BONUSES: '5312',
  EMPLOYEE_DEDUCTIONS: '422',
  PAYROLL_TAX: '2233',
  CASH_SHORTAGE: '541', // تسوية عجز الصندوق
  BANK_ACCOUNTS: '123201', // حساب البنك الرئيسي (الأهلي المصري افتراضياً)
  INVENTORY_RAW_MATERIALS: '10301',
  INVENTORY_WIP: '10303',
  INVENTORY_FINISHED_GOODS: '10302',
  LABOR_COST_ALLOCATED: '513',
  WASTAGE_EXPENSE: '5121',
  SECURITY_DEPOSIT_ACCOUNT: '226',
  WHT_PAYABLE: '2232', // ضريبة الخصم والتحصيل - علينا
  WHT_RECEIVABLE: '1242', // ضريبة الخصم والتحصيل - لنا
  SALES_RETURNS: '412', // مردودات المبيعات
  SALES_DISCOUNT: '413', // الخصم المسموح به
  ASSETS_FIXED: '111', // الأصول الثابتة
  ACCUMULATED_DEPRECIATION: '1119', // مجمع الإهلاك
  DEPRECIATION_EXPENSE: '533', // مصروف الإهلاك
  OPENING_BALANCES: '3999', // الأرصدة الافتتاحية
  PREPAID_EXPENSES: '1243', // مصروفات مقدمة
  ACCRUED_EXPENSES: '225', // مصروفات مستحقة
  REVENUE_OTHER: '421', // إيرادات أخرى
  EXPENSE_GENERAL: '53', // مصروفات إدارية وعمومية
  SOCIAL_INSURANCE: '224', // هيئة التأمينات الاجتماعية
  HIMS_BILLING_REVENUE: '41101', // إيرادات الخدمات الطبية
  HIMS_INSURANCE_RECEIVABLE: '122101', // ذمم التأمين
};

interface AccountingContextType {
  organization: any;
  currentUser: UserProfile | null;
  organizations: any[];
  currentSelectedOrgId: string | null;
  setCurrentSelectedOrgId: (id: string | null) => void;
  isLoading: boolean;
  settings: any;
  accounts: any[];
  entries: any[];
  assets: any[];
  budgets: any[];
  vouchers: any[];
  costCenters: any[];
  employees: any[];
  products: any[];
  transfers: any[];
  purchaseInvoices: any[];
  lastUpdated: Date | null;
  invoices: any[];
  salespeople: any[];
  categories: any[];
  users: any[];
  warehouses: any[];
  restaurantTables: any[];
  menuCategories: any[];
  customers: any[];
  suppliers: any[];
  cheques: any[];
  currentShift: any;
  activityLog: any[];
  refreshData: () => Promise<void>;
  fetchEntriesPaged: (page: number, pageSize: number) => Promise<{ data: any[], count: number }>;

  isDemo: boolean;
  clearCache: () => void;
  getFinancialSummary: () => Promise<any>;
  // --- دالة الصلاحيات ---
  can: (module: string, action: string) => boolean;
  // --- الدوال المحاسبية ---
  addEntry: (entry: any) => Promise<void>;
  getSystemAccount: (key: string) => any;
  updateVoucher: (id: string, updates: any) => Promise<boolean>;
  getAccountBalanceInPeriod: (id: string, start: string, end: string) => Promise<number>;
  addAccount: (acc: any) => Promise<any>;
  updateAccount: (id: string, updates: any) => Promise<void>;
  deleteAccount: (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
  clearTransactions: () => Promise<void>;
  emptyRecycleBin: (table: string) => Promise<void>;
  saveBudget: (budget: any) => Promise<void>;
  // --- دوال المخزون ---
  recalculateStock: (productId?: string) => Promise<void>;
  addProduct: (product: any) => Promise<any>;
  updateProduct: (id: string, updates: any) => Promise<void>;
  deleteProduct: (id: string, reason?: string) => Promise<void>;
  addStockTransfer: (transfer: any) => Promise<void>;
  approveStockTransfer: (id: string) => Promise<void>;
  cancelStockTransfer: (id: string) => Promise<void>;
  addWarehouse: (warehouse: any) => Promise<void>;
  updateWarehouse: (id: string, updates: any) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  addWastage: (wastage: any) => Promise<boolean>;
  produceItem: (id: string, qty: number, whId: string, date: string, cost: number, ref: string) => Promise<any>;
  // --- دوال المبيعات والمشتريات ---
  addCustomer: (customer: any) => Promise<any>;
  updateCustomer: (id: string, updates: any) => Promise<void>;
  deleteCustomer: (id: string, reason?: string) => Promise<void>;
  addSupplier: (supplier: any) => Promise<any>;
  updateSupplier: (id: string, updates: any) => Promise<void>;
  deleteSupplier: (id: string, reason?: string) => Promise<void>;
  approveInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<boolean>;
  approvePurchaseInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<void>;
  convertPoToInvoice: (poId: string, warehouseId?: string, orgId?: string) => Promise<void>;
  addOpeningBalanceTransaction: (id: string, type: string, amount: number, date: string, name: string) => Promise<void>;
  addPaymentVoucher: (voucher: any) => Promise<void>;
  // --- دوال الأصول والشيكات ---
  addAsset: (asset: any) => Promise<void>;
  runDepreciation: (id?: string, amount?: number, date?: string) => Promise<void>;
  revaluateAsset: (id: string, val: number, date: string, accId: string) => Promise<void>;
  addCheque: (cheque: any) => Promise<void>;
  updateChequeStatus: (id: string, status: string, date: string, bankId?: string) => Promise<void>;
  addTransfer: (transfer: any) => Promise<void>;
  restoreItem: (table: string, id: string) => Promise<{ success: boolean; message?: string }>;
  permanentDeleteItem: (table: string, id: string) => Promise<{ success: boolean; message?: string }>;
  exportJournalToCSV: () => void;
  // --- دوال الموارد البشرية ---
  addEmployee: (employee: any) => Promise<void>;
  updateEmployee: (id: string, updates: any) => Promise<void>;
  deleteEmployee: (id: string, reason?: string) => Promise<void>;
  runPayroll: (month: number, year: number, date: string, treasuryId: string, data: any[], orgId?: string) => Promise<void>;
  // --- دوال المطاعم ---
  finalizeProductionOrder: (id: string, status: string, notes: string) => Promise<any>;
  openTableSession: (tableId: string) => Promise<string | null>;
  reserveTable: (tableId: string, name: string, time: string) => Promise<boolean>;
  cancelReservation: (tableId: string) => Promise<void>;
  transferTableSession: (sessionId: string, targetTableId: string) => Promise<boolean>;
  mergeTableSessions: (sourceId: string, targetId: string) => Promise<boolean>;
  createRestaurantOrder: (payload: any) => Promise<string>;
  getOpenTableOrder: (tableId: string) => Promise<any>;
  completeRestaurantOrder: (orderId: string, method: string, total: number, accountId: string | null, warehouseId?: string) => Promise<void>;
  processSplitPayment: (orderId: string, items: any[], method: string, total: number, accountId: string) => Promise<boolean>;
  addRestaurantTable: (data: any) => Promise<void>;
  updateRestaurantTable: (id: string, data: any) => Promise<void>;
  deleteRestaurantTable: (id: string) => Promise<void>;
  updateKitchenOrderStatus: (id: string, status: string) => Promise<void>;
  startShift: (amount: number) => Promise<void>;
  closeCurrentShift: (actualCash: number, notes: string) => Promise<void>;
  getCurrentShiftSummary: () => Promise<any>;
  createMissingSystemAccounts: () => Promise<any>;
  recalculateAllBalances: () => Promise<void>;
  purgeDeletedRecords: () => Promise<void>;
  refreshSaasSchema: () => Promise<void>;
  closeFinancialYear: (year: number, date: string) => Promise<boolean>;
  exportData: () => Promise<void>;
  // --- دوال الديمو ---
  addDemoEntry: (entry: any) => void;
  addDemoPaymentVoucher: (voucher: any) => void;
  addDemoReceiptVoucher: (voucher: any) => void;
  addDemoInvoice: (invoice: any) => void;
  postDemoSalesInvoice: (invoice: any) => void;
  addDemoPurchaseInvoice: (invoice: any) => void;
  deleteOrganization: (orgId: string) => Promise<{ success: boolean; message?: string }>;

}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

export const useAccounting = () => {
  const context = useContext(AccountingContext);
  if (!context) throw new Error('useAccounting must be used within an AccountingProvider');
  return context;
};

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser: authUser, can } = useAuth();
  const { showToast } = useToast();
  const [organization, setOrganization] = useState<any>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [currentSelectedOrgId, setCurrentSelectedOrgId] = useState<string | null>(null); // New state for super admin's selected org
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [salespeople, setSalespeople] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [restaurantTables, setRestaurantTables] = useState<any[]>([]);
  const [menuCategories, setMenuCategories] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [activityLog, setActivityLog] = useState<any[]>([]);

  const isDemo = authUser?.username === 'demo@demo.com' || authUser?.role === 'demo';

  const refreshData = useCallback(async () => {
    if (!authUser) return;
    setIsLoading(true);
    try {
      // جلب بيانات المنظمة والبروفايل
      const { data: profile, error: profileError } = await supabase.from('profiles').select('*, organizations(*)').eq('id', authUser.id).single();
      if (profileError) throw profileError;
      if (profile) {
        setCurrentUser(profile);
      }

      // 🛡️ صمام أمان: جلب قائمة الشركات للسوبر أدمن فوراً لملء القائمة المنسدلة
      const isSuperAdmin = authUser.role === 'super_admin' || (profile && profile.role === 'super_admin');
      if (isSuperAdmin) {
        const { data: allOrgs } = await supabase.from('organizations').select('id, name').order('name');
        setOrganizations(allOrgs || []);
      }

      // Determine the organization ID to use for fetching data
      let fetchOrgId = profile.organization_id;

      if (isSuperAdmin) {
          if (currentSelectedOrgId) {
              fetchOrgId = currentSelectedOrgId;
          } else if (profile.organization_id) {
              fetchOrgId = profile.organization_id;
              setCurrentSelectedOrgId(profile.organization_id); 
          }
      }

      // إذا لم يكن هناك شركة مختارة (حتى للسوبر أدمن)، نتوقف عن جلب البيانات المالية فقط ونعرض الواجهة
      if (!fetchOrgId) {
        setIsLoading(false);
        return;
      }

      // تحديث كائن المنظمة ليتوافق مع المنظمة النشطة (دعم السوبر أدمن)
      if (fetchOrgId === profile.organization_id) {
        setOrganization(profile.organizations);
      } else {
        // جلب تفاصيل المنظمة المختارة يدوياً
        const { data: selectedOrg } = await supabase.from('organizations').select('*').eq('id', fetchOrgId).single();
        if (selectedOrg) setOrganization(selectedOrg);
      }

      // جلب الإعدادات
      const { data: sett } = await supabase.rpc('get_current_company_settings', { p_org_id: fetchOrgId }).maybeSingle();
      setSettings(sett || {});

      // جلب الحسابات والمستودعات
      const [accs, ents, vchs, ccs, emps, prods, trns, pinvs, invs, sps, cats, usrs, whs, rTables, mCats, custs, sups, chqs, shift, assetData, budgetData] = await Promise.all([
      supabase.from('accounts').select('*').eq('organization_id', fetchOrgId).order('code'),
      supabase.from('journal_entries').select('*, journal_lines(*)').eq('organization_id', fetchOrgId).order('transaction_date', { ascending: false }),
      supabase.from('vouchers').select('*').eq('organization_id', fetchOrgId).order('date', { ascending: false }),
      supabase.from('cost_centers').select('*').eq('organization_id', fetchOrgId).order('name'),
      supabase.from('employees').select('*').eq('organization_id', fetchOrgId).order('full_name'),
      supabase.from('products').select('*').eq('organization_id', fetchOrgId).order('name'),
      supabase.from('stock_transfers').select('*').eq('organization_id', fetchOrgId).order('transfer_date', { ascending: false }),
      supabase.from('purchase_invoices').select('*').eq('organization_id', fetchOrgId).order('invoice_date', { ascending: false }),
      supabase.from('invoices').select('*').eq('organization_id', fetchOrgId).order('invoice_date', { ascending: false }),
      supabase.from('salespeople').select('*').eq('organization_id', fetchOrgId).order('name'),
      supabase.from('product_categories').select('*').eq('organization_id', fetchOrgId).order('name'),
      supabase.from('profiles').select('*').eq('organization_id', fetchOrgId).order('full_name'),
      supabase.from('warehouses').select('*').eq('organization_id', fetchOrgId).eq('is_active', true),
      supabase.from('restaurant_tables').select('*').eq('organization_id', fetchOrgId).order('name'),
      supabase.from('menu_categories').select('*').eq('organization_id', fetchOrgId).order('display_order'),
      supabase.from('customers').select('*').eq('organization_id', fetchOrgId).is('deleted_at', null),
      supabase.from('suppliers').select('*').eq('organization_id', fetchOrgId).is('deleted_at', null),
      supabase.from('cheques').select('*').eq('organization_id', fetchOrgId).order('due_date'),
        supabase.rpc('get_active_shift', { p_org_id: fetchOrgId }),
      supabase.from('assets').select('*').eq('organization_id', fetchOrgId),
      supabase.from('budgets').select('*').eq('organization_id', fetchOrgId)
      ]);

      setAccounts(accs.data || []);
      setEntries(ents.data || []);
      setAssets(assetData.data || []);
      setBudgets(budgetData.data || []);
      setVouchers(vchs.data || []);
      setCostCenters(ccs.data || []);
      setEmployees(emps.data || []);
      setProducts(prods.data || []);
      setTransfers(trns.data || []);
      setPurchaseInvoices(pinvs.data || []);
      setInvoices(invs.data || []);
      setSalespeople(sps.data || []);
      setCategories(cats.data || []);
      setUsers(usrs.data || []);
      setWarehouses(whs.data || []);
      setRestaurantTables(rTables.data || []);
      setMenuCategories(mCats.data || []);
      setCustomers(custs.data || []);
      setSuppliers(sups.data || []);
      setCheques(chqs.data || []);
      
      // 🛡️ تصحيح جذري: التحقق من وجود ID حقيقي للوردية لمنع الوردية "الوهمية"
      const activeShiftData = Array.isArray(shift.data) ? shift.data[0] : shift.data;
      setCurrentShift(activeShiftData && activeShiftData.id ? activeShiftData : null);
      setLastUpdated(new Date());

    } catch (error) {
      if (import.meta.env.DEV) console.error('Error refreshing accounting data:', error);
      showToast('فشل تحديث البيانات، يرجى التحقق من اتصال الإنترنت', 'error');    } finally {
      setIsLoading(false);
    }
  }, [authUser, currentSelectedOrgId]); // Add currentSelectedOrgId to dependencies

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // --- تنفيذ الدوال المطلوبة (RPC Wrappers) ---
  const clearCache = () => { window.location.reload(); };
  const getFinancialSummary = async () => { const { data } = await supabase.rpc('get_financial_summary', { p_org_id: currentSelectedOrgId }); return data; };
 
  const fetchEntriesPaged = useCallback(async (page: number, pageSize: number) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    if (!targetOrgId) return { data: [], count: 0 };

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from('journal_entries')
      .select('*, journal_lines(*)', { count: 'exact' })
      .eq('organization_id', targetOrgId)
      .order('transaction_date', { ascending: false })
      .range(from, to);

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching paged entries:', error);
      }
      return { data: [], count: 0 };
    }

    return { data: data || [], count: count || 0 };
  }, [currentSelectedOrgId, currentUser?.organization_id]); 
  const addEntry = async (entry: any) => { const { error } = await supabase.rpc('add_journal_entry', entry); if (error) throw error; refreshData(); };
  const getSystemAccount = (key: string) => {
    const mappingId = settings.account_mappings?.[key];
    if (mappingId) return accounts.find(a => a.id === mappingId);
    const defaultCode = SYSTEM_ACCOUNTS[key as keyof typeof SYSTEM_ACCOUNTS];
    return accounts.find(a => a.code === defaultCode);
  };
  const updateVoucher = async (id: string, updates: any) => { const { error } = await supabase.from('vouchers').update(updates).eq('id', id); refreshData(); return !error; };
  const getAccountBalanceInPeriod = async (id: string, start: string, end: string) => { 
    const { data } = await supabase.rpc('get_account_balance_in_period', { p_account_id: id, p_start_date: start, p_end_date: end, p_org_id: currentSelectedOrgId });
    return data || 0;
  };
  const addAccount = async (acc: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data, error } = await supabase.from('accounts').insert({ ...acc, organization_id: targetOrgId }).select().single(); 
    if (error) throw error;
    await refreshData(); return data; 
  };
  const updateAccount = async (id: string, updates: any) => { await supabase.from('accounts').update(updates).eq('id', id); refreshData(); };
  const deleteAccount = async (id: string, reason?: string) => { const { error } = await supabase.from('accounts').delete().eq('id', id); refreshData(); return { success: !error, message: error?.message }; };
  const clearTransactions = async () => { await supabase.rpc('clear_all_transactions'); refreshData(); };
  const emptyRecycleBin = async (table: string) => { await supabase.rpc('empty_recycle_bin', { p_table_name: table }); refreshData(); };
  const saveBudget = async (budget: any) => { 
    const { error } = await supabase.from('budgets').upsert(budget); 
    if (error) {
      showToast('فشل حفظ الموازنة: ' + error.message, 'error');
    } else {
      showToast('تم حفظ الموازنة بنجاح ✅', 'success');
      refreshData(); 
    }
  };
  // Inventory
  const recalculateStock = async (productId?: string) => { 
    const { error } = await supabase.rpc('recalculate_stock_rpc', { 
      p_product_id: productId || null, 
      p_org_id: currentSelectedOrgId || currentUser?.organization_id || null 
    }); 
        if (error) {
      showToast('فشل إعادة حساب المخزون: ' + error.message, 'error');
    } else {
      showToast('تم تحديث المخزون بنجاح ✅', 'success');
      await refreshData(); // 🚀 الانتظار ضروري لتحديث الحالة قبل إغلاق اللودر في الواجهة
    }
  };  const addProduct = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data: p, error } = await supabase.from('products').insert({ ...data, organization_id: targetOrgId }).select().single();
    if (error) throw error;
    await refreshData(); return p; 
  };
   const updateProduct = async (id: string, data: any) => { 
    const { error } = await supabase.from('products').update(data).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const deleteProduct = async (id: string, reason?: string) => { 
    // تم إزالة تحديث حقل 'notes' لأن الجدول لا يحتوي عليه في قاعدة البيانات حالياً
    const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id);
          
    if (error) throw error;
    showToast('تم نقل الصنف إلى سلة المحذوفات', 'success');
    refreshData(); 
  };
  const addStockTransfer = async (data: any) => { 
    const { error } = await supabase.from('stock_transfers').insert(data);
    if (error) throw error;
    refreshData(); 
  };
  const approveStockTransfer = async (id: string) => { 
    const { error } = await supabase.rpc('approve_stock_transfer', { p_transfer_id: id });
    if (error) throw error;
    refreshData(); 
  };
  const cancelStockTransfer = async (id: string) => { await supabase.from('stock_transfers').update({ status: 'cancelled' }).eq('id', id); showToast('تم إلغاء طلب التحويل', 'info'); refreshData(); };
  const addWarehouse = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('warehouses').insert({ ...data, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };
   const updateWarehouse = async (id: string, data: any) => { 
    const { error } = await supabase.from('warehouses').update(data).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const deleteWarehouse = async (id: string) => { 
    const { error } = await supabase.from('warehouses').update({ is_active: false }).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const addWastage = async (data: any) => { 
    const { error } = await supabase.rpc('record_wastage', data); 
    if (error) {
      showToast('فشل تسجيل الهالك: ' + error.message, 'error');
    } else {
      showToast('تم تسجيل الهالك وتحديث المخزن ✅', 'success');
      refreshData();
    }
    return !error; 
  };
  const produceItem = async (id: string, qty: number, whId: string, date: string, cost: number, ref: string) => { return await supabase.rpc('mfg_create_order_direct', { p_product_id: id, p_qty: qty, p_warehouse_id: whId, p_date: date, p_additional_cost: cost, p_reference: ref }); };

  // Sales & Purchases
  const addCustomer = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data: c, error } = await supabase.from('customers').insert({ ...data, organization_id: targetOrgId }).select().single(); 
    if (error) throw error;
    await refreshData(); return c; 
  };
  const updateCustomer = async (id: string, data: any) => { 
    const { error } = await supabase.from('customers').update(data).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const deleteCustomer = async (id: string, reason?: string) => { 
    const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString(), notes: reason }).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const addSupplier = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data: s, error } = await supabase.from('suppliers').insert({ ...data, organization_id: targetOrgId }).select().single(); 
    if (error) {
      showToast('فشل إضافة المورد: ' + error.message, 'error');
      throw error;
    }
    showToast('تم إضافة المورد بنجاح ✅', 'success');
    await refreshData();
    return s; 
  };
    const updateSupplier = async (id: string, data: any) => { 
    const { error } = await supabase.from('suppliers').update(data).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const deleteSupplier = async (id: string, reason?: string) => { 
    const { error } = await supabase.from('suppliers').update({ deleted_at: new Date().toISOString(), notes: reason }).eq('id', id);
    if (error) throw error;
    refreshData(); 
  };
  const approveInvoice = async (id: string, orgId?: string, warehouseId?: string) => { 
    const { error } = await supabase.rpc('post_sales_invoice', { 
      p_invoice_id: id,
      p_org_id: orgId || currentSelectedOrgId || currentUser?.organization_id || null,
      p_warehouse_id: warehouseId
    }); 
    refreshData(); 
    return !error; 
  };
   const approvePurchaseInvoice = async (id: string, orgId?: string, warehouseId?: string) => { 
    const { error } = await supabase.rpc('post_purchase_invoice', { 
      p_invoice_id: id,
      p_org_id: orgId || currentSelectedOrgId || currentUser?.organization_id,
      p_warehouse_id: warehouseId
    }); 
    if (error) {
      showToast('فشل اعتماد الفاتورة: ' + error.message, 'error');
    } else {
      showToast('تم اعتماد فاتورة المشتريات وتحديث المخزون بنجاح ✅', 'success');
      refreshData();
    }
  };
  const convertPoToInvoice = async (id: string, warehouseId?: string, orgId?: string) => { 
    const { error } = await supabase.rpc('convert_po_to_invoice', { 
      p_po_id: id, 
      p_warehouse_id: warehouseId,
      p_org_id: orgId || currentSelectedOrgId || currentUser?.organization_id
    }); 
    if (error) {
      showToast('فشل تحويل أمر الشراء: ' + error.message, 'error');
    } else {
      showToast('تم تحويل أمر الشراء إلى فاتورة بنجاح ✅', 'success');
      refreshData();
    }
  };
  const addOpeningBalanceTransaction = async (id: string, type: string, amount: number, date: string, name: string) => { await supabase.rpc('add_opening_balance', { p_id: id, p_type: type, p_amount: amount, p_date: date, p_name: name }); refreshData(); };
  const addPaymentVoucher = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('vouchers').insert({ ...data, type: 'payment', organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };

  // Assets & Cheques
  const addAsset = async (assetData: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    
    // 1. فصل تعليمات القيد المحاسبي عن بيانات الجدول الفعلية لتجنب خطأ 400
    const { create_journal_entry, credit_account_id, ...dbPayload } = assetData;

    // 2. تنظيف البيانات (تحويل القيم الفارغة إلى null)
    const cleanedPayload = { ...dbPayload };
    ['accumulated_depreciation_account_id', 'depreciation_expense_account_id'].forEach(key => {
      if (cleanedPayload[key] === '') cleanedPayload[key] = null;
    });

    // 3. إدراج الأصل في قاعدة البيانات
    const { data: newAsset, error } = await supabase
      .from('assets')
      .insert({ ...cleanedPayload, organization_id: targetOrgId })
      .select()
      .single(); 
      
    if (error) throw error;

    // 4. إنشاء قيد اليومية آلياً إذا طلب المستخدم ذلك
    if (create_journal_entry && newAsset) {
      try {
        await addEntry({
          date: newAsset.purchase_date || new Date().toISOString().split('T')[0],
          description: `إثبات شراء أصل ثابت: ${newAsset.name}`,
          reference: `ASSET-${newAsset.id.split('-')[0].toUpperCase()}`,
          status: 'posted',
          p_org_id: targetOrgId,
          lines: [
            {
              account_id: newAsset.asset_account_id,
              debit: newAsset.purchase_cost,
              credit: 0,
              description: `قيمة الأصل المشتري: ${newAsset.name}`
            },
            {
              account_id: credit_account_id || getSystemAccount('OPENING_BALANCES')?.id,
              debit: 0,
              credit: newAsset.purchase_cost,
              description: `سداد قيمة الأصل: ${newAsset.name}`
            }
          ]
        });
      } catch (jeError) {
        console.error("Failed to create asset journal entry:", jeError);
        showToast('تمت إضافة الأصل ولكن فشل إنشاء القيد آلياً، يرجى إنشاؤه يدوياً.', 'warning');
      }
    }

    await refreshData(); 
  };
  const runDepreciation = async (id?: string, amount?: number, date?: string) => { await supabase.rpc('run_monthly_depreciation', { p_asset_id: id, p_amount: amount, p_date: date }); refreshData(); };
  const revaluateAsset = async (id: string, val: number, date: string, accId: string) => { await supabase.from('assets').update({ current_value: val }).eq('id', id); refreshData(); };
  const addCheque = async (cheque: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('cheques').insert({ ...cheque, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };
  const updateChequeStatus = async (id: string, status: string, date: string, bankId?: string) => {
    const updatePayload: { status: string; current_account_id?: string | null } = { status };
    if (bankId !== undefined) { // تضمين bankId فقط إذا تم تمريره صراحةً، مما يسمح بمسحه إذا كان null
      updatePayload.current_account_id = bankId;
    }
    await supabase.from('cheques').update(updatePayload).eq('id', id); 
    refreshData(); 
  };     
  const addTransfer = async (transfer: any) => { await supabase.rpc('add_treasury_transfer', transfer); refreshData(); };
  const restoreItem = async (table: string, id: string) => { const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', id); refreshData(); return { success: !error, message: error?.message }; };
  const permanentDeleteItem = async (table: string, id: string) => { const { error } = await supabase.from(table).delete().eq('id', id); refreshData(); return { success: !error, message: error?.message }; };
  const exportJournalToCSV = () => { /* Logic */ };

  // HR
  const addEmployee = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('employees').insert({ ...data, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };
  const updateEmployee = async (id: string, data: any) => { await supabase.from('employees').update(data).eq('id', id); refreshData(); };
  const deleteEmployee = async (id: string, reason?: string) => { await supabase.from('employees').update({ status: 'terminated', notes: reason }).eq('id', id); refreshData(); };
  const runPayroll = async (month: number, year: number, date: string, treasuryId: string, data: any[], orgId?: string) => {
    const { error } = await supabase.rpc('run_payroll_rpc', {
      p_month: month,
      p_year: year,
      p_date: date,
      p_treasury_acc: treasuryId,
      p_items: data,
      p_org_id: orgId || currentSelectedOrgId || null // استخدام null لضمان صحة JSON
    });
    
    if (error) {
      if (process.env.NODE_ENV === 'development') console.error("Payroll RPC Error:", error);
      throw new Error(error.message || 'حدث خطأ أثناء تنفيذ مسير الرواتب');
    }
    
    await refreshData();
  };

  // --- Demo Stubs ---
  const addDemoEntry = (e: any) => console.log('Demo Entry:', e);
  const addDemoPaymentVoucher = (v: any) => console.log('Demo Payment:', v);
  const addDemoReceiptVoucher = (v: any) => console.log('Demo Receipt:', v);
  const addDemoInvoice = (i: any) => console.log('Demo Invoice:', i);
  const postDemoSalesInvoice = (inv: any) => console.log('Demo Post Invoice:', inv);
  const addDemoPurchaseInvoice = (i: any) => console.log('Demo Purchase:', i);

  // --- Restaurant Functions ---
  const finalizeProductionOrder = async (id: string, status: string, notes: string) => {
    return await supabase.rpc('mfg_finalize_order', { p_order_id: id, p_final_status: status, p_qc_notes: notes });
  };

  const openTableSession = async (tableId: string) => {
    const { data, error } = await supabase.rpc('open_table_session', { p_table_id: tableId });
    if (error) { showToast(error.message, 'error'); return null; }
    refreshData();
    return data;
  };

  const reserveTable = async (tableId: string, name: string, time: string) => {
    const { error } = await supabase.from('restaurant_tables').update({ status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } }).eq('id', tableId);
    if (error) return false;
    refreshData();
    return true;
  };

  const cancelReservation = async (tableId: string) => {
    await supabase.from('restaurant_tables').update({ status: 'AVAILABLE', reservation_info: null }).eq('id', tableId);
    refreshData();
  };

  const transferTableSession = async (sessionId: string, targetTableId: string) => {
    const { error } = await supabase.rpc('transfer_table_session', { p_session_id: sessionId, p_target_table_id: targetTableId });
    if (error) { showToast(error.message, 'error'); return false; }
    refreshData();
    return true;
  };

  const mergeTableSessions = async (sourceId: string, targetId: string) => {
    const { error } = await supabase.rpc('merge_table_sessions', { p_source_session_id: sourceId, p_target_session_id: targetId });
    if (error) { showToast(error.message, 'error'); return false; }
    refreshData();
    return true;
  };

  const createRestaurantOrder = async (payload: any) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data, error } = await supabase.rpc('create_restaurant_order', { 
      ...payload, 
      p_warehouse_id: payload.p_warehouse_id || settings?.default_warehouse_id,
      p_org_id: targetOrgId 
    });
    if (error) throw error;
    return data;
  };

  const getOpenTableOrder = async (tableId: string) => {
    const { data } = await supabase.rpc('get_open_table_order', { p_table_id: tableId });
    return data;
  };

  const completeRestaurantOrder = async (orderId: string, method: string, total: number, accountId: string | null, warehouseId?: string) => {
    const { error } = await supabase.rpc('complete_restaurant_order', { 
      p_order_id: orderId, 
      p_payment_method: method, 
      p_amount: total, 
      p_cash_account_id: accountId, 
      p_org_id: currentSelectedOrgId || currentUser?.organization_id,
      p_warehouse_id: warehouseId
    });
    if (error) throw error;
    refreshData();
  };

  const processSplitPayment = async (orderId: string, items: any[], method: string, total: number, accountId: string) => {
    const { error } = await supabase.rpc('process_split_payment', { p_order_id: orderId, p_items: items, p_payment_method: method, p_amount: total, p_cash_account_id: accountId, p_org_id: currentSelectedOrgId });
    if (error) { showToast(error.message, 'error'); return false; }
    refreshData();
    return true;
  };

  const addRestaurantTable = async (data: any) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('restaurant_tables').insert({ ...data, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshData(); 
  };
  const updateRestaurantTable = async (id: string, data: any) => { await supabase.from('restaurant_tables').update(data).eq('id', id); refreshData(); };
  const deleteRestaurantTable = async (id: string) => { await supabase.from('restaurant_tables').delete().eq('id', id); refreshData(); };
  
  const updateKitchenOrderStatus = async (id: string, status: string) => {
    await supabase.from('kitchen_orders').update({ status }).eq('id', id);
  };

  const startShift = async (amount: number) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const treasuryAcc = getSystemAccount('CASH');
    const { error } = await supabase.rpc('start_pos_shift', { 
      p_opening_balance: Number(amount) || 0,
      p_resume_existing: false, // 🛡️ تصحيح: عند الضغط على زر "بدء" نريد إنشاء وردية جديدة فعلاً وليس مجرد استئناف
      p_treasury_account_id: treasuryAcc?.id || null,
      p_user_id: currentUser?.id,
      p_org_id: targetOrgId
    }); 
    if (error) throw error;
    await refreshData(); 
  };
  const closeCurrentShift = async (actualCash: number, notes: string) => { 
    const shiftId = Array.isArray(currentShift) ? currentShift[0]?.id : currentShift?.id;
    if (!shiftId) {
      throw new Error('لا توجد وردية مفتوحة حالياً ليتم إغلاقها');
    }
    const { error } = await supabase.rpc('close_shift', { 
      p_shift_id: shiftId, 
      p_actual_cash: actualCash, 
      p_notes: notes,
      p_org_id: currentSelectedOrgId || currentUser?.organization_id
    }); 
    if (error) throw error;
    await refreshData(); 
  };
  const getCurrentShiftSummary = async () => { 
    const shiftId = Array.isArray(currentShift) ? currentShift[0]?.id : currentShift?.id;
    if (!shiftId) return null; 
    const { data, error } = await supabase.rpc('get_shift_summary', { p_shift_id: shiftId }); 
    if (error) throw error;
    return data; 
  };

  const createMissingSystemAccounts = async () => await supabase.rpc('create_missing_system_accounts');
  const recalculateAllBalances = async () => { await supabase.rpc('recalculate_all_balances'); showToast('تم تحديث الأرصدة', 'success'); };
    const purgeDeletedRecords = async () => { 
    const { error } = await supabase.rpc('purge_deleted_records'); 
    if (error) { showToast('فشل تنظيف السجلات: ' + error.message, 'error'); return; }
    showToast('تم تنظيف السجلات المحذوفة بنجاح ✅', 'success');
    refreshData(); 
  };
  const refreshSaasSchema = async () => { await supabase.rpc('refresh_saas_schema'); showToast('جاري تحديث هيكل النظام...', 'info'); setTimeout(() => window.location.reload(), 1500); };
  const closeFinancialYear = async (year: number, date: string) => {
    const { data, error } = await supabase.rpc('close_financial_year', { p_year: year, p_closing_date: date });
        if (error) { showToast('فشل إقفال السنة: ' + error.message, 'error'); return false; }
    showToast(`تم إقفال السنة المالية ${year} بنجاح ✅`, 'success');
    return !!data;
  };
  const exportData = async () => { /* Logic to export JSON */ };

  const deleteOrganization = useCallback(async (orgId: string) => {
    if (currentUser?.role !== 'super_admin') {
      showToast('ليس لديك صلاحية لحذف الشركات.', 'error');
      return { success: false, message: 'ليس لديك صلاحية لحذف الشركات.' };
    }

    if (!window.confirm('⚠️ تحذير: سيتم حذف هذه الشركة وجميع بياناتها (الحسابات، الفواتير، المخزون...) بشكل نهائي.\n\nلا يمكن التراجع عن هذا الإجراء.\n\nهل أنت متأكد تماماً؟')) {
      return { success: false, message: 'تم إلغاء عملية الحذف.' };
    }

    try {
      // استدعاء دالة الحذف الآمنة التي تتجاوز الحماية السيادية في قاعدة البيانات
      const { error } = await supabase.rpc('fn_delete_organization_safe', { p_org_id: orgId });

      if (error) {
        console.error('Error deleting organization:', error);
        showToast(`فشل حذف الشركة: ${error.message}`, 'error');
        return { success: false, message: `فشل حذف الشركة: ${error.message}` };
      }

      showToast('تم حذف الشركة وجميع بياناتها بنجاح ✅', 'success');
      await refreshData(); // تحديث القائمة بعد الحذف
      return { success: true };
    } catch (e: any) {
      showToast(`حدث خطأ غير متوقع: ${e.message}`, 'error');
      return { success: false, message: e.message };
    }
  }, [currentUser, showToast, refreshData]);

  const value: AccountingContextType = {
    organization, currentUser, organizations, currentSelectedOrgId, setCurrentSelectedOrgId, isLoading, lastUpdated, settings, accounts, entries, assets, budgets, vouchers, costCenters, getFinancialSummary,
    fetchEntriesPaged, employees, products, transfers, purchaseInvoices, invoices, salespeople, categories,
    users, warehouses, restaurantTables, menuCategories, customers, suppliers, cheques,
    currentShift, activityLog, refreshData, isDemo, can, clearCache,
    // Accounting Functions
    addEntry, getSystemAccount, updateVoucher, getAccountBalanceInPeriod, addAccount, updateAccount, deleteAccount, clearTransactions, emptyRecycleBin, saveBudget,
    // Inventory Functions
    recalculateStock, addProduct, updateProduct, deleteProduct, addStockTransfer,
    approveStockTransfer, cancelStockTransfer, addWarehouse, updateWarehouse,
    deleteWarehouse, addWastage, produceItem,
    // Sales & Purchases
    addCustomer, updateCustomer, deleteCustomer, addSupplier, updateSupplier,
    deleteSupplier, approveInvoice, approvePurchaseInvoice, convertPoToInvoice,
    addOpeningBalanceTransaction, addPaymentVoucher,
    // Assets & Cheques
    addAsset, runDepreciation, revaluateAsset, addCheque, updateChequeStatus, addTransfer,
    restoreItem, permanentDeleteItem, exportJournalToCSV,
    // HR
    addEmployee, updateEmployee, deleteEmployee, runPayroll,
    // Restaurant
    finalizeProductionOrder, openTableSession, reserveTable, cancelReservation,
    transferTableSession, mergeTableSessions, createRestaurantOrder, getOpenTableOrder,
    completeRestaurantOrder, processSplitPayment, addRestaurantTable, updateRestaurantTable,
    deleteRestaurantTable, updateKitchenOrderStatus, startShift, closeCurrentShift,
    getCurrentShiftSummary, createMissingSystemAccounts, recalculateAllBalances,
    purgeDeletedRecords, refreshSaasSchema, closeFinancialYear, exportData,
    // Demo
    addDemoEntry, addDemoPaymentVoucher, addDemoReceiptVoucher, addDemoInvoice,
    deleteOrganization,
    postDemoSalesInvoice, addDemoPurchaseInvoice
  };

  return (
    <AccountingContext.Provider value={value}>
      {children}
    </AccountingContext.Provider>
  );
};
```

### 📄 supabaseClient.ts
```typescript
/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// قراءة المفاتيح من ملف البيئة (.env)
let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
let supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// تنظيف القيم من أي علامات تنصيص زائدة أو مسافات (قد تحدث بسبب خطأ في ملف .env)
if (supabaseUrl) supabaseUrl = supabaseUrl.replace(/["']/g, "").trim();
if (supabaseKey) supabaseKey = supabaseKey.replace(/["']/g, "").trim();

// التأكد من وجود المفاتيح قبل إنشاء الاتصال
if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL and Key must be defined in the .env file");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
```

