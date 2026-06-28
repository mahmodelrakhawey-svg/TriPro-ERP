# TODO
- [ ] Fix Supabase query in `modules/sales/CustomerStatement.tsx` to avoid `PGRST108 journal_lines is not an embedded resource`.
- [ ] Replace embed/join approach with two-step queries:
  - [ ] Fetch `journal_lines` (debit/credit + FK to `journal_entries`) without embeds.
  - [ ] Fetch `journal_entries` by FK IDs (reference, transaction_date, description, status, related_document_*).
- [ ] Rebuild and verify the Customer Statement page loads without HTTP 400.
- [ ] Ensure filtering (account_id, org_id, posted, date range, related_document_type=in(invoice)) is preserved.
- [ ] Validate balancing logic (opening/closing and unposted count).

