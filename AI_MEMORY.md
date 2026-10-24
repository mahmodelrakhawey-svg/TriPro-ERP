# 🧠 ذاكرة المشروع (AI Project Context)
📅 تاريخ التحديث: ٢٤‏/١٠‏/٢٠٢٦، ٨:٣٨:٤٧ م
ℹ️ تعليمات للذكاء الاصطناعي: هذا الملف يحتوي على هيكل المشروع الحالي وأهم الأكواد. استخدمه كمرجع قبل اقتراح أي كود جديد لتجنب التكرار.

## 1. هيكل الملفات والمجلدات (File Structure)
(هذه الملفات موجودة بالفعل، لا تقم بإنشائها مرة أخرى)

```text
📁 modules/
  📁 accounting/
    📁 components/
      📁 GeneralJournal/
        📄 JournalActionBar.tsx
        📄 JournalAdvancedFilters.tsx
        📄 JournalEntryCard.tsx
        📄 journalExportUtils.ts
        📄 JournalFiscalYearBar.tsx
        📄 JournalOrphanAlert.tsx
        📄 JournalPagination.tsx
        📄 journalSourceClassifier.ts
      📄 CurrencyRevaluationModal.test.tsx
      📄 CurrencyRevaluationModal.tsx
      📄 MidnightAuditShieldCard.test.tsx
      📄 MidnightAuditShieldCard.tsx
    📄 AccountingDashboard.tsx
    📄 AccountList.tsx
    📄 AddAccountModal.tsx
    📄 AnnualFinancialReport.tsx
    📄 BalanceSheet.tsx
    📄 BudgetManager.tsx
    📄 BudgetVarianceReport.tsx
    📄 CashFlowReport.tsx
    📄 CashFlowStatement.tsx
    📄 CFODashboard.tsx
    📄 ChangesInEquityStatement.tsx
    📄 FiscalPeriodManager.tsx
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
    📁 components/
      📄 AddClientModal.tsx
      📄 CloneCompanyModal.tsx
      📄 EditClientModal.tsx
      📄 SaaSAdminActionModals.tsx
    📁 types/
      📄 saasTypes.ts
    📄 AuditTrailViewer.tsx
    📄 auto_setup_new_org.sql
    📄 DataMigrationCenter.tsx
    📄 PermissionsManager.test.tsx
    📄 PermissionsManager.tsx
    📄 RecycleBin.tsx
    📄 SaaSAdmin.tsx
    📄 SystemStressTest.tsx
    📄 UserPermissionsEditor.tsx
  📁 assets/
    📁 components/
      📄 AssetFieldScanner.tsx
      📄 AssetLabelStudio.tsx
      📄 AssetTransferManager.tsx
    📄 AssetManager.test.tsx
    📄 AssetManager.tsx
  📁 banking/
    📄 ChequeMovementReport.tsx
    📄 ChequePrint.tsx
    📄 ChequesPage.test.tsx
    📄 ChequesPage.tsx
    📄 LettersOfCreditPage.tsx
    📄 LettersOfGuaranteePage.tsx
    📄 ReturnedChequesReport.tsx
  📁 construction/
    📁 components/
      📄 BillingManager.tsx
      📄 BOQManager.tsx
      📄 ChangeOrderManager.tsx
      📄 ConstructionDashboard.tsx
      📄 CustodyManager.tsx
      📄 DailyReportForm.tsx
      📄 EquipmentManager.tsx
      📄 MaterialIssueForm.tsx
      📄 MaterialWasteAnalytics.tsx
      📄 PriceEscalationCalculator.tsx
      📄 ProjectChangeOrderForm.tsx
      📄 ProjectClosingForm.tsx
      📄 ProjectComprehensiveReport.tsx
      📄 ProjectForm.tsx
      📄 ProjectGanttChart.tsx
      📄 ProjectHealthGauges.tsx
      📄 ProjectInsights.tsx
      📄 ProjectManager.tsx
      📄 ProjectMilestonesManager.tsx
      📄 RetentionReleaseManager.tsx
      📄 RfiSubmittalManager.tsx
      📄 SiteAssetsCustody.tsx
      📄 SiteAttachmentManager.tsx
      📄 SiteAttendanceManager.tsx
      📄 SiteDailyLogsManager.tsx
      📄 SiteImageGallery.tsx
      📄 SiteRequisitionManager.tsx
      📄 SubcontractorBillingManager.tsx
      📄 SubcontractorContractsManager.tsx
      📄 SubcontractorForm.tsx
      📄 SubcontractorManager.tsx
      📄 SubcontractorPaymentButton.tsx
      📄 SubcontractorStatement.tsx
      📄 WorkInspectionManager.tsx
    📁 reports/
      📄 LaborCostReport.tsx
      📄 ProjectExecutiveReport.tsx
      📄 ProjectProfitabilityDashboard.tsx
      📄 SubcontractorAnalytics.tsx
  📁 finance/
    📁 components/
      📄 BankReconciliationForm.test.tsx
      📄 BankReconciliationForm.tsx
      📄 CashClosingForm.tsx
      📄 CustomerDepositForm.tsx
      📄 ExpenseVoucherForm.tsx
      📄 PaymentGatewaySettings.tsx
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
      📄 ClinicalNotesForm.tsx
      📄 ClinicalPharmacy.tsx
      📄 DischargeManager.test.tsx
      📄 DischargeManager.tsx
      📄 HospitalBillingEngine.test.tsx
      📄 HospitalBillingEngine.tsx
      📄 OrderManagement.tsx
      📄 PACSViewerModal.tsx
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
      📄 DoctorKPIs.tsx
      📄 DoctorManager.tsx
      📄 ERTriageBoard.tsx
      📄 HIMSExecutiveDashboard.tsx
      📄 HIMSProfitabilityReports.tsx
      📄 HIMSServicesManager.tsx
      📄 InpatientDashboard.tsx
      📄 InsuranceClaimsManager.tsx
      📄 LabDashboard.tsx
      📄 LabSpecimenTracking.tsx
      📄 MedicalBilling.tsx
      📄 NurseStation.tsx
      📄 OperatingTheaterManager.tsx
      📄 PatientManager.tsx
      📄 PatientPortal.tsx
      📄 PharmacyDashboard.tsx
      📄 RadiologyDashboard.tsx
      📄 StaffRosterManager.tsx
      📄 SurgeryScheduler.tsx
    📄 hims.types.ts
    📄 himsHelpers.ts
  📁 hooks/
    📄 usePermissions.ts
  📁 hr/
    📁 components/
      📄 AttendanceManager.tsx
      📄 BiometricDeviceManager.tsx
      📄 EmployeeAdvances.tsx
      📄 EmployeeManager.tsx
      📄 EndOfServiceCalculator.tsx
      📄 HrDashboard.tsx
      📄 LeaveManager.tsx
      📄 PayrollRun.tsx
      📄 PayslipModal.tsx
      📄 PenaltiesAndRewards.tsx
      📄 ShiftManager.tsx
    📁 data/
      📄 factoryEmployees.ts
    📁 reports/
      📄 EmployeeReports.tsx
      📄 EmployeeStatement.tsx
      📄 PayrollReport.tsx
  📁 inventory/
    📁 components/
      📄 AutoCreatedProductsModal.tsx
      📄 BulkOfferModal.tsx
      📄 BulkPriceUpdateModal.tsx
      📄 CategoryModal.tsx
      📄 ExcelPriceUpdateModal.tsx
      📄 ExpectedConsumptionModal.tsx
      📄 ProductFormModal.tsx
    📁 utils/
      📄 productBarcodeUtils.ts
      📄 productExcelUtils.ts
    📄 BinLocationManager.tsx
    📄 DetailedStockMovementReport.tsx
    📄 ExpiryClearanceRadar.tsx
    📄 GoodsReceiptManager.tsx
    📄 HypermarketReplenishment.tsx
    📄 InTransitTransfersManager.tsx
    📄 InventoryCountDraft.test.ts
    📄 InventoryCountForm.tsx
    📄 InventoryCountList.tsx
    📄 InventoryDashboard.tsx
    📄 InventoryRevaluation.tsx
    📄 ItemMovementReport.tsx
    📄 ItemProfitReport.tsx
    📄 MobilePdaStocktaking.tsx
    📄 OpeningInventory.tsx
    📄 ProductManager.tsx
    📄 ShelfRestockReport.tsx
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
      📄 BOMImportModal.tsx
      📄 ByProductModal.tsx
      📄 CapacityPlanningDashboard.tsx
      📄 CostClosingDashboard.tsx
      📄 MachineOeeTracker.tsx
      📄 MachineryMaintenanceManager.test.tsx
      📄 MachineryMaintenanceManager.tsx
      📄 ManufacturingDashboard.tsx
      📄 ManufacturingManager.tsx
      📄 MaterialRequestsList.tsx
      📄 ProductionGanttScheduler.tsx
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
    📁 utils/
      📄 bomExportUtils.test.ts
      📄 bomExportUtils.ts
    📄 MFG_TEST_SCENARIO.md
  📁 mobile/
    📁 components/
      📄 MobileHeader.tsx
      📄 MobileNavigation.tsx
      📄 MobileReceiptModal.tsx
      📄 QuickAddCustomerModal.tsx
    📁 tabs/
      📄 MobileDashboardTab.tsx
      📄 MobileSalesTab.tsx
      📄 MobileScannerTab.tsx
      📄 MobileSyncTab.tsx
    📄 MobileApp.tsx
  📁 purchases/
    📁 components/
      📄 PurchaseInvoiceAttachments.tsx
    📄 AutoReorderPurchases.tsx
    📄 DebitNoteForm.tsx
    📄 DebitNoteList.tsx
    📄 DebitNotePrint.tsx
    📄 NetPurchasesReport.tsx
    📄 PurchaseAnalysisReport.tsx
    📄 PurchaseInvoiceForm.tsx
    📄 PurchaseInvoiceList.tsx
    📄 PurchaseInvoicePrint.tsx
    📄 purchaseInvoiceUtils.ts
    📄 PurchaseOrderForm.tsx
    📄 PurchaseOrderList.tsx
    📄 PurchaseOrderPrint.tsx
    📄 PurchaseReports.tsx
    📄 PurchaseReturnForm.tsx
    📄 PurchaseReturnPrint.tsx
    📄 PurchaseReturnsList.tsx
    📄 RfqBiddingManager.tsx
    📄 SupplierAgingReport.tsx
    📄 SupplierBalanceReconciliation.tsx
    📄 SupplierBalancesReport.tsx
    📄 SupplierInvoiceExcelImporter.tsx
    📄 SupplierManager.tsx
    📄 SupplierStatement.tsx
    📄 VendorContractsManager.tsx
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
        📄 ExpoScreen.tsx
        📄 KdsScreen.tsx
        📄 KitchenTicket.tsx
      📁 Kiosk/
        📄 SelfOrderingKiosk.tsx
      📁 Management/
        📄 AutoReorderManager.tsx
        📄 ButcheringYieldManager.tsx
        📄 CustomerWinBackManager.tsx
        📄 DeliveryAggregatorManager.tsx
        📄 DriverDispatchManager.tsx
        📄 HappyHourManager.tsx
        📄 KitchenEndDayCount.tsx
        📄 KitchenStationManager.tsx
        📄 LoyaltyProgramManager.tsx
        📄 ModifierManagement.tsx
        📄 MultiChannelPricingManager.tsx
        📄 NewButcheringOrderModal.tsx
        📄 RecipeManagement.tsx
        📄 ThermalPrintersManager.tsx
        📄 TipsPoolManager.tsx
        📄 YieldAnalyticsReport.tsx
        📄 YieldTemplatesModal.tsx
      📁 Modals/
        📄 BulkQRCodeModal.tsx
        📄 CopyModifiersModal.tsx
        📄 ModifierSelectionModal.tsx
        📄 PaymentModal.tsx
        📄 QRCodeModal.tsx
      📁 POS/
        📄 BlindShiftCloseModal.tsx
        📄 CustomerDisplay.tsx
        📄 MobileWaiterScreen.tsx
        📄 OrderSummary.tsx
        📄 PendingOrdersSidebar.tsx
        📄 PettyCashModal.tsx
        📄 PosScreen.tsx
        📄 RestaurantPosCards.tsx
        📄 RestaurantShiftModals.tsx
        📄 RestaurantTableModals.tsx
      📄 GuestMenuLayout.tsx
    📁 reports/
      📄 ReportBuilder.tsx
      📄 RestaurantAnalytics.tsx
      📄 RestaurantProfitReport.tsx
      📄 RestaurantSalesReport.tsx
      📄 SalesByUserReport.tsx
      📄 WastageAnalysisReport.tsx
    📁 services/
      📄 modifierService.ts
      📄 posService.ts
    📁 utils/
      📄 runRestaurantFlowTest.ts
  📁 retail/
    📁 components/
      📁 CustomerDisplay/
        📄 CustomerFacingScreen.tsx
      📁 POS/
        📄 CashDropModal.tsx
        📄 CashierShiftsHistory.tsx
        📄 HeldOrdersModal.tsx
        📄 PosReturnModal.tsx
        📄 RetailPosCartTable.tsx
        📄 RetailPosHeader.tsx
        📄 RetailPosPaymentPanel.tsx
        📄 RetailPosPrintReceipt.tsx
        📄 RetailPosScreen.test.tsx
        📄 RetailPosScreen.tsx
        📄 RetailPosShiftCloseModal.tsx
        📄 RetailPosShiftOpenView.tsx
        📄 RetailPosShortcutsFooter.tsx
        📄 ScaleConnectModal.tsx
        📄 SplitPaymentModal.tsx
        📄 SupervisorBadgePrintModal.tsx
        📄 SupervisorPinModal.tsx
      📁 Promotions/
        📄 CouponsManagerTab.tsx
        📄 PromotionsManager.tsx
      📄 PriceCheckerKiosk.tsx
    📁 hooks/
      📄 usePosCart.ts
    📁 services/
      📄 couponService.ts
      📄 posCheckoutService.ts
      📄 posProductResolver.ts
      📄 posShiftService.ts
      📄 promotionEngine.test.ts
      📄 promotionEngine.ts
      📄 scaleService.ts
    📁 utils/
      📄 barcodeSvg.ts
  📁 sales/
    📁 components/
      📄 InvoiceHeader.tsx
      📄 InvoiceItemsTable.tsx
      📄 InvoiceSummary.tsx
      📄 QuickCustomerModals.tsx
      📄 SalesInvoiceActionBar.tsx
      📄 SalesInvoiceExcelImporter.tsx
      📄 ThermalInvoicePrintTemplate.tsx
    📄 CreditNoteForm.tsx
    📄 CreditNoteList.tsx
    📄 CreditNotePrint.tsx
    📄 CustomerAgingReport.tsx
    📄 CustomerBalanceReconciliation.tsx
    📄 CustomerManager.tsx
    📄 CustomerStatement.tsx
    📄 ETATracker.tsx
    📄 FreeReturnsReport.tsx
    📄 index.css
    📄 InvoiceList.tsx
    📄 MultiUomStockReport.tsx
    📄 OfferBeneficiariesReport.tsx
    📄 QuotationForm.tsx
    📄 QuotationList.tsx
    📄 QuotationPrint.tsx
    📄 RecurringInvoicesManager.tsx
    📄 Reports.tsx
    📄 SalesInvoiceForm.tsx
    📄 SalesInvoicePrint.tsx
    📄 SalesOrderForm.tsx
    📄 SalesOrderPrint.tsx
    📄 SalesOrders.tsx
    📄 SalesReports.tsx
    📄 SalesReturnForm.tsx
    📄 SalesReturnPrint.tsx
    📄 SalesReturnsList.tsx
  📁 stadium/
    📁 components/
      📄 BookingManager.tsx
      📄 CoachManager.tsx
      📄 DisbursementManager.tsx
      📄 FacilityMaintenanceManager.test.tsx
      📄 FacilityMaintenanceManager.tsx
      📄 FacilityManager.tsx
      📄 GateScanner.tsx
      📄 MemberCardModal.tsx
      📄 MemberManager.tsx
      📄 ReceiptModal.tsx
      📄 RentalContractPrintModal.tsx
      📄 RentalManager.tsx
      📄 StadiumBudgetManager.tsx
      📄 StadiumCustodyManager.tsx
      📄 StadiumDashboard.tsx
      📄 TournamentManager.tsx
      📄 TrainingProgramManager.tsx
    📁 reports/
      📄 MemberAgingReport.tsx
      📄 OccupancyReport.tsx
      📄 ProgramProfitReport.tsx
      📄 StadiumExpenseReport.tsx
      📄 StadiumPnLReport.tsx
      📄 StadiumRevenueReport.tsx
    📄 stadium.types.ts
    📄 stadiumHelpers.ts
📁 components/
  📁 settings/
    📄 AccountMappingTab.tsx
    📄 ArchiveManager.tsx
    📄 BackupRestoreManager.tsx
    📄 DemoModeTab.tsx
    📄 EtaIntegrationTab.tsx
    📄 FinancialSettingsTab.tsx
    📄 GeneralSettingsTab.tsx
    📄 index.ts
    📄 SystemMaintenanceTab.tsx
    📄 TerminalsSettingsTab.tsx
    📄 types.ts
  📄 _redirects
  📄 About.tsx
  📄 AdminTestDashboard.tsx
  📄 AppGuardsAndLayout.tsx
  📄 backup_service.sql
  📄 Dashboard.tsx
  📄 DashboardAlerts.tsx
  📄 DemoTour.tsx
  📄 DEPLOYMENT_STRATEGY.md
  📄 DevEnvironmentBanner.tsx
  📄 DocumentAuditTimeline.tsx
  📄 DraftJournalsList.tsx
  📄 EmployeeSearchSelect.tsx
  📄 ErrorBoundary.tsx
  📄 FINAL_FEATURES_SUMMARY.md
  📄 full-flow-test.ts
  📄 Header.tsx
  📄 index.ts
  📄 IntegrityCheckScreen.tsx
  📄 InvoiceItemsList.tsx
  📄 InvoiceOCRScannerModal.tsx
  📄 LandingPage.tsx
  📄 Login.tsx
  📄 LuxuryReportEngine.ts
  📄 Maintenance.tsx
  📄 manufacturing_module.sql
  📄 MobileBottomNav.tsx
  📄 NotFound.tsx
  📄 NotificationCenter.tsx
  📄 OfflineSyncProvider.tsx
  📄 PaymentLinkModal.tsx
  📄 PrintableInvoice.tsx
  📄 ProductSearchSelect.tsx
  📄 ProductStockViewer.tsx
  📄 ProjectSCurveChart.tsx
  📄 QuickBooksWorkflowHub.tsx
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
  📄 SupplierSearchSelect.tsx
  📄 TableSkeleton.tsx
  📄 TopMenuBar.tsx
  📄 UnitsOfMeasureManager.tsx
  📄 usePagination.ts
  📄 UserGuide.tsx
  📄 UserManager.tsx
  📄 UserProfile.tsx
  📄 WorkspaceTabsBar.tsx
📁 services/
  📁 migrations/
    📁 archive/
      📄 admin_platform_stats.sql
      📄 approve_purchase_return_rpc.sql
      📄 approve_sales_return_rpc.sql
      📄 check_missing_rls.sql
      📄 check_user_status.sql
      📄 client_backup.sql
      📄 complete_manufacturing_module.sql
      📄 comprehensive_fix_403.sql
      📄 comprehensive_fix.sql
      📄 construction_module.sql
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
      📄 full_unified_system.sql
      📄 hims_master_setup.sql
      📄 hims_module.sql
      📄 hims_updates.sql
      📄 initialize_egyptian_coa.sql
      📄 invoice_items_queries.sql
      📄 link_returns_to_invoices.sql
      📄 manufacturing_alerts.sql
      📄 manufacturing_functions.sql
      📄 manufacturing_qc_variance.sql
      📄 manufacturing_rls.sql
      📄 manufacturing_setup.sql
      📄 manufacturing_stabilization.sql
      📄 master_setup.sql
      📄 mfg_advanced_costing.sql
      📄 mfg_cost_analytics.sql
      📄 mfg_rls_test.sql
      📄 populate_demo_activity.sql
      📄 quick_diagnostic.sql
      📄 reset_database_clean.sql
      📄 restaurant_analytics_views.sql
      📄 restore_from_backup.sql
      📄 secure_tables.sql
      📄 seed_icd10_codes.sql
      📄 setup_client_admin.sql
      📄 setup_complete_demo.sql
      📄 setup_demo_environment.sql
      📄 setup_demo_protection.sql
      📄 setup_new_client_db.sql
      📄 setup_rls.sql
      📄 simple_debug.sql
      📄 stadium_module.sql
      📄 surgery_functions.sql
      📄 test_approve_invoice.sql
      📄 test_clear_demo_data.sql
      📄 test_payment_voucher.sql
      📄 test_receipt_voucher_logic.sql
      📄 test_receipt_voucher_v2.sql
      📄 ultimate_data_repair.sql
      📄 unit_test_restaurant_lifecycle.sql
      📄 updated_system_stabilization.sql
      📄 verify_and_fix_returns_schema.sql
      📄 verify_closing.sql
      📄 verify_demo_security.sql
      📄 verify_frontend_integration.sql
      📄 verify_functions.sql
      📄 verify_reset.sql
      📄 verify_rls_status.sql
      📄 verify_system_health.sql
    📄 00_master_clean_hypermarket_install.sql
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
    📄 2026-07-02_retail_pos_setup.sql
    📄 2026-07-03_fix_tax_disabled_orders.sql
    📄 2026-07-04_mfg_barcode_commands.sql
    📄 2026-07-04_qr_menu_online_payment.sql
    📄 2026-07-05_automatic_deletion_audit.sql
    📄 2026-07-05_secure_created_by_defaults.sql
    📄 2026-07-06_fix_restaurant_modifiers_schema.sql
    📄 2026-07-06_pos_credit_posting.sql
    📄 2026-07-06_restaurant_process_split_payment.sql
    📄 2026-07-06_restaurant_sync_categories.sql
    📄 2026-07-06_restaurant_table_session_operations.sql
    📄 2026-07-08_fix_purchase_invoice_immediate_payment.sql
    📄 2026-07-08_fix_sales_invoice_immediate_payment.sql
    📄 2026-07-08_treasury_transfer_edit_delete.sql
    📄 2026-07-09_add_bonds_and_investment_revenue.sql
    📄 2026-07-09_add_incorporation_expenses.sql
    📄 2026-07-09_add_investments_and_loans.sql
    📄 2026-07-09_add_opening_balance_rpc.sql
    📄 2026-07-09_add_provisions_and_custodies.sql
    📄 2026-07-09_add_specific_accumulated_depreciations.sql
    📄 2026-07-13_fix_convert_po_to_invoice.sql
    📄 2026-07-15_fix_manufacturing_wip_resolution.sql
    📄 2026-07-16_fix_cost_closing_entry_condition.sql
    📄 2026-07-17_add_product_with_opening_balance_rpc.sql
    📄 2026-07-17_fix_mfg_fan_out_and_reconciliation.sql
    📄 2026-07-17_fix_mfg_record_scrap_scrap_date.sql
    📄 2026-07-17_fix_mfg_reports_turnover_unit_cost.sql
    📄 2026-07-18_add_items_progress_to_progress_billings.sql
    📄 2026-07-28_fix_scrap_stock_recalculation.sql
    📄 2026-07-28_fix_wip_labor_double_counting.sql
    📄 2026-07-30_fix_delete_organization_fk_constraint.sql
    📄 2026-07-31_fix_complete_surgery_and_consume.sql
    📄 2026-07-31_fix_prescription_uuid_validation.sql
    📄 2026-08-01_fefo_batch_tracking.sql
    📄 2026-08-01_fix_hims_billing_and_journal_entries.sql
    📄 2026-08-01_fix_insurance_batching.sql
    📄 2026-08-01_hims_lab_specimen_trigger.sql
    📄 2026-08-01_hims_public_portal_rpc.sql
    📄 2026-08-02_fix_finalize_billing_charge_patient.sql
    📄 2026-08-02_fix_finalize_billing_custom_amount.sql
    📄 2026-08-02_fix_lab_billing_integration.sql
    📄 2026-08-02_fix_lab_consumables.sql
    📄 2026-08-03_fix_hims_finalize_billing_unbalanced.sql
    📄 2026-08-04_eta_integration.sql
    📄 2026-08-04_wac_recalculation_engine.sql
    📄 2026-08-10_auto_wip_gl_closing.sql
    📄 2026-08-13_fix_qr_orders_in_shift.sql
    📄 2026-08-14_add_construction_revenue_account.sql
    📄 2026-08-14_fix_construction_accounting_and_custody.sql
    📄 2026-08-15_fix_fn_close_project.sql
    📄 2026-08-15_fix_project_revenue_and_dashboard_profit.sql
    📄 2026-08-15_subcontractor_advance_payment.sql
    📄 2026-08-15_sync_subcontractors_with_suppliers.sql
    📄 2026-08-15_update_retention_release_with_bank_choice.sql
    📄 2026-08-16_fix_backup_and_restore_engine.sql
    📄 2026-08-17_enterprise_rbac_permissions.sql
    📄 2026-08-17_enterprise_security_audit_engine.sql
    📄 2026-08-17_fix_cheques_cashing_and_collection.sql
    📄 2026-08-17_fix_construction_revenue_for_all_companies.sql
    📄 2026-08-17_fix_get_current_company_settings.sql
    📄 2026-08-17_fix_wac_recalculation_hims_unit_cost.sql
    📄 2026-08-20_fix_purchase_sales_orders_columns.sql
    📄 2026-08-20_fix_unbalanced_purchase_invoice_entries.sql
    📄 2026-08-20_sync_purchase_order_status_with_invoices.sql
    📄 2026-08-20_sync_quotation_status_with_sales_invoices.sql
    📄 2026-08-21_stadium_disbursements_and_custodies.sql
    📄 2026-08-21_stadium_enterprise_expansion.sql
    📄 2026-08-22_cleanup_stress_test_rpc.sql
    📄 2026-08-22_fix_delete_journal_and_supplier_balance.sql
    📄 2026-08-22_fix_hims_demo_and_dispense.sql
    📄 2026-08-22_fix_reconciliation_balance_functions.sql
    📄 2026-08-23_data_integrity_and_database_constraints.sql
    📄 2026-08-23_fix_cheques_journal_entry_trigger.sql
    📄 2026-08-23_fix_notifications_and_backups_rls.sql
    📄 2026-08-23_monthly_fiscal_periods_and_locking.sql
    📄 2026-08-23_payment_gateways_and_instant_links.sql
    📄 2026-08-23_stadium_reconciliation_integration.sql
    📄 2026-08-24_restaurant_service_charge_account.sql
    📄 2026-08-25_get_sales_by_user_report.sql
    📄 2026-08-26_company_cloning_engine.sql
    📄 2026-08-27_create_butchering_yield_module.sql
    📄 2026-08-27_fix_butchering_permissions_and_stock.sql
    📄 2026-08-27_fix_cashier_shifts_permissions.sql
    📄 2026-08-27_fix_kitchen_stations_and_products.sql
    📄 2026-08-27_fix_shift_petty_cash_and_closing.sql
    📄 2026-08-27_restaurant_advanced_features.sql
    📄 2026-08-27_restaurant_advanced_phase4.sql
    📄 2026-08-27_restaurant_roles_and_permissions.sql
    📄 2026-08-28_add_cost_to_stock_adjustment_items.sql
    📄 2026-08-28_add_updated_at_to_products.sql
    📄 2026-08-28_create_delivery_drivers_table.sql
    📄 2026-08-28_fix_butchering_orders_400.sql
    📄 2026-08-28_fix_order_item_notes_in_kitchen.sql
    📄 2026-08-29_create_letters_of_credit.sql
    📄 2026-08-29_create_letters_of_guarantee.sql
    📄 2026-08-29_fix_stock_recalculation_lc.sql
    📄 2026-08-30_create_retail_promotions.sql
    📄 2026-08-30_fix_product_type_flipping.sql
    📄 2026-08-30_vw_inventory_wastage_analysis.sql
    📄 2026-08-31_construction_advanced_suite.sql
    📄 2026-08-31_construction_site_logs_rfis.sql
    📄 2026-08-31_heal_orphaned_journal_lines.sql
    📄 2026-08-31_hr_advanced_suite.sql
    📄 2026-08-31_hypermarket_retail_suite.sql
    📄 2026-08-31_manufacturing_advanced_suite.sql
    📄 2026-08-31_master_all_preset_roles.sql
    📄 2026-08-31_seed_retail_roles.sql
    📄 2026-09-01_adjust_product_stock_rpc.sql
    📄 2026-09-01_fix_driver_deliveries_table.sql
    📄 2026-09-01_fixed_assets_enterprise_suite.sql
    📄 2026-09-01_hr_enterprise_suite.sql
    📄 2026-09-02_fix_mfg_byproducts_and_warehouse_stock.sql
    📄 2026-09-02_fix_purchase_orders_schema_and_columns.sql
    📄 2026-09-02_fix_stock_recalculation_all_returns.sql
    📄 2026-09-02_fix_vendor_rebates_and_shelf_rentals_coa.sql
    📄 2026-09-02_fix_warehouse_bins_constraints.sql
    📄 2026-09-02_purchase_rfqs_and_vendor_bids.sql
    📄 2026-09-02_recurring_invoices_subscriptions.sql
    📄 2026-09-02_setup_advanced_manufacturing_tables.sql
    📄 2026-09-02_wms_bins_and_in_transit_transfers.sql
    📄 2026-09-04_add_bundle_columns_to_retail_promotions.sql
    📄 2026-09-04_add_hypermarket_fields_to_products.sql
    📄 2026-09-04_cash_drop_types.sql
    📄 2026-09-04_final_fix_shift_closing.sql
    📄 2026-09-04_fix_get_shift_summary.sql
    📄 2026-09-04_fix_journal_payout_lines.sql
    📄 2026-09-04_fix_shift_cash_returns_and_drawer.sql
    📄 2026-09-04_fix_shift_closing_promotions_and_discounts.sql
    📄 2026-09-04_hypermarket_advanced_pricing_and_limits.sql
    📄 2026-09-04_hypermarket_complete_update.sql
    📄 2026-09-05_atomic_draft_operations.sql
    📄 2026-09-05_atomic_invoice_operations.sql
    📄 2026-09-05_enterprise_core_optimizations.sql
    📄 2026-09-05_enterprise_indexing_and_performance.sql
    📄 2026-09-05_enterprise_tier1_hardening.sql
    📄 2026-09-05_fix_ambiguous_function_signatures.sql
    📄 2026-09-05_fix_purchase_invoice_draft.sql
    📄 2026-09-05_fix_shift_closing_vat_discount_accounting.sql
    📄 2026-09-05_unify_customer_supplier_balances.sql
    📄 2026-09-05_unify_inventory_stock_and_fix_opening.sql
    📄 2026-09-06_database_first_balance_and_ledger_engine.sql
    📄 2026-09-06_fix_customer_aging_balance_mismatch.sql
    📄 2026-09-06_fix_delete_journal_entry_safe_unpost.sql
    📄 2026-09-06_fix_purchase_invoice_missing_discount_amount.sql
    📄 2026-09-06_fix_rejected_cheques_reconciliation_and_descriptions.sql
    📄 2026-09-06_fix_sales_invoice_discount_promotions_accounting.sql
    📄 2026-09-06_fix_supplier_aging_ledger.sql
    📄 2026-09-06_pos_card_sales_bank_closing.sql
    📄 2026-09-11_fix_mobile_sales_invoice_subtotal_and_treasury.sql
    📄 2026-09-12_enterprise_pessimistic_stock_locking.sql
    📄 2026-09-17_fix_offline_pos_sync_uuid_safety.sql
    📄 2026-09-24_purchase_invoice_discounts_and_attachments.sql
    📄 2026-09-28_advanced_enterprise_indexing_and_fast_analytics.sql
    📄 30-8-2026-shelf
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
    📄 approve_receipt_voucher_rpc.sql
    📄 cash_closing_setup.sql
    📄 client_db_comprehensive_repair.sql
    📄 complete_schema_compatibility_pack.sql
    📄 create_missing_tables.sql
    📄 database_updates_2026-04-05.sql
    📄 egyptian_coa_full.sql
    📄 FINAL_COMBINED_PRODUCTION_SCHEMA.sql
    📄 fix_missing_accounts.sql
    📄 increase_user_limit.sql
    📄 inventory_costing_setup.sql
    📄 inventory_schema_repair.sql
    📄 optimize_database_performance.sql
    📄 recalculate_customer_balances_fix.sql
    📄 recalculate_stock_v4.sql
    📄 rejected_closings_setup.sql
    📄 reports_functions.sql
    📄 run_period_depreciation_rpc.sql
    📄 schema.sql
    📄 secure_journals.sql
    📄 seed_missing_guarantee_and_lc_accounts.sql
    📄 setup_notifications.sql
    📄 sync_missing_accounts.sql
    📄 system_stabilization.sql
    📄 update_products_schema_v2.sql
    📄 voucher_attachments_setup.sql
  📄 accountingEngine.ts
  📄 accountService.ts
  📄 ArchiveManager.tsx
  📄 assetEnterpriseService.ts
  📄 auditDaemonService.ts
  📄 auditService.ts
  📄 autoReorderService.ts
  📄 BackupRestoreManager.tsx
  📄 balanceService.ts
  📄 butcheringYieldService.ts
  📄 cashShiftService.ts
  📄 channelPricingService.ts
  📄 ClinicalPharmacy.tsx
  📄 cookPacingService.ts
  📄 create-client.ts
  📄 currencyRevaluationService.ts
  📄 customerWinBackService.ts
  📄 DailyReportForm.tsx
  📄 deliveryAggregatorService.ts
  📄 driverDispatchService.ts
  📄 etaService.ts
  📄 financialYearService.ts
  📄 geminiService.ts
  📄 happyHourService.ts
  📄 himsService.ts
  📄 hrEnterpriseService.ts
  📄 index.ts
  📄 invoiceItems.ts
  📄 itemAvailabilityGuard.ts
  📄 journalAuditService.ts
  📄 kitchenStationService.ts
  📄 loyaltyService.ts
  📄 NEXT_PHASE_ROADMAP.md
  📄 NotificationScheduler.ts
  📄 notificationService.ts
  📄 notificationTestUtils.ts
  📄 offlineService.ts
  📄 offsiteBackupService.ts
  📄 organizationService.ts
  📄 paymentGatewayService.ts
  📄 ProjectInsights.tsx
  📄 recurringInvoiceService.ts
  📄 ReportBuilder.tsx
  📄 RestaurantAnalytics.tsx
  📄 rfqService.ts
  📄 sequenceService.ts
  📄 SiteAttendanceManager.tsx
  📄 SiteImageGallery.tsx
  📄 stockMovementService.ts
  📄 stockTransferService.ts
  📄 stressTestEngine.ts
  📄 SubcontractorPaymentButton.tsx
  📄 subledgerRegistry.ts
  📄 supabaseClient.ts
  📄 tenantContext.ts
  📄 thermalPrinterService.ts
  📄 tipsPoolService.ts
  📄 waiterPagingService.ts
  📄 whatsappService.ts
  📄 wmsLocationService.ts
📁 context/
  📁 domains/
    📄 AccountingSettingsContext.tsx
    📄 BankingContext.tsx
    📄 CustomerContext.tsx
    📄 domainUtils.ts
    📄 GeneralLedgerContext.tsx
    📄 HrContext.tsx
    📄 ProductContext.tsx
    📄 RestaurantContext.tsx
    📄 SalesContext.tsx
    📄 SupplierContext.tsx
  📄 accountingConstants.ts
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
  "version": "1.0.0",
  "type": "module",
  "main": "desktop/main.cjs",
  "scripts": {
    "dev": "vite",
    "build": "npm run security-audit && tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:integration": "dotenv -e .env.integration -- vitest run --config vitest.integration.config.ts",
    "test:integration:verbose": "dotenv -e .env.integration -- vitest run --config vitest.integration.config.ts --reporter=verbose",
    "test:all": "npm run test && npm run test:integration",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "verify:release": "npm run test && npm run build && playwright test",
    "demo": "vite --mode demo",
    "preview": "vite preview",
    "desktop:start": "electron desktop/main.cjs",
    "pos:start": "electron desktop/main.cjs --pos",
    "desktop:portable": "node scripts/build-portable-desktop.mjs",
    "desktop:dist": "npm run build && electron-builder --win",
    "desktop:pack": "npm run build && electron-builder --win --dir",
    "update-memory": "node update_memory.js",
    "security-audit": "node scripts/security-audit.js",
    "security-check": "npm audit && npm run security-audit",
    "health-check": "node scripts/system_health_check.mjs"
  },
  "dependencies": {
    "@ant-design/icons": "^6.2.3",
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@google/genai": "^1.34.0",
    "@hookform/resolvers": "^5.4.0",
    "@remix-run/router": "^1.13.0",
    "@supabase/supabase-js": "^2.39.0",
    "@tanstack/react-query": "^5.90.16",
    "antd": "^6.4.3",
    "date-fns": "^4.2.1",
    "dayjs": "^1.11.21",
    "dexie": "^4.3.0",
    "dexie-react-hooks": "^4.2.0",
    "html2canvas": "^1.4.1",
    "jspdf": "^4.0.0",
    "lucide-react": "^0.294.0",
    "nodemailer": "^10.0.16",
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
    "@playwright/test": "^1.63.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@types/nodemailer": "^8.0.2",
    "@types/uuid": "^10.0.0",
    "@vercel/node": "^5.6.11",
    "@vitejs/plugin-react": "^4.2.0",
    "@vitest/ui": "^2.0.4",
    "autoprefixer": "^10.4.16",
    "dotenv-cli": "^11.0.0",
    "electron": "^44.4.1",
    "electron-builder": "^26.15.3",
    "jsdom": "^24.1.1",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "typescript": "^5.2.2",
    "vite": "^5.0.0",
    "vitest": "^2.0.4"
  },
  "build": {
    "appId": "com.tripro.erp",
    "productName": "TriPro ERP",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "desktop/**/*"
    ],
    "win": {
      "target": [
        "nsis",
        "portable"
      ]
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "TriPro ERP"
    }
  }
}

```

### 📄 App.tsx
```typescript
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import arEG from 'antd/locale/ar_EG';
import { supabase } from './supabaseClient';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AccountingProvider, useAccounting } from './context/AccountingContext';
import { Landmark, X, Info } from 'lucide-react';
import { ToastProvider } from './context/ToastContext';
import { Toaster as HotToaster } from 'react-hot-toast';
import { notifyUserError } from './utils/errorHandler';
import { logger } from './utils/logger';
import NotificationScheduler from './services/NotificationScheduler';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import TopMenuBar from './components/TopMenuBar';
import WorkspaceTabsBar from './components/WorkspaceTabsBar';
import MobileBottomNav from './components/MobileBottomNav';
import { secureStorage } from './utils/securityMiddleware';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import NotFound from './components/NotFound';

// 📱 تطبيق الموبايل الميداني التقدمي (Mobile PWA Companion)
const MobileApp = lazy(() => import('./modules/mobile/MobileApp'));

// 📊 لوحات التحكم والأدوات الإدارية (Lazy Loaded)
const AdminTestDashboard = lazy(() => import('./components/AdminTestDashboard'));
const AuditTrailViewer = lazy(() => import('./modules/admin/AuditTrailViewer'));
const Quotations = lazy(() => import('./components/Quotations'));
const DraftJournalsList = lazy(() => import('./components/DraftJournalsList'));

// 🏛️ المحاسبة والقيود والتقارير المالية (Accounting & Journal - Lazy Loaded)
const GeneralJournal = lazy(() => import('./modules/accounting/GeneralJournal'));
const GeneralLedger = lazy(() => import('./modules/accounting/GeneralLedger'));
const JournalEntryForm = lazy(() => import('./modules/accounting/JournalEntryForm'));
const IncomeStatement = lazy(() => import('./modules/accounting/IncomeStatement'));
const BalanceSheet = lazy(() => import('./modules/accounting/BalanceSheet'));
const ChangesInEquityStatement = lazy(() => import('./modules/accounting/ChangesInEquityStatement'));
const CashFlowStatement = lazy(() => import('./modules/accounting/CashFlowStatement'));
const AnnualFinancialReport = lazy(() => import('./modules/accounting/AnnualFinancialReport'));
const CFODashboard = lazy(() => import('./modules/accounting/CFODashboard'));
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
const ETATracker = lazy(() => import('./modules/sales/ETATracker'));
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
const CashierShiftsHistory = lazy(() => import('./modules/retail/components/POS/CashierShiftsHistory'));
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
const AutoReorderPurchases = lazy(() => import('./modules/purchases/AutoReorderPurchases'));
const RestaurantSalesReport = lazy(() => import('./modules/restaurant/reports/RestaurantSalesReport'));
const SalesByUserReport = lazy(() => import('./modules/restaurant/reports/SalesByUserReport'));
const WastageAnalysisReport = lazy(() => import('./modules/restaurant/reports/WastageAnalysisReport'));
const RestaurantProfitReport = lazy(() => import('./modules/restaurant/reports/RestaurantProfitReport'));
const RestaurantAnalytics = lazy(() => import('./modules/restaurant/reports/RestaurantAnalytics'));
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



// إنشاء عميل React Query بإعدادات متقدمة للحفظ المؤقت وإعادة المحاولة
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 دقائق: الحفاظ على البيانات لتجنب جلبها مع كل انتقال
      gcTime: 10 * 60 * 1000,          // 10 دقائق في الكاش
      retry: 2,                         // إعادة المحاولة مرتين عند الفشل الشبكي
      refetchOnWindowFocus: false,      // منع إعادة الجلب غير الضروري عند التبديل بين النوافذ
      refetchOnReconnect: true,         // إعادة الجلب التلقائي عند استعادة الاتصال
    },
    mutations: {
      retry: 0,                         // منع تكرار العمليات المالية التلقائية
    },
  },
});

import {
  PrintHeader,
  PrintFooter,
  DemoBanner,
  DemoWelcomeModal,
  DemoWatermark,
  SuspendedScreen,
  ModuleGuard,
  LazyLoadingFallback,
  ErrorBoundary
} from './components/AppGuardsAndLayout';


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
const COMPATIBILITY_REDIRECTS: [string, string][] = [
  ['/price-checker', '/retail/price-checker'],
  ['/promotions', '/retail/promotions'],
  ['/pda-stocktaking', '/inventory/pda-stocktaking'],
  ['/expiry-radar', '/inventory/expiry-radar'],
  ['/shelf-restock', '/inventory/shelf-restock'],
  ['/replenishment', '/inventory/replenishment'],
  ['/goods-receipt', '/inventory/goods-receipt'],
  ['/vendor-contracts', '/purchases/vendor-contracts'],
  ['/expo', '/restaurant/expo'],
  ['/kitchen-stations', '/restaurant/stations'],
  ['/aggregators', '/restaurant/aggregators'],
  ['/channel-pricing', '/restaurant/channel-pricing'],
  ['/driver-dispatch', '/restaurant/driver-dispatch'],
  ['/tips-pool', '/restaurant/tips-pool'],
  ['/win-back', '/restaurant/win-back'],
  ['/auto-reorder', '/restaurant/auto-reorder'],
  ['/happy-hours', '/restaurant/happy-hours'],
  ['/butchering-yield', '/restaurant/butchering-yield'],
  ['/waiter', '/restaurant/waiter'],
  ['/printers', '/restaurant/printers'],
  ['/loyalty', '/restaurant/loyalty'],
  ['/kiosk', '/restaurant/kiosk'],
  ['/sales', '/invoices-list'],
  ['/purchases', '/purchase-invoices-list'],
  ['/vouchers', '/receipt-vouchers-list'],
  ['/manufacturing', '/mfg/dashboard'],
  ['/hims', '/hims/patients'],
];

const MainLayout = () => {
    const { currentUser: accUser, organization, settings } = useAccounting();
    const { can, currentUser: authUser } = useAuth();
    const currentUser = authUser || accUser;
    const location = useLocation();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(() => {
        try {
            const userPref = authUser?.dashboard_view_mode || accUser?.dashboard_view_mode || 'both';
            const isWorkflowDashboard = (location.pathname === '/' || location.pathname === '/dashboard') &&
                (userPref === 'workflow_only' || (userPref !== 'analytics_only' && secureStorage.getItem('tripro_dashboard_view_mode') !== 'analytics'));
            if (isWorkflowDashboard) return true;
            return secureStorage.getItem('tripro_desktop_sidebar_collapsed') === 'true';
        } catch {
            return false;
        }
    });

    const toggleDesktopSidebar = () => {
        setIsDesktopCollapsed(prev => {
            const next = !prev;
            try { secureStorage.setItem('tripro_desktop_sidebar_collapsed', String(next)); } catch {}
            return next;
        });
    };

    // ⚡ عند فتح لوحة القيادة بمود خريطة العمليات فقط، يتم طي القائمة الجانبية تلقائياً لتكون الشاشة كاملة
    useEffect(() => {
        const pref = authUser?.dashboard_view_mode || accUser?.dashboard_view_mode || 'both';
        const isDashboardRoute = location.pathname === '/' || location.pathname === '/dashboard';
        if (isDashboardRoute && pref === 'workflow_only') {
            setIsDesktopCollapsed(true);
            try { secureStorage.setItem('tripro_desktop_sidebar_collapsed', 'true'); } catch {}
        }
    }, [authUser?.dashboard_view_mode, accUser?.dashboard_view_mode, location.pathname]);

    // ⚡ استقبال أوامر إخفاء/إظهار القائمة الجانبية تلقائياً (مثل التبديل بين خريطة تري برو ولوحة التحليلات)
    useEffect(() => {
        const handleCollapseEvent = (e: Event) => {
            const customEvent = e as CustomEvent;
            const collapse = Boolean(customEvent?.detail);
            setIsDesktopCollapsed(collapse);
            try { secureStorage.setItem('tripro_desktop_sidebar_collapsed', String(collapse)); } catch {}
        };
        window.addEventListener('set-desktop-sidebar-collapsed', handleCollapseEvent);
        return () => {
            window.removeEventListener('set-desktop-sidebar-collapsed', handleCollapseEvent);
        };
    }, []);

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

    const isVanSales = (currentUser?.role as string) === 'van_sales';

    // 🚚 إذا كان المستخدم مندوب مبيعات وتوزيع سيارة، يُلزم بتطبيق الموبايل الميداني فقط ويُمنع من الوصول للواجهة المكتبية
    if (isVanSales && location.pathname !== '/mobile') {
        return <Navigate to="/mobile" replace />;
    }

    // إذا كان المستخدم في وضع الموبايل الميداني (Mobile Companion)، يتم عرضه بملء الشاشة مخصصاً للهواتف
    if (location.pathname === '/mobile') {
        if (!isVanSales && !can('mobile', 'view')) {
            return <Navigate to="/" replace />;
        }
        return (
            <Suspense fallback={<LazyLoadingFallback />}>
                <MobileApp />
            </Suspense>
        );
    }

    // 🛒 وضع الكاشير المستقل بملء الشاشة (Dedicated Fullscreen POS Kiosk Mode)
    // عزل واجهة الكاشير تماماً عن القوائم الإدارية والسايدبار لتكون شاشة كاشير احترافية خالصة
    if (location.pathname === '/retail-pos') {
        return (
            <Suspense fallback={<LazyLoadingFallback />}>
                <div className="min-h-screen bg-slate-950 text-slate-100 font-sans" dir="rtl">
                    <OfflineSyncProvider />
                    <RetailPosScreen />
                </div>
            </Suspense>
        );
    }

    if (location.pathname === '/pos') {
        return (
            <Suspense fallback={<LazyLoadingFallback />}>
                <div className="min-h-screen bg-slate-100 font-sans" dir="rtl">
                    <OfflineSyncProvider />
                    <PosScreen />
                </div>
            </Suspense>
        );
    }

    return (
        <div className="flex min-h-screen bg-slate-50 font-sans text-right print:block print:h-auto" dir="rtl">
            <Sidebar 
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
                isDesktopCollapsed={isDesktopCollapsed}
                onToggleDesktopCollapse={toggleDesktopSidebar}
            />
            <div className="flex-1 flex flex-col min-w-0 h-screen print:h-auto print:block print:overflow-visible">
                <DemoBanner />
                <DemoWelcomeModal />
                <DemoTour />
                <DemoWatermark />
                <OfflineSyncProvider />
                <PrintHeader />
                <div className="print:hidden">
                    <div className="hidden md:block">
                        <TopMenuBar />
                    </div>
                    <Header 
                        onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)} 
                        isDesktopCollapsed={isDesktopCollapsed}
                        onToggleDesktopSidebar={toggleDesktopSidebar}
                    />
                    <div className="hidden sm:block">
                        <WorkspaceTabsBar />
                    </div>
                </div>
                {/* إضافة هوامش للطباعة وللشريط السفلي في الموبايل لتجنب تغطية المحتوى */}
                <main className="flex-1 p-3 sm:p-5 lg:p-8 pb-24 sm:pb-6 lg:pb-8 overflow-y-scroll bg-slate-50 print:bg-white print:p-0 print:overflow-visible print:h-auto print:mt-24 print:mb-12">
                    <div className="max-w-7xl mx-auto print:max-w-none print:w-full print:px-4">
                        <ErrorBoundary fallbackTitle="حدث خطأ غير متوقع أثناء تحميل الصفحة">
                        <Suspense fallback={<LazyLoadingFallback />}>
                        <Routes>
                {/* المسارات الأساسية */}
                <Route path="/mobile" element={(!isVanSales && !can('mobile', 'view')) ? <Navigate to="/" replace /> : <MobileApp />} />
                <Route 
                  path="/dashboard" 
                  element={
                    ((authUser?.dashboard_view_mode === 'workflow_only' || accUser?.dashboard_view_mode === 'workflow_only' || authUser?.dashboard_view_mode === 'analytics_only' || accUser?.dashboard_view_mode === 'analytics_only') || can('dashboard', 'view')) 
                      ? <Dashboard /> 
                      : <Navigate to="/" replace />
                  } 
                />
                <Route
                  path="/"
                  element={
                    (authUser?.dashboard_view_mode === 'workflow_only' || accUser?.dashboard_view_mode === 'workflow_only' || authUser?.dashboard_view_mode === 'analytics_only' || accUser?.dashboard_view_mode === 'analytics_only')
                      ? <Dashboard />
                      : (currentUser?.role as string) === 'chef' || (currentUser?.role as string) === 'restaurant_cook'
                      ? <Navigate to="/kds" replace />
                      : (currentUser?.role as string) === 'restaurant_cashier'
                      ? <Navigate to="/pos" replace />
                      : (currentUser?.role as string) === 'retail_cashier'
                      ? <Navigate to="/retail-pos" replace />
                      : (currentUser?.role as string) === 'cashier'
                      ? (
                          (() => {
                            try {
                              const localPref = secureStorage.getItem('tripro_default_pos_mode');
                              if (localPref === 'restaurant') return <Navigate to="/pos" replace />;
                              if (localPref === 'retail') return <Navigate to="/retail-pos" replace />;
                            } catch {}

                            const defaultPosMode = (settings as any)?.defaultPosMode || (settings as any)?.accountMappings?.default_pos_mode;
                            if (defaultPosMode === 'restaurant') return <Navigate to="/pos" replace />;
                            if (defaultPosMode === 'retail') return <Navigate to="/retail-pos" replace />;

                            const actType = (organization as any)?.activity_type || (settings as any)?.activity_type;
                            const modules = (organization as any)?.allowed_modules || [];

                            if (actType === 'restaurant' || (modules.includes('restaurant') && !modules.includes('retail'))) {
                              return <Navigate to="/pos" replace />;
                            }
                            return <Navigate to="/retail-pos" replace />;
                          })()
                        )
                      : (currentUser?.role as string) === 'restaurant_waiter'
                      ? <Navigate to="/restaurant/waiter" replace />
                      : (currentUser?.role as string) === 'restaurant_driver'
                      ? <Navigate to="/restaurant/driver-dispatch" replace />
                      : (currentUser?.role as string) === 'van_sales'
                      ? <Navigate to="/mobile" replace />
                      : can('dashboard', 'view')
                      ? <Dashboard />
                      : <Navigate to={can('sales', 'view') ? "/invoices-list" : can('inventory', 'view') ? "/products" : can('accounting', 'view') ? "/general-journal" : "/profile"} replace />
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
                      <Route path="boms" element={<Navigate to="/mfg/routing-bom" replace />} />
                      <Route path="work-orders" element={<Navigate to="/mfg/orders" replace />} />
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
                <Route path="/receipt-voucher" element={<ModuleGuard module="treasury"><ReceiptVoucherForm /></ModuleGuard>} />
                <Route path="/receipt-vouchers-list" element={<ModuleGuard module="treasury"><ReceiptVoucherList /></ModuleGuard>} />
                <Route path="/payment-voucher" element={<ModuleGuard module="treasury"><PaymentVoucherForm /></ModuleGuard>} />
                <Route path="/payment-vouchers-list" element={<ModuleGuard module="treasury"><PaymentVoucherList /></ModuleGuard>} />
                <Route path="/expense-voucher" element={<ModuleGuard module="treasury"><ExpenseVoucherForm /></ModuleGuard>} />
                <Route path="/transfer" element={<ModuleGuard module="treasury"><TransferForm /></ModuleGuard>} />
                <Route path="/customer-deposit" element={<ModuleGuard module="treasury"><CustomerDepositForm /></ModuleGuard>} />
                <Route path="/cheques" element={<ModuleGuard module="treasury"><ChequesPage /></ModuleGuard>} />
                <Route path="/letters-of-guarantee" element={<ModuleGuard module="treasury"><LettersOfGuaranteePage /></ModuleGuard>} />
                <Route path="/letters-of-credit" element={<ModuleGuard module="treasury"><LettersOfCreditPage /></ModuleGuard>} />
                <Route path="/cheque-movement-report" element={<ModuleGuard module="treasury"><ChequeMovementReport /></ModuleGuard>} />
                <Route path="/returned-cheques-report" element={<ModuleGuard module="treasury"><ReturnedChequesReport /></ModuleGuard>} />
                <Route path="/bank-reconciliation" element={<ModuleGuard module="treasury"><BankReconciliationForm /></ModuleGuard>} />
                <Route path="/cash-closing" element={<ModuleGuard module="treasury"><CashClosingForm /></ModuleGuard>} />
                <Route path="/payment-gateways" element={<ModuleGuard module="treasury"><PaymentGatewaySettings /></ModuleGuard>} />
                <Route path="/deficit-report" element={<ModuleGuard module="treasury"><DeficitReport /></ModuleGuard>} />
                
                {/* 🛒 مديول المبيعات والعملاء */}
                <Route path="/sales-invoice" element={<ModuleGuard module="sales"><SalesInvoiceForm /></ModuleGuard>} />
                <Route path="/invoices-list" element={<ModuleGuard module="sales"><InvoiceList /></ModuleGuard>} />
                <Route path="/eta-invoices" element={<ModuleGuard module="sales"><ETATracker /></ModuleGuard>} />
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
                <Route path="/purchases/auto-reorder" element={<ModuleGuard module="purchases"><AutoReorderPurchases /></ModuleGuard>} />
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
                <Route path="/changes-in-equity" element={<ModuleGuard module="accounting"><ChangesInEquityStatement /></ModuleGuard>} />
                <Route path="/cash-flow" element={<ModuleGuard module="accounting"><CashFlowStatement /></ModuleGuard>} />
                <Route path="/annual-report" element={<ModuleGuard module="accounting"><AnnualFinancialReport /></ModuleGuard>} />
                <Route path="/cfo-dashboard" element={<ModuleGuard module="accounting"><CFODashboard /></ModuleGuard>} />
                <Route path="/cash-flow-report" element={<ModuleGuard module="accounting" requiredPermission="reports.cash_bank_movement"><CashFlowReport /></ModuleGuard>} />
                <Route path="/tax-return" element={<ModuleGuard module="accounting"><TaxReturnReport /></ModuleGuard>} />
                <Route path="/performance-comparison" element={<ModuleGuard module="accounting"><PerformanceComparisonReport /></ModuleGuard>} /> 
                <Route path="/multi-currency-statement" element={<ModuleGuard module="accounting" requiredPermission="reports.multi_currency_statement"><MultiCurrencyStatement /></ModuleGuard>} /> 
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
                <Route path="/admin/audit-logs" element={<ModuleGuard module="admin"><AuditTrailViewer /></ModuleGuard>} />
                <Route path="/saas-admin" element={currentUser?.role === 'super_admin' ? <SaasAdmin /> : <Navigate to="/" replace />} />
                
                {/* 🧭 توجيهات توافقية سريعة ومسارات بديلة (Compatibility Route Redirects) */}
                <Route path="/sales-orders-list" element={<Navigate to="/sales-orders" replace />} />
                <Route path="/purchase-orders-list" element={<Navigate to="/purchase-order-list" replace />} />
                <Route path="/goods-receipt" element={<Navigate to="/inventory/goods-receipt" replace />} />
                <Route path="/stock-transfers-list" element={<Navigate to="/stock-transfer-list" replace />} />
                <Route path="/uom" element={<Navigate to="/units-of-measure" replace />} />
                <Route path="/hr/employees" element={<Navigate to="/employees" replace />} />
                <Route path="/hr/advances" element={<Navigate to="/employee-advances" replace />} />
                <Route path="/hr/disbursement" element={<Navigate to="/payroll-run" replace />} />
                <Route path="/hr/employee-statement" element={<Navigate to="/employee-statement" replace />} />
                <Route path="/treasury" element={<Navigate to="/cash-closing" replace />} />
                <Route path="/banking" element={<Navigate to="/bank-reconciliation" replace />} />
                <Route path="/internal-transfer" element={<Navigate to="/transfer" replace />} />
                <Route path="/fiscal-closing" element={<Navigate to="/fiscal-year-closing" replace />} />
                <Route path="/general-ledger" element={<Navigate to="/ledger" replace />} />
                <Route path="/sales-analysis" element={<Navigate to="/item-sales-analysis" replace />} />
                <Route path="/aging-report" element={<Navigate to="/customer-aging" replace />} />
                <Route path="/stock-movement-report" element={<Navigate to="/detailed-stock-movement" replace />} />
                <Route path="/cost-centers" element={<Navigate to="/accounts" replace />} />
                <Route path="/currency-revaluation" element={<Navigate to="/multi-currency-statement" replace />} />
                <Route path="/budgeting" element={<Navigate to="/budget-setup" replace />} />
                <Route path="/health-check" element={<Navigate to="/stress-test" replace />} />
                <Route path="/about" element={<Navigate to="/user-guide" replace />} />
                <Route path="/profile" element={<UserProfile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/pos" element={<ModuleGuard module="restaurant"><PosScreen /></ModuleGuard>} /> 
                <Route path="/retail/pos" element={<Navigate to="/retail-pos" replace />} />
                <Route path="/retail-pos" element={<ModuleGuard module="retail"><RetailPosScreen /></ModuleGuard>} /> 
                <Route path="/pos/shifts-history" element={<CashierShiftsHistory />} /> 
                <Route path="/reports/shifts" element={<CashierShiftsHistory />} /> 
                <Route path="/retail/price-checker" element={<ModuleGuard module="retail"><PriceCheckerKiosk /></ModuleGuard>} /> 
                <Route path="/retail/customer-display" element={<CustomerFacingScreen />} />
                <Route path="/retail/promotions" element={<ModuleGuard module="retail"><PromotionsManager /></ModuleGuard>} />
                <Route path="/inventory/pda-stocktaking" element={<ModuleGuard module="inventory"><MobilePdaStocktaking /></ModuleGuard>} />
                <Route path="/inventory/expiry-radar" element={<ModuleGuard module="inventory"><ExpiryClearanceRadar /></ModuleGuard>} /> 
                <Route path="/inventory/shelf-restock" element={<ModuleGuard module="inventory"><ShelfRestockReport /></ModuleGuard>} /> 
                <Route path="/kds" element={<ModuleGuard module="restaurant"><KdsScreen /></ModuleGuard>} /> 
                <Route path="/restaurant/expo" element={<ModuleGuard module="restaurant"><ExpoScreen /></ModuleGuard>} /> 
                <Route path="/restaurant/stations" element={<ModuleGuard module="restaurant"><KitchenStationManager /></ModuleGuard>} /> 
                <Route path="/restaurant/aggregators" element={<ModuleGuard module="restaurant"><DeliveryAggregatorManager /></ModuleGuard>} /> 
                <Route path="/restaurant/channel-pricing" element={<ModuleGuard module="restaurant"><MultiChannelPricingManager /></ModuleGuard>} /> 
                <Route path="/restaurant/driver-dispatch" element={<ModuleGuard module="restaurant"><DriverDispatchManager /></ModuleGuard>} /> 
                <Route path="/restaurant/tips-pool" element={<ModuleGuard module="restaurant"><TipsPoolManager /></ModuleGuard>} /> 
                <Route path="/restaurant/win-back" element={<ModuleGuard module="restaurant"><CustomerWinBackManager /></ModuleGuard>} /> 
                <Route path="/restaurant/auto-reorder" element={<ModuleGuard module="restaurant"><AutoReorderManager /></ModuleGuard>} /> 
                <Route path="/restaurant/happy-hours" element={<ModuleGuard module="restaurant"><HappyHourManager /></ModuleGuard>} /> 
                <Route path="/kitchen-end-day" element={<ModuleGuard module="restaurant"><KitchenEndDayCount /></ModuleGuard>} /> 
                <Route path="/restaurant/butchering-yield" element={<ModuleGuard module="restaurant"><ButcheringYieldManager /></ModuleGuard>} /> 
                <Route path="/restaurant/waiter" element={<ModuleGuard module="restaurant"><MobileWaiterScreen /></ModuleGuard>} /> 
                <Route path="/restaurant/printers" element={<ModuleGuard module="restaurant"><ThermalPrintersManager /></ModuleGuard>} /> 
                <Route path="/restaurant/loyalty" element={<ModuleGuard module="restaurant"><LoyaltyProgramManager /></ModuleGuard>} /> 
                <Route path="/restaurant/kiosk" element={<SelfOrderingKiosk />} /> 

                {/* 🔗 مسارات التوجيه السريع والتوافق */}
                {COMPATIBILITY_REDIRECTS.map(([from, to]) => (
                  <Route key={from} path={from} element={<Navigate to={to} replace />} />
                ))}
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            </ErrorBoundary>
          </div>
        </main>
        <MobileBottomNav onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)} />
        <PrintFooter />
            </div>
        </div>
    );
};

// 🛡️ مكون شاشة تسجيل الدخول المباشر
const LoginRoute = () => {
  const { currentUser, logout } = useAuth();
  if (currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/20">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-black text-white">أنت مسجل دخول بالفعل</h2>
            <p className="text-sm text-slate-400 mt-1">
              الحساب الحالي: <span className="font-bold text-blue-400">{(currentUser as any)?.full_name || (currentUser as any)?.name || currentUser?.username || 'المستخدم'}</span>
            </p>
          </div>
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              onClick={() => logout()}
              className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 text-sm"
            >
              تسجيل الخروج والدخول بحساب آخر
            </button>
            <button
              onClick={() => { window.location.hash = '#/'; }}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors text-sm"
            >
              الاستمرار بالحساب الحالي
            </button>
          </div>
        </div>
      </div>
    );
  }
  return <Login />;
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

  // 🛡️ صمام أمان عام: التقاط أي أخطاء غير معالجة أو وعود متوقفة في الواجهة وعرضها كإشعار فوري للمستخدم
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const message = String(reason?.message || reason || '');
      if (
        message.includes('ResizeObserver') ||
        message.includes('AbortError') ||
        message.includes('canceled')
      ) {
        return;
      }
      logger.error('Unhandled Promise Rejection:', reason);
      notifyUserError(reason, 'حدث خطأ غير متوقع أثناء معالجة العملية');
    };

    const handleWindowError = (event: ErrorEvent) => {
      if (event?.message?.includes('ResizeObserver')) return;
      logger.error('Uncaught Window Error:', event.error || event.message);
      notifyUserError(event.error || event.message, 'حدث خطأ غير متوقع في واجهة النظام');
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleWindowError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleWindowError);
    };
  }, []);

  // Check for maintenance mode
  const isMaintenanceMode = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

  if (isMaintenanceMode) {
    return <Maintenance />;
  }

  // Show loading screen only during initial boot until authentication is initialized
  if (!authInitialized) {
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
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/* The single source of truth for authentication is now `currentUser` from the context */}
      <Suspense fallback={<LazyLoadingFallback />}>
        <Routes>
          {/* 1. المسارات العامة (متاحة للجميع دون تسجيل دخول) */}
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/customer-display" element={<CustomerDisplay />} />
          <Route path="/menu/:qrKey" element={<GuestMenuLayout />} />
          <Route path="/menu" element={<GuestMenuLayout />} />
          <Route path="/kiosk" element={<Navigate to="/restaurant/kiosk" replace />} />
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
    <ConfigProvider
      direction="rtl"
      locale={arEG}
      theme={{
        token: {
          colorPrimary: '#2563eb',
          colorLink: '#2563eb',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          colorInfo: '#38bdf8',
          borderRadius: 10,
          fontFamily: "'Tajawal', sans-serif",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <HotToaster 
              position="top-center" 
              reverseOrder={false} 
              toastOptions={{ 
                duration: 4000, 
                style: { 
                  fontFamily: "'Tajawal', sans-serif", 
                  borderRadius: '12px', 
                  fontSize: '13px', 
                  fontWeight: 'bold',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
                } 
              }} 
            />
            <AccountingProvider>
              <AppContent />
            </AccountingProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>
  );
};

export default App;

```

### 📄 context/AccountingContext.tsx
```typescript
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { 
  Account, JournalEntry, JournalEntryLine, SystemSettings, UserRole, Organization, 
  HrScope, DashboardViewMode, Customer, Supplier, Warehouse, Category, Product, 
  Salesperson, Invoice, Employee, Cheque, Asset, Budget, CostCenter, PaymentVoucher, 
  PurchaseInvoice, RestaurantTable, MenuCategory, StockTransfer, User, ShiftReconciliationData 
} from '../types';
import { secureStorage } from '../utils/securityMiddleware';
import { logger } from '../utils/logger';
import { validateEntryBalance, deriveAccountMappings } from '../utils/financialSafety';

export interface UserProfile {
  id: string;
  full_name: string | null;
  role: UserRole;
  organization_id: string | null;
  is_active: boolean;
  avatar_url?: string;
  hr_scope?: HrScope;
  can_view_dashboard?: boolean;
  can_access_mobile?: boolean;
  dashboard_view_mode?: DashboardViewMode;
  allowed_treasury_ids?: string[];
}


import { offlineService, isValidUUID } from '../services/offlineService';
import { setActiveOrgId, getActiveOrgIdSync } from '../services/tenantContext';
import { closeFinancialYearEngine, reopenFinancialYearEngine } from '../services/financialYearService';
import { deleteOrganizationSafe } from '../services/organizationService';
import { fetchCompleteDataset } from '../services/balanceService';
import {
  SYSTEM_ACCOUNTS,
  DEFAULT_OFFLINE_ORG,
  DEFAULT_OFFLINE_TABLES,
  DEFAULT_OFFLINE_CATEGORIES,
  DEFAULT_OFFLINE_PRODUCTS,
  DEFAULT_OFFLINE_ACCOUNTS,
  DEFAULT_OFFLINE_WAREHOUSES,
  getOfflineTableOrders,
  setOfflineTableOrder
} from './accountingConstants';

type DynamicQuery = any;
type DynamicParam = any;

export {
  SYSTEM_ACCOUNTS,
  DEFAULT_OFFLINE_ORG,
  DEFAULT_OFFLINE_TABLES,
  DEFAULT_OFFLINE_CATEGORIES,
  DEFAULT_OFFLINE_PRODUCTS,
  DEFAULT_OFFLINE_ACCOUNTS,
  DEFAULT_OFFLINE_WAREHOUSES,
  getOfflineTableOrders,
  setOfflineTableOrder
};

interface AccountingContextType {
  organization: any;
  currentUser: UserProfile | null;
  organizations: any[];
  currentSelectedOrgId: string | null;
  setCurrentSelectedOrgId: (id: string | null) => void;
  effectiveOrgId: string;
  getEffectiveOrgId: () => string;
  isLoading: boolean;
  settings: any;
  accounts: Account[];
  entries: JournalEntry[];
  assets: any[];
  budgets: any[];
  vouchers: any[];
  costCenters: any[];
  employees: any[];
  products: Product[];
  transfers: any[];
  purchaseInvoices: any[];
  lastUpdated: Date | null;
  invoices: any[];
  salespeople: Salesperson[];
  categories: Category[];
  users: any[];
  warehouses: Warehouse[];
  restaurantTables: any[];
  menuCategories: any[];
  customers: Customer[];
  suppliers: Supplier[];
  cheques: any[];
  currentShift: any;
  activityLog: any[];
  logActivity?: (action: string, details: string) => void;
  refreshData: () => Promise<void>;
  refreshCustomers?: () => Promise<void>;
  refreshSuppliers?: () => Promise<void>;
  refreshSalesAndPurchases?: () => Promise<void>;
  refreshBanking?: () => Promise<void>;
  refreshBankingAndShift?: () => Promise<void>;
  refreshAccountsAndLedger?: () => Promise<void>;
  refreshLedger?: () => Promise<void>;
  refreshSettings?: () => Promise<void>;
  refreshEmployees?: () => Promise<void>;
  updateSettings?: (newSettings: Record<string, unknown>) => Promise<void>;
  fetchEntriesPaged: (page: number, pageSize: number) => Promise<{ data: any[], count: number }>;

  isDemo: boolean;
  clearCache: () => void;
  getFinancialSummary: () => Promise<any>;
  // --- دالة الصلاحيات ---
  can: (module: string, action: string) => boolean;
  // --- الدوال المحاسبية ---
  addEntry: (entry: DynamicParam) => Promise<void>;
  getSystemAccount: (key: string) => any;
  updateVoucher: (id: string, updates: DynamicParam) => Promise<boolean>;
  getAccountBalanceInPeriod: (id: string, start: string, end: string) => Promise<number>;
  addAccount: (acc: Partial<Account>) => Promise<any>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string, reason?: string) => Promise<{ success: boolean; message?: string }>;
  clearTransactions: () => Promise<void>;
  emptyRecycleBin: (table: string) => Promise<void>;
  saveBudget: (budget: DynamicParam) => Promise<void>;
  // --- دوال المخزون ---
  recalculateStock: (productId?: string) => Promise<void>;
  addProduct: (product: Partial<Product>) => Promise<any>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string, reason?: string) => Promise<void>;
  addStockTransfer: (transfer: DynamicParam) => Promise<void>;
  approveStockTransfer: (id: string) => Promise<void>;
  cancelStockTransfer: (id: string) => Promise<void>;
  addWarehouse: (warehouse: Partial<Warehouse>) => Promise<void>;
  updateWarehouse: (id: string, updates: Partial<Warehouse>) => Promise<void>;
  deleteWarehouse: (id: string) => Promise<void>;
  addWastage: (wastage: DynamicParam) => Promise<boolean>;
  produceItem: (id: string, qty: number, whId: string, date: string, cost: number, ref: string) => Promise<any>;
  // --- دوال المبيعات والمشتريات ---
  addCustomer: (customer: Partial<Customer>) => Promise<any>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string, reason?: string) => Promise<void>;
  addSupplier: (supplier: Partial<Supplier>) => Promise<any>;
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string, reason?: string) => Promise<void>;
  approveInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<boolean>;
  unpostSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deleteSalesInvoice: (id: string, orgId?: string) => Promise<boolean>;
  approvePurchaseInvoice: (id: string, orgId?: string, warehouseId?: string) => Promise<void>;
  unpostPurchaseInvoice: (id: string, orgId?: string) => Promise<boolean>;
  deletePurchaseInvoice: (id: string, orgId?: string) => Promise<boolean>;
  convertPoToInvoice: (poId: string, warehouseId?: string, orgId?: string) => Promise<void>;
  addOpeningBalanceTransaction: (id: string, type: string, amount: number, date: string, name: string) => Promise<void>;
  addPaymentVoucher: (voucher: DynamicParam) => Promise<void>;
  // --- دوال الأصول والشيكات ---
  addAsset: (asset: Partial<Asset>) => Promise<void>;
  updateAsset: (id: string, updates: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  runDepreciation: (id?: string, amount?: number, date?: string) => Promise<void>;
  revaluateAsset: (id: string, val: number, date: string, accId: string) => Promise<void>;
  addCheque: (cheque: Partial<Cheque>) => Promise<void>;
  updateCheque: (id: string, cheque: Partial<Cheque>) => Promise<void>;
  deleteCheque: (id: string) => Promise<void>;
  updateChequeStatus: (id: string, status: string, date: string, bankId?: string) => Promise<void>;
  addTransfer: (transfer: DynamicParam) => Promise<void>;
  updateTransfer: (id: string, transfer: DynamicParam) => Promise<void>;
  deleteTransfer: (id: string) => Promise<void>;
  restoreItem: (table: string, id: string) => Promise<{ success: boolean; message?: string }>;
  permanentDeleteItem: (table: string, id: string) => Promise<{ success: boolean; message?: string }>;
  exportJournalToCSV: () => void;
  // --- دوال الموارد البشرية ---
  addEmployee: (employee: Partial<Employee>) => Promise<void>;
  updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  deleteEmployee: (id: string, reason?: string) => Promise<void>;
  runPayroll: (month: number, year: number, date: string, treasuryId: string, data: any[], orgId?: string) => Promise<void>;
  runPayrollAccrual: (month: number, year: number, date: string, data: any[], orgId?: string) => Promise<any>;
  payAccruedPayroll: (params: { payrollId?: string; month?: number; year?: number; paymentDate: string; treasuryId: string; orgId?: string }) => Promise<any>;
  cancelPayrollAccrual: (payrollId: string, orgId?: string) => Promise<void>;
  // --- دوال المطاعم ---
  finalizeProductionOrder: (id: string, status: string, notes: string) => Promise<any>;
  openTableSession: (tableId: string) => Promise<string | null>;
  reserveTable: (tableId: string, name: string, time: string) => Promise<boolean>;
  cancelReservation: (tableId: string) => Promise<void>;
  transferTableSession: (sessionId: string, targetTableId: string) => Promise<boolean>;
  mergeTableSessions: (sourceId: string, targetId: string) => Promise<boolean>;
  createRestaurantOrder: (payload: DynamicParam) => Promise<string>;
  getOpenTableOrder: (tableId: string) => Promise<any>;
  completeRestaurantOrder: (orderId: string, method: string, total: number, accountId: string | null, warehouseId?: string) => Promise<void>;
  processSplitPayment: (orderId: string, items: any[], method: string, total: number, accountId: string) => Promise<boolean>;
  addRestaurantTable: (data: DynamicParam) => Promise<void>;
  updateRestaurantTable: (id: string, data: DynamicParam) => Promise<void>;
  deleteRestaurantTable: (id: string) => Promise<void>;
  updateKitchenOrderStatus: (id: string, status: string) => Promise<void>;
  startShift: (amount: number) => Promise<void>;
  closeCurrentShift: (actualCash: number, notes: string, reconciliation?: ShiftReconciliationData | null) => Promise<void>;
  getCurrentShiftSummary: () => Promise<any>;
  createMissingSystemAccounts: () => Promise<any>;
  recalculateAllBalances: () => Promise<void>;
  purgeDeletedRecords: () => Promise<void>;
  refreshSaasSchema: () => Promise<void>;
  closeFinancialYear: (year: number, date: string) => Promise<boolean>;
  reopenFinancialYear: (year: number) => Promise<boolean>;
  exportData: () => Promise<void>;
  // --- دوال الديمو ---
  addDemoEntry: (entry: Partial<JournalEntry>) => void;
  addDemoPaymentVoucher: (voucher: DynamicParam) => void;
  addDemoReceiptVoucher: (voucher: DynamicParam) => void;
  addDemoInvoice: (invoice: Partial<Invoice>) => void;
  postDemoSalesInvoice: (invoice: Partial<Invoice>) => void;
  addDemoPurchaseInvoice: (invoice: Partial<Invoice>) => void;
  deleteOrganization: (orgId: string) => Promise<{ success: boolean; message?: string }>;
  selectedFiscalYear: number;
  setSelectedFiscalYear: (year: number) => void;
  fiscalYearRange: { startDate: string; endDate: string };
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

export const useAccounting = () => {
  const context = useContext(AccountingContext);
  if (!context) throw new Error('useAccounting must be used within an AccountingProvider');
  return context;
};

// --- Modular Domain Hooks (Facade Pattern) ---
export { useProductDomain, ProductProvider } from './domains/ProductContext';
export { useCustomerDomain, CustomerProvider } from './domains/CustomerContext';
export { useSupplierDomain, SupplierProvider } from './domains/SupplierContext';
export { useSettingsDomain, SettingsProvider } from './domains/AccountingSettingsContext';
export { useSalesDomain, SalesProvider } from './domains/SalesContext';
export { useBankingDomain, BankingProvider } from './domains/BankingContext';
export { useGeneralLedgerDomain, GeneralLedgerProvider } from './domains/GeneralLedgerContext';
export { useHrDomain, HrProvider } from './domains/HrContext';
export { useRestaurantDomain, RestaurantProvider } from './domains/RestaurantContext';
export { fetchAllTableRecords } from './domains/domainUtils';

import { useSettingsDomain, SettingsProvider } from './domains/AccountingSettingsContext';
import { useCustomerDomain, CustomerProvider } from './domains/CustomerContext';
import { useSupplierDomain, SupplierProvider } from './domains/SupplierContext';
import { useProductDomain, ProductProvider } from './domains/ProductContext';
import { useSalesDomain, SalesProvider } from './domains/SalesContext';
import { useBankingDomain, BankingProvider } from './domains/BankingContext';
import { useGeneralLedgerDomain, GeneralLedgerProvider } from './domains/GeneralLedgerContext';
import { useHrDomain, HrProvider } from './domains/HrContext';
import { useRestaurantDomain, RestaurantProvider } from './domains/RestaurantContext';
import { fetchAllTableRecords } from './domains/domainUtils';

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser: authUser, can } = useAuth();
  const { showToast } = useToast();
  const [organization, setOrganization] = useState<any>(null);
  const [currentSelectedOrgId, setCurrentSelectedOrgIdState] = useState<string | null>(() => {
    return getActiveOrgIdSync() || secureStorage.getItem<string>('tripro_active_org_id') || null;
  });

  const setCurrentSelectedOrgId = useCallback((id: string | null) => {
    setCurrentSelectedOrgIdState(id);
    if (id) {
      secureStorage.setItem('tripro_active_org_id', id);
      if (id !== 'org-default-offline' && isValidUUID(id)) {
        setActiveOrgId(id);
      }
    } else {
      setActiveOrgId(null);
    }
  }, []);

  useEffect(() => {
    const handleOrgChange = (e: DynamicParam) => {
      const newOrgId = e.detail?.orgId || null;
      setCurrentSelectedOrgIdState(prev => (prev !== newOrgId ? newOrgId : prev));
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('tripro:organization_changed', handleOrgChange);
      return () => window.removeEventListener('tripro:organization_changed', handleOrgChange);
    }
  }, []);

  const [organizations, setOrganizations] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const cachedLastOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || null;
    if (authUser) {
      return {
        id: authUser.id,
        full_name: authUser.name || 'مستخدم النظام',
        role: authUser.role as UserRole,
        organization_id: (authUser as any).organization_id || cachedLastOrg || 'org-default-offline',
        is_active: true,
        hr_scope: authUser.hr_scope,
        can_view_dashboard: authUser.can_view_dashboard,
        can_access_mobile: authUser.can_access_mobile,
        dashboard_view_mode: authUser.dashboard_view_mode,
        allowed_treasury_ids: authUser.allowed_treasury_ids,
      };
    }
    return null;
  });

  useEffect(() => {
    const cachedLastOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || null;
    if (authUser) {
      setCurrentUser(prev => ({
        id: authUser.id,
        full_name: authUser.name || prev?.full_name || 'مستخدم النظام',
        role: (authUser.role || prev?.role || 'viewer') as UserRole,
        organization_id: (authUser as any).organization_id || prev?.organization_id || cachedLastOrg || 'org-default-offline',
        is_active: prev?.is_active ?? true,
        hr_scope: authUser.hr_scope || prev?.hr_scope,
        can_view_dashboard: authUser.can_view_dashboard ?? prev?.can_view_dashboard,
        can_access_mobile: authUser.can_access_mobile ?? prev?.can_access_mobile,
        dashboard_view_mode: authUser.dashboard_view_mode || prev?.dashboard_view_mode || 'both',
        allowed_treasury_ids: authUser.allowed_treasury_ids || prev?.allowed_treasury_ids,
        avatar_url: prev?.avatar_url
      }));
    }
  }, [authUser]);

  const getEffectiveOrgId = useCallback(() => {
    const tenantActive = getActiveOrgIdSync(currentSelectedOrgId);
    if (tenantActive) return tenantActive;
    if (currentSelectedOrgId && currentSelectedOrgId !== 'org-default-offline') return currentSelectedOrgId;
    if (currentUser?.organization_id && currentUser.organization_id !== 'org-default-offline') return currentUser.organization_id;
    const cachedValidOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || 
      (typeof window !== 'undefined' ? window.localStorage?.getItem('tripro_last_valid_org_id') : null);
    if (cachedValidOrg && cachedValidOrg !== 'org-default-offline') return cachedValidOrg;
    return 'org-default-offline';
  }, [currentSelectedOrgId, currentUser?.organization_id]);

  const effectiveOrgId = useMemo(() => getEffectiveOrgId(), [getEffectiveOrgId]);

  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [selectedFiscalYear, setSelectedFiscalYearState] = useState<number>(() => {
    const saved = secureStorage.getItem<string | number>('tripro_selected_fiscal_year');
    if (saved) {
      const parsed = typeof saved === 'number' ? saved : parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 2000 && parsed <= 2099) return parsed;
    }
    return new Date().getFullYear();
  });

  const setSelectedFiscalYear = (year: number) => {
    setSelectedFiscalYearState(year);
    secureStorage.setItem('tripro_selected_fiscal_year', year);
  };

  const fiscalYearRange = useMemo(() => ({
    startDate: `${selectedFiscalYear}-01-01`,
    endDate: `${selectedFiscalYear}-12-31`
  }), [selectedFiscalYear]);

  // 🛡️ عزل تام لبيانات المنظمات: تنظيف المفاتيح القديمة غير المعزولة لمنع تسريب العروض والكوبونات بين الشركات
  useEffect(() => {
    secureStorage.removeItem('tripro_promos_active');
    secureStorage.removeItem('tripro_retail_coupons');
  }, [currentSelectedOrgId]);
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
  const refreshDataPromiseRef = useRef<Promise<void> | null>(null);

  const logActivity = useCallback((action: string, details: string) => {
    const newLog = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      user: currentUser?.full_name || (currentUser as any)?.username || 'مستخدم النظام',
      action,
      details,
      date: new Date().toISOString()
    };
    setActivityLog(prev => [newLog, ...prev.slice(0, 49)]);
  }, [currentUser]);

  const isDemo = authUser?.username === 'demo@demo.com' || authUser?.role === 'demo';

  // دالة مساعدة لتحميل بيانات الأوفلاين والديمو بسلاسة فائقة
  const loadOfflineFallbackData = useCallback(async () => {
    const cachedValidOrg = secureStorage.getItem<string>('tripro_last_valid_org_id') || 
      (typeof window !== 'undefined' ? window.localStorage?.getItem('tripro_last_valid_org_id') : null) ||
      ((currentSelectedOrgId && currentSelectedOrgId !== 'org-default-offline') ? currentSelectedOrgId : null);
    
    const effectiveOfflineOrgId = cachedValidOrg || DEFAULT_OFFLINE_ORG.id;
    const effectiveOrgObj = cachedValidOrg ? { ...DEFAULT_OFFLINE_ORG, id: cachedValidOrg } : DEFAULT_OFFLINE_ORG;

    const fallbackProfile: UserProfile = {
      id: authUser?.id || 'demo-user-id',
      full_name: authUser?.name || 'مستخدم تجريبي (TriPro Offline)',
      role: (authUser?.role as UserRole) || 'demo',
      organization_id: effectiveOfflineOrgId,
      is_active: true,
      hr_scope: authUser?.hr_scope,
      can_view_dashboard: authUser?.can_view_dashboard,
      can_access_mobile: authUser?.can_access_mobile,
      dashboard_view_mode: authUser?.dashboard_view_mode || 'both',
      allowed_treasury_ids: authUser?.allowed_treasury_ids
    };
    setCurrentUser(fallbackProfile);
    setOrganization(effectiveOrgObj);
    setOrganizations([effectiveOrgObj]);
    setCurrentSelectedOrgId(effectiveOfflineOrgId);
    setAccounts(DEFAULT_OFFLINE_ACCOUNTS.map((a: Record<string, any>) => ({ ...a, isGroup: Boolean(a.is_group ?? a.isGroup) })));
    setProducts(DEFAULT_OFFLINE_PRODUCTS);
    setRestaurantTables(DEFAULT_OFFLINE_TABLES);
    setMenuCategories(DEFAULT_OFFLINE_CATEGORIES);
    setCategories(DEFAULT_OFFLINE_CATEGORIES);
    setWarehouses(DEFAULT_OFFLINE_WAREHOUSES);
    setCustomers([{ id: 'cust-walkin', name: 'عميل نقدي صالة', phone: '0000000000' }]);
    setSuppliers([{ id: 'sup-main', name: 'مورد عام معتمد', phone: '01000000000' }]);

    // استرجاع الوردية المفتوحة محلياً أو إنشاء وردية جاهزة للعمل
    let localShift: Record<string, any> | null = null;
    try {
      localShift = secureStorage.getItem<any>('tripro_offline_current_shift');
    } catch (e) {}

    if (!localShift) {
      localShift = {
        id: 'shift-offline-' + (authUser?.id || 'demo'),
        shift_number: 'SHIFT-001',
        user_id: authUser?.id || 'demo-user',
        cashier_id: authUser?.id || 'demo-user',
        opening_balance: 500,
        status: 'OPEN',
        start_time: new Date().toISOString()
      };
      try {
        secureStorage.setItem('tripro_offline_current_shift', localShift);
      } catch (e) {}
    }
    setCurrentShift(localShift);

    // زراعة المنتجات في قاعدة IndexedDB المحلية ليعمل كود الباركود والبحث الفوري بالتجزئة
    await offlineService.seedFallbackProducts(DEFAULT_OFFLINE_PRODUCTS);
    setLastUpdated(new Date());
    setIsLoading(false);
  }, [authUser]);

  const refreshData = useCallback(async () => {
    if (refreshDataPromiseRef.current) {
      return refreshDataPromiseRef.current;
    }
    const currentPromise = (async () => {
      if (!authUser) return;
      setIsLoading(true);

    // 📴 إذا كان التطبيق مفصولاً عن الإنترنت أو في وضع الديمو، ننتقل فوراً للبيانات المحلية بدون أي تأخير أو أخطاء
    if (!navigator.onLine || isDemo) {
      await loadOfflineFallbackData();
      return;
    }

    try {
      // جلب بيانات المنظمة والبروفايل
      let profile: DynamicParam = null;
      try {
        const { data: pData, error: profileError } = await supabase.from('profiles').select('*, organizations(*)').eq('id', authUser.id).single();
        if (!profileError && pData) {
          profile = pData;
          setCurrentUser({
            ...pData,
            dashboard_view_mode: pData.dashboard_view_mode || authUser?.dashboard_view_mode || 'both',
            can_view_dashboard: pData.can_view_dashboard ?? authUser?.can_view_dashboard ?? true
          } as UserProfile);
        }
      } catch (pErr) {
        logger.warn('Could not fetch online profile, using fallback:', pErr);
      }

      if (!profile) {
        await loadOfflineFallbackData();
        return;
      }

      // 🛡️ صمام أمان: جلب كافة الشركات لملء القائمة وضمان وجود منظمة نشطة حتمياً
      let allOrgs: Organization[] = [];
      try {
        const { data: orgsData } = await supabase.from('organizations').select('*').order('name');
        if (orgsData && orgsData.length > 0) {
          allOrgs = orgsData;
        }
      } catch (orgErr) {
        logger.warn('Could not fetch organizations from Supabase, using fallback:', orgErr);
      }

      const validOrgs = allOrgs.length > 0 ? allOrgs : [DEFAULT_OFFLINE_ORG];
      setOrganizations(validOrgs);

      // تحديد معرف المنظمة النشطة مع اختيار تلقائي حتمي يمنع التوقف تماماً
      let fetchOrgId = currentSelectedOrgId || profile.organization_id;
      if (!fetchOrgId || !validOrgs.some(o => o.id === fetchOrgId)) {
        fetchOrgId = validOrgs[0].id;
        setCurrentSelectedOrgId(fetchOrgId);
      }

      // تحديث كائن المنظمة ليتوافق مع المنظمة النشطة
      const activeOrgObj = validOrgs.find(o => o.id === fetchOrgId) || profile.organizations || DEFAULT_OFFLINE_ORG;
      setOrganization(activeOrgObj);

      // تأكيد تعيين المنظمة في بيانات المستخدم لمنع أخطاء التريجرز والـ RLS
      setCurrentUser(prev => prev ? { 
        ...prev, 
        organization_id: fetchOrgId,
        dashboard_view_mode: prev.dashboard_view_mode || authUser?.dashboard_view_mode || 'both',
        can_view_dashboard: prev.can_view_dashboard ?? authUser?.can_view_dashboard ?? true
      } : {
        id: authUser.id,
        full_name: authUser.name || 'مستخدم النظام',
        role: authUser.role as UserRole,
        organization_id: fetchOrgId,
        is_active: true,
        hr_scope: authUser.hr_scope,
        can_view_dashboard: authUser.can_view_dashboard ?? true,
        can_access_mobile: authUser.can_access_mobile,
        dashboard_view_mode: authUser.dashboard_view_mode || 'both',
        allowed_treasury_ids: authUser.allowed_treasury_ids
      });

      // جلب الإعدادات وتوحيد الحقول
      const { data: sett } = await supabase.rpc('get_current_company_settings', { p_org_id: fetchOrgId }).maybeSingle();
      
      const normalizeSettings = (raw: Record<string, any>) => {
        if (!raw || typeof raw !== 'object') return {};
        
        let vatRateNum = 14;
        if (raw.vatRate !== undefined && raw.vatRate !== null) {
          vatRateNum = Number(raw.vatRate);
        } else if (raw.vat_rate !== undefined && raw.vat_rate !== null) {
          vatRateNum = Number(raw.vat_rate);
        }
        
        const vatRatePercentage = vatRateNum <= 1 ? vatRateNum * 100 : vatRateNum;
        const vatRateDecimal = vatRatePercentage / 100;

        const isTaxEnabled = raw.enableTax !== undefined 
          ? Boolean(raw.enableTax) 
          : (raw.enable_tax !== undefined ? Boolean(raw.enable_tax) : true);

        const isServiceChargeEnabled = raw.enableServiceCharge !== undefined 
          ? Boolean(raw.enableServiceCharge) 
          : (raw.enable_service_charge !== undefined 
              ? Boolean(raw.enable_service_charge) 
              : (raw.account_mappings?.enable_service_charge !== undefined 
                  ? Boolean(raw.account_mappings.enable_service_charge) 
                  : false));

        let serviceRateNum = 12;
        if (raw.serviceChargeRate !== undefined && raw.serviceChargeRate !== null) {
          serviceRateNum = Number(raw.serviceChargeRate);
        } else if (raw.service_charge_rate !== undefined && raw.service_charge_rate !== null) {
          serviceRateNum = Number(raw.service_charge_rate);
        } else if (raw.account_mappings?.service_charge_rate !== undefined && raw.account_mappings?.service_charge_rate !== null) {
          serviceRateNum = Number(raw.account_mappings.service_charge_rate);
        }
        const serviceChargeRatePercentage = serviceRateNum <= 1 && serviceRateNum > 0 ? serviceRateNum * 100 : serviceRateNum;
        const serviceChargeRateDecimal = serviceChargeRatePercentage / 100;

        // الحفاظ على خيار البيع بالسالب للمنظمات المصرح لها (بما فيها شركة لينزا كحالة افتراضية موثقة)
        const isLenzaOrg = Boolean(
          (activeOrgObj?.name && /لينزا|lenza/i.test(activeOrgObj.name)) ||
          (activeOrgObj?.commercial_name && /لينزا|lenza/i.test(activeOrgObj.commercial_name)) ||
          (raw?.companyName && /لينزا|lenza/i.test(raw.companyName)) ||
          (raw?.company_name && /لينزا|lenza/i.test(raw.company_name))
        );

        const allowNegativeStock = raw.allowNegativeStock !== undefined 
          ? Boolean(raw.allowNegativeStock) 
          : (raw.allow_negative_stock !== undefined ? Boolean(raw.allow_negative_stock) : isLenzaOrg);

        const lockManualPrices = raw.lockManualPrices !== undefined
          ? Boolean(raw.lockManualPrices)
          : (raw.lock_manual_prices !== undefined ? Boolean(raw.lock_manual_prices) : false);

        const maxCashDeficitLimit = raw.maxCashDeficitLimit !== undefined && raw.maxCashDeficitLimit !== null
          ? Number(raw.maxCashDeficitLimit)
          : (raw.max_cash_deficit_limit !== undefined && raw.max_cash_deficit_limit !== null ? Number(raw.max_cash_deficit_limit) : 50);

        const decimalPlaces = raw.decimalPlaces !== undefined && raw.decimalPlaces !== null
          ? Number(raw.decimalPlaces)
          : (raw.decimal_places !== undefined && raw.decimal_places !== null ? Number(raw.decimal_places) : 2);

        const currency = raw.currency || 'EGP';

        return {
          ...raw,
          currency,
          enableTax: isTaxEnabled,
          enable_tax: isTaxEnabled,
          vatRate: vatRatePercentage,
          vat_rate: vatRateDecimal,
          enableServiceCharge: isServiceChargeEnabled,
          enable_service_charge: isServiceChargeEnabled,
          serviceChargeRate: serviceChargeRatePercentage,
          service_charge_rate: serviceChargeRateDecimal,
          allowNegativeStock,
          allow_negative_stock: allowNegativeStock,
          lockManualPrices,
          lock_manual_prices: lockManualPrices,
          maxCashDeficitLimit,
          max_cash_deficit_limit: maxCashDeficitLimit,
          decimalPlaces,
          decimal_places: decimalPlaces,
          defaultWarehouseId: raw.defaultWarehouseId || raw.default_warehouse_id || '',
          default_warehouse_id: raw.default_warehouse_id || raw.defaultWarehouseId || '',
          defaultTreasuryId: raw.defaultTreasuryId || raw.default_treasury_id || '',
          default_treasury_id: raw.default_treasury_id || raw.defaultTreasuryId || '',
          productionWarehouseId: raw.productionWarehouseId || raw.production_warehouse_id || '',
          production_warehouse_id: raw.production_warehouse_id || raw.productionWarehouseId || '',
          rawMaterialsWarehouseId: raw.rawMaterialsWarehouseId || raw.raw_material_warehouse_id || '',
          raw_material_warehouse_id: raw.raw_material_warehouse_id || raw.rawMaterialsWarehouseId || '',
          accountMappings: raw.accountMappings || raw.account_mappings || {},
          lastClosedYear: raw.lastClosedYear !== undefined && raw.lastClosedYear !== null ? Number(raw.lastClosedYear) : (raw.last_closed_year !== undefined && raw.last_closed_year !== null ? Number(raw.last_closed_year) : null),
          last_closed_year: raw.last_closed_year !== undefined && raw.last_closed_year !== null ? Number(raw.last_closed_year) : (raw.lastClosedYear !== undefined && raw.lastClosedYear !== null ? Number(raw.lastClosedYear) : null),
          lastClosedDate: raw.lastClosedDate || raw.last_closed_date || null,
          last_closed_date: raw.last_closed_date || raw.lastClosedDate || null
        };
      };

      setSettings(normalizeSettings(sett || {}));

      // 🛡️ مزامنة قاعدة البيانات لشركة لينزا: ضمان تفعيل allow_negative_stock لمرة واحدة فقط إذا لم تكن مفعلة مسبقاً
      const isLenzaActive = Boolean(
        (activeOrgObj?.name && /لينزا|lenza/i.test(activeOrgObj.name)) ||
        (activeOrgObj?.commercial_name && /لينزا|lenza/i.test(activeOrgObj.commercial_name))
      );
      if (isLenzaActive && fetchOrgId && fetchOrgId !== 'org-default-offline' && !(sett as any)?.allow_negative_stock) {
        supabase
          .from('company_settings')
          .update({ allow_negative_stock: true })
          .eq('organization_id', fetchOrgId)
          .then(({ error }) => {
            if (error) logger.warn('[AccountingContext] Auto-sync allow_negative_stock for Lenza error:', error);
          });
      }

      // جلب الحسابات والمستودعات مع ترشيد الاستعلامات المالية بالسنة المالية النشطة
      const [accs, ents, ccs, emps, prods, trns, pinvs, invs, cats, usrs, whs, rTables, custs, sups, chqs, shift, assetData, budgetData] = await Promise.all([
        supabase.from('accounts').select('*').eq('organization_id', fetchOrgId).order('code'),
        fetchCompleteDataset<JournalEntry>(async (from, to) =>
          supabase.from('journal_entries')
            .select('*, journal_lines(*)')
            .eq('organization_id', fetchOrgId)
            .gte('transaction_date', fiscalYearRange.startDate)
            .lte('transaction_date', fiscalYearRange.endDate)
            .order('transaction_date', { ascending: false })
            .range(from, to)
        ).then(data => ({ data, error: null })),
        supabase.from('cost_centers').select('*').eq('organization_id', fetchOrgId).order('name'),
        supabase.from('employees').select('*').eq('organization_id', fetchOrgId).order('full_name'),
        Promise.resolve({ data: [] as Product[], error: null }), // مُعالج بالكامل في سياق النطاق ProductProvider
        Promise.resolve({ data: [] as StockTransfer[], error: null }), // مُعالج بالكامل في سياق النطاق ProductProvider
        Promise.resolve({ data: [] as PurchaseInvoice[], error: null }), // مُعالج بالكامل في سياق النطاق SupplierProvider
        Promise.resolve({ data: [] as Invoice[], error: null }), // مُعالج بالكامل في سياق النطاق SalesProvider
        Promise.resolve({ data: [] as Category[], error: null }), // مُعالج بالكامل في سياق النطاق ProductProvider
        supabase.from('profiles').select('*').eq('organization_id', fetchOrgId).order('full_name'),
        Promise.resolve({ data: [] as Warehouse[], error: null }), // مُعالج بالكامل في سياق النطاق ProductProvider
        supabase.from('restaurant_tables').select('*').eq('organization_id', fetchOrgId).order('name'),
        Promise.resolve({ data: [] as Customer[], error: null }), // مُعالج بالكامل في سياق النطاق CustomerProvider
        Promise.resolve({ data: [] as Supplier[], error: null }), // مُعالج بالكامل في سياق النطاق SupplierProvider
        Promise.resolve({ data: [] as Cheque[], error: null }), // مُعالج بالكامل في سياق النطاق BankingProvider
        supabase.rpc('get_active_shift', { p_org_id: fetchOrgId }),
        fetchCompleteDataset<Asset>(async (from, to) =>
          supabase.from('assets').select('*').eq('organization_id', fetchOrgId).is('deleted_at', null).range(from, to)
        ).then(data => ({ data: data || [], error: null })),
        fetchCompleteDataset<Budget>(async (from, to) =>
          supabase.from('budgets').select('*').eq('organization_id', fetchOrgId).range(from, to)
        ).then(data => ({ data: data || [], error: null }))
      ]);

      const loadedAccounts = (accs.data && accs.data.length > 0) ? accs.data.map((acc: Record<string, any>) => ({
        ...acc,
        isGroup: Boolean(acc.is_group ?? acc.isGroup),
        type: acc.type ? acc.type.toUpperCase() : acc.type
      })) : DEFAULT_OFFLINE_ACCOUNTS.map((acc: Record<string, any>) => ({
        ...acc,
        isGroup: Boolean(acc.is_group ?? acc.isGroup)
      }));

      setAccounts(loadedAccounts);

      // 🛡️ فحص وتهيئة ربط الحسابات الافتراضية تلقائياً (Default Account Mappings Auto-Derivation & Verification)
      const currentRawMappings = { ...((sett as any)?.account_mappings || (sett as any)?.accountMappings || {}) };
      const { mappings: autoDerivedMappings, hasNewMappings } = deriveAccountMappings(loadedAccounts as any, currentRawMappings);
      if (hasNewMappings) {
        setSettings(prev => ({
          ...prev,
          account_mappings: autoDerivedMappings,
          accountMappings: autoDerivedMappings
        }));

        if (fetchOrgId && fetchOrgId !== 'org-default-offline') {
          supabase
            .from('company_settings')
            .update({ account_mappings: autoDerivedMappings })
            .eq('organization_id', fetchOrgId)
            .then(({ error: mapErr }) => {
              if (mapErr) logger.warn('[AccountingContext] Auto-persist account_mappings notice:', mapErr);
            });
        }
      }

      setEntries(ents.data || []);
      setAssets(assetData?.data || []);
      setBudgets(budgetData?.data || []);

      const { data: vchrs } = await supabase
        .from('payment_vouchers')
        .select('*')
        .eq('organization_id', fetchOrgId)
        .is('deleted_at', null)
        .order('payment_date', { ascending: false })
        .limit(200);
      interface RawVoucherRow {
        payment_date?: string | null;
        date?: string | null;
        created_at?: string | null;
        notes?: string | null;
        description?: string | null;
        supplier_id?: string | null;
        party_id?: string | null;
        [key: string]: unknown;
      }
      const mappedVchrs = (vchrs || []).map((row: RawVoucherRow) => ({
        ...row,
        date: (row.payment_date || row.date || (row.created_at ? row.created_at.split('T')[0] : '')) as string,
        payment_date: (row.payment_date || row.date || (row.created_at ? row.created_at.split('T')[0] : '')) as string,
        description: (row.notes || row.description || '') as string,
        notes: (row.notes || row.description || '') as string,
        type: 'payment',
        subType: row.supplier_id ? 'supplier' : 'account',
        party_id: (row.supplier_id || row.party_id) as string,
      }));
      setVouchers(mappedVchrs);
      setCostCenters(ccs.data || []);

      // 🛡️ عزل نطاق الإشراف للموارد البشرية والرواتب (HR Supervisory Scope)
      const rawEmployees = emps.data || [];
      const userHrScope = (profile as any)?.hr_scope || (authUser as any)?.hr_scope || (authUser as any)?.user_metadata?.hr_scope || 'all';

      const isFactoryDept = (dept: unknown) => {
        const d = String(dept || '').trim().toLowerCase();
        return d === 'المصنع' || d === 'مصنع' || d === 'factory';
      };

      let scopedEmployees = rawEmployees;
      if (userHrScope === 'factory') {
        scopedEmployees = rawEmployees.filter((e: Record<string, any>) => isFactoryDept(e.department));
      } else if (userHrScope === 'branches') {
        scopedEmployees = rawEmployees.filter((e: Record<string, any>) => !isFactoryDept(e.department));
      }

      setEmployees(scopedEmployees);
      const mappedSalespeople: Salesperson[] = scopedEmployees.map((e: { id: string; name?: string; full_name?: string }) => ({
        id: e.id,
        name: e.name || e.full_name || 'مندوب'
      }));
      setSalespeople(mappedSalespeople);

      const loadedProducts = (prods.data && prods.data.length > 0) ? prods.data : (currentUser?.role === 'demo' ? DEFAULT_OFFLINE_PRODUCTS : []);
      setProducts(loadedProducts);
      setTransfers(trns.data || []);
      setPurchaseInvoices(pinvs.data || []);
      setInvoices(invs.data || []);

      const loadedCategories = (cats.data && cats.data.length > 0) ? cats.data : (currentUser?.role === 'demo' ? DEFAULT_OFFLINE_CATEGORIES : []);
      setCategories(loadedCategories);
      setMenuCategories(loadedCategories);

      setUsers(usrs.data || []);

      const loadedWhs = whs.data || [];
      setWarehouses(loadedWhs.length > 0 ? loadedWhs : (currentUser?.role === 'demo' ? DEFAULT_OFFLINE_WAREHOUSES : []));

      const loadedTables = (rTables.data && rTables.data.length > 0) ? rTables.data : DEFAULT_OFFLINE_TABLES;
      setRestaurantTables(loadedTables);

      setCustomers((custs.data && custs.data.length > 0) ? custs.data : (currentUser?.role === 'demo' ? [{ id: 'cust-walkin', name: 'عميل نقدي صالة', phone: '0000000000' }] : []));
      setSuppliers((sups.data && sups.data.length > 0) ? sups.data : (currentUser?.role === 'demo' ? [{ id: 'sup-main', name: 'مورد عام معتمد', phone: '01000000000' }] : []));
      setCheques(chqs.data || []);
      
      const activeShiftData = Array.isArray(shift.data) ? shift.data[0] : shift.data;
      if (activeShiftData && activeShiftData.id) {
        setCurrentShift(activeShiftData);
      } else {
        // إذا لم تكن هناك وردية نشطة أونلاين، نحتفظ بالوردية المحلية إن وجدت
        let localShift = null;
        try {
          localShift = secureStorage.getItem<any>('tripro_offline_current_shift');
        } catch (e) {}
        setCurrentShift(localShift || null);
      }
      setLastUpdated(new Date());

      // مزامنة المنتجات محلياً في الخلفية لدعم وضع الأوفلاين مستقبلاً
      offlineService.seedFallbackProducts(loadedProducts).catch(() => {});

    } catch (error) {
      logger.error('Error refreshing accounting data, loading offline fallback:', error);
      await loadOfflineFallbackData();
    } finally {
      setIsLoading(false);
    }
  })();

  refreshDataPromiseRef.current = currentPromise;
  try {
    await currentPromise;
  } finally {
    refreshDataPromiseRef.current = null;
  }
}, [authUser, currentSelectedOrgId, fiscalYearRange.startDate, fiscalYearRange.endDate, isDemo, loadOfflineFallbackData]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // --- دوال التحديث المجزأة لكل نطاق لترشيد الأداء ومنع شلال الـ 18 استعلاماً ---
  const refreshAccountsAndLedger = useCallback(async () => {
    const targetOrg = getEffectiveOrgId();
    if (!targetOrg || targetOrg === 'org-default-offline') return;
    try {
      const [accs, ents, ccs, budgetData] = await Promise.all([
        supabase.from('accounts').select('*').eq('organization_id', targetOrg).order('code'),
        fetchCompleteDataset<JournalEntry>(async (from, to) =>
          supabase.from('journal_entries')
            .select('*, journal_lines(*)')
            .eq('organization_id', targetOrg)
            .gte('transaction_date', fiscalYearRange.startDate)
            .lte('transaction_date', fiscalYearRange.endDate)
            .order('transaction_date', { ascending: false })
            .range(from, to)
        ).then(data => ({ data, error: null })),
        supabase.from('cost_centers').select('*').eq('organization_id', targetOrg).order('name'),
        supabase.from('budgets').select('*').eq('organization_id', targetOrg)
      ]);
      if (accs.data) {
        setAccounts(accs.data.map((acc: Record<string, any>) => ({
          ...acc,
          isGroup: Boolean(acc.is_group ?? acc.isGroup),
          type: acc.type ? acc.type.toUpperCase() : acc.type
        })));
      }
      if (ents.data) setEntries(ents.data);
      if (ccs.data) setCostCenters(ccs.data);
      if (budgetData.data) setBudgets(budgetData.data);
      setLastUpdated(new Date());
    } catch (e) {
      logger.error('Error in refreshAccountsAndLedger:', e);
    }
  }, [getEffectiveOrgId, fiscalYearRange.startDate, fiscalYearRange.endDate]);

  const refreshCustomers = useCallback(async () => {
    const targetOrg = getEffectiveOrgId();
    if (!targetOrg || targetOrg === 'org-default-offline') return;
    try {
      const res = await fetchAllTableRecords('customers', q => q.eq('organization_id', targetOrg).is('deleted_at', null).order('name'));
      if (res.data) setCustomers(res.data);
      setLastUpdated(new Date());
    } catch (e) {
      logger.error('Error in refreshCustomers:', e);
    }
  }, [getEffectiveOrgId]);

  const refreshSuppliers = useCallback(async () => {
    const targetOrg = getEffectiveOrgId();
    if (!targetOrg || targetOrg === 'org-default-offline') return;
    try {
      const res = await fetchAllTableRecords('suppliers', q => q.eq('organization_id', targetOrg).is('deleted_at', null).order('name'));
      if (res.data) setSuppliers(res.data);
      setLastUpdated(new Date());
    } catch (e) {
      logger.error('Error in refreshSuppliers:', e);
    }
  }, [getEffectiveOrgId]);

  const refreshProductsAndInventory = useCallback(async () => {
    const targetOrg = getEffectiveOrgId();
    if (!targetOrg || targetOrg === 'org-default-offline') return;
    try {
      const [prods, trns, cats, whs] = await Promise.all([
        fetchAllTableRecords('products', q => q.eq('organization_id', targetOrg).is('deleted_at', null).order('name')),
        fetchCompleteDataset<StockTransfer>(async (from, to) =>
          supabase.from('stock_transfers')
            .select('*')
            .eq('organization_id', targetOrg)
            .order('transfer_date', { ascending: false })
            .range(from, to)
        ).then(data => ({ data, error: null })),
        supabase.from('item_categories').select('*').eq('organization_id', targetOrg).order('name'),
        supabase.from('warehouses').select('*').eq('organization_id', targetOrg).eq('is_active', true)
      ]);
      if (prods.data) {
        setProducts(prods.data);
        offlineService.seedFallbackProducts(prods.data).catch(() => {});
      }
      if (trns.data) setTransfers(trns.data);
      if (cats.data) {
        setCategories(cats.data);
        setMenuCategories(cats.data);
      }
      if (whs.data) setWarehouses(whs.data);
      setLastUpdated(new Date());
    } catch (e) {
      logger.error('Error in refreshProductsAndInventory:', e);
    }
  }, [getEffectiveOrgId]);

  const refreshSalesAndPurchases = useCallback(async () => {
    const targetOrg = getEffectiveOrgId();
    if (!targetOrg || targetOrg === 'org-default-offline') return;
    try {
      const [pinvs, invs] = await Promise.all([
        fetchCompleteDataset<PurchaseInvoice>(async (from, to) =>
          supabase.from('purchase_invoices')
            .select('*')
            .eq('organization_id', targetOrg)
            .gte('invoice_date', fiscalYearRange.startDate)
            .lte('invoice_date', fiscalYearRange.endDate)
            .order('invoice_date', { ascending: false })
            .range(from, to)
        ).then(data => ({ data, error: null })),
        fetchCompleteDataset<Invoice>(async (from, to) =>
          supabase.from('invoices')
            .select('*')
            .eq('organization_id', targetOrg)
            .gte('invoice_date', fiscalYearRange.startDate)
            .lte('invoice_date', fiscalYearRange.endDate)
            .order('invoice_date', { ascending: false })
            .range(from, to)
        ).then(data => ({ data, error: null }))
      ]);
      if (pinvs.data) setPurchaseInvoices(pinvs.data);
      if (invs.data) setInvoices(invs.data);
      setLastUpdated(new Date());
    } catch (e) {
      logger.error('Error in refreshSalesAndPurchases:', e);
    }
  }, [getEffectiveOrgId, fiscalYearRange.startDate, fiscalYearRange.endDate]);

  const refreshBankingAndShift = useCallback(async () => {
    const targetOrg = getEffectiveOrgId();
    if (!targetOrg || targetOrg === 'org-default-offline') return;
    try {
      interface RawVoucherFetchRow {
        payment_date?: string | null;
        date?: string | null;
        created_at?: string | null;
        notes?: string | null;
        description?: string | null;
        supplier_id?: string | null;
        party_id?: string | null;
        [key: string]: unknown;
      }

      const [chqs, shift, vchrs] = await Promise.all([
        fetchCompleteDataset<Record<string, unknown>>(async (from, to) =>
          supabase.from('cheques')
            .select('*')
            .eq('organization_id', targetOrg)
            .order('due_date')
            .range(from, to)
        ).then(data => ({ data, error: null })),
        supabase.rpc('get_active_shift', { p_org_id: targetOrg }),
        fetchCompleteDataset<RawVoucherFetchRow>(async (from, to) =>
          supabase.from('payment_vouchers')
            .select('*')
            .eq('organization_id', targetOrg)
            .is('deleted_at', null)
            .order('payment_date', { ascending: false })
            .range(from, to)
        ).then(data => ({ data, error: null }))
      ]);
      if (chqs.data) setCheques(chqs.data);
      if (vchrs.data) {
        const mappedVchrs = (vchrs.data || []).map((row: RawVoucherFetchRow) => ({
          ...row,
          date: (row.payment_date || row.date || (row.created_at ? row.created_at.split('T')[0] : '')) as string,
          payment_date: (row.payment_date || row.date || (row.created_at ? row.created_at.split('T')[0] : '')) as string,
          description: (row.notes || row.description || '') as string,
          notes: (row.notes || row.description || '') as string,
          type: 'payment',
          subType: row.supplier_id ? 'supplier' : 'account',
          party_id: (row.supplier_id || row.party_id) as string,
        }));
        setVouchers(mappedVchrs);
      }
      const activeShiftData = Array.isArray(shift.data) ? shift.data[0] : shift.data;
      if (activeShiftData && activeShiftData.id) {
        setCurrentShift(activeShiftData);
      }
      setLastUpdated(new Date());
    } catch (e) {
      logger.error('Error in refreshBankingAndShift:', e);
    }
  }, [getEffectiveOrgId]);

  const refreshAssets = useCallback(async () => {
    const targetOrg = getEffectiveOrgId();
    if (!targetOrg || targetOrg === 'org-default-offline') return;
    try {
      const data = await fetchCompleteDataset<Asset>(async (from, to) =>
        supabase.from('assets').select('*').eq('organization_id', targetOrg).is('deleted_at', null).range(from, to)
      );
      if (data) setAssets(data);
      setLastUpdated(new Date());
    } catch (e) {
      logger.error('Error in refreshAssets:', e);
    }
  }, [getEffectiveOrgId]);

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
        logger.error('Error fetching paged entries:', error);
      }
      return { data: [], count: 0 };
    }

    return { data: data || [], count: count || 0 };
  }, [currentSelectedOrgId, currentUser?.organization_id]); 
  const addEntry = async (entry: DynamicParam) => {
    const targetOrgId = entry.p_org_id || entry.organization_id || currentSelectedOrgId || currentUser?.organization_id;
    const sanitizedLines = (entry.lines || [])
      .filter((l: Record<string, any>) => {
        const accId = l.accountId || l.account_id;
        return accId && typeof accId === 'string' && accId.trim() !== '' && (Number(l.debit) > 0 || Number(l.credit) > 0);
      })
      .map((l: Record<string, any>) => ({
        accountId: l.accountId || l.account_id,
        account_id: l.accountId || l.account_id,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        description: l.description || entry.description || ''
      }));

    if (sanitizedLines.length === 0) {
      logger.warn('addEntry: No valid lines to post journal entry');
      return;
    }

    const payload: Record<string, any> = {
      date: entry.date || new Date().toISOString().split('T')[0],
      description: entry.description || null,
      reference: entry.reference || null,
      status: entry.status || 'posted',
      lines: sanitizedLines,
      p_org_id: targetOrgId
    };

    const balanceCheck = validateEntryBalance({
      reference: entry.reference || 'JE-DRAFT',
      date: payload.date,
      lines: sanitizedLines
    });

    if (!balanceCheck.isBalanced) {
      const errMsg = `القيد المحاسبي غير متوازن: إجمالي المدين (${balanceCheck.totalDebit}) لا يساوي إجمالي الدائن (${balanceCheck.totalCredit}) بفارق ${balanceCheck.difference}`;
      logger.error('addEntry balance error:', errMsg);
      showToast(errMsg, 'error');
      throw new Error(errMsg);
    }

    const { error } = await supabase.rpc('add_journal_entry', payload);
    if (error) throw error;
    logActivity('إنشاء قيد يومية', `قيد مرجعي: ${payload.reference || 'عام'}`);
    await refreshAccountsAndLedger();
  };
  const getSystemAccount = (key: string) => {
    const mappingId = settings.account_mappings?.[key];
    if (mappingId) return accounts.find(a => a.id === mappingId);
    const defaultCode = SYSTEM_ACCOUNTS[key as keyof typeof SYSTEM_ACCOUNTS];
    if (defaultCode) {
      const matchByExactCode = accounts.find(a => a.code === defaultCode);
      if (matchByExactCode) return matchByExactCode;
      const matchByPrefix = accounts.find(a => a.code?.startsWith(defaultCode));
      if (matchByPrefix) return matchByPrefix;
    }
    // Fallback by name and alternate standard codes
    if (key === 'CUSTOMERS' || key === 'AR' || key === 'CUSTOMER') {
      return accounts.find(a => a.name?.includes('العملاء') || a.name?.includes('عملاء') || a.name?.toLowerCase().includes('customer') || a.name?.toLowerCase().includes('receivable') || a.code === '1221' || a.code === '1103' || a.code === '121' || a.code?.startsWith('122') || a.code?.startsWith('1103'));
    }
    if (key === 'SUPPLIERS' || key === 'AP' || key === 'SUPPLIER') {
      return accounts.find(a => a.name?.includes('الموردين') || a.name?.includes('موردين') || a.name?.toLowerCase().includes('supplier') || a.name?.toLowerCase().includes('payable') || a.code === '201' || a.code === '2101' || a.code === '221' || a.code?.startsWith('201') || a.code?.startsWith('2101'));
    }
    if (key === 'CASH' || key === 'TREASURY') {
      return accounts.find(a => a.name?.includes('الخزينة') || a.name?.includes('النقدية') || a.name?.includes('الصندوق') || a.name?.toLowerCase().includes('cash') || a.code === '1231' || a.code === '10101' || a.code === '123' || a.code?.startsWith('1231') || a.code?.startsWith('10101'));
    }
    if (key === 'VAT' || key === 'VAT_OUTPUT') {
      return accounts.find(a => (a.name?.includes('القيمة المضافة') || a.name?.includes('ضريبة المبيعات') || a.code === '2231' || a.code === '2105' || a.code?.startsWith('2231')) && !a.name?.includes('مدخلات') && !a.name?.includes('مشتريات'));
    }
    if (key === 'VAT_INPUT') {
      return accounts.find(a => a.name?.includes('مدخلات') || a.name?.includes('مشتريات') || a.code === '1241' || a.code === '1105');
    }
    if (key === 'OPENING_BALANCES') {
      return accounts.find(a => a.name?.includes('أرصدة افتتاحية') || a.name?.includes('افتتاحي') || a.name?.includes('افتتاحية') || a.name?.toLowerCase().includes('opening') || a.code === '3999' || a.code === '313' || a.code?.startsWith('39') || a.code?.startsWith('300'));
    }
    if (key === 'INVENTORY_FINISHED_GOODS' || key === 'INVENTORY') {
      return accounts.find(a => a.code === '10302' || a.code === '1213' || a.code === '103' || a.code === '122' || a.code === '121' || a.name?.includes('بضائع بغرض البيع') || a.name?.includes('منتج تام') || a.name?.includes('تام الصنع') || a.name?.includes('المخزون') || a.name?.includes('مخزون'));
    }
    if (key === 'INVENTORY_RAW_MATERIALS') {
      return accounts.find(a => a.code === '10301' || a.code === '1211' || a.code === '103' || a.name?.includes('خامات') || a.name?.includes('مواد خام') || a.name?.includes('المخزون') || a.name?.includes('مخزون'));
    }
    if (key === 'COGS') {
      return accounts.find(a => a.code === '511' || a.code === '311' || a.code?.startsWith('51') || a.name?.includes('تكلفة المبيعات') || a.name?.includes('تكلفة البضاعة'));
    }
    if (key === 'SALES_REVENUE') {
      return accounts.find(a => a.code === '411' || a.code === '41' || a.code?.startsWith('41') || a.name?.includes('المبيعات') || a.name?.includes('إيراد المبيعات'));
    }
    if (key === 'NOTES_RECEIVABLE') {
      return accounts.find(a => a.name?.includes('أوراق القبض') || a.name?.includes('أوراق قبض') || a.name?.includes('شيكات واردة') || a.name?.includes('تحت التحصيل') || a.code === '1222' || a.code?.startsWith('10103') || a.code?.startsWith('1231'));
    }
    if (key === 'NOTES_PAYABLE') {
      return accounts.find(a => a.name?.includes('أوراق الدفع') || a.name?.includes('أوراق دفع') || a.name?.includes('شيكات صادرة') || a.code === '222' || a.code?.startsWith('20102') || a.code?.startsWith('2202'));
    }
    if (key === 'BANK_ACCOUNTS' || key === 'BANK_MAIN') {
      return accounts.find(a => a.name?.includes('بنك') || a.name?.toLowerCase().includes('bank') || a.code?.startsWith('1232') || a.code?.startsWith('10102'));
    }
    if (key === 'INVENTORY_ADJUSTMENTS' || key === 'WASTAGE_EXPENSE' || key === 'INVENTORY_REVALUATION') {
      return accounts.find(a => (a.code === '512' || a.code === '5121' || a.name?.includes('تسويات الجرد') || a.name?.includes('عجز المخزون') || a.name?.includes('الهالك والفاقد') || a.name?.includes('تكلفة الهالك')) && !a.name?.includes('ضريب') && !a.code?.startsWith('223') && !a.code?.startsWith('124'));
    }
    if (key === 'CASH_SHORTAGE') {
      return accounts.find(a => (a.code === '541' || a.name?.includes('عجز الصندوق') || a.name?.includes('عجز الخزينة')) && !a.name?.includes('ضريب') && !a.code?.startsWith('223'));
    }
    if (key === 'REVENUE_OTHER' || key === 'OTHER_REVENUE') {
      return accounts.find(a => (a.code === '421' || a.code === '441' || a.name?.includes('إيرادات متنوعة') || a.name?.includes('إيرادات أخرى')) && !a.name?.includes('ضريب'));
    }
    if (key === 'LETTER_OF_GUARANTEE_MARGIN') {
      return accounts.find(a =>
        a.code === '1248' ||
        a.code?.startsWith('1248') ||
        a.name?.includes('غطاء خطابات ضمان') ||
        a.name?.includes('غطاء خطابات الضمان') ||
        a.name?.includes('غطاء الضمان')
      );
    }
    if (key === 'LETTER_OF_CREDIT_GOODS') {
      return accounts.find(a =>
        a.code === '1246' ||
        a.code?.startsWith('1246') ||
        a.name?.includes('اعتمادات مستندية') ||
        a.name?.includes('اعتماد مستندي') ||
        a.name?.includes('خطابات اعتماد')
      );
    }
    return undefined;
  };
  const updateVoucher = async (id: string, updates: DynamicParam) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const sanitizedUpdates: Record<string, any> = {};
    if (updates.amount !== undefined) sanitizedUpdates.amount = updates.amount;
    if (updates.notes !== undefined) sanitizedUpdates.notes = updates.notes;
    else if (updates.description !== undefined) sanitizedUpdates.notes = updates.description;
    if (updates.payment_date !== undefined) sanitizedUpdates.payment_date = updates.payment_date;
    else if (updates.date !== undefined) sanitizedUpdates.payment_date = updates.date;
    if (sanitizedUpdates.payment_date) sanitizedUpdates.date = sanitizedUpdates.payment_date;
    if (updates.treasury_account_id !== undefined) sanitizedUpdates.treasury_account_id = updates.treasury_account_id;
    if (updates.cost_center_id !== undefined) sanitizedUpdates.cost_center_id = updates.cost_center_id;
    if (updates.payment_method !== undefined) sanitizedUpdates.payment_method = updates.payment_method;
    if (updates.supplier_id !== undefined) sanitizedUpdates.supplier_id = updates.supplier_id;
    else if (updates.party_id !== undefined) sanitizedUpdates.supplier_id = updates.party_id;
    if (updates.voucher_number !== undefined) sanitizedUpdates.voucher_number = updates.voucher_number;
    if (updates.recipient_name !== undefined) sanitizedUpdates.recipient_name = updates.recipient_name;
    if (updates.currency !== undefined) sanitizedUpdates.currency = updates.currency;
    if (updates.exchange_rate !== undefined) sanitizedUpdates.exchange_rate = updates.exchange_rate;

    let query = supabase.from('payment_vouchers').update(sanitizedUpdates).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);
    const { error } = await query;
    if (error) {
      logger.error('updateVoucher error:', error);
      showToast('فشل تعديل السند: ' + error.message, 'error');
      return false;
    }
    showToast('تم تعديل السند بنجاح ✅', 'success');
    await refreshData();
    return true;
  };
  const getAccountBalanceInPeriod = async (id: string, start: string, end: string) => { 
    const { data } = await supabase.rpc('get_account_balance_in_period', { p_account_id: id, p_start_date: start, p_end_date: end, p_org_id: currentSelectedOrgId });
    return data || 0;
  };
  const addAccount = async (acc: Partial<Account>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data, error } = await supabase.from('accounts').insert({ ...acc, organization_id: targetOrgId }).select().single(); 
    if (error) throw error;
    await refreshAccountsAndLedger(); return data; 
  };
  const updateAccount = async (id: string, updates: Partial<Account>) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    let query = supabase.from('accounts').update(updates).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);
    const { error } = await query;
    if (error) throw error;
    await refreshAccountsAndLedger();
  };
  const deleteAccount = async (id: string, _reason?: string) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    let query = supabase.from('accounts').delete().eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);
    const { error } = await query;
    await refreshAccountsAndLedger();
    return { success: !error, message: error?.message };
  };
  const clearTransactions = async () => { await supabase.rpc('clear_all_transactions'); await refreshAccountsAndLedger(); };
  const emptyRecycleBin = async (table: string) => { await supabase.rpc('empty_recycle_bin', { p_table_name: table }); await refreshData(); };
  const saveBudget = async (budget: Record<string, any>) => { 
    const { error } = await supabase.from('budgets').upsert(budget); 
    if (error) {
      showToast('فشل حفظ الموازنة: ' + error.message, 'error');
    } else {
      showToast('تم حفظ الموازنة بنجاح ✅', 'success');
      await refreshAccountsAndLedger(); 
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
      await refreshProductsAndInventory();
    }
  };

  const addProduct = async (data: Partial<Product>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const toNullableUUID = (v: unknown) => {
      if (!v || typeof v !== 'string' || v.trim() === '') return null;
      const trimmed = v.trim();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
    };

    const payload: Record<string, any> = { 
      ...data, 
      organization_id: targetOrgId,
      created_by: currentUser?.id || null,
      updated_by: currentUser?.id || null
    };
    
    if ('category_id' in payload) payload.category_id = toNullableUUID(payload.category_id);
    if ('base_uom_id' in payload) payload.base_uom_id = toNullableUUID(payload.base_uom_id);
    if ('purchase_uom_id' in payload) payload.purchase_uom_id = toNullableUUID(payload.purchase_uom_id);
    if ('sale_uom_id' in payload) payload.sale_uom_id = toNullableUUID(payload.sale_uom_id);
    if ('inventory_account_id' in payload) payload.inventory_account_id = toNullableUUID(payload.inventory_account_id);
    if ('cogs_account_id' in payload) payload.cogs_account_id = toNullableUUID(payload.cogs_account_id);
    if ('sales_account_id' in payload) payload.sales_account_id = toNullableUUID(payload.sales_account_id);
    if ('supplier_id' in payload) {
      if (!payload.supplier_id || payload.supplier_id === '') {
        delete payload.supplier_id;
      } else {
        payload.supplier_id = toNullableUUID(payload.supplier_id);
      }
    }

    let p: DynamicParam = null;
    let error: DynamicParam = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await supabase.from('products').insert(payload).select().single();
      p = res.data;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
      }
      break;
    }

    if (error) {
      logger.error('addProduct error:', error);
      showToast('فشل إضافة الصنف: ' + error.message, 'error');
      throw error;
    }
    showToast('تمت إضافة الصنف بنجاح ✅', 'success');
    logActivity('إضافة صنف', `تمت إضافة الصنف: ${data.name || ''}`);
    await refreshProductsAndInventory(); 
    return p; 
  };
  const updateProduct = async (id: string, data: Partial<Product>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const toNullableUUID = (v: unknown) => {
      if (!v || typeof v !== 'string' || v.trim() === '') return null;
      const trimmed = v.trim();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
    };

    const payload: Record<string, any> = { ...data };
    delete payload.id;
    delete payload.organization_id;
    if (currentUser?.id) payload.updated_by = currentUser.id;

    if ('category_id' in payload) payload.category_id = toNullableUUID(payload.category_id);
    if ('base_uom_id' in payload) payload.base_uom_id = toNullableUUID(payload.base_uom_id);
    if ('purchase_uom_id' in payload) payload.purchase_uom_id = toNullableUUID(payload.purchase_uom_id);
    if ('sale_uom_id' in payload) payload.sale_uom_id = toNullableUUID(payload.sale_uom_id);
    if ('inventory_account_id' in payload) payload.inventory_account_id = toNullableUUID(payload.inventory_account_id);
    if ('cogs_account_id' in payload) payload.cogs_account_id = toNullableUUID(payload.cogs_account_id);
    if ('sales_account_id' in payload) payload.sales_account_id = toNullableUUID(payload.sales_account_id);
    if ('supplier_id' in payload) payload.supplier_id = toNullableUUID(payload.supplier_id);
    
    let error: DynamicParam = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      let query = supabase.from('products').update(payload).eq('id', id);
      if (targetOrgId) query = query.eq('organization_id', targetOrgId);
      const res = await query;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
      }
      break;
    }

    if (error) {
      logger.error('updateProduct error:', error);
      showToast('فشل تحديث الصنف: ' + error.message, 'error');
      throw error;
    }
    showToast('تم تحديث بيانات الصنف بنجاح ✅', 'success');
    logActivity('تعديل صنف', `تم تعديل بيانات الصنف رقم: ${id}`);
    await refreshProductsAndInventory(); 
  };
  const deleteProduct = async (id: string, _reason?: string) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    let query = supabase.from('products').update({ 
      deleted_at: new Date().toISOString(),
      updated_by: currentUser?.id
    }).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);
    const { error } = await query;
    if (error) throw error;
    showToast('تم نقل الصنف إلى سلة المحذوفات', 'success');
    logActivity('حذف صنف', `تم حذف الصنف رقم: ${id}`);
    await refreshProductsAndInventory(); 
  };
  const addStockTransfer = async (data: DynamicParam) => { 
    const { error } = await supabase.from('stock_transfers').insert(data);
    if (error) throw error;
    await refreshProductsAndInventory(); 
  };
  const approveStockTransfer = async (id: string) => { 
    const { error } = await supabase.rpc('approve_stock_transfer', { p_transfer_id: id });
    if (error) throw error;
    await refreshProductsAndInventory(); 
  };
  const cancelStockTransfer = async (id: string) => { 
    await supabase.from('stock_transfers').update({ status: 'cancelled' }).eq('id', id); 
    showToast('تم إلغاء طلب التحويل', 'info'); 
    await refreshProductsAndInventory(); 
  };
  const addWarehouse = async (data: Partial<Warehouse>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('warehouses').insert({ ...data, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshProductsAndInventory(); 
  };
  const updateWarehouse = async (id: string, data: Partial<Warehouse>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    let query = supabase.from('warehouses').update(data).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);
    const { error } = await query;
    if (error) throw error;
    await refreshProductsAndInventory(); 
  };
  const deleteWarehouse = async (id: string) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    let query = supabase.from('warehouses').update({ is_active: false }).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);
    const { error } = await query;
    if (error) throw error;
    await refreshProductsAndInventory(); 
  };
  const addWastage = async (data: Record<string, any>) => { 
    const { error } = await supabase.rpc('record_wastage', data); 
    if (error) {
      showToast('فشل تسجيل الهالك: ' + error.message, 'error');
    } else {
      showToast('تم تسجيل الهالك وتحديث المخزن ✅', 'success');
      await refreshProductsAndInventory();
    }
    return !error; 
  };
  const produceItem = async (id: string, qty: number, whId: string, date: string, cost: number, ref: string) => { return await supabase.rpc('mfg_create_order_direct', { p_product_id: id, p_qty: qty, p_warehouse_id: whId, p_date: date, p_additional_cost: cost, p_reference: ref }); };

  // Sales & Purchases
  const addCustomer = async (data: Partial<Customer>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const payload: Record<string, any> = {
      ...data,
      organization_id: targetOrgId,
      created_by: currentUser?.id || null,
      updated_by: currentUser?.id || null
    };

    let c: DynamicParam = null;
    let error: DynamicParam = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await supabase.from('customers').insert(payload).select().single();
      c = res.data;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
      }
      break;
    }

    if (error) throw error;
    logActivity('إضافة عميل', `تم إضافة العميل: ${data.name || ''}`);
    await refreshCustomers(); 
    return c; 
  };
  const updateCustomer = async (id: string, data: Partial<Customer>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const payload: Record<string, any> = { ...data };
    delete payload.id;
    delete payload.organization_id;
    if (currentUser?.id) payload.updated_by = currentUser.id;

    let error: DynamicParam = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      let query = supabase.from('customers').update(payload).eq('id', id);
      if (targetOrgId) query = query.eq('organization_id', targetOrgId);
      const res = await query;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
      }
      break;
    }

    if (error) throw error;
    logActivity('تعديل عميل', `تم تعديل بيانات العميل رقم: ${id}`);
    await refreshCustomers(); 
  };
  const deleteCustomer = async (id: string, reason?: string) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const payload: Record<string, any> = {
      deleted_at: new Date().toISOString(),
      deletion_reason: reason || null
    };
    if (currentUser?.id) payload.updated_by = currentUser.id;

    let error: DynamicParam = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      let query = supabase.from('customers').update(payload).eq('id', id);
      if (targetOrgId) query = query.eq('organization_id', targetOrgId);
      const res = await query;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
      }
      break;
    }

    if (error) throw error;
    logActivity('حذف عميل', `تم حذف العميل رقم: ${id}`);
    await refreshCustomers(); 
  };
  const addSupplier = async (data: Partial<Supplier>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const payload: Record<string, any> = {
      name: data.name?.trim() || '',
      code: data.code?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      tax_number: (data.tax_number || (data as any).tax_id || (data as any).taxId)?.trim() || null,
      tax_id: ((data as any).tax_id || (data as any).taxId || data.tax_number)?.trim() || null,
      address: data.address?.trim() || null,
      contact_person: (data.contact_person || (data as any).contactPerson)?.trim() || null,
      opening_balance: Number(data.opening_balance || 0),
      credit_limit: Number(data.credit_limit || 0),
      organization_id: targetOrgId,
      created_by: currentUser?.id || null,
      updated_by: currentUser?.id || null
    };

    let s: DynamicParam = null;
    let error: DynamicParam = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await supabase.from('suppliers').insert(payload).select().single();
      s = res.data;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
      }
      break;
    }

    if (error) {
      showToast('فشل إضافة المورد: ' + error.message, 'error');
      throw error;
    }
    showToast('تم إضافة المورد بنجاح ✅', 'success');
    logActivity('إضافة مورد', `تم إضافة المورد: ${data.name || ''}`);
    await refreshSuppliers();
    return s; 
  };
  const updateSupplier = async (id: string, data: Partial<Supplier>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const payload: Record<string, any> = { ...data };
    delete payload.id;
    delete payload.organization_id;
    if (currentUser?.id) payload.updated_by = currentUser.id;

    let error: DynamicParam = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      let query = supabase.from('suppliers').update(payload).eq('id', id);
      if (targetOrgId) query = query.eq('organization_id', targetOrgId);
      const res = await query;
      error = res.error;
      if (!error) break;

      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const match = error.message?.match(/Could not find the '([^']+)' column/i);
        if (match && match[1] && match[1] in payload) {
          delete payload[match[1]];
          continue;
        }
      }
      break;
    }

    if (error) throw error;
    logActivity('تعديل مورد', `تم تعديل بيانات المورد رقم: ${id}`);
    await refreshSuppliers(); 
  };
  const deleteSupplier = async (id: string, reason?: string) => { 
    // حذف قيد الرصيد الافتتاحي المرتبط بالمورد إن وجد لتفادي بقائه معلقاً في الأستاذ العام
    try {
      const { data: opEntries } = await supabase
        .from('journal_entries')
        .select('id')
        .or(`reference.eq.OP-SUPP-${id},reference.ilike.%${id}%`);

      if (opEntries && opEntries.length > 0) {
        for (const opEntry of opEntries) {
          await supabase.rpc('delete_journal_entry_safe', { p_entry_id: opEntry.id, p_org_id: null });
        }
      }
    } catch (e) {
      logger.warn('Could not auto-clean opening balance entry for supplier:', e);
    }

    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    let query = supabase.from('suppliers').update({ deleted_at: new Date().toISOString(), deletion_reason: reason }).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);
    const { error } = await query;
    if (error) throw error;
    await refreshSuppliers(); 
  };
  const approveInvoice = async (id: string, orgId?: string, warehouseId?: string) => { 
    const { error } = await supabase.rpc('post_sales_invoice', { 
      p_invoice_id: id,
      p_org_id: orgId || currentSelectedOrgId || currentUser?.organization_id || null,
      p_warehouse_id: warehouseId
    }); 
    if (error) {
      logger.error('approveInvoice RPC error:', error);
      throw error;
    }
    await refreshSalesAndPurchases(); 
    return true; 
  };

  const unpostSalesInvoice = async (id: string, orgId?: string): Promise<boolean> => {
    const targetOrgId = orgId || currentSelectedOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('unpost_sales_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId
    });
    if (error) {
      logger.warn('RPC unpost_sales_invoice error:', error);
      throw error;
    }
    await refreshSalesAndPurchases();
    return true; 
  };

  const deleteSalesInvoice = async (id: string, orgId?: string): Promise<boolean> => {
    const targetOrgId = orgId || currentSelectedOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('delete_sales_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId
    });
    if (error) {
      logger.warn('RPC delete_sales_invoice error:', error);
      throw error;
    }
    await refreshSalesAndPurchases();
    return true; 
  };

  const approvePurchaseInvoice = async (id: string, orgId?: string, warehouseId?: string) => { 
    const { error } = await supabase.rpc('post_purchase_invoice', { 
      p_invoice_id: id,
      p_org_id: orgId || currentSelectedOrgId || currentUser?.organization_id,
      p_warehouse_id: warehouseId
    }); 
    if (error) {
      showToast('فشل اعتماد الفاتورة: ' + error.message, 'error');
      throw error;
    } else {
      showToast('تم اعتماد فاتورة المشتريات وتحديث المخزون بنجاح ✅', 'success');
      await refreshSalesAndPurchases();
    }
  };

  const unpostPurchaseInvoice = async (id: string, orgId?: string): Promise<boolean> => {
    const targetOrgId = orgId || currentSelectedOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('unpost_purchase_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId
    });
    if (error) {
      logger.warn('RPC unpost_purchase_invoice error:', error);
      throw error;
    }
    await refreshSalesAndPurchases();
    return true; 
  };

  const deletePurchaseInvoice = async (id: string, orgId?: string): Promise<boolean> => {
    const targetOrgId = orgId || currentSelectedOrgId || currentUser?.organization_id || null;
    const { error } = await supabase.rpc('delete_purchase_invoice', {
      p_invoice_id: id,
      p_org_id: targetOrgId
    });
    if (error) {
      logger.warn('RPC delete_purchase_invoice error:', error);
      throw error;
    }
    await refreshSalesAndPurchases();
    return true; 
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
      await refreshSalesAndPurchases();
    }
  };
  const addOpeningBalanceTransaction = async (id: string, type: string, amount: number, date: string, name: string) => {
    const { error } = await supabase.rpc('add_opening_balance', {
      p_id: id,
      p_type: type,
      p_amount: amount,
      p_date: date,
      p_name: name
    });
    if (error) {
      showToast('فشل تسجيل القيد الافتتاحي: ' + error.message, 'error');
    } else {
      showToast('تم تسجيل الرصيد الافتتاحي وتحديث الحسابات بنجاح ✅', 'success');
      refreshData();
    }
  };
  const addPaymentVoucher = async (data: DynamicParam) => { 
    const { data: { session } } = await supabase.auth.getSession();
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id || session?.user?.user_metadata?.org_id || (currentUser as any)?.user_metadata?.org_id;
    const supplierId = data.partyId || data.supplierId || data.supplier_id;
    const treasuryId = data.treasuryAccountId || data.treasury_account_id || data.treasuryId;
    const amount = Number(data.amount) || 0;
    const date = data.date || data.payment_date || new Date().toISOString().split('T')[0];
    const notes = data.notes || data.description || '';
    const voucherNumber = data.voucher_number || data.voucherNumber || `PV-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;

    const supplier = suppliers.find(s => s.id === supplierId);
    const supplierName = data.partyName || data.supplierName || supplier?.name || '';
    const fullDesc = notes 
      ? (supplierName && !notes.includes(supplierName) ? `${notes} (${supplierName})` : notes)
      : `سند صرف للمورد ${supplierName}`.trim();

    // 🛡️ تحديد حساب المورد المدين
    let supplierAccId = supplier?.account_id || supplier?.accountId || 
                          getSystemAccount('SUPPLIERS')?.id || 
                          accounts.find(a => a.code === '201' || a.code === '20101' || a.code === '2201' || a.code?.startsWith('201') || a.name?.includes('مورد'))?.id;

    if (!supplierAccId && targetOrgId) {
      const { data: dbAcc } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', targetOrgId)
        .or('code.eq.201,code.eq.20101,code.eq.2201,name.ilike.%مورد%')
        .limit(1)
        .maybeSingle();
      if (dbAcc) supplierAccId = dbAcc.id;
    }

    // 🛡️ التحقق القبلي الصارم لمنع إنشاء سندات صرف معلقة بدون أطراف محاسبية
    if (amount > 0 && !supplierAccId) {
      showToast('لا يمكن إنشاء سند الصرف: لم يتم تحديد حساب المورد أو حساب الموردين الافتراضي', 'error');
      throw new Error('لم يتم تحديد حساب المورد أو حساب الموردين الافتراضي');
    }
    if (amount > 0 && !treasuryId) {
      showToast('لا يمكن إنشاء سند الصرف: يجب اختيار حساب الخزينة أو البنك', 'error');
      throw new Error('يجب اختيار حساب الخزينة أو البنك');
    }

    // 1. إدراج السند في جدول payment_vouchers
    const { data: pvData, error: pvError } = await supabase.from('payment_vouchers').insert({
      voucher_number: voucherNumber,
      payment_date: date,
      supplier_id: supplierId || null,
      amount: amount,
      treasury_account_id: treasuryId || null,
      notes: fullDesc,
      payment_method: data.paymentMethod || data.payment_method || 'cash',
      organization_id: targetOrgId
    }).select('id').maybeSingle();

    if (pvError) {
      logger.error('payment_vouchers insert error:', pvError);
      showToast('فشل إنشاء سند الصرف: ' + pvError.message, 'error');
      throw pvError;
    }

    const voucherId = pvData?.id;

    // 2. إنشاء القيد المحاسبي لسند الصرف بشكل مضمون
    if (amount > 0 && supplierAccId && treasuryId) {
      let entryCreated = false;

      // محاولة 1: الدالة الآمنة في قاعدة البيانات
      if (voucherId) {
        try {
          const { error: rpcErr } = await supabase.rpc('approve_payment_voucher', {
            p_voucher_id: voucherId,
            p_debit_account_id: supplierAccId
          });
          if (!rpcErr) entryCreated = true;
        } catch (rpcEx) {
          logger.warn('approve_payment_voucher RPC failed, falling back to manual entry:', rpcEx);
        }
      }

      // محاولة 2: استخدام دالة addEntry
      if (!entryCreated) {
        try {
          await addEntry({
            date: date,
            description: fullDesc,
            reference: voucherNumber,
            status: 'posted',
            p_org_id: targetOrgId,
            lines: [
              { account_id: supplierAccId, accountId: supplierAccId, debit: amount, credit: 0, description: fullDesc },
              { account_id: treasuryId, accountId: treasuryId, debit: 0, credit: amount, description: `سداد سند صرف ${voucherNumber}` }
            ]
          });
          entryCreated = true;
        } catch (addErr) {
          logger.warn('addEntry RPC failed, falling back to direct table insert:', addErr);
        }
      }

      // محاولة 3: إدراج مباشر في journal_entries و journal_lines
      if (!entryCreated && targetOrgId) {
        try {
          const { data: newJe, error: jeErr } = await supabase
            .from('journal_entries')
            .insert({
              transaction_date: date,
              description: fullDesc,
              reference: voucherNumber,
              status: 'posted',
              is_posted: true,
              organization_id: targetOrgId,
              related_document_id: voucherId || data.invoiceId || null,
              related_document_type: 'payment_voucher'
            })
            .select('id')
            .single();

          if (!jeErr && newJe) {
            const { error: linesErr } = await supabase.from('journal_lines').insert([
              {
                journal_entry_id: newJe.id,
                account_id: supplierAccId,
                debit: amount,
                credit: 0,
                description: fullDesc,
                organization_id: targetOrgId
              },
              {
                journal_entry_id: newJe.id,
                account_id: treasuryId,
                debit: 0,
                credit: amount,
                description: `سداد سند صرف ${voucherNumber}`,
                organization_id: targetOrgId
              }
            ]);

            if (linesErr) {
              await supabase.from('journal_entries').delete().eq('id', newJe.id);
              throw linesErr;
            }

            if (voucherId) {
              await supabase
                .from('payment_vouchers')
                .update({ related_journal_entry_id: newJe.id })
                .eq('id', voucherId);
            }
            entryCreated = true;
          }
        } catch (directErr) {
          logger.error('Direct journal entry insert error:', directErr);
          showToast('تعذر إنشاء القيد المحاسبي المباشر للسند: ' + (directErr?.message || ''), 'warning');
        }
      }

      // 🛡️ تراجع تعويضي فوري (Compensating Rollback): في حال فشل إنشاء القيود، يُحذف السند لمنع أي أثر يتيم
      if (!entryCreated) {
        if (voucherId) {
          try {
            await supabase.from('payment_vouchers').delete().eq('id', voucherId);
            logger.warn(`Compensating rollback executed: deleted orphan payment voucher ${voucherId}`);
          } catch (rbErr) {
            logger.error('Failed to compensate voucher delete:', rbErr);
          }
        }
        showToast('فشل إنشاء القيد المحاسبي لسند الصرف، تم التراجع عن إنشاء السند تلقائياً لضمان توازن الدفاتر ❌', 'error');
        throw new Error('فشل إنشاء القيد المحاسبي لسند الصرف، تم التراجع عن العملية.');
      }
    }

    // 3. تحديث المبلغ المدفوع في فاتورة المشتريات إن وجدت
    if (data.invoiceId) {
      try {
        const { data: currentInv, error: fetchInvErr } = await supabase
          .from('purchase_invoices')
          .select('paid_amount, total_amount, status')
          .eq('id', data.invoiceId)
          .maybeSingle();

        if (!fetchInvErr && currentInv) {
          const newPaid = (Number(currentInv.paid_amount) || 0) + amount;
          const newStatus = newPaid >= Number(currentInv.total_amount) ? 'paid' : (currentInv.status === 'draft' ? 'draft' : 'posted');
          await supabase
            .from('purchase_invoices')
            .update({ paid_amount: newPaid, status: newStatus })
            .eq('id', data.invoiceId);
        }
      } catch (invErr) {
        logger.error('Failed to update purchase invoice paid_amount:', invErr);
        showToast('تعذر تحديث المبلغ المسدد في فاتورة المشتريات: ' + (invErr?.message || ''), 'warning');
      }
    }

    // 4. إعادة مزامنة أرصدة الحسابات والموردين
    if (targetOrgId) {
      try {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
      } catch (recErr) {
        logger.warn('recalculate balances error:', recErr);
      }
    }

    await refreshData(); 
  };

  // Assets & Cheques
  const addAsset = async (assetData: DynamicParam) => { 
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
        const refCode = `ASSET-${newAsset.id.split('-')[0].toUpperCase()}`;
        await addEntry({
          date: newAsset.purchase_date || new Date().toISOString().split('T')[0],
          description: `إثبات شراء أصل ثابت: ${newAsset.name}`,
          reference: refCode,
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

        // ربط القيد بـ related_document_id لتسهيل التتبع
        await supabase
          .from('journal_entries')
          .update({ related_document_id: newAsset.id, related_document_type: 'fixed_asset' })
          .eq('reference', refCode)
          .eq('organization_id', targetOrgId);
      } catch (jeError) {
        logger.error("Failed to create asset journal entry:", jeError);
        showToast('تمت إضافة الأصل ولكن فشل إنشاء القيد آلياً، يرجى إنشاؤه يدوياً.', 'warning');
      }
    }

    await refreshAssets(); 
  };
  const updateAsset = async (id: string, updates: Partial<Asset>) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    let query = supabase.from('assets').update(updates).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);
    const { error } = await query;
    if (error) throw error;
    await refreshAssets();
  };
  const deleteAsset = async (id: string) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    let query = supabase.from('assets').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);
    const { error } = await query;
    if (error) throw error;

    // إلغاء ترحيل قيود الأصل المرتبطة (الشراء والإهلاك) حتى لا تظهر في ميزان المراجعة أثناء وجود الأصل بالسلة
    try {
      const prefix = id.split('-')[0].toUpperCase();
      const shortId = id.slice(0, 6);
      await supabase
        .from('journal_entries')
        .update({ status: 'draft', is_posted: false })
        .eq('organization_id', targetOrgId)
        .or(`related_document_id.eq.${id},reference.ilike.ASSET-${prefix}%,reference.ilike.DEP-${shortId}%`);

      if (targetOrgId) {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
      }
    } catch (e) {
      logger.warn('deleteAsset unpost fallback:', e);
    }

    await refreshAssets();
  };
  const runDepreciation = async (id?: string, amount?: number, date?: string) => { 
    const { error } = await supabase.rpc('run_monthly_depreciation', { p_asset_id: id, p_amount: amount, p_date: date }); 
    if (error) {
      logger.error('runDepreciation error:', error);
      showToast('فشل تنفيذ الإهلاك: ' + error.message, 'error');
      throw error;
    }
    showToast('تم تنفيذ الإهلاك وتحديث الأرصدة بنجاح ✅', 'success');
    await refreshAssets(); 
  };
  const revaluateAsset = async (id: string, val: number, date: string, accId: string) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { data: asset, error: fetchErr } = await supabase.from('assets').select('*').eq('id', id).maybeSingle();
    if (fetchErr || !asset) {
      showToast('تعذر العثور على بيانات الأصل لإعادة التقييم', 'error');
      return;
    }
    const oldVal = Number(asset.current_value ?? asset.purchase_cost) || 0;
    const newVal = Number(val) || 0;
    const diff = newVal - oldVal;

    let updateQuery = supabase.from('assets').update({ current_value: newVal }).eq('id', id);
    if (targetOrgId) updateQuery = updateQuery.eq('organization_id', targetOrgId);
    const { error: updateErr } = await updateQuery;
    if (updateErr) {
      showToast('فشل إعادة تقييم الأصل: ' + updateErr.message, 'error');
      return;
    }

    if (diff !== 0 && accId && asset.asset_account_id) {
      try {
        const isSurplus = diff > 0;
        const absDiff = Math.abs(diff);
        await addEntry({
          date: date || new Date().toISOString().split('T')[0],
          description: `إعادة تقييم الأصل: ${asset.name} (${isSurplus ? 'فائض' : 'عجز'} تقييم)`,
          reference: `REVAL-${asset.id.slice(0, 8).toUpperCase()}`,
          status: 'posted',
          p_org_id: targetOrgId,
          lines: isSurplus ? [
            { accountId: asset.asset_account_id, debit: absDiff, credit: 0, description: `زيادة قيمة الأصل ${asset.name}` },
            { accountId: accId, debit: 0, credit: absDiff, description: `احتياطي فائض إعادة التقييم` }
          ] : [
            { accountId: accId, debit: absDiff, credit: 0, description: `خسائر وعجز إعادة تقييم الأصل` },
            { accountId: asset.asset_account_id, debit: 0, credit: absDiff, description: `تخفيض قيمة الأصل ${asset.name}` }
          ]
        });
      } catch (jeErr) {
        logger.warn('Revaluation journal entry notice:', jeErr);
      }
    }

    showToast('تمت إعادة تقييم الأصل بنجاح ✅', 'success');
    await refreshAssets(); 
  };
  const addCheque = async (cheque: Partial<Cheque>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase.from('cheques').insert({ ...cheque, organization_id: targetOrgId }); 
    if (error) throw error;
    await refreshBankingAndShift(); 
  };

  const updateCheque = async (id: string, cheque: Partial<Cheque>) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const { error } = await supabase
      .from('cheques')
      .update({
        cheque_number: cheque.cheque_number,
        amount: cheque.amount,
        due_date: cheque.due_date,
        party_id: cheque.party_id,
        party_name: cheque.party_name,
        bank_name: cheque.bank_name,
        notes: cheque.notes
      })
      .eq('id', id)
      .eq('organization_id', targetOrgId);

    if (error) throw error;

    try {
      await supabase.rpc('post_cheque_journal_entry', { p_cheque_id: id });
    } catch (e) {
      logger.warn('post_cheque_journal_entry fallback:', e);
    }

    try {
      await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
    } catch (e) {
      // ignore
    }

    await refreshBankingAndShift();
  };

  const deleteCheque = async (id: string) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    
    // 1. جلب بيانات الشيك والقيود المحاسبية المرتبطة به
    const { data: chq, error: fetchErr } = await supabase
      .from('cheques')
      .select('id, related_journal_entry_id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !chq) {
      throw new Error(fetchErr?.message || 'تعذر العثور على سجل الشيك المطلوب حذفه');
    }
    
    // 2. فك ارتباط القيد المحاسبي بالشيك أولاً لتجنب انتهاك قيود المفاتيح الأجنبية
    if (chq.related_journal_entry_id) {
      await supabase.from('cheques').update({ related_journal_entry_id: null }).eq('id', id);
    }

    // 3. حذف مرفقات الشيك
    await supabase.from('cheque_attachments').delete().eq('cheque_id', id);

    // 4. حذف سجل الشيك الرئيسي أولاً
    let delQuery = supabase.from('cheques').delete().eq('id', id);
    if (targetOrgId) delQuery = delQuery.eq('organization_id', targetOrgId);
    const { error: delError } = await delQuery;

    if (delError) {
      // 🛡️ تراجع فوري: إعادة ربط القيد المحاسبي بالشيك في حال فشل حذف الشيك
      if (chq.related_journal_entry_id) {
        await supabase.from('cheques').update({ related_journal_entry_id: chq.related_journal_entry_id }).eq('id', id);
      }
      throw delError;
    }

    // 5. بعد نجاح حذف الشيك بشكل مؤكد، يتم حذف قيود اليومية المرتبطة بأمان
    if (chq.related_journal_entry_id) {
      await supabase.from('journal_lines').delete().eq('journal_entry_id', chq.related_journal_entry_id);
      await supabase.from('journal_entries').delete().eq('id', chq.related_journal_entry_id);
    }
    
    // حذف أي قيود أخرى مرتبطة بالشيك عن طريق related_document_id
    const { data: relatedEntries } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('related_document_id', id)
      .eq('organization_id', targetOrgId);

    if (relatedEntries && relatedEntries.length > 0) {
      const entryIds = relatedEntries.map(e => e.id);
      await supabase.from('journal_lines').delete().in('journal_entry_id', entryIds);
      await supabase.from('journal_entries').delete().in('id', entryIds);
    }

    // 6. تحديث الأرصدة
    try {
      if (targetOrgId) {
        await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
      }
    } catch (e) {
      // ignore
    }

    await refreshBankingAndShift();
  };
  const updateChequeStatus = async (id: string, status: string, date: string, bankId?: string) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const actionDate = date || new Date().toISOString().split('T')[0];

    // 1. محاولة استدعاء الدالة المباشرة RPC لصرف أو تحصيل الشيك
    if (status === 'cashed' || status === 'collected') {
      try {
        const { data: rpcRes, error: rpcError } = await supabase.rpc('cash_or_collect_cheque', {
          p_cheque_id: id,
          p_status: status,
          p_bank_account_id: bankId || null,
          p_action_date: actionDate,
          p_user_id: currentUser?.id || null
        });
        if (!rpcError && (rpcRes?.success || rpcRes === true)) {
          await refreshBankingAndShift();
          return;
        }
        if (rpcError) {
          logger.warn('RPC cash_or_collect_cheque fallback to manual:', rpcError);
        }
      } catch (rpcErr) {
        logger.warn('RPC cash_or_collect_cheque fallback:', rpcErr);
      }
    }

    // 2. إنشاء القيد المحاسبي المباشر عبر addEntry الآمنة
    let createdEntryRef: string | null = null;
    try {
      const { data: cheque } = await supabase
        .from('cheques')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (cheque && (status === 'cashed' || status === 'collected') && bankId) {
        const notesReceivableAcc = getSystemAccount('NOTES_RECEIVABLE') || accounts.find(a => a.code === '10103' || a.code === '1222' || a.name?.includes('أوراق قبض') || a.name?.includes('قبض'));
        const notesPayableAcc = getSystemAccount('NOTES_PAYABLE') || accounts.find(a => a.code === '20102' || a.code === '222' || a.name?.includes('أوراق دفع') || a.name?.includes('دفع'));
        const amount = Number(cheque.amount) || 0;

        if (amount > 0) {
          let lines: any[] = [];
          let desc = '';
          let ref = '';

          if (cheque.type === 'incoming' || cheque.type === 'in') {
            desc = `تحصيل شيك وارد رقم ${cheque.cheque_number || ''} - إيداع بنكي (${cheque.party_name || ''})`;
            ref = `CHQ-${cheque.cheque_number || id.slice(-8)}-COL`;
            if (notesReceivableAcc?.id) {
              lines = [
                { accountId: bankId, debit: amount, credit: 0, description: desc },
                { accountId: notesReceivableAcc.id, debit: 0, credit: amount, description: desc }
              ];
            }
          } else {
            desc = `صرف شيك صادر رقم ${cheque.cheque_number || ''} - خصم بنكي (${cheque.party_name || ''})`;
            ref = `CHQ-${cheque.cheque_number || id.slice(-8)}-CSH`;
            if (notesPayableAcc?.id) {
              lines = [
                { accountId: notesPayableAcc.id, debit: amount, credit: 0, description: desc },
                { accountId: bankId, debit: 0, credit: amount, description: desc }
              ];
            }
          }

          if (lines.length === 2) {
            // فحص هل القيد مسجل مسبقاً لنفس الشيك والمرجع لمنع التكرار نهائياً
            const { data: existingEntry } = await supabase
              .from('journal_entries')
              .select('id')
              .eq('organization_id', targetOrgId)
              .eq('reference', ref)
              .maybeSingle();

            if (!existingEntry) {
              await addEntry({
                date: actionDate,
                reference: ref,
                description: desc,
                status: 'posted',
                p_org_id: targetOrgId,
                lines: lines
              });
              createdEntryRef = ref;
            }
          }
        }
      }
    } catch (entryErr) {
      logger.warn('Cheque journal entry creation error:', entryErr);
    }

    // 3. التحديث عبر REST مع التراجع الذكي
    const updatePayload: { status: string; current_account_id?: string | null; transfer_date?: string } = { 
      status, 
      transfer_date: actionDate 
    };
    if (bankId !== undefined) {
      updatePayload.current_account_id = bankId;
    }
    
    let { error } = await supabase.from('cheques').update(updatePayload).eq('id', id); 
    if (error) {
      // 🛡️ تراجع تعويضي عن القيد المحاسبي إذا فشل تحديث حالة الشيك
      if (createdEntryRef) {
        try {
          const { data: rbJe } = await supabase.from('journal_entries').select('id').eq('reference', createdEntryRef).maybeSingle();
          if (rbJe) {
            await supabase.from('journal_lines').delete().eq('journal_entry_id', rbJe.id);
            await supabase.from('journal_entries').delete().eq('id', rbJe.id);
          }
        } catch (rbErr) {
          logger.error('Failed to rollback cheque journal entry:', rbErr);
        }
      }

      if (error.message?.includes('current_account_id') || error.code === 'PGRST204' || error.code === '42703') {
        const { error: fallbackError } = await supabase.from('cheques').update({ status }).eq('id', id);
        if (fallbackError) throw fallbackError;
      } else {
        throw error;
      }
    }
    await refreshBankingAndShift(); 
  };     
  const addTransfer = async (transfer: Record<string, any>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const targetUserId = currentUser?.id;
    const { error } = await supabase.rpc('add_treasury_transfer', {
      p_from_account_id: transfer.sourceAccountId,
      p_to_account_id: transfer.destinationAccountId,
      p_amount: transfer.amount,
      p_transfer_date: transfer.date,
      p_notes: transfer.description || '',
      p_org_id: targetOrgId,
      p_user_id: targetUserId
    });
    if (error) throw error;
    await refreshData(); 
  };

  const updateTransfer = async (id: string, transfer: Record<string, any>) => {
    try {
      const { error } = await supabase.rpc('update_treasury_transfer', {
        p_journal_entry_id: id,
        p_from_account_id: transfer.sourceAccountId,
        p_to_account_id: transfer.destinationAccountId,
        p_amount: transfer.amount,
        p_transfer_date: transfer.date,
        p_notes: transfer.description || ''
      });
      
      if (error) {
        // Fallback to direct REST if RPC doesn't exist
        const isFuncMissing = error.code === 'P0001' || 
                              error.message?.includes('function') || 
                              error.message?.includes('does not exist');
        if (isFuncMissing) {
          logger.warn("RPC update_treasury_transfer not found, falling back to direct REST updates");
          const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;

          // Update journal entry
          const { error: entryError } = await supabase.from('journal_entries').update({
            transaction_date: transfer.date,
            description: transfer.description || ''
          }).eq('id', id);
          if (entryError) throw entryError;

          // Delete old journal lines
          const { error: linesDeleteError } = await supabase.from('journal_lines').delete().eq('journal_entry_id', id);
          if (linesDeleteError) throw linesDeleteError;

          // Insert new journal lines
          const { error: linesInsertError } = await supabase.from('journal_lines').insert([
            {
              journal_entry_id: id,
              account_id: transfer.destinationAccountId,
              debit: transfer.amount,
              credit: 0,
              description: 'تحويل وارد: ' + (transfer.description || ''),
              organization_id: targetOrgId
            },
            {
              journal_entry_id: id,
              account_id: transfer.sourceAccountId,
              debit: 0,
              credit: transfer.amount,
              description: 'تحويل صادر: ' + (transfer.description || ''),
              organization_id: targetOrgId
            }
          ]);
          if (linesInsertError) throw linesInsertError;

          // Recalculate balances
          await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
        } else {
          throw error;
        }
      }
      await refreshData();
    } catch (error) {
      logger.error('Error updating transfer:', error);
      showToast('فشل تعديل التحويل المالي: ' + (error?.message || ''), 'error');
      throw error;
    }
  };

  const deleteTransfer = async (id: string) => {
    try {
      const { error } = await supabase.rpc('delete_treasury_transfer', {
        p_journal_entry_id: id
      });
      
      if (error) {
        // Fallback to direct REST if RPC doesn't exist
        const isFuncMissing = error.code === 'P0001' || 
                              error.message?.includes('function') || 
                              error.message?.includes('does not exist');
        if (isFuncMissing) {
          logger.warn("RPC delete_treasury_transfer not found, falling back to direct REST deletion");
          const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;

          // Delete journal lines first
          const { error: linesError } = await supabase.from('journal_lines').delete().eq('journal_entry_id', id);
          if (linesError) throw linesError;

          // Delete journal entry
          const { error: entryError } = await supabase.from('journal_entries').delete().eq('id', id);
          if (entryError) throw entryError;

          // Recalculate balances
          await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
        } else {
          throw error;
        }
      }
      await refreshData();
    } catch (error) {
      logger.error('Error deleting transfer:', error);
      showToast('فشل حذف التحويل المالي: ' + (error?.message || ''), 'error');
      throw error;
    }
  };

  const ALLOWED_RECYCLE_TABLES = ['products', 'customers', 'suppliers', 'assets', 'warehouses', 'employees', 'restaurant_tables'];

  const restoreItem = async (table: string, id: string) => { 
    if (!ALLOWED_RECYCLE_TABLES.includes(table)) {
      return { success: false, message: 'الجدول غير مصرح به لعمليات الاسترجاع' };
    }
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    let query = supabase.from(table).update({ deleted_at: null }).eq('id', id);
    if (targetOrgId) query = query.eq('organization_id', targetOrgId);
    const { error } = await query;
    if (!error && table === 'assets') {
      try {
        const prefix = id.split('-')[0].toUpperCase();
        const shortId = id.slice(0, 6);
        await supabase
          .from('journal_entries')
          .update({ status: 'posted', is_posted: true })
          .eq('organization_id', targetOrgId)
          .or(`related_document_id.eq.${id},reference.ilike.ASSET-${prefix}%,reference.ilike.DEP-${shortId}%`);

        if (targetOrgId) {
          await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
        }
      } catch (e) {
        logger.warn('restoreItem asset repost fallback:', e);
      }
    }
    await refreshData(); 
    return { success: !error, message: error?.message }; 
  };

  const permanentDeleteItem = async (table: string, id: string) => { 
    if (!ALLOWED_RECYCLE_TABLES.includes(table)) {
      return { success: false, message: 'الجدول غير مصرح به لعمليات الحذف النهائي' };
    }
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    if (table === 'assets') {
      try {
        const prefix = id.split('-')[0].toUpperCase();
        const shortId = id.slice(0, 6);

        // 1. العثور على قيود اليومية المرتبطة بالأصل (شراء وإهلاك)
        const { data: entries } = await supabase
          .from('journal_entries')
          .select('id')
          .eq('organization_id', targetOrgId)
          .or(`related_document_id.eq.${id},reference.ilike.ASSET-${prefix}%,reference.ilike.DEP-${shortId}%`);

        if (entries && entries.length > 0) {
          const entryIds = entries.map(e => e.id);
          // أ. إلغاء الترحيل أولاً لتخطي مشغل حماية القيود المرحلة
          await supabase.from('journal_entries').update({ status: 'draft', is_posted: false }).in('id', entryIds);
          // ب. حذف أسطر القيود
          await supabase.from('journal_lines').delete().in('journal_entry_id', entryIds);
          // ج. حذف رؤوس القيود
          await supabase.from('journal_entries').delete().in('id', entryIds);
        }

        // حذف السجلات التابعة
        await supabase.from('asset_audits').delete().eq('asset_id', id);
        await supabase.from('asset_transfers').delete().eq('asset_id', id);

        if (targetOrgId) {
          await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrgId });
        }
      } catch (e) {
        logger.warn('Error purging asset journal entries during permanent delete:', e);
      }
    }

    let delQuery = supabase.from(table).delete().eq('id', id);
    if (targetOrgId) delQuery = delQuery.eq('organization_id', targetOrgId);
    const { error } = await delQuery;
    await refreshData(); 
    return { success: !error, message: error?.message }; 
  };
  const exportJournalToCSV = async () => {
    try {
      const orgId = currentSelectedOrgId || currentUser?.organization_id;
      let query = supabase
        .from('journal_entries')
        .select(`
          id,
          transaction_date,
          reference,
          description,
          status,
          journal_lines (
            debit,
            credit,
            description,
            account_id
          )
        `)
        .order('transaction_date', { ascending: false });

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        showToast('لا توجد قيود لتصديرها.', 'info');
        return;
      }

      const XLSX = await import('xlsx');
      const accountMap = new Map((accounts || []).map((a: Account | Record<string, any>) => [a.id, a]));

      const flatData: any[] = [];
      data.forEach((entry: Record<string, any>) => {
        (entry.journal_lines || []).forEach((line: Record<string, any>) => {
          const acc = accountMap.get(line.account_id);
          flatData.push({
            'التاريخ': entry.transaction_date,
            'رقم القيد': entry.reference,
            'البيان الرئيسي': entry.description,
            'الحالة': entry.status === 'posted' ? 'مرحل' : 'مسودة',
            'كود الحساب': acc?.code || line.account_code || '-',
            'اسم الحساب': acc?.name || '-',
            'مدين': Number(line.debit) || 0,
            'دائن': Number(line.credit) || 0,
            'بيان الحركة': line.description || '-'
          });
        });
      });

      const ws = XLSX.utils.json_to_sheet(flatData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Journal Entries");
      XLSX.writeFile(wb, `General_Journal_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('تم تصدير القيود المحاسبية بنجاح ✅', 'success');
    } catch (err) {
      logger.error('Export CSV error:', err);
      showToast('فشل تصدير القيود: ' + err.message, 'error');
    }
  };

  // HR
  const sanitizeEmployeePayload = (data: Partial<Employee>) => {
    const raw: Record<string, any> = { ...data };
    const payload: Record<string, any> = {};

    // 1. تحويل shift_id الفارغ إلى null لمنع خطأ تحويل UUID في PostgreSQL (invalid input syntax for type uuid: "")
    if (raw.shift_id !== undefined) {
      payload.shift_id = (raw.shift_id && String(raw.shift_id).trim() !== '') ? raw.shift_id : null;
    }

    // 2. التوافق المزدوج للاسم بين full_name و name
    const empName = raw.full_name || raw.name;
    if (empName !== undefined) {
      payload.name = empName;
      payload.full_name = empName;
    }

    // 3. التوافق المزدوج للراتب بين basic_salary و salary
    const salaryVal = raw.basic_salary !== undefined ? raw.basic_salary : raw.salary;
    if (salaryVal !== undefined && salaryVal !== null && salaryVal !== '') {
      const numSal = Number(salaryVal) || 0;
      payload.basic_salary = numSal;
      payload.salary = numSal;
    }

    // 4. الحقول المعتمدة في جدول employees فقط
    if (raw.position !== undefined) payload.position = raw.position || null;
    if (raw.department !== undefined) payload.department = raw.department || null;
    if (raw.phone !== undefined) payload.phone = raw.phone || null;
    if (raw.email !== undefined) payload.email = raw.email || null;
    if (raw.hire_date !== undefined) payload.hire_date = raw.hire_date || null;
    if (raw.notes !== undefined) payload.notes = raw.notes || null;
    if (raw.status !== undefined) payload.status = raw.status || 'active';
    if (raw.hourly_rate !== undefined) payload.hourly_rate = Number(raw.hourly_rate) || 0;
    if (raw.biometric_id !== undefined) payload.biometric_id = raw.biometric_id || null;
    if (raw.shift_id !== undefined) payload.shift_id = (raw.shift_id && typeof raw.shift_id === 'string' && raw.shift_id.trim() !== '') ? raw.shift_id.trim() : null;
    if (raw.organization_id !== undefined) payload.organization_id = raw.organization_id;

    // 5. إدارة الحذف المؤرخ وحالة الموظف (نشط / غير نشط / منتهي)
    if (raw.status !== undefined) {
      if (raw.status === 'active' || raw.status === 'inactive') {
        payload.deleted_at = null;
      } else if (raw.status === 'terminated') {
        payload.deleted_at = raw.deleted_at || new Date().toISOString();
      }
    } else if (raw.deleted_at !== undefined) {
      payload.deleted_at = raw.deleted_at;
    }

    return payload;
  };

  const addEmployee = async (data: Partial<Employee>) => { 
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id;
    const payload = sanitizeEmployeePayload({ ...data, organization_id: targetOrgId } as any);
    const { error } = await supabase.from('employees').insert(payload); 
    if (error) {
      logger.error('Failed to add employee:', error);
      throw error;
    }
    await refreshData(); 
  };

  const updateEmployee = async (id: string, data: Partial<Employee>) => { 
    const payload = sanitizeEmployeePayload(data);
    const { error } = await supabase.from('employees').update(payload).eq('id', id); 
    if (error) {
      logger.error('Failed to update employee:', error);
      throw error;
    }
    await refreshData(); 
  };

  const deleteEmployee = async (id: string, reason?: string) => { 
    const { error } = await supabase.from('employees').update({ 
      status: 'terminated', 
      notes: reason || null,
      deleted_at: new Date().toISOString()
    }).eq('id', id); 
    if (error) {
      logger.error('Failed to delete employee:', error);
      throw error;
    }
    await refreshData(); 
  };
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
      logger.error("Payroll RPC Error:", error);
      throw new Error(error.message || 'حدث خطأ أثناء تنفيذ مسير الرواتب');
    }
    
    await refreshData();
  };

  const runPayrollAccrual = async (month: number, year: number, date: string, data: any[], orgId?: string) => {
    const { data: resData, error } = await supabase.rpc('run_payroll_accrual_rpc', {
      p_month: month,
      p_year: year,
      p_date: date,
      p_items: data,
      p_org_id: orgId || currentSelectedOrgId || null
    });
    
    if (error) {
      logger.error("Payroll Accrual RPC Error:", error);
      throw new Error(error.message || 'حدث خطأ أثناء تنفيذ قيد استحقاق الرواتب');
    }
    
    await refreshData();
    return resData;
  };

  const payAccruedPayroll = async (params: { payrollId?: string; month?: number; year?: number; paymentDate: string; treasuryId: string; orgId?: string }) => {
    const { data: resData, error } = await supabase.rpc('pay_accrued_payroll_rpc', {
      p_payroll_id: params.payrollId || null,
      p_month: params.month || null,
      p_year: params.year || null,
      p_payment_date: params.paymentDate,
      p_treasury_acc: params.treasuryId,
      p_org_id: params.orgId || currentSelectedOrgId || null
    });

    if (error) {
      logger.error("Pay Accrued Payroll RPC Error:", error);
      throw new Error(error.message || 'حدث خطأ أثناء صرف الرواتب وترحيل قيد النقدية');
    }

    await refreshData();
    return resData;
  };

  const cancelPayrollAccrual = async (payrollId: string, orgId?: string) => {
    const targetOrg = orgId || currentSelectedOrgId || null;
    try {
      const { error: rpcError } = await supabase.rpc('cancel_payroll_accrual_rpc', {
        p_payroll_id: payrollId,
        p_org_id: targetOrg
      });

      if (rpcError) {
        logger.warn('cancel_payroll_accrual_rpc notice, applying direct rollback:', rpcError);

        const { data: items } = await supabase.from('payroll_items').select('id').eq('payroll_id', payrollId);
        const itemIds = (items || []).map((i: { id: string }) => i.id);

        if (itemIds.length > 0) {
          await supabase
            .from('employee_advances')
            .update({ status: 'paid', payroll_item_id: null })
            .in('payroll_item_id', itemIds);
        }

        const { data: pData } = await supabase.from('payrolls').select('*').eq('id', payrollId).maybeSingle();
        if (pData) {
          if (pData.accrual_je_id) {
            await supabase.from('journal_lines').delete().eq('journal_entry_id', pData.accrual_je_id);
            await supabase.from('journal_entries').delete().eq('id', pData.accrual_je_id);
          }
          const { data: relJes } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('related_document_id', payrollId)
            .eq('related_document_type', 'payroll');
          if (relJes && relJes.length > 0) {
            const jeIds = relJes.map((j: { id: string }) => j.id);
            await supabase.from('journal_lines').delete().in('journal_entry_id', jeIds);
            await supabase.from('journal_entries').delete().in('id', jeIds);
          }
          await supabase.from('payrolls').delete().eq('id', payrollId);
        }

        if (targetOrg) {
          try {
            await supabase.rpc('recalculate_all_system_balances', { p_org_id: targetOrg });
          } catch (e) {
            // ignore
          }
        }
      }
    } catch (err: unknown) {
      logger.error('Error cancelling payroll accrual:', err);
      const errMsg = err instanceof Error ? err.message : 'فشل إلغاء قيد الاستحقاق';
      throw new Error(errMsg);
    }

    await refreshData();
  };

  // --- Demo Stubs ---
  const addDemoEntry = (e: Partial<JournalEntry> | Record<string, any>) => logger.log('Demo Entry:', e);
  const addDemoPaymentVoucher = (v: Record<string, any>) => logger.log('Demo Payment:', v);
  const addDemoReceiptVoucher = (v: Record<string, any>) => logger.log('Demo Receipt:', v);
  const addDemoInvoice = (i: Partial<Invoice> | Record<string, any>) => logger.log('Demo Invoice:', i);
  const postDemoSalesInvoice = (inv: Partial<Invoice> | Record<string, any>) => logger.log('Demo Post Invoice:', inv);
  const addDemoPurchaseInvoice = (i: Partial<Invoice> | Record<string, any>) => logger.log('Demo Purchase:', i);

  // --- Restaurant Functions ---
  const finalizeProductionOrder = async (id: string, status: string, notes: string) => {
    return await supabase.rpc('mfg_finalize_order', { p_order_id: id, p_final_status: status, p_qc_notes: notes });
  };

  const openTableSession = async (tableId: string) => {
    if (!navigator.onLine || isDemo) {
      const sessionId = 'session-' + Date.now();
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'OCCUPIED', session_id: sessionId } : t));
      setOfflineTableOrder(tableId, { sessionId, orderId: null, items: [] });
      return sessionId;
    }
    try {
      const { data, error } = await supabase.rpc('open_table_session', { p_table_id: tableId });
      if (error) throw error;
      refreshData();
      return data;
    } catch (err) {
      const sessionId = 'session-' + Date.now();
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'OCCUPIED', session_id: sessionId } : t));
      setOfflineTableOrder(tableId, { sessionId, orderId: null, items: [] });
      return sessionId;
    }
  };

  const reserveTable = async (tableId: string, name: string, time: string) => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } } : t));
      return true;
    }
    try {
      const { error } = await supabase.from('restaurant_tables').update({ status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } }).eq('id', tableId);
      if (error) return false;
      refreshData();
      return true;
    } catch {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'RESERVED', reservation_info: { customerName: name, arrivalTime: time } } : t));
      return true;
    }
  };

  const cancelReservation = async (tableId: string) => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', reservation_info: null } : t));
      return;
    }
    try {
      await supabase.from('restaurant_tables').update({ status: 'AVAILABLE', reservation_info: null }).eq('id', tableId);
      refreshData();
    } catch {
      setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', reservation_info: null } : t));
    }
  };

  const transferTableSession = async (sessionId: string, targetTableId: string) => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => {
        if (t.session_id === sessionId) return { ...t, status: 'AVAILABLE', session_id: null };
        if (t.id === targetTableId) return { ...t, status: 'OCCUPIED', session_id: sessionId };
        return t;
      }));
      showToast('تم نقل الطاولة بنجاح (محلياً)', 'success');
      return true;
    }
    try {
      const { error } = await supabase.rpc('transfer_table_session', { p_session_id: sessionId, p_target_table_id: targetTableId });
      if (error) { showToast(error.message, 'error'); return false; }
      refreshData();
      return true;
    } catch {
      return false;
    }
  };

  const mergeTableSessions = async (sourceId: string, targetId: string) => {
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.session_id === sourceId ? { ...t, status: 'AVAILABLE', session_id: null } : t));
      showToast('تم دمج الطاولات بنجاح (محلياً)', 'success');
      return true;
    }
    try {
      const { error } = await supabase.rpc('merge_table_sessions', { p_source_session_id: sourceId, p_target_session_id: targetId });
      if (error) { showToast(error.message, 'error'); return false; }
      refreshData();
      return true;
    } catch {
      return false;
    }
  };

  const createRestaurantOrder = async (payload: Record<string, any>) => {
    const targetOrgId = getEffectiveOrgId();
    
    if (!navigator.onLine || isDemo) {
      const orderId = 'ord-offline-' + Date.now();
      const tableId = payload.p_table_id;
      const matchedTable = tableId ? { id: tableId } : restaurantTables.find(t => t.session_id === payload.p_session_id || t.id === payload.p_table_id);
      const effectiveTableId = matchedTable?.id || tableId;

      if (effectiveTableId) {
        const existing = getOfflineTableOrders()[effectiveTableId] || {};
        const formattedItems = (payload.p_items || []).map((item: Record<string, any>, idx: number) => ({
          id: item.id || ('item-' + Date.now() + '-' + idx),
          productId: item.product_id,
          name: item.name || products.find(p => p.id === item.product_id)?.name || 'صنف',
          quantity: Number(item.quantity || 1),
          unitPrice: Number(item.unit_price || 0),
          unitCost: Number(item.unit_cost || 0),
          notes: item.notes || '',
          selectedModifiers: item.modifiers || [],
          savedQuantity: Number(item.quantity || 1)
        }));
        setOfflineTableOrder(effectiveTableId, {
          sessionId: payload.p_session_id || existing.sessionId || ('session-' + Date.now()),
          orderId,
          warehouseId: payload.p_warehouse_id || 'wh-main',
          items: formattedItems
        });
        setRestaurantTables(prev => prev.map(t => t.id === effectiveTableId ? { ...t, status: 'OCCUPIED' } : t));
      }

      try {
        await offlineService.queueOrder({ ...payload, orderId, organization_id: targetOrgId });
      } catch (e) {
        logger.warn('Offline order queue notice:', e);
      }
      return orderId;
    }

    try {
      const { data, error } = await supabase.rpc('create_restaurant_order', { 
        ...payload, 
        p_warehouse_id: payload.p_warehouse_id || settings?.default_warehouse_id,
        p_org_id: targetOrgId 
      });
      if (error) throw error;
      return data;
    } catch (err) {
      const orderId = 'ord-offline-' + Date.now();
      try {
        await offlineService.queueOrder({ ...payload, orderId, organization_id: targetOrgId });
      } catch (e) {}
      return orderId;
    }
  };

  const getOpenTableOrder = async (tableId: string) => {
    if (!navigator.onLine || isDemo) {
      const offlineOrders = getOfflineTableOrders();
      if (offlineOrders[tableId]) {
        return offlineOrders[tableId];
      }
      return { sessionId: 'session-' + Date.now(), orderId: null, items: [] };
    }

    try {
      const { data } = await supabase.rpc('get_open_table_order', { p_table_id: tableId });
      if (data?.orderId && data?.items && data.items.length > 0) {
        return data;
      }
    } catch (rpcErr) {
      logger.warn('RPC get_open_table_order notice:', rpcErr);
    }

    try {
      const { data: session } = await supabase
        .from('table_sessions')
        .select('id, organization_id')
        .eq('table_id', tableId)
        .eq('status', 'OPEN')
        .is('end_time', null)
        .maybeSingle();

      if (session?.id) {
        const { data: order } = await supabase
          .from('orders')
          .select(`
            id, warehouse_id, status,
            order_items (
              id, product_id, quantity, unit_price, unit_cost, notes, modifiers,
              products (name)
            )
          `)
          .eq('session_id', session.id)
          .neq('status', 'PAID')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (order?.id && order.order_items && order.order_items.length > 0) {
          const formattedItems = order.order_items.map((oi: Record<string, any>) => ({
            id: oi.id,
            productId: oi.product_id,
            name: oi.products?.name || 'صنف',
            quantity: Number(oi.quantity),
            unitPrice: Number(oi.unit_price),
            unitCost: Number(oi.unit_cost),
            notes: oi.notes,
            selectedModifiers: oi.modifiers || [],
            savedQuantity: Number(oi.quantity)
          }));

          return {
            sessionId: session.id,
            orderId: order.id,
            warehouseId: order.warehouse_id,
            items: formattedItems
          };
        }

        return { sessionId: session.id, orderId: null, items: [] };
      }
    } catch (fbErr) {
      logger.warn('Fallback getOpenTableOrder notice:', fbErr);
    }

    const offlineOrders = getOfflineTableOrders();
    return offlineOrders[tableId] || null;
  };

  const completeRestaurantOrder = async (orderId: string, method: string, total: number, accountId: string | null, warehouseId?: string) => {
    if (!navigator.onLine || isDemo || String(orderId).startsWith('ord-offline-')) {
      const offlineOrders = getOfflineTableOrders();
      for (const [tableId, ord] of Object.entries(offlineOrders)) {
        if (ord.orderId === orderId || !orderId) {
          setOfflineTableOrder(tableId, null);
          setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', session_id: null } : t));
          break;
        }
      }
      showToast('تم إتمام الطلب بنجاح (وضع أوفلاين) ✅', 'success');
      return;
    }

    try {
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
    } catch (err) {
      const offlineOrders = getOfflineTableOrders();
      for (const [tableId, ord] of Object.entries(offlineOrders)) {
        if (ord.orderId === orderId) {
          setOfflineTableOrder(tableId, null);
          setRestaurantTables(prev => prev.map(t => t.id === tableId ? { ...t, status: 'AVAILABLE', session_id: null } : t));
          break;
        }
      }
      showToast('تم حفظ العملية محلياً وإتمام السداد بنجاح ✅', 'success');
    }
  };

  const processSplitPayment = async (orderId: string, items: any[], method: string, total: number, accountId: string) => {
    if (!navigator.onLine || isDemo) {
      showToast('تم الدفع الجزئي بنجاح (محلياً)', 'success');
      return true;
    }
    try {
      const { error } = await supabase.rpc('process_split_payment', { p_order_id: orderId, p_items: items, p_payment_method: method, p_amount: total, p_cash_account_id: accountId, p_org_id: currentSelectedOrgId });
      if (error) { 
        logger.error('process_split_payment RPC error:', error);
        showToast(error.message, 'error'); 
        return false; 
      }
      await refreshData();
      return true;
    } catch (err: unknown) {
      logger.error('processSplitPayment exception:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast('فشل معالجة الدفع الجزئي: ' + errMsg, 'error');
      return false;
    }
  };

  const addRestaurantTable = async (data: Record<string, any>) => { 
    const targetOrgId = getEffectiveOrgId();
    if (!navigator.onLine || isDemo) {
      const newT = { ...data, id: 'tbl-' + Date.now(), organization_id: targetOrgId, status: data.status || 'AVAILABLE' };
      setRestaurantTables(prev => [...prev, newT]);
      showToast('تمت إضافة الطاولة بنجاح (محلياً)', 'success');
      return;
    }
    try {
      const { error } = await supabase.from('restaurant_tables').insert({ ...data, organization_id: targetOrgId }); 
      if (error) throw error;
      await refreshData(); 
    } catch (err) {
      const newT = { ...data, id: 'tbl-' + Date.now(), organization_id: targetOrgId, status: data.status || 'AVAILABLE' };
      setRestaurantTables(prev => [...prev, newT]);
      showToast('تمت إضافة الطاولة بنجاح (محلياً)', 'success');
    }
  };
  const updateRestaurantTable = async (id: string, data: Record<string, any>) => { 
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
      showToast('تم تحديث بيانات الطاولة بنجاح', 'success');
      return;
    }
    try {
      await supabase.from('restaurant_tables').update(data).eq('id', id); 
      refreshData(); 
    } catch {
      setRestaurantTables(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
    }
  };
  const deleteRestaurantTable = async (id: string) => { 
    if (!navigator.onLine || isDemo) {
      setRestaurantTables(prev => prev.filter(t => t.id !== id));
      showToast('تم حذف الطاولة بنجاح', 'success');
      return;
    }
    try {
      await supabase.from('restaurant_tables').delete().eq('id', id); 
      refreshData(); 
    } catch {
      setRestaurantTables(prev => prev.filter(t => t.id !== id));
    }
  };
  
  const updateKitchenOrderStatus = async (id: string, status: string) => {
    if (!navigator.onLine || isDemo) return;
    try {
      await supabase.from('kitchen_orders').update({ status }).eq('id', id);
    } catch (e) {}
  };

  const startShift = async (amount: number) => { 
    const targetOrgId = getEffectiveOrgId();
    const treasuryAcc = getSystemAccount('CASH');

    if (!navigator.onLine || isDemo) {
      const newShift = {
        id: 'shift-offline-' + Date.now(),
        shift_number: 'SHIFT-' + Math.floor(1000 + Math.random() * 9000),
        user_id: currentUser?.id || authUser?.id || 'demo-user',
        cashier_id: currentUser?.id || authUser?.id || 'demo-user',
        opening_balance: Number(amount) || 0,
        status: 'OPEN',
        start_time: new Date().toISOString(),
        organization_id: targetOrgId
      };
      setCurrentShift(newShift);
      try {
        secureStorage.setItem('tripro_offline_current_shift', newShift);
      } catch (e) {}
      showToast('تم بدء وردية الكاشير بنجاح (محلياً) ✅', 'success');
      return;
    }

    try {
      const { error } = await supabase.rpc('start_pos_shift', { 
        p_opening_balance: Number(amount) || 0,
        p_resume_existing: false,
        p_treasury_account_id: (treasuryAcc?.id && isValidUUID(treasuryAcc.id)) ? treasuryAcc.id : null,
        p_user_id: (currentUser?.id && isValidUUID(currentUser.id)) ? currentUser.id : null,
        p_org_id: (targetOrgId && isValidUUID(targetOrgId)) ? targetOrgId : null,
        p_terminal_id: null
      }); 
      if (error) throw error;
      await refreshData(); 
    } catch (err) {
      const newShift = {
        id: 'shift-offline-' + Date.now(),
        shift_number: 'SHIFT-' + Math.floor(1000 + Math.random() * 9000),
        user_id: currentUser?.id || authUser?.id || 'demo-user',
        cashier_id: currentUser?.id || authUser?.id || 'demo-user',
        opening_balance: Number(amount) || 0,
        status: 'OPEN',
        start_time: new Date().toISOString(),
        organization_id: targetOrgId
      };
      setCurrentShift(newShift);
      showToast('تم بدء الوردية محلياً (وضع أوفلاين) ✅', 'success');
    }
  };

  const closeCurrentShift = async (actualCash: number, notes: string, reconciliation?: ShiftReconciliationData | null) => { 
    const shiftId = Array.isArray(currentShift) ? currentShift[0]?.id : currentShift?.id;
    if (!navigator.onLine || isDemo || !isValidUUID(shiftId)) {
      setCurrentShift(null);
      try {
        secureStorage.removeItem('tripro_offline_current_shift');
        localStorage.removeItem('tripro_offline_current_shift');
      } catch (e) {}
      showToast('تم إغلاق الوردية محلياً بنجاح 🔒', 'success');
      return;
    }
    if (!shiftId) {
      throw new Error('لا توجد وردية مفتوحة حالياً ليتم إغلاقها');
    }
    try {
      const effectiveOrgId = (currentSelectedOrgId && isValidUUID(currentSelectedOrgId))
        ? currentSelectedOrgId
        : ((currentUser?.organization_id && isValidUUID(currentUser.organization_id)) ? currentUser.organization_id : null);
      const { error } = await supabase.rpc('close_shift', { 
        p_shift_id: shiftId, 
        p_actual_cash: actualCash, 
        p_notes: notes,
        p_org_id: effectiveOrgId,
        p_reconciliation: reconciliation || null
      }); 
      if (error) throw error;
      setCurrentShift(null);
    } catch (err) {
      setCurrentShift(null);
      showToast('تم إغلاق الوردية محلياً 🔒', 'success');
    }
  };

  const getCurrentShiftSummary = async () => { 
    const shiftId = Array.isArray(currentShift) ? currentShift[0]?.id : currentShift?.id;
    if (!shiftId) return null; 
    if (!navigator.onLine || isDemo || !isValidUUID(shiftId) || String(shiftId).startsWith('shift-offline-')) {
      return {
        opening_balance: Number(currentShift?.opening_balance || 0),
        total_sales: 0,
        cash_sales: 0,
        card_sales: 0,
        order_count: 0
      };
    }
    try {
      const { data, error } = await supabase.rpc('get_shift_summary', { p_shift_id: shiftId }); 
      if (error) throw error;
      return data; 
    } catch (err) {
      return {
        opening_balance: Number(currentShift?.opening_balance || 0),
        total_sales: 0,
        cash_sales: 0,
        card_sales: 0,
        order_count: 0
      };
    }
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
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id || '';
    const res = await closeFinancialYearEngine({ supabase, year, closingDate: date, targetOrgId });
    if (res.success) {
      showToast(res.message, 'success');
      await refreshData();
      return true;
    } else {
      showToast(res.message, 'error');
      return false;
    }
  };

  const reopenFinancialYear = async (year: number) => {
    const targetOrgId = currentSelectedOrgId || currentUser?.organization_id || '';
    const res = await reopenFinancialYearEngine({ supabase, year, targetOrgId });
    if (res.success) {
      showToast(res.message, 'success');
      await refreshData();
      return true;
    } else {
      showToast(res.message, 'error');
      return false;
    }
  };
  const exportData = async () => {
    try {
      const exportPayload = {
        exported_at: new Date().toISOString(),
        organization_id: effectiveOrgId,
        organization_name: organization?.name || 'TriPro Organization',
        settings,
        accounts: accounts.map(a => ({ code: a.code, name: a.name, type: a.type, balance: a.balance })),
        customers: customers.map((c: { id: string; name: string; phone?: string; balance?: number }) => ({ id: c.id, name: c.name, phone: c.phone, balance: c.balance })),
        suppliers: suppliers.map((s: { id: string; name: string; phone?: string; balance?: number }) => ({ id: s.id, name: s.name, phone: s.phone, balance: s.balance })),
        products: products.map((p: { id: string; name: string; sku?: string; price?: number; stock?: number }) => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, stock: p.stock })),
      };
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const jsonStr = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tripro_backup_${effectiveOrgId || 'org'}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      logActivity('تصدير بيانات', 'تم تصدير نسخة احتياطية من بيانات المنظمة بصيغة JSON');
      showToast('تم تصدير نسخة احتياطية من البيانات بنجاح ✅', 'success');
    } catch (err: unknown) {
      logger.error('Failed to export data:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      showToast('فشل تصدير البيانات: ' + errMsg, 'error');
    }
  };

  const deleteOrganization = useCallback(async (orgId: string) => {
    const res = await deleteOrganizationSafe({ supabase, orgId, currentUser });
    if (res.success) {
      showToast('تم حذف الشركة وجميع بياناتها بنجاح ✅', 'success');
      await refreshData();
      return { success: true };
    } else {
      if (res.message && res.message !== 'تم إلغاء عملية الحذف.') {
        showToast(res.message, 'error');
      }
      return { success: false, message: res.message };
    }
  }, [currentUser, showToast, refreshData]);

  const value: AccountingContextType = useMemo(() => ({
    organization, currentUser, organizations, currentSelectedOrgId, setCurrentSelectedOrgId, effectiveOrgId, getEffectiveOrgId, isLoading, lastUpdated, settings, accounts, entries, assets, budgets, vouchers, costCenters, getFinancialSummary,
    fetchEntriesPaged, employees, products, transfers, purchaseInvoices, invoices, salespeople, categories,
    users, warehouses, restaurantTables, menuCategories, customers, suppliers, cheques,
    currentShift, activityLog, logActivity, refreshData, refreshBankingAndShift, refreshCustomers, refreshSuppliers, isDemo, can, clearCache,
    // Accounting Functions
    addEntry, getSystemAccount, updateVoucher, getAccountBalanceInPeriod, addAccount, updateAccount, deleteAccount, clearTransactions, emptyRecycleBin, saveBudget,
    // Inventory Functions
    recalculateStock, addProduct, updateProduct, deleteProduct, addStockTransfer,
    approveStockTransfer, cancelStockTransfer, addWarehouse, updateWarehouse,
    deleteWarehouse, addWastage, produceItem,
    // Sales & Purchases
    addCustomer, updateCustomer, deleteCustomer, addSupplier, updateSupplier,
    deleteSupplier, approveInvoice, unpostSalesInvoice, deleteSalesInvoice, approvePurchaseInvoice, unpostPurchaseInvoice, deletePurchaseInvoice, convertPoToInvoice,
    addOpeningBalanceTransaction, addPaymentVoucher,
    // Assets & Cheques
    addAsset, updateAsset, deleteAsset, runDepreciation, revaluateAsset, addCheque, updateCheque, deleteCheque, updateChequeStatus, addTransfer, updateTransfer, deleteTransfer,
    restoreItem, permanentDeleteItem, exportJournalToCSV,
    // HR
    addEmployee, updateEmployee, deleteEmployee, runPayroll, runPayrollAccrual, payAccruedPayroll, cancelPayrollAccrual,
    // Restaurant
    finalizeProductionOrder, openTableSession, reserveTable, cancelReservation,
    transferTableSession, mergeTableSessions, createRestaurantOrder, getOpenTableOrder,
    completeRestaurantOrder, processSplitPayment, addRestaurantTable, updateRestaurantTable,
    deleteRestaurantTable, updateKitchenOrderStatus, startShift, closeCurrentShift,
    getCurrentShiftSummary, createMissingSystemAccounts, recalculateAllBalances,
    purgeDeletedRecords, refreshSaasSchema, closeFinancialYear, reopenFinancialYear, exportData,
    selectedFiscalYear, setSelectedFiscalYear, fiscalYearRange,
    // Demo
    addDemoEntry, addDemoPaymentVoucher, addDemoReceiptVoucher, addDemoInvoice,
    deleteOrganization,
    postDemoSalesInvoice, addDemoPurchaseInvoice
  }), [
    organization, currentUser, organizations, currentSelectedOrgId, effectiveOrgId, getEffectiveOrgId, isLoading, lastUpdated, settings, accounts, entries, assets, budgets, vouchers, costCenters, getFinancialSummary,
    fetchEntriesPaged, employees, products, transfers, purchaseInvoices, invoices, salespeople, categories,
    users, warehouses, restaurantTables, menuCategories, customers, suppliers, cheques,
    currentShift, activityLog, logActivity, refreshData, refreshBankingAndShift, refreshCustomers, refreshSuppliers, isDemo, can, clearCache,
    addEntry, getSystemAccount, updateVoucher, getAccountBalanceInPeriod, addAccount, updateAccount, deleteAccount, clearTransactions, emptyRecycleBin, saveBudget,
    recalculateStock, addProduct, updateProduct, deleteProduct, addStockTransfer,
    approveStockTransfer, cancelStockTransfer, addWarehouse, updateWarehouse,
    deleteWarehouse, addWastage, produceItem,
    addCustomer, updateCustomer, deleteCustomer, addSupplier, updateSupplier,
    deleteSupplier, approveInvoice, unpostSalesInvoice, deleteSalesInvoice, approvePurchaseInvoice, unpostPurchaseInvoice, deletePurchaseInvoice, convertPoToInvoice,
    addOpeningBalanceTransaction, addPaymentVoucher,
    addAsset, updateAsset, deleteAsset, runDepreciation, revaluateAsset, addCheque, updateCheque, deleteCheque, updateChequeStatus, addTransfer, updateTransfer, deleteTransfer,
    restoreItem, permanentDeleteItem, exportJournalToCSV,
    addEmployee, updateEmployee, deleteEmployee, runPayroll, runPayrollAccrual, payAccruedPayroll, cancelPayrollAccrual,
    finalizeProductionOrder, openTableSession, reserveTable, cancelReservation,
    transferTableSession, mergeTableSessions, createRestaurantOrder, getOpenTableOrder,
    completeRestaurantOrder, processSplitPayment, addRestaurantTable, updateRestaurantTable,
    deleteRestaurantTable, updateKitchenOrderStatus, startShift, closeCurrentShift,
    getCurrentShiftSummary, createMissingSystemAccounts, recalculateAllBalances,
    purgeDeletedRecords, refreshSaasSchema, closeFinancialYear, reopenFinancialYear, exportData,
    selectedFiscalYear, fiscalYearRange,
    addDemoEntry, addDemoPaymentVoucher, addDemoReceiptVoucher, addDemoInvoice,
    deleteOrganization,
    postDemoSalesInvoice, addDemoPurchaseInvoice
  ]);

  return (
    <SettingsProvider
      orgId={effectiveOrgId}
      currentUser={currentUser}
      can={can}
      logActivity={logActivity}
      showToast={showToast}
      isDemo={isDemo}
      initialOrganization={organization}
      initialSettings={settings}
    >
      <CustomerProvider
        orgId={effectiveOrgId}
        currentUser={currentUser}
        logActivity={logActivity}
        isDemo={isDemo}
        initialCustomers={customers}
      >
        <SupplierProvider
          orgId={effectiveOrgId}
          currentUser={currentUser}
          logActivity={logActivity}
          showToast={showToast}
          isDemo={isDemo}
          initialSuppliers={suppliers}
          initialPurchaseInvoices={purchaseInvoices}
        >
          <ProductProvider
            orgId={effectiveOrgId}
            currentUser={currentUser}
            logActivity={logActivity}
            showToast={showToast}
            isDemo={isDemo}
            initialProducts={products}
            initialWarehouses={warehouses}
            initialCategories={categories}
            initialTransfers={transfers}
          >
            <SalesProvider
              orgId={effectiveOrgId}
              currentUser={currentUser}
              logActivity={logActivity}
              showToast={showToast}
              isDemo={isDemo}
              initialInvoices={invoices}
              initialCustomers={customers}
              initialSalespeople={salespeople}
              fiscalYearRange={fiscalYearRange}
            >
              <BankingProvider
                orgId={effectiveOrgId}
                currentUser={currentUser}
                logActivity={logActivity}
                showToast={showToast}
                isDemo={isDemo}
                initialCheques={cheques}
                initialVouchers={vouchers}
              >
                <GeneralLedgerProvider
                  orgId={effectiveOrgId}
                  currentUser={currentUser}
                  settings={settings}
                  logActivity={logActivity}
                  showToast={showToast}
                  isDemo={isDemo}
                  initialEntries={entries}
                  initialAccounts={accounts}
                  initialCostCenters={costCenters}
                  initialBudgets={budgets}
                  initialYear={selectedFiscalYear}
                  fiscalYearRange={fiscalYearRange}
                >
                  <HrProvider
                    orgId={effectiveOrgId}
                    currentUser={currentUser}
                    logActivity={logActivity}
                    showToast={showToast}
                    isDemo={isDemo}
                    initialEmployees={employees}
                  >
                    <RestaurantProvider
                      orgId={effectiveOrgId}
                      currentUser={currentUser}
                      logActivity={logActivity}
                      showToast={showToast}
                      isDemo={isDemo}
                      initialTables={restaurantTables}
                      initialShift={currentShift}
                      products={products}
                      defaultWarehouseId={settings?.default_warehouse_id}
                      getSystemAccount={getSystemAccount}
                      refreshData={refreshData}
                    >
                      <AccountingFacadeBridge coreValue={value}>
                        {children}
                      </AccountingFacadeBridge>
                    </RestaurantProvider>
                  </HrProvider>
                </GeneralLedgerProvider>
              </BankingProvider>
            </SalesProvider>
          </ProductProvider>
        </SupplierProvider>
      </CustomerProvider>
    </SettingsProvider>
  );
};

const AccountingFacadeBridge: React.FC<{
  coreValue: AccountingContextType;
  children: React.ReactNode;
}> = ({ coreValue, children }) => {
  const customerDomain = useCustomerDomain();
  const supplierDomain = useSupplierDomain();
  const productDomain = useProductDomain();
  const salesDomain = useSalesDomain();
  const bankingDomain = useBankingDomain();
  const glDomain = useGeneralLedgerDomain();
  const settingsDomain = useSettingsDomain();
  const hrDomain = useHrDomain();
  const restaurantDomain = useRestaurantDomain();

  const domainsRef = useRef({
    coreValue,
    customerDomain,
    supplierDomain,
    productDomain,
    salesDomain,
    bankingDomain,
    glDomain,
    settingsDomain,
    hrDomain,
    restaurantDomain
  });
  domainsRef.current = {
    coreValue,
    customerDomain,
    supplierDomain,
    productDomain,
    salesDomain,
    bankingDomain,
    glDomain,
    settingsDomain,
    hrDomain,
    restaurantDomain
  };

  const handleRefreshData = useCallback(async () => {
    const d = domainsRef.current;
    await Promise.all([
      d.coreValue.refreshData(),
      d.customerDomain.refreshCustomers ? d.customerDomain.refreshCustomers() : Promise.resolve(),
      d.supplierDomain.refreshSuppliers ? d.supplierDomain.refreshSuppliers() : Promise.resolve(),
      d.supplierDomain.refreshPurchaseInvoices ? d.supplierDomain.refreshPurchaseInvoices() : Promise.resolve(),
      d.productDomain.refreshProducts ? d.productDomain.refreshProducts() : Promise.resolve(),
      d.productDomain.refreshWarehouses ? d.productDomain.refreshWarehouses() : Promise.resolve(),
      d.productDomain.refreshCategories ? d.productDomain.refreshCategories() : Promise.resolve(),
      d.productDomain.refreshTransfers ? d.productDomain.refreshTransfers() : Promise.resolve(),
      d.salesDomain.refreshSales ? d.salesDomain.refreshSales() : Promise.resolve(),
      d.bankingDomain.refreshBanking ? d.bankingDomain.refreshBanking() : Promise.resolve(),
      d.glDomain.refreshLedger ? d.glDomain.refreshLedger() : Promise.resolve(),
      d.settingsDomain.refreshSettings ? d.settingsDomain.refreshSettings() : Promise.resolve(),
      d.hrDomain.refreshEmployees ? d.hrDomain.refreshEmployees() : Promise.resolve(),
      d.restaurantDomain.refreshRestaurant ? d.restaurantDomain.refreshRestaurant() : Promise.resolve(),
      d.restaurantDomain.refreshShift ? d.restaurantDomain.refreshShift() : Promise.resolve(),
    ]);
  }, []);

  const handleRefreshSalesAndPurchases = useCallback(async () => {
    const d = domainsRef.current;
    await Promise.all([
      d.salesDomain.refreshSales ? d.salesDomain.refreshSales() : Promise.resolve(),
      d.supplierDomain.refreshPurchaseInvoices ? d.supplierDomain.refreshPurchaseInvoices() : Promise.resolve(),
    ]);
  }, []);

  const handleRefreshBankingAndShift = useCallback(async () => {
    const d = domainsRef.current;
    await Promise.all([
      d.bankingDomain.refreshBanking ? d.bankingDomain.refreshBanking() : Promise.resolve(),
      d.restaurantDomain.refreshShift ? d.restaurantDomain.refreshShift() : Promise.resolve(),
      d.coreValue.refreshBankingAndShift ? d.coreValue.refreshBankingAndShift() : Promise.resolve(),
    ]);
  }, []);

  const facadeValue: AccountingContextType = useMemo(() => ({
    ...coreValue,
    // Settings Domain Delegation
    settings: settingsDomain.settings,
    organization: settingsDomain.organization || coreValue.organization,
    can: settingsDomain.can,
    updateSettings: settingsDomain.updateSettings,
    refreshSettings: settingsDomain.refreshSettings,
    // Customer Domain Delegation
    customers: customerDomain.customers,
    addCustomer: customerDomain.addCustomer as (data: Partial<Customer>) => Promise<any>,
    updateCustomer: customerDomain.updateCustomer,
    deleteCustomer: customerDomain.deleteCustomer,
    refreshCustomers: customerDomain.refreshCustomers,
    // Supplier Domain Delegation
    suppliers: supplierDomain.suppliers,
    purchaseInvoices: supplierDomain.purchaseInvoices,
    addSupplier: supplierDomain.addSupplier as (data: Partial<Supplier>) => Promise<any>,
    updateSupplier: supplierDomain.updateSupplier,
    deleteSupplier: supplierDomain.deleteSupplier,
    approvePurchaseInvoice: supplierDomain.approvePurchaseInvoice,
    unpostPurchaseInvoice: supplierDomain.unpostPurchaseInvoice,
    deletePurchaseInvoice: supplierDomain.deletePurchaseInvoice,
    convertPoToInvoice: supplierDomain.convertPoToInvoice,
    refreshSuppliers: supplierDomain.refreshSuppliers,
    // Product & Inventory Domain Delegation
    products: productDomain.products,
    warehouses: productDomain.warehouses,
    categories: productDomain.categories,
    menuCategories: productDomain.categories,
    transfers: productDomain.transfers,
    recalculateStock: productDomain.recalculateStock,
    addProduct: productDomain.addProduct as (data: Partial<Product>) => Promise<any>,
    updateProduct: productDomain.updateProduct,
    deleteProduct: productDomain.deleteProduct,
    addStockTransfer: productDomain.addStockTransfer,
    approveStockTransfer: productDomain.approveStockTransfer,
    cancelStockTransfer: productDomain.cancelStockTransfer,
    addWarehouse: productDomain.addWarehouse,
    updateWarehouse: productDomain.updateWarehouse,
    deleteWarehouse: productDomain.deleteWarehouse,
    addWastage: productDomain.addWastage,
    produceItem: productDomain.produceItem,
    // Sales Domain Delegation
    invoices: salesDomain.invoices,
    salespeople: salesDomain.salespeople,
    approveInvoice: salesDomain.approveInvoice,
    unpostSalesInvoice: salesDomain.unpostSalesInvoice,
    deleteSalesInvoice: salesDomain.deleteSalesInvoice,
    refreshSalesAndPurchases: handleRefreshSalesAndPurchases,
    // Banking & Treasury Domain Delegation
    cheques: bankingDomain.cheques,
    vouchers: bankingDomain.vouchers,
    addCheque: bankingDomain.addCheque,
    updateCheque: bankingDomain.updateCheque,
    deleteCheque: bankingDomain.deleteCheque,
    updateChequeStatus: bankingDomain.updateChequeStatus,
    refreshBanking: bankingDomain.refreshBanking,
    refreshBankingAndShift: handleRefreshBankingAndShift,
    // General Ledger Domain Delegation
    entries: glDomain.entries,
    accounts: glDomain.accounts,
    costCenters: glDomain.costCenters,
    budgets: glDomain.budgets,
    fiscalYearRange: glDomain.fiscalYearRange,
    selectedFiscalYear: glDomain.selectedFiscalYear,
    setSelectedFiscalYear: glDomain.setSelectedFiscalYear,
    addEntry: glDomain.addEntry,
    fetchEntriesPaged: glDomain.fetchEntriesPaged,
    getAccountBalanceInPeriod: glDomain.getAccountBalanceInPeriod,
    addAccount: glDomain.addAccount,
    updateAccount: glDomain.updateAccount,
    deleteAccount: glDomain.deleteAccount,
    getSystemAccount: glDomain.getSystemAccount,
    saveBudget: glDomain.saveBudget,
    exportJournalToCSV: glDomain.exportJournalToCSV,
    closeFinancialYear: glDomain.closeFinancialYear,
    reopenFinancialYear: glDomain.reopenFinancialYear,
    recalculateAllBalances: glDomain.recalculateAllBalances,
    refreshAccountsAndLedger: glDomain.refreshLedger,
    refreshLedger: glDomain.refreshLedger,
    // HR Domain Delegation
    employees: hrDomain.employees,
    addEmployee: hrDomain.addEmployee,
    updateEmployee: hrDomain.updateEmployee,
    deleteEmployee: hrDomain.deleteEmployee,
    runPayroll: hrDomain.runPayroll,
    runPayrollAccrual: hrDomain.runPayrollAccrual,
    payAccruedPayroll: hrDomain.payAccruedPayroll,
    cancelPayrollAccrual: hrDomain.cancelPayrollAccrual,
    refreshEmployees: hrDomain.refreshEmployees,
    // Restaurant & POS Shift Domain Delegation
    restaurantTables: restaurantDomain.restaurantTables,
    currentShift: restaurantDomain.currentShift,
    openTableSession: restaurantDomain.openTableSession,
    reserveTable: restaurantDomain.reserveTable,
    cancelReservation: restaurantDomain.cancelReservation,
    transferTableSession: restaurantDomain.transferTableSession,
    mergeTableSessions: restaurantDomain.mergeTableSessions,
    createRestaurantOrder: restaurantDomain.createRestaurantOrder,
    getOpenTableOrder: restaurantDomain.getOpenTableOrder,
    completeRestaurantOrder: restaurantDomain.completeRestaurantOrder,
    processSplitPayment: restaurantDomain.processSplitPayment,
    addRestaurantTable: restaurantDomain.addRestaurantTable,
    updateRestaurantTable: restaurantDomain.updateRestaurantTable,
    deleteRestaurantTable: restaurantDomain.deleteRestaurantTable,
    updateKitchenOrderStatus: restaurantDomain.updateKitchenOrderStatus,
    startShift: restaurantDomain.startShift,
    closeCurrentShift: restaurantDomain.closeCurrentShift,
    getCurrentShiftSummary: restaurantDomain.getCurrentShiftSummary,
    finalizeProductionOrder: restaurantDomain.finalizeProductionOrder,
    refreshData: handleRefreshData
  }), [
    coreValue,
    customerDomain,
    supplierDomain,
    productDomain,
    salesDomain,
    bankingDomain,
    glDomain,
    settingsDomain,
    hrDomain,
    restaurantDomain,
    handleRefreshData,
    handleRefreshSalesAndPurchases,
    handleRefreshBankingAndShift
  ]);

  return (
    <AccountingContext.Provider value={facadeValue}>
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
let supabaseKey = import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// تنظيف القيم وتصحيح الرابط تلقائياً
if (supabaseUrl) {
  supabaseUrl = supabaseUrl.replace(/["']/g, "").trim();
  
  // معالجة إذا تم لصق رابط لوحة التحكم بدلاً من رابط الـ API
  // https://supabase.com/dashboard/project/abcdefgh... -> https://abcdefgh....supabase.co
  const dashboardMatch = supabaseUrl.match(/supabase\.com\/dashboard\/project\/([a-zA-Z0-9_-]+)/i);
  if (dashboardMatch) {
    supabaseUrl = `https://${dashboardMatch[1]}.supabase.co`;
  }
  
  // إزالة أي شرطات مائلة في النهاية أو مسارات مضافة بالخطأ
  supabaseUrl = supabaseUrl.replace(/\/+$/, "");
  supabaseUrl = supabaseUrl.replace(/\/(rest|auth)\/v1\/?$/i, "");
  
  // التأكد من البروتوكول
  if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
    supabaseUrl = `https://${supabaseUrl}`;
  }
}

if (supabaseKey) supabaseKey = supabaseKey.replace(/["']/g, "").trim();

// التأكد من وجود المفاتيح قبل إنشاء الاتصال
if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase URL and Key must be defined in the .env file");
}

// ✅ كشف بيئة Electron لتعطيل الميزات غير المدعومة
const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron');

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // ✅ في Electron لا نستخدم detectSessionInUrl ولا LockManager
    detectSessionInUrl: !isElectron,
    // ✅ إصلاح خطأ "LockManager null lock" في Electron
    lock: isElectron
      ? async <R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
          // Electron لا يدعم Web Locks API — نشغّل الدالة مباشرة بدون lock
          return await fn();
        }
      : undefined,
  }
});

export { supabaseUrl };
```

