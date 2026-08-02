import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Luxury HTML-to-PDF Report Generator
 * Uses html2canvas to capture browser-rendered HTML/CSS,
 * supporting Arabic text shaping, custom fonts (Cairo), and RTL/LTR layout dynamically.
 */
export const LuxuryReportEngine = {
  generatePDF: async (data: any, type: 'invoice' | 'discharge', lang: 'ar' | 'en' = 'ar') => {
    // 1. Create a hidden printing container
    const printContainer = document.createElement('div');
    printContainer.id = 'luxury-print-container';
    
    // Style container to match standard A4 dimensions at 96 DPI
    printContainer.style.position = 'fixed';
    printContainer.style.left = '-9999px';
    printContainer.style.top = '0';
    printContainer.style.width = '793px'; // A4 width in pixels
    printContainer.style.padding = '40px';
    printContainer.style.backgroundColor = '#ffffff';
    printContainer.style.color = '#1e293b'; // slate-800
    printContainer.style.fontFamily = lang === 'ar' ? "'Cairo', 'Inter', system-ui, sans-serif" : "'Inter', system-ui, sans-serif";
    printContainer.style.direction = lang === 'ar' ? 'rtl' : 'ltr';
    printContainer.style.textAlign = lang === 'ar' ? 'right' : 'left';

    // Translations catalog
    const t = {
      invoiceTitle: lang === 'ar' ? 'فاتورة علاج ضريبية' : 'Medical Tax Invoice',
      dischargeTitle: lang === 'ar' ? 'ملخص خروج طبي (Discharge Summary)' : 'Medical Discharge Summary',
      vatLabel: lang === 'ar' ? 'رقم التسجيل الضريبي للمنشأة:' : 'Hospital VAT No:',
      patientName: lang === 'ar' ? 'اسم المريض:' : 'Patient Name:',
      nationalId: lang === 'ar' ? 'الرقم القومي:' : 'National ID / Passport:',
      bloodType: lang === 'ar' ? 'فصيلة الدم:' : 'Blood Type:',
      dateLabel: lang === 'ar' ? 'التاريخ:' : 'Date:',
      dischargeDateLabel: lang === 'ar' ? 'تاريخ الخروج:' : 'Discharge Date:',
      doctorLabel: lang === 'ar' ? 'الطبيب المعالج:' : 'Attending Doctor:',
      supervisingDoctorLabel: lang === 'ar' ? 'الطبيب المشرف:' : 'Supervising Doctor:',
      servicesTitle: lang === 'ar' ? 'تفاصيل الخدمات الطبية والرعاية' : 'Detailed Services & Clinical Care',
      serviceDesc: lang === 'ar' ? 'وصف الخدمة' : 'Service Description',
      qty: lang === 'ar' ? 'الكمية' : 'Qty',
      unitPrice: lang === 'ar' ? 'سعر الوحدة' : 'Unit Price',
      total: lang === 'ar' ? 'الإجمالي' : 'Total',
      netPayable: lang === 'ar' ? 'الصافي المستحق للدفع:' : 'Net Payable Amount:',
      clinicalSummaryTitle: lang === 'ar' ? 'الملخص السريري والتشخيص النهائي' : 'Clinical Summary & Final Diagnosis',
      finalDiagnosis: lang === 'ar' ? 'التشخيص النهائي (Final Diagnosis):' : 'Final Diagnosis:',
      clinicalNotes: lang === 'ar' ? 'الملاحظات الطبية (Clinical Notes):' : 'Clinical Notes:',
      medicationsTitle: lang === 'ar' ? 'الأدوية الموصوفة للمنزل عند الخروج' : 'Discharge Medications',
      labsTitle: lang === 'ar' ? 'نتائج التحاليل والفحوصات الهامة' : 'Key Lab & Diagnostic Results',
      recommendationsTitle: lang === 'ar' ? 'توصيات المتابعة والنصائح الطبية' : 'Follow-up Recommendations & Plan',
      signature: lang === 'ar' ? 'توقيع الطبيب المعالج:' : 'Attending Doctor Signature:',
      signatureNote: lang === 'ar' ? '(مستند معتمد إلكترونياً ولا يحتاج لختم)' : '(Electronically verified document, no stamp required)',
      footerLine: lang === 'ar' ? 'هذا المستند معتمد إلكترونياً. امسح الرمز للتأكد من صحة البيانات.' : 'This document is electronically verified. Scan to authenticate.',
      noDiagnosis: lang === 'ar' ? 'حالة مستقرة - خروج طبي عادي.' : 'Stable condition - normal medical discharge.',
      noNotes: lang === 'ar' ? 'لا توجد ملاحظات سريرية مسجلة.' : 'No clinical notes recorded.'
    };

    // Inject fonts and luxury stylesheet
    const style = document.createElement('style');
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Inter:wght@400;600;800&display=swap');
      
      #luxury-print-container {
        font-family: ${lang === 'ar' ? "'Cairo', 'Inter', sans-serif" : "'Inter', sans-serif"};
      }
      
      .luxury-header {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #ffffff;
        padding: 32px;
        border-radius: 16px;
        margin-bottom: 24px;
        position: relative;
        overflow: hidden;
      }
      
      .luxury-header::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 6px;
        background: linear-gradient(90deg, #3b82f6 0%, #10b981 100%);
      }

      .hospital-title {
        font-size: 24px;
        font-weight: 900;
        margin-bottom: 4px;
      }
      
      .report-type {
        font-size: 14px;
        font-weight: 600;
        color: #60a5fa;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 12px;
      }
      
      .hospital-meta {
        font-size: 12px;
        opacity: 0.85;
      }

      .patient-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        padding: 20px;
        border-radius: 12px;
        margin-bottom: 28px;
      }

      .grid-item {
        font-size: 13px;
        line-height: 1.6;
      }

      .grid-label {
        font-weight: 700;
        color: #64748b;
      }

      .luxury-title {
        font-size: 16px;
        font-weight: 700;
        color: #2563eb;
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 6px;
        margin-top: 28px;
        margin-bottom: 16px;
      }

      .notes-block {
        font-size: 14px;
        line-height: 1.7;
        background-color: #fafafa;
        border-right: ${lang === 'ar' ? '4px solid #3b82f6' : 'none'};
        border-left: ${lang === 'en' ? '4px solid #3b82f6' : 'none'};
        padding: 12px 16px;
        margin-bottom: 16px;
        border-radius: 4px;
        white-space: pre-wrap;
        color: #334155;
      }

      .luxury-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
      }

      .luxury-table th {
        background-color: #f1f5f9;
        color: #475569;
        padding: 12px;
        font-weight: 700;
        font-size: 13px;
        text-align: ${lang === 'ar' ? 'right' : 'left'};
        border-bottom: 2px solid #cbd5e1;
      }

      .luxury-table td {
        padding: 12px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 13px;
        color: #334155;
        text-align: ${lang === 'ar' ? 'right' : 'left'};
      }

      .luxury-table tr:nth-child(even) {
        background-color: #f8fafc;
      }

      .totals-container {
        margin-top: 24px;
        display: flex;
        justify-content: flex-start;
        font-size: 15px;
        font-weight: 700;
      }

      .total-badge {
        background-color: #eff6ff;
        border: 1px dashed #3b82f6;
        padding: 10px 20px;
        border-radius: 8px;
        color: #1e3a8a;
      }

      .total-val {
        color: #2563eb;
        font-size: 18px;
        font-weight: 900;
      }

      .list-container {
        padding-right: ${lang === 'ar' ? '20px' : '0'};
        padding-left: ${lang === 'en' ? '20px' : '0'};
        margin: 0;
      }

      .list-item {
        font-size: 13px;
        margin-bottom: 8px;
        color: #334155;
      }

      .footer-section {
        border-top: 1px solid #e2e8f0;
        margin-top: 48px;
        padding-top: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-direction: ${lang === 'ar' ? 'row' : 'row-reverse'};
      }

      .signature-block {
        font-size: 13px;
        font-weight: 700;
      }

      .security-badge {
        border: 2px solid #cbd5e1;
        background-color: #f8fafc;
        border-radius: 8px;
        padding: 10px;
        width: 100px;
        text-align: center;
        font-size: 9px;
        font-weight: 700;
        color: #64748b;
        letter-spacing: 0.5px;
        line-height: 1.3;
      }
    `;
    printContainer.appendChild(style);

    // 2. Safe variable mapping with robust fallbacks
    const patientName = data.patient?.full_name || data.patient_info?.name || (lang === 'ar' ? 'غير معروف' : 'Unknown');
    const patientFile = data.patient?.national_id || data.patient?.id || data.patient_info?.file_no || 'N/A';
    const patientBlood = data.patient?.blood_type || data.patient_info?.blood || 'N/A';
    
    const visitDate = data.visit?.created_at || data.visit_details?.date || new Date().toISOString();
    const dateStr = new Date(visitDate).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const doctorName = data.visit?.doctor_name || data.visit_details?.doctor || (lang === 'ar' ? 'غير محدد' : 'Unassigned');

    // 3. Assemble HTML template based on report type
    let mainContent = '';

    if (type === 'invoice') {
      const netPayable = data.financial_summary?.net_payable ?? 0;
      mainContent = `
        <div class="luxury-header">
          <div class="report-type">${t.invoiceTitle}</div>
          <div class="hospital-title">${data.hospital_info?.name || (lang === 'ar' ? 'مستشفى الرخاوي التخصصي' : 'Al-Rakhawey Hospital')}</div>
          <div class="hospital-meta">${t.vatLabel} ${data.hospital_info?.vat || 'N/A'}</div>
        </div>

        <div class="patient-grid">
          <div class="grid-item">
            <div><span class="grid-label">${t.patientName}</span> ${patientName}</div>
            <div><span class="grid-label">${t.nationalId}</span> ${patientFile}</div>
            <div><span class="grid-label">${t.bloodType}</span> ${patientBlood}</div>
          </div>
          <div class="grid-item">
            <div><span class="grid-label">${t.dateLabel}</span> ${dateStr}</div>
            <div><span class="grid-label">${t.doctorLabel}</span> ${doctorName}</div>
          </div>
        </div>

        <div class="luxury-title">${t.servicesTitle}</div>
        <table class="luxury-table">
          <thead>
            <tr>
              <th>${t.serviceDesc}</th>
              <th style="width: 80px; text-align: center;">${t.qty}</th>
              <th style="width: 120px; text-align: ${lang === 'ar' ? 'left' : 'right'};">${t.unitPrice}</th>
              <th style="width: 120px; text-align: ${lang === 'ar' ? 'left' : 'right'};">${t.total}</th>
            </tr>
          </thead>
          <tbody>
            ${(data.billing_items || []).map((item: any) => `
              <tr>
                <td>${item.description}</td>
                <td style="text-align: center;">${item.quantity}</td>
                <td style="text-align: ${lang === 'ar' ? 'left' : 'right'};">${item.unit_price?.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP</td>
                <td style="text-align: ${lang === 'ar' ? 'left' : 'right'};">${item.total_price?.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals-container" style="justify-content: ${lang === 'ar' ? 'flex-start' : 'flex-end'};">
          <div class="total-badge">
            ${t.netPayable} <span class="total-val">${netPayable.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP</span>
          </div>
        </div>
      `;
    } else if (type === 'discharge') {
      const notes = data.clinical_notes?.map((cn: any) => cn.assessment).filter(Boolean).join('\n') || t.noNotes;
      const recommendations = data.clinical_notes?.map((cn: any) => cn.plan).filter(Boolean).join('\n') 
        || data.visit?.plan 
        || (lang === 'ar' ? 'يرجى مراجعة الطبيب المعالج بعد أسبوعين أو عند الضرورة.' : 'Please follow up with the attending doctor in two weeks or as necessary.');

      mainContent = `
        <div class="luxury-header">
          <div class="report-type">${t.dischargeTitle}</div>
          <div class="hospital-title">${data.hospital_info?.name || (lang === 'ar' ? 'مستشفى الرخاوي التخصصي' : 'Al-Rakhawey Hospital')}</div>
        </div>

        <div class="patient-grid">
          <div class="grid-item">
            <div><span class="grid-label">${t.patientName}</span> ${patientName}</div>
            <div><span class="grid-label">${t.nationalId}</span> ${patientFile}</div>
            <div><span class="grid-label">${t.bloodType}</span> ${patientBlood}</div>
          </div>
          <div class="grid-item">
            <div><span class="grid-label">${t.dischargeDateLabel}</span> ${dateStr}</div>
            <div><span class="grid-label">${t.supervisingDoctorLabel}</span> ${doctorName}</div>
          </div>
        </div>

        <div class="luxury-title">${t.clinicalSummaryTitle}</div>
        
        <div style="margin-bottom: 20px;">
          <div style="font-weight: 700; margin-bottom: 6px; color: #475569;">${t.finalDiagnosis}</div>
          <div class="notes-block">${data.diagnosis || t.noDiagnosis}</div>
        </div>

        <div style="margin-bottom: 20px;">
          <div style="font-weight: 700; margin-bottom: 6px; color: #475569;">${t.clinicalNotes}</div>
          <div class="notes-block">${notes}</div>
        </div>

        ${data.medications && data.medications.length > 0 ? `
          <div class="luxury-title">${t.medicationsTitle}</div>
          <ol class="list-container">
            ${data.medications.map((med: any) => `
              <li class="list-item">
                <strong>${med.drug_name}</strong> 
                ${med.qty ? ` - ${lang === 'ar' ? 'الكمية: ' + med.qty : 'Qty: ' + med.qty}` : ''}
                ${med.dosage ? ` | ${med.dosage}` : ''} 
                ${med.frequency ? ` (${med.frequency})` : ''}
              </li>
            `).join('')}
          </ol>
        ` : ''}

        ${data.lab_results && data.lab_results.length > 0 ? `
          <div class="luxury-title">${t.labsTitle}</div>
          <ul class="list-container" style="list-style-type: square;">
            ${data.lab_results.map((lab: any) => `
              <li class="list-item"><strong>${lab.test}</strong>: ${lab.result}</li>
            `).join('')}
          </ul>
        ` : ''}

        <div class="luxury-title">${t.recommendationsTitle}</div>
        <div class="notes-block" style="border-right-color: ${lang === 'ar' ? '#10b981' : 'none'}; border-left-color: ${lang === 'en' ? '#10b981' : 'none'};">${recommendations}</div>
      `;
    }

    // Common Footer with signature and dynamic QR verification code
    const visitId = data.visit_id || data.id || data.visit?.id || '';
    const qrUrl = `${window.location.origin}/#/public/hims/visit/${visitId}`;
    const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrUrl)}`;

    mainContent += `
      <div class="footer-section">
        <div class="signature-block">
          <div>${t.signature}</div>
          <div style="margin-top: 24px; color: #64748b; font-weight: normal; font-size: 11px;">${t.signatureNote}</div>
        </div>
        ${visitId ? `
          <div class="qr-code-block" style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <img src="${qrImgSrc}" alt="QR verification" style="width: 80px; height: 80px; object-fit: contain;" />
            <div style="font-size: 9px; color: #64748b; font-weight: bold; margin-top: 2px;">مسح للتحقق والصرف 📱</div>
          </div>
        ` : ''}
        <div class="security-badge">
          <div>DOCUMENT SECURED</div>
          <div style="color: #2563eb; font-weight: 800; font-size: 10px; margin-top: 2px;">VERIFIED</div>
        </div>
      </div>
    `;

    printContainer.innerHTML += mainContent;
    document.body.appendChild(printContainer);

    try {
      // 4. Render HTML to canvas
      const canvas = await html2canvas(printContainer, {
        scale: 2, // Double quality for sharp and clear printable text
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      
      // 5. Build PDF from canvas
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Handle multi-page reports (if content overflows single A4 page)
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Save the generated document
      pdf.save(`${type}_${patientName.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('LuxuryReportEngine: Error generating PDF', error);
      throw error;
    } finally {
      // 6. Clean up the DOM
      document.body.removeChild(printContainer);
    }
  }
};