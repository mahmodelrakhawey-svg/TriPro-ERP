-- ==============================================================================
-- 🛡️ TriPro ERP — Baseline: Mark All Existing 136 Migrations As Applied
-- لا يحتوي هذا السكريبت على أي أوامر DDL أو تعديل بيانات على الإطلاق
-- مجرد تسجيل أسماء الملفات الـ 136 الحالية في جدول _schema_migrations
-- ==============================================================================

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-07_fix_hims_dispense_prescription', '2026-09-07_fix_hims_dispense_prescription.sql', 'a3b3d0444297f104e6aa8bee1e3007f631402893f29f72a647ee8ea748ee0f73', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-10_add_supplier_to_products', '2026-09-10_add_supplier_to_products.sql', '22e5c48e1e007e355eea657f037cf2ad905239259d7d4c01235e5538e0ad7769', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-12_enterprise_pessimistic_stock_locking', '2026-09-12_enterprise_pessimistic_stock_locking.sql', 'f24776c33567405f3f02b813e20c7e8c6f2b8a1b5123d8669a06c378990f8c87', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-13_bakery_roles_and_permissions', '2026-09-13_bakery_roles_and_permissions.sql', 'a2b510141a70d3fc53b31c226db21d131d200e429c0a8f6e49c9569bb7cac950', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-13_cleanup_lenza_database_orphan_users', '2026-09-13_cleanup_lenza_database_orphan_users.sql', 'c3bb0a0b44501cd091349724854dc315a6f2e169ee585e3583433c9161481300', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-13_cleanup_notifications_bloat', '2026-09-13_cleanup_notifications_bloat.sql', '6c7554c138c7f59ee763e09a564b5463ba4be20b032b6bd3aae881746404db62', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-13_fix_fn_delete_organization_safe', '2026-09-13_fix_fn_delete_organization_safe.sql', 'fdd870c32b8ca3da8232b89698677a0d395aa9e43e02d75fbb93f21d2a57c5e8', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-13_fix_unprotected_tables_and_views', '2026-09-13_fix_unprotected_tables_and_views.sql', 'a3a2d86cd0a47f1b4a018ad066a287e84276fefddd61c506c6da068a035e8c1f', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-13_fix_views_and_tables_security', '2026-09-13_fix_views_and_tables_security.sql', '9ab83fc481c0941662c5e0494fcf6bc2c936990c8f952e9c4e3d1aeeec263c74', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-13_import_factory_employees', '2026-09-13_import_factory_employees.sql', '57c652c86c165326dd49913cbe61bb55e4559b4778e585ddfd1973a241bd2142', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-13_provision_hr_role', '2026-09-13_provision_hr_role.sql', '486fe1cefee18e645c34113f5784ad94e74c4ca6d0d2e79beb49a64644cf66bc', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-13_security_hardening_rls_and_permissions', '2026-09-13_security_hardening_rls_and_permissions.sql', 'f584737f750d3ab9b62e66a5abe36738b127fad70e2388f9214e94ac88354afa', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-13_support_intermediate_products', '2026-09-13_support_intermediate_products.sql', 'f78271aa45180f115dd6a860be407c83612c1dce4f1abbb849cc7140c90021bc', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-15_direct_user_permissions', '2026-09-15_direct_user_permissions.sql', '81bd28cc70447a49ea6e8f3504c118f545fe9783e0e70bc0a9212ad69ab61325', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-15_hr_supervisory_scope', '2026-09-15_hr_supervisory_scope.sql', 'eef8b09aaf49752a9d97214392d00a180fdd7a3864ddb526c07d1513f083cf26', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-16_cleanup_orphaned_organizations_data', '2026-09-16_cleanup_orphaned_organizations_data.sql', '2b3124241d73f4f77ef6b56298d85d4e0c3dbff763facffd6989137fab0cc8ad', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-16_daily_backup_3am_keep_2_versions', '2026-09-16_daily_backup_3am_keep_2_versions.sql', 'c7214f0e3fc1cebbd20b4a7c2147585e50b4d6b79e78a8247d439a7195aefc25', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-16_eta_einvoicing_enhancements', '2026-09-16_eta_einvoicing_enhancements.sql', '0d2a4a8f8654c8acba34e67504c0e0b0cbb364f67287b3426cb084f6d41ab9a2', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-16_fix_effective_permissions_view_security', '2026-09-16_fix_effective_permissions_view_security.sql', 'f4fbeaece386afc44b0308236e223a24c96ebcba765ea1c2fd3d27e7e6be3711', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-16_offline_pos_sync_and_conflict_engine', '2026-09-16_offline_pos_sync_and_conflict_engine.sql', '023cbee0cc4553735af3472d3a894b09f43ed6896a7f55d4f49c514988d380e6', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-16_offsite_s3_backup', '2026-09-16_offsite_s3_backup.sql', 'cf2a0a0ef9f1973180b232ba398afc34e6307405a21d5c18963c9f0db7959c5c', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-17_fix_customer_and_supplier_balances_rpc', '2026-09-17_fix_customer_and_supplier_balances_rpc.sql', '5693b90d03b96a4fec614372992847511d4acfb37c53df1150dd418c2c718d49', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-17_fix_offline_pos_sync_uuid_safety', '2026-09-17_fix_offline_pos_sync_uuid_safety.sql', 'aad5010d0fdf3be68f666c89cb44da07382034b9b18ecfbaad8b09b977dc17e2', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-20_deduplicate_supplier_opening_balances', '2026-09-20_deduplicate_supplier_opening_balances.sql', 'be6734320fcc20061e7137558d7c7b78e49f95ace4deef3a3864a39256e07756', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-20_fix_ashraf_saafan_balance', '2026-09-20_fix_ashraf_saafan_balance.sql', '32ebc1138cba2d7f3660bf479009a8fdd2fd04b2459298fdd2256b995d3c81d8', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-20_import_supplier_opening_balances', '2026-09-20_import_supplier_opening_balances.sql', '354f5dd463a15468cf189ce5830205cf3c92ec802a727b0bab4f956b26c2eea8', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-21_fix_table_permissions_and_rls', '2026-09-21_fix_table_permissions_and_rls.sql', '6e71595cb36896b449ab137eaf78a63927b6e716b2f1a810bddaee0933458805', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-22_fix_start_pos_shift_overload', '2026-09-22_fix_start_pos_shift_overload.sql', 'b965586629f2fde4577ecccc3fe8743ec964621529b784dc5204d43ae7373595', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-22_include_journal_entries_in_supplier_balances', '2026-09-22_include_journal_entries_in_supplier_balances.sql', '956fed2b311dcdecb905a61a752fe229d57ac074f0f86427f81b3c9294e287cd', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-23_add_plan_to_organizations', '2026-09-23_add_plan_to_organizations.sql', '40c10b4c039564003e3dae76a96270d0d491826d092d8bd53543935ff1ceba8c', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-23_deduplicate_sphynx_and_moghrebel_opening_balances', '2026-09-23_deduplicate_sphynx_and_moghrebel_opening_balances.sql', '64e05bf60e93a3ee8367aa05441fd3bb0b0035eb05db8efa1d718e6c6d3beec6', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-23_fix_supplier_exact_name_matching', '2026-09-23_fix_supplier_exact_name_matching.sql', 'b1a9a296292a9517144955cb2987de4be68bb0adda4ec9ce0da63945a374c4e8', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-23_provision_new_org_complete', '2026-09-23_provision_new_org_complete.sql', '5672a48167598337cccdef833a3ddb2af991c122c9700c5650c7958ef5b5a928', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-24_purchase_invoice_discounts_and_attachments', '2026-09-24_purchase_invoice_discounts_and_attachments.sql', 'd5337513aabea29b6e90f91bdaae5ec9ada8e9d080b1091e9367fecd84abecb8', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-26_fix_lenza_auto_backup_timeout_and_cron', '2026-09-26_fix_lenza_auto_backup_timeout_and_cron.sql', 'b321d4a234abcc456201b8c52a7082ff0dcbc226c234cac251623597830fea4d', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-26_payroll_accrual_and_disbursement_rpcs', '2026-09-26_payroll_accrual_and_disbursement_rpcs.sql', 'a97fdc9031346f87a408f0206d971b65bd9e47b29ea03f9cdcf3eb78e5340181', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-27_dashboard_and_mobile_access_control', '2026-09-27_dashboard_and_mobile_access_control.sql', 'c9d657a40aa9c7c14acf2251840f65ddc78162f4af11bce67c8111befa28fd9c', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-29_detect_unbalanced_journal_entries', '2026-09-29_detect_unbalanced_journal_entries.sql', '326114971e07578e822950f50fc868da81e5bd358fc3f1f93b83258a8c03f772', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-30_critical_security_fixes', '2026-09-30_critical_security_fixes.sql', '00738d6f01fd86a1dbd8b4348e7bbc7cf1aaaa070a1be0b37caaffb448428fa4', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-30_database_balance_guard_and_fiscal_period_lock', '2026-09-30_database_balance_guard_and_fiscal_period_lock.sql', 'ce11da1398ada5325c817a7f0a4d930e284ac790ca9efb3963d87a72f5325bc2', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-30_document_immutability_guard', '2026-09-30_document_immutability_guard.sql', 'ef36c81e56915b1a451775051517964475ce165b5e7a3696eb20233e2a9a3043', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-30_final_rls_lockdown', '2026-09-30_final_rls_lockdown.sql', 'e4dbb650a7b26ecabb5b7477b1a16250bb03ab5a1171484dcc1a8629b8995f9f', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-30_financial_reports_server_side_rpcs', '2026-09-30_financial_reports_server_side_rpcs.sql', '5bb45f9bb61e644b56629ddd9b4858e85483237e26a2a26f1854f4434f64e80e', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-30_MASTER_CONSOLIDATED_SYSTEM_HARDENING', '2026-09-30_MASTER_CONSOLIDATED_SYSTEM_HARDENING.sql', 'abfd7704c9ff902770c5ffdecb7df35158199714bd76147c74d3dfc0230e59ec', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-30_performance_indexes_and_income_statement_rpc', '2026-09-30_performance_indexes_and_income_statement_rpc.sql', 'dd490d94074473f4b2669533aed2404d5fc4d064f3decfbadd9a25134ee9f054', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-30_phase1_audit_and_security_shield', '2026-09-30_phase1_audit_and_security_shield.sql', 'd87679cd66bba5ded57a3875800e64d2eaa7dc96d536c9f6b8c0c0b13eec3e14', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-30_phase1_stock_engine_acceleration', '2026-09-30_phase1_stock_engine_acceleration.sql', '95119005e9411778e23c6176a7acd3352199cc34cc221e91f3d3f1ad9957d4f9', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-09-30_phase2_performance_indexes', '2026-09-30_phase2_performance_indexes.sql', 'ecd414c80fb58b27ef6f0ef6aeda4aff61c0c8e510e6f723c74ae67a70b2bf72', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-02_midnight_audit_and_trial_balance_rpcs', '2026-10-02_midnight_audit_and_trial_balance_rpcs.sql', 'fa0ea9e70e509a86b59e062676a1279378f52ab645292ae756849b381e74bf57', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-02_phase3_atomic_invoicing_and_depreciation_rpcs', '2026-10-02_phase3_atomic_invoicing_and_depreciation_rpcs.sql', '65b1794cae144b4019fe080af2a676850f60349e05df4ff0a348d109ddccfbf6', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-03_add_shift_id_to_employees', '2026-10-03_add_shift_id_to_employees.sql', '18c4fcce5ee945e44f6b2592fb1d1d9968e2f5256264e4d62bf94436bf38c9d8', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-03_allow_negative_stock_lenza_and_user_exception', '2026-10-03_allow_negative_stock_lenza_and_user_exception.sql', '1d5d85cb5ac94d04deb2e721f3df57eb0198a7aba9645358c335f04b210f0290', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-03_fix_purchase_invoice_rounding_balance_guard', '2026-10-03_fix_purchase_invoice_rounding_balance_guard.sql', 'c733447f155854a43c2fdafe1b692e5961fa8a87a0faa1e70a8bc8c55c201cfb', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-04_fix1_revoke_anon_and_accounting_periods_rls', '2026-10-04_fix1_revoke_anon_and_accounting_periods_rls.sql', '8a39dac1d9dc089a0dd0d41fe5d39a6a6cf207afe40670f6b8b91130ecc50257', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-04_fix2_balance_guard_trigger_and_immutability', '2026-10-04_fix2_balance_guard_trigger_and_immutability.sql', '4c1b1f12f4c363e8d03e66adbffec715d928fdacdbf0cb55e461a8bd95b92e1e', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-04_fix3_remove_hardcoded_lenza_and_clean_approve_invoice', '2026-10-04_fix3_remove_hardcoded_lenza_and_clean_approve_invoice.sql', 'df3e95062cc2f4d9a101f3f9625442cd609e3db2235e2918cbedebcc3d6965fd', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-04_fix4_public_menu_rls_and_rate_limit_store', '2026-10-04_fix4_public_menu_rls_and_rate_limit_store.sql', '6beab9decaad137ff08963020ddad8471248324840a2978a2877ebe011bfe586', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-04_fix5_materialized_view_trial_balance_and_audit_log', '2026-10-04_fix5_materialized_view_trial_balance_and_audit_log.sql', '8f702219d0744648ce55e5251630c8359d9f7acc6bf9eb988d78e8ac2f70397e', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-04_fix6_fx_revaluation_and_year_end_closing', '2026-10-04_fix6_fx_revaluation_and_year_end_closing.sql', '0bded598000421610d678242d6d964c6281a73be53d0773c71f7d19e067a96d0', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-08_add_salary_compatibility_to_employees', '2026-10-08_add_salary_compatibility_to_employees.sql', 'f4c10e585801428f7c9b1310eaca42d5580494073cd64d3ce90e874f25e28dcb', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-08_add_update_employee_advance_rpc', '2026-10-08_add_update_employee_advance_rpc.sql', 'd32d23cdb351efe068e2e4c256fbd13155a24801ff4919e2ee254e047fedeb58', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-08_fix_sales_invoice_discount_balance_guard', '2026-10-08_fix_sales_invoice_discount_balance_guard.sql', '094aecdb4549c390d0fe3d85f23a7ad047320a4b2d2b064c390364f3f5ffeed9', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-09_dashboard_view_mode_per_user', '2026-10-09_dashboard_view_mode_per_user.sql', '774c54cdc6e9f61c9d5157d113d1ed6283722b24a55e91af1ab0b89ed0d56448', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-10_secure_lenza_departed_employees_and_sessions', '2026-10-10_secure_lenza_departed_employees_and_sessions.sql', 'a3f9004eb29e54ce24f4a8ed0fb8473f34e7ce3b7f5c7406e5c6d8a13b0f619e', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-10_unified_stock_ledger_engine', '2026-10-10_unified_stock_ledger_engine.sql', 'c6d80ff0e1bf40aa972125cd583fe2f0ee72c7b638f9b6efab6be4ed6ec1fad4', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-11_fix_payroll_advance_deduction_date_filter', '2026-10-11_fix_payroll_advance_deduction_date_filter.sql', '3cd6e379a9386a45c288ec74b2235061d012ef549ec365c0a0f8d3abcd1c9f16', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-12_add_granular_reports_permissions', '2026-10-12_add_granular_reports_permissions.sql', '84e687c4a0875f72dd293d52f28a17523a380cb12cea3a78915b3e83a41f842b', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-13_add_deleted_at_and_date_sync_to_vouchers', '2026-10-13_add_deleted_at_and_date_sync_to_vouchers.sql', '2d921a6f17b84583ab7945dbd212e91fde968c2ad0b16b750b69328e6c56ec4a', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-13_add_missing_columns_to_suppliers_and_products', '2026-10-13_add_missing_columns_to_suppliers_and_products.sql', '7f3495727f243dccd1296c8a5f4c85d95c0969c23bcdec0f9fff0879e19fd197', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-13_standardize_audit_columns_across_all_tables', '2026-10-13_standardize_audit_columns_across_all_tables.sql', '3e1e506b1625c66420b0cc22b6a5fc7c932ef33d431b597eb0223291f161f2a5', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-14_add_allowed_treasury_ids_to_profiles', '2026-10-14_add_allowed_treasury_ids_to_profiles.sql', '66024a6bc4f246ae1ed35a95618a8b727d206f05a13882840a08567193bf7930', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-14_enterprise_auto_reconcile_and_integrity_guard', '2026-10-14_enterprise_auto_reconcile_and_integrity_guard.sql', '225e5a4fb522b5aa4f22f272fb1417ab12c8d6b341404d3786bd1e851465d9f2', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-14_fix_supplier_subledger_13600_and_prevent_duplicates', '2026-10-14_fix_supplier_subledger_13600_and_prevent_duplicates.sql', '74c30e219eaa26631df0a4c59d640dc54dc561a1a9e9b7b16d30a2984b2dcd4e', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-14_fix_unpost_sales_and_purchase_invoices', '2026-10-14_fix_unpost_sales_and_purchase_invoices.sql', 'a259df9ef128438fe77577df089299682869586bac6022a03d857d3c70f37d2a', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-14_fix_voucher_approval_and_sync_exp_923100', '2026-10-14_fix_voucher_approval_and_sync_exp_923100.sql', '67c399d648dd37b3993552b687cca5549962685921d7e264d8dfa041f95d00b9', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-15_final_vulnerability_patch', '2026-10-15_final_vulnerability_patch.sql', '350265c941f57f901c100dd8e780dec2b6f5129df75ec494bd8b0a7aa96ef5f3', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-15_ultimate_security_shield', '2026-10-15_ultimate_security_shield.sql', '3ccfecec7b0e294578c10bc63207fb7f4371e4a7137ed996b2d8778668a157ab', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-16_add_pricing_tier_to_customers', '2026-10-16_add_pricing_tier_to_customers.sql', '1beee62e151092a4a252521b418100e2a562e26a864fa5dfab5732185a1a127c', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-17_fix_approve_receipt_voucher_rpc', '2026-10-17_fix_approve_receipt_voucher_rpc.sql', '816ba9b6a76d87fa7115ad3744d72ea76e8891072eb959f36278ebd1d8ea6e7b', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-18_optimize_recalculate_system_balances_no_timeout', '2026-10-18_optimize_recalculate_system_balances_no_timeout.sql', '56fc71f0373d5def5f3e6e35d66a9ce3c7a3dc176f1605723e6bd5e72bad30e6', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-18_restore_complete_5_pillar_audit_shield', '2026-10-18_restore_complete_5_pillar_audit_shield.sql', '1ee4e768a549673b3896fe8f2cdae67f9282302b7bd767e03c259fd955a6e14d', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-19_phase2_security_hardening_rls', '2026-10-19_phase2_security_hardening_rls.sql', '7dff55051db6378ba55f1cf06c30a049bb6235244b078b81f2debf9665ecef45', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-21_enterprise_pos_dual_cashier_shift_closing', '2026-10-21_enterprise_pos_dual_cashier_shift_closing.sql', 'a844c5e8f400944f5a583036e29ce51ff045dda81fcf506162e2ed70d2102958', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-21_fix_sales_invoice_approve_42703', '2026-10-21_fix_sales_invoice_approve_42703.sql', 'cd993b1594b53a26198f9c30adf148ae1baa51f4fe8cfef16402a46af6829c05', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-21_fix_unpost_and_post_purchase_invoice_immutability', '2026-10-21_fix_unpost_and_post_purchase_invoice_immutability.sql', 'e663a5e26be12bb504e1b0447dab88bdaf358f3067ad5e3bed4c4b8cdc7f8290', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-21_sync_general_db_with_lenza_master', '2026-10-21_sync_general_db_with_lenza_master.sql', 'abde00e5cb6890c0d850f8c3dc7956bfbb666d8e66bab84933a57d8ad47d4ad5', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-22_add_payment_method_to_orders', '2026-10-22_add_payment_method_to_orders.sql', '36c8ae1d69438be5d1cdbdd78daaa45a59d3582f57d0c8a7c59fbf7757ba1d04', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-22_enhance_employee_advances_management', '2026-10-22_enhance_employee_advances_management.sql', 'b052685c5e89de3d0e9f244db132cee5688aff6462d70d4c705a91fe723c054e', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-22_FINAL_STABILITY_PATCH', '2026-10-22_FINAL_STABILITY_PATCH.sql', '2234f886de377e27a6fd53cb56805224e1af667308470941fcd28d79df0bc602', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-22_fix_invoice_trigger_and_orders_columns', '2026-10-22_fix_invoice_trigger_and_orders_columns.sql', '05cf7c4b42ab56517a303b5abdf9d39597be8d6ac908cb9e777a357a6942c5ca', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-22_fix_shift_closing_journal_and_account_resolution', '2026-10-22_fix_shift_closing_journal_and_account_resolution.sql', '3e7fe91c1a826887b44b33ba79cc661ed87bb1ecef2701ae716fd8f30d36bbf1', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-22_pos_advance_deposits_and_refunds_multichannel', '2026-10-22_pos_advance_deposits_and_refunds_multichannel.sql', '4352e498598f88b6e9882cf1cf8874432c39078030d382009983c02654248a73', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-23_add_is_base_column_to_uoms', '2026-10-23_add_is_base_column_to_uoms.sql', '673febb6ee1d2673fed45fa57ae8611d21e4338c43961c4d6ddd3275607db050', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-23_add_updated_at_to_invoices_and_purchase_invoices', '2026-10-23_add_updated_at_to_invoices_and_purchase_invoices.sql', '99d536b43d659d10e0bcd591642befa7e80ebfa4968b51c362834cc4b7238aae', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-23_fix_cash_deficit_surplus_accounts_and_shift_resolution', '2026-10-23_fix_cash_deficit_surplus_accounts_and_shift_resolution.sql', '1bbe91aab6ccfaa8af2ee3565f2e6162bfd678b39f1230430470584cda37d8f1', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-23_fix_customer_advances_mapping', '2026-10-23_fix_customer_advances_mapping.sql', 'c59ee52ba49b178347d6137c1df322d6ae6c945307637434ac6fec087a676b66', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-23_fix_pos_deposit_refund_display_and_robust_aggregation', '2026-10-23_fix_pos_deposit_refund_display_and_robust_aggregation.sql', '6e27bf1246d897cdcb48fdd324e71d3f8d8b7b148b10446aba713d7113f79c97', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-23_seed_standard_reports_permissions', '2026-10-23_seed_standard_reports_permissions.sql', 'd1fa48fdf9555435e7b52fb57d379d3e88a66a799cde8c99234209a5811dc24e', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-24_fix_shift_closing_journal_and_repost', '2026-10-24_fix_shift_closing_journal_and_repost.sql', '968017ea6c788979ede5798377f555bd9eb417efd24b1b3cda1a17937133da72', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-28_dynamic_approval_workflows_engine', '2026-10-28_dynamic_approval_workflows_engine.sql', '1562cfcd1772678d48501ce1549bc7b6951bbb8b526450254dad347f76db6785', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-28_unify_manufactured_stock_recalculation', '2026-10-28_unify_manufactured_stock_recalculation.sql', '3985df50d5d8209cec9f2130dd4eeda3d38ae37a34b4a63dd81129bcc2bd3cd6', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-29_fix_approval_workflows_permissions_and_rls', '2026-10-29_fix_approval_workflows_permissions_and_rls.sql', '2e68caa7e1c03a4a533bd315e8c4c141e0b3c77370fcc106feef6fa9d04503c0', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-30_fix_approval_workflows_financial_integrity_and_sync', '2026-10-30_fix_approval_workflows_financial_integrity_and_sync.sql', '95bf3db4ae80b33e85c26e2fe5671ea6862a09054bb8a774f386d8e38f70b36e', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-10-31_fix_payroll_advance_deduction_and_restore_october', '2026-10-31_fix_payroll_advance_deduction_and_restore_october.sql', 'f57bbc54971df9d9d96d25119ca91a0b9cde984f736013bf19d8fe6c25f18e98', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-01_admin_reset_user_password_rpc', '2026-11-01_admin_reset_user_password_rpc.sql', 'a21bb8263a383b4aede39fa73644d1105890e4146ea5e5b832c45c4ad7a1cbc4', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-06_production_order_cost_snapshot_and_server_time', '2026-11-06_production_order_cost_snapshot_and_server_time.sql', 'e225f04f8999a18079c5596baa89aff7dac1cc684e84283cbbd172541f48d043', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-09_production_security_hardening_lenza_safe', '2026-11-09_production_security_hardening_lenza_safe.sql', 'bd3f151d926db279320827da6d1f0ed1e0fb78a8ad6ec17ddcc2d02571e2ff1c', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-09_production_security_hardening_phase2_lenza_safe', '2026-11-09_production_security_hardening_phase2_lenza_safe.sql', '171833fc4b34fd625829d601410b23d078c23178f1aef8b08d699212e684ceea', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-10_fix_admin_reset_user_password_tenant_isolation', '2026-11-10_fix_admin_reset_user_password_tenant_isolation.sql', 'b0294dd537e1e50db1c73ff717743adf4d0e491a4fadca6dff0373f75164dfa6', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-10_fix_payroll_accrual_timeout_and_performance', '2026-11-10_fix_payroll_accrual_timeout_and_performance.sql', 'b5670ac7c0b6ad7b8c5c1f03d04c1cdeec1537a5de5fb06500de6bdc678c9284', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-10_storage_security_and_tenant_isolation', '2026-11-10_storage_security_and_tenant_isolation.sql', 'c6945e46294e26e0510a3c7cfe3e748dabe12511c76548321411364de7f6ef90', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-11_secure_mv_trial_balance', '2026-11-11_secure_mv_trial_balance.sql', '0e71c558b9c0f3231d5046633b716263fa04854559a4e8f2364b03f4671222dc', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_definitive_eiffel_supplier_balance_fix', '2026-11-14_definitive_eiffel_supplier_balance_fix.sql', '289635b3f5a16a4dea94b6eb935cb167e559f848e07b1639455da3c6683869ac', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_FINAL_CONSOLIDATED_GENERAL_DB_PATCH', '2026-11-14_FINAL_CONSOLIDATED_GENERAL_DB_PATCH.sql', 'a503bb4a6c147d106dae6ca4dc568140566e3703d9e26ba4079c45a67785efb4', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_fix_advance_445716_and_update_advance_rpc', '2026-11-14_fix_advance_445716_and_update_advance_rpc.sql', 'dc2f510eb0d4566571f040a0ac1ed636f66e9c3dc562efd2f964158ee718d16e', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_fix_purchase_return_immutability_and_supplier_discrepancy', '2026-11-14_fix_purchase_return_immutability_and_supplier_discrepancy.sql', '02b4f446967ac6d4bd3a0bf2541ae8d14ba0bbb927c593db569046d496953cc4', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_general_db_purchase_return_immutability_and_supplier_balances', '2026-11-14_general_db_purchase_return_immutability_and_supplier_balances.sql', 'f4c6b371f885f6da2c5edcf093c8d3c84497ee5dd3aa64be0f7eeb02a83d7e43', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_investigate_and_fix_300k_shield_variance', '2026-11-14_investigate_and_fix_300k_shield_variance.sql', 'f69e5b664adba889ce2acf3a026345b6212515e9c631024a09ccc4e6900b4a49', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_lenza_clean_duplicate_905_and_sync_shield', '2026-11-14_lenza_clean_duplicate_905_and_sync_shield.sql', 'f54a62fb375523bc08fb4b189c7da12a551f55032fbc5a59e857a963ab955f3b', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_permanent_supplier_audit_shield_sync', '2026-11-14_permanent_supplier_audit_shield_sync.sql', 'a8695524a996bbe4327eab7a706cb6e9c97ea8072bbae14d8dcb4e21fcc7ebf9', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_restore_and_sync_all_supplier_balances_exact', '2026-11-14_restore_and_sync_all_supplier_balances_exact.sql', '01c38ecd857b28527f76e60457cfc11b40e340e2d4ec7325f661dea2fdbb46f1', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_restore_fast_midnight_audit_shield_and_zero_variance', '2026-11-14_restore_fast_midnight_audit_shield_and_zero_variance.sql', '56cebc84bdd1403310a662156c99f0bad0e054cc4781312a39e3f0674c12d8e8', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_sales_returns_immutability_and_unpost_guard', '2026-11-14_sales_returns_immutability_and_unpost_guard.sql', '1e0abc6423390180e72061ffceb3bc78bc4da88ed50877ac411c85e1fe23091f', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-14_security_hardening_tenant_isolation_and_returns', '2026-11-14_security_hardening_tenant_isolation_and_returns.sql', '929d290969ab167f1ead052b42ee6b3c2fe46c90cc65a6ea63bb51606afaf8e8', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-15_CONSOLIDATED_PATCH_FOR_LENZA_AND_GENERAL', '2026-11-15_CONSOLIDATED_PATCH_FOR_LENZA_AND_GENERAL.sql', 'e4bd4040e0f7fd4213f34a0fbe3d30a5f8a31a2c53cecbb34817ec543fdeaaf8', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-16_fix_update_employee_advance_column_date_error', '2026-11-16_fix_update_employee_advance_column_date_error.sql', '18d81d63ba7a117c3ee6487651ac371918bf2c9bb951666fda77d26326fdbabb', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-18_rpc_delete_inventory_count', '2026-11-18_rpc_delete_inventory_count.sql', '002655555b0713a2e33a539c030541c7627f2cbc9e88401eb2572f22cf032d12', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-18_rpc_reverse_inventory_count', '2026-11-18_rpc_reverse_inventory_count.sql', 'a8201f5fbf99d721540cb88cb5ba1f5c69cb8c29e7da76cbea3e08fd2c60898a', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-20_prevent_duplicate_journal_entries_and_harden_vouchers', '2026-11-20_prevent_duplicate_journal_entries_and_harden_vouchers.sql', '7388d2c73594aceb3d50dc331b501d9645cd07108e507c6eb6dfc40b8027ee31', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-22_atomic_create_employee_advance_with_duplicate_guard', '2026-11-22_atomic_create_employee_advance_with_duplicate_guard.sql', 'ef374f096cd64ea1b2a6fa5b658e3fff461e1397ef233be2bebe9fe2e65d6960', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-22_fix_trial_balance_rpc_overload_and_timeout', '2026-11-22_fix_trial_balance_rpc_overload_and_timeout.sql', '5fec9626914ffcf49aca6620b3d30167bbe7bdd3db0ccf68314bc70bbd1fb1e0', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-22_security_fix_anon_permissions_and_rls_policies', '2026-11-22_security_fix_anon_permissions_and_rls_policies.sql', '00922bb94deb8d78cc3a219801437cb6214c0539302641ed290a9465d55af459', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-22_security_fix_company_settings_and_secrets', '2026-11-22_security_fix_company_settings_and_secrets.sql', '4f065ecf308b2e698a91819d6bab5e6e5bfb11369f18fdb3e58d660f20345717', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('2026-11-23_fix_trial_balance_rpc_and_tenant_validation_robust', '2026-11-23_fix_trial_balance_rpc_and_tenant_validation_robust.sql', '3f302feb6fcb27d9235a531d4ee747e8d00eb99b936e3cd26ca03bca82992466', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('import_30_tortes_routings_and_bom', 'import_30_tortes_routings_and_bom.sql', '0eb3d7209e413c29e247719b69bea0bcc06b58f698de9aa9943b8c5e8e7f72ac', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

INSERT INTO public._schema_migrations (version, filename, checksum, applied_at)
VALUES ('route_finished_goods_to_10302', 'route_finished_goods_to_10302.sql', '5df2f1e9c1a3845dbc4723eaae863eae2eb54542f9f8e979be610d6c30aa2ab3', now())
ON CONFLICT (version) DO UPDATE SET applied_at = now(), checksum = EXCLUDED.checksum;

