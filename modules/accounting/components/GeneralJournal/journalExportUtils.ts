import { logger } from '../../../../utils/logger';
import * as XLSX from 'xlsx';
import { supabase } from '../../../../supabaseClient';
import { JournalEntry } from '../../../../types';
import { getEntrySource } from './journalSourceClassifier';

export const printJournalEntry = (entry: JournalEntry) => {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    const dateStr = entry.date || (entry as any).transaction_date || (entry as any).created_at;
    const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('ar-EG') : 'تاريخ غير متوفر';

    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>سند قيد رقم ${entry.reference || entry.id.slice(0, 8)}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
            th { background-color: #f8f9fa; }
            .footer { margin-top: 50px; display: flex; justify-content: space-between; }
            .signature { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 10px; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">سند قيد يومية</div>
            <div>رقم القيد: ${entry.reference || entry.id.slice(0, 8)}</div>
          </div>
          
          <div class="meta">
            <div><strong>التاريخ:</strong> ${formattedDate}</div>
            <div><strong>الحالة:</strong> ${entry.status === 'posted' ? 'مرحّل' : 'مسودة'}</div>
          </div>
          
          <div style="margin-bottom: 20px;"><strong>البيان:</strong> ${entry.description}</div>

          <table>
            <thead>
              <tr>
                <th>اسم الحساب</th>
                <th>رقم الحساب</th>
                <th>مدين</th>
                <th>دائن</th>
              </tr>
            </thead>
            <tbody>
              ${(entry.lines || []).map((line: Record<string, any>) => `
                <tr>
                  <td>${line.accountName || '-'}</td>
                  <td>${line.accountCode || '-'}</td>
                  <td>${line.debit > 0 ? line.debit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                  <td>${line.credit > 0 ? line.credit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                </tr>
              `).join('')}
              <tr style="font-weight: bold; background-color: #f8f9fa;">
                  <td colspan="2" style="text-align: left;">الإجمالي</td>
                  <td>${(entry.lines || []).reduce((sum: number, line: Record<string, any>) => sum + (line.debit || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td>${(entry.lines || []).reduce((sum: number, line: Record<string, any>) => sum + (line.credit || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            <div class="signature">المحاسب</div>
            <div class="signature">المدير المالي</div>
            <div class="signature">المعتمد</div>
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }
};

export interface ExportParams {
  currentUser: any;
  journalEntries: any[];
  startDate: string;
  endDate: string;
  queryModifier: (query: Record<string, any>) => Record<string, any>;
  users: any[];
  accounts: any[];
  toast: any;
  setIsExporting: (val: boolean) => void;
}

export const exportJournalToExcel = async ({
  currentUser,
  journalEntries,
  startDate,
  endDate,
  queryModifier,
  users,
  accounts,
  toast,
  setIsExporting
}: ExportParams) => {
  setIsExporting(true);
  try {
    if (currentUser?.role === 'demo') {
      const flatData = journalEntries.flatMap((entry: Record<string, any>) => 
        (entry.lines || []).map((line: Record<string, any>) => ({
          'التاريخ': entry.date || '-',
          'رقم القيد': entry.reference || '-',
          'البيان الرئيسي': entry.description || '-',
          'الحالة': entry.status === 'posted' ? 'مرحل' : 'مسودة',
          'كود الحساب': line.accountCode || '-',
          'اسم الحساب': line.accountName || '-',
          'مدين': Number(line.debit) || 0,
          'دائن': Number(line.credit) || 0,
          'بيان الحركة': line.description || entry.description || '-'
        }))
      );

      if (flatData.length === 0) {
        toast.error('لا توجد بيانات لتصديرها.');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(flatData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "دفتر اليومية");
      XLSX.writeFile(wb, `General_Journal_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('تم تصدير دفتر اليومية بنجاح ✅');
      return;
    }

    const orgId = currentUser?.organization_id || currentUser?.user_metadata?.org_id;
    let query = supabase
      .from('journal_entries')
      .select(`
        id,
        transaction_date,
        reference,
        description,
        status,
        user_id,
        created_at,
        journal_lines (
          id,
          account_id,
          debit,
          credit,
          description,
          cost_center_id
        )
      `)
      .order('transaction_date', { ascending: false });

    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    // تطبيق الفلاتر الحالية نفسها
    query = queryModifier(query as Record<string, any>) as any;

    const { data: entries, error } = await query;
    if (error) throw error;

    if (!entries || entries.length === 0) {
      toast.error('لا توجد بيانات مطابقة للفلاتر الحالية لتصديرها.');
      return;
    }

    const userMap = new Map((users || []).map((u: Record<string, any>) => [u.id, u.name]));
    const accountMap = new Map((accounts || []).map((a: Record<string, any>) => [a.id, a]));

    const flatData: any[] = [];
    entries.forEach((entry: Record<string, any>) => {
      const sourceInfo = getEntrySource(entry.reference, entry.description);
      const userName = userMap.get(entry.user_id) || 'النظام';
      const statusLabel = entry.status === 'posted' ? 'مرحل' : 'مسودة';
      const dateStr = entry.transaction_date || (entry.created_at ? entry.created_at.split('T')[0] : '-');

      const lines = entry.journal_lines || [];
      if (lines.length === 0) {
        flatData.push({
          'التاريخ': dateStr,
          'رقم القيد': entry.reference || '-',
          'مصدر القيد': sourceInfo.label,
          'البيان الرئيسي': entry.description || '-',
          'الحالة': statusLabel,
          'المستخدم': userName,
          'كود الحساب': '-',
          'اسم الحساب': '-',
          'مدين': 0,
          'دائن': 0,
          'بيان الحركة': '-'
        });
      } else {
        lines.forEach((line: Record<string, any>) => {
          const acc = accountMap.get(line.account_id);
          flatData.push({
            'التاريخ': dateStr,
            'رقم القيد': entry.reference || '-',
            'مصدر القيد': sourceInfo.label,
            'البيان الرئيسي': entry.description || '-',
            'الحالة': statusLabel,
            'المستخدم': userName,
            'كود الحساب': acc?.code || line.account_code || '-',
            'اسم الحساب': acc?.name || 'غير معروف',
            'مدين': Number(line.debit) || 0,
            'دائن': Number(line.credit) || 0,
            'بيان الحركة': line.description || entry.description || '-'
          });
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "دفتر اليومية");

    const fileDate = startDate && endDate ? `${startDate}_to_${endDate}` : new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `General_Journal_${fileDate}.xlsx`);
    toast.success(`تم تصدير ${entries.length} قيد محاسبي إلى ملف Excel بنجاح ✅`);
  } catch (err) {
    logger.error('Error exporting journal entries:', err);
    toast.error('حدث خطأ أثناء تصدير البيانات: ' + err.message);
  } finally {
    setIsExporting(false);
  }
};
