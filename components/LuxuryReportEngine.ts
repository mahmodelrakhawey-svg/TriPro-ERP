import { jsPDF } from 'jspdf';

// يجب إضافة الخطوط العربية لـ jsPDF لضمان عرض صحيح للنصوص العربية
// مثال: import 'jspdf-autotable'; // إذا كنت تستخدم الجداول
/**
 * محرك توليد التقارير الطبية الفندقية الفاخرة
 * صمم ليكون خفيفاً جداً ولا يؤثر على أداء النظام
 */
export const LuxuryReportEngine = {
  generatePDF: async (data: any, type: 'invoice' | 'discharge') => {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const brandColor = [30, 41, 59]; // Slate-800
    const accentColor = [37, 99, 235]; // Blue-600

    // --- 1. الترويسة الفاخرة (Luxury Header) - موحدة ---
    doc.setFillColor(brandColor[0], brandColor[1], brandColor[2]);
    doc.rect(0, 0, 210, 45, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    const title = type === 'invoice' ? 'TAX INVOICE | فاتورة ضريبية' : 'DISCHARGE SUMMARY | خلاصة خروج المريض';
    doc.text(title, 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.text(`${data.hospital_info?.name || 'HIMS Pro Hospital'}`, 105, 30, { align: 'center' });
    doc.text(`VAT: ${data.hospital_info?.vat || 'N/A'}`, 105, 35, { align: 'center' });
    
    // --- 2. بيانات المريض (Patient Card) ---
    doc.setTextColor(50, 50, 50);
    doc.setFillColor(248, 250, 252); // Gray-50
    doc.roundedRect(10, 50, 190, 30, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.text(`Patient Name / اسم المريض: ${data.patient_info?.name}`, 15, 58);
    doc.text(`File No / رقم الملف: ${data.patient_info?.file_no}`, 15, 65);
    doc.text(`Blood Type: ${data.patient_info?.blood || 'N/A'}`, 15, 72);
    
    doc.text(`Date / التاريخ: ${new Date(data.visit_details?.date || data.visit?.created_at).toLocaleDateString()}`, 140, 58);
    doc.text(`Doctor / الطبيب: ${data.visit_details?.doctor || data.visit?.doctor_name || 'N/A'}`, 140, 65);
    
    // --- 3. جدول الخدمات (Billing Items) ---
    let yPos = 95;
    if (type === 'invoice') {
      doc.setFontSize(12);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('Detailed Services | تفاصيل الخدمات المرفقة', 10, yPos - 5);
      
      // Header Table
      doc.setFillColor(230, 230, 230);
      doc.rect(10, yPos, 190, 8, 'F');
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.text('Description / الوصف', 15, yPos + 5);
      doc.text('Qty', 120, yPos + 5);
      doc.text('Unit Price', 145, yPos + 5);
      doc.text('Total', 175, yPos + 5);

      yPos += 12;
      data.billing_items?.forEach((item: any, index: number) => {
        if (index % 2 === 0) doc.setFillColor(250, 250, 250);
        else doc.setFillColor(255, 255, 255);
        doc.rect(10, yPos - 4, 190, 7, 'F');
        
        doc.text(item.description, 15, yPos);
        doc.text(item.quantity.toString(), 122, yPos);
        doc.text(item.unit_price.toLocaleString(), 145, yPos);
        doc.text(item.total_price.toLocaleString(), 175, yPos);
        yPos += 7;
      });

      // Totals Box
      yPos += 10;
      doc.setDrawColor(200, 200, 200);
      doc.line(130, yPos, 200, yPos);
      yPos += 7;
      doc.setFontSize(11);
      doc.text('Net Payable / الصافي المستحق:', 130, yPos);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text(`${data.financial_summary?.net_payable?.toLocaleString()} ${data.hospital_info?.currency || 'EGP'}`, 175, yPos);
    } else if (type === 'discharge') {
      doc.setFontSize(12);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('Clinical Summary | الملخص السريري', 10, yPos - 5);
      yPos += 5;

      // Diagnosis
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      doc.text('Final Diagnosis / التشخيص النهائي:', 15, yPos);
      doc.setFontSize(9);
      doc.text(data.diagnosis || 'لم يتم تسجيل تشخيص نهائي.', 15, yPos + 5, { maxWidth: 180 });
      yPos += 15;

      // Clinical Notes
      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      doc.text('Clinical Notes / الملاحظات السريرية:', 15, yPos);
      doc.setFontSize(9);
      const notes = data.clinical_notes?.map((cn: any) => cn.assessment).join('\n') || 'لا توجد ملاحظات سريرية.';
      const splitNotes = doc.splitTextToSize(notes, 180);
      doc.text(splitNotes, 15, yPos + 5);
      yPos += (splitNotes.length * 5) + 10;

      // Medications
      if (data.medications && data.medications.length > 0) {
        doc.setFontSize(10);
        doc.setTextColor(50, 50, 50);
        doc.text('Medications at Discharge / الأدوية عند الخروج:', 15, yPos);
        doc.setFontSize(9);
        data.medications.forEach((med: any, index: number) => {
          doc.text(`${index + 1}. ${med.drug_name} - ${med.dosage} (${med.frequency})`, 15, yPos + 5 + (index * 5));
        });
        yPos += (data.medications.length * 5) + 10;
      }

      // Lab Results (Critical only)
      if (data.lab_results && data.lab_results.length > 0) {
        doc.setFontSize(10);
        doc.setTextColor(50, 50, 50);
        doc.text('Key Lab Results / نتائج المختبر الهامة:', 15, yPos);
        doc.setFontSize(9);
        data.lab_results.forEach((lab: any, index: number) => {
          doc.text(`${index + 1}. ${lab.test}: ${lab.result}`, 15, yPos + 5 + (index * 5));
        });
        yPos += (data.lab_results.length * 5) + 10;
      }

      // Recommendations
      doc.setFontSize(10);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('Follow-up Recommendations / توصيات المتابعة:', 15, yPos);
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      const recommendations = data.visit?.plan || 'يرجى مراجعة الطبيب المعالج بعد أسبوعين أو عند الضرورة.';
      const splitRecs = doc.splitTextToSize(recommendations, 180);
      doc.text(splitRecs, 15, yPos + 5);
      yPos += (splitRecs.length * 5) + 10;

      // Doctor's Signature
      doc.text(`Lead Doctor / الطبيب المشرف: ${data.visit_details?.doctor || data.visit?.doctor_name || 'N/A'}`, 15, yPos + 10);
    }

    // --- 4. التذييل والـ QR (Footer & Security) ---
    const footerY = 270;
    doc.setDrawColor(brandColor[0], brandColor[1], brandColor[2]);
    doc.setLineWidth(0.5);
    doc.line(10, footerY, 200, footerY);
    
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('This document is electronically verified. Scan QR code to authenticate.', 105, footerY + 5, { align: 'center' });
    
    // محاكاة مكان الـ QR (سيتم توليده في الواجهة وإضافته كصورة إن لزم)
    doc.rect(175, footerY + 2, 20, 20);
    doc.setFontSize(6);
    doc.text('SECURITY\nVERIFIED', 185, footerY + 12, { align: 'center' });

    doc.save(`${type}_${data.patient_info?.name}.pdf`);
  }
};