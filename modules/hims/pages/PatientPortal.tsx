import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { 
  User, 
  DollarSign, 
  Pill, 
  AlertTriangle,
  Clock,
  CheckCircle,
  Stethoscope,
  Info,
  Activity,
  ClipboardList
} from 'lucide-react';

interface PortalData {
  hospital_name: string;
  hospital_logo?: string;
  patient_name: string;
  patient_blood: string;
  doctor_name: string;
  specialty: string;
  check_in_time: string;
  visit_status: string;
  billing?: {
    total_amount: number;
    patient_paid_amount: number;
    insurance_covered_amount: number;
    payment_status: string;
    has_insurance: boolean;
  };
  prescriptions: {
    id: string;
    medications: {
      drug_name: string;
      qty: number;
      dosage: string;
      frequency: string;
    }[];
    status: string;
    created_at: string;
  }[];
  labs: {
    id: string;
    test_name: string;
    status: string;
    result?: string;
    created_at: string;
  }[];
  radiology: {
    id: string;
    scan_type: string;
    status: string;
    report?: string;
    created_at: string;
  }[];
  error?: string;
}

export default function PatientPortal() {
  const { visitId } = useParams<{ visitId: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visitId) {
      fetchPortalData();
    }
  }, [visitId]);

  const fetchPortalData = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('hims_get_public_visit_portal_data', {
        p_visit_id: visitId
      });
      if (error) throw error;
      setData(res);
    } catch (err: any) {
      console.error(err);
      setData({
        error: err.message || 'فشل تحميل بيانات الزيارة الطبية',
        hospital_name: '',
        patient_name: '',
        patient_blood: '',
        doctor_name: '',
        specialty: '',
        check_in_time: '',
        visit_status: '',
        prescriptions: [],
        labs: [],
        radiology: []
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{
          ...styles.spinner,
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={styles.loadingText}>جاري تحميل ملف المريض الإلكتروني...</p>
      </div>
    );
  }

  if (data?.error) {
    return (
      <div style={styles.errorContainer}>
        <AlertTriangle size={48} color="#ef4444" />
        <h2 style={styles.errorTitle}>خطأ في تحميل البيانات</h2>
        <p style={styles.errorText}>{data.error}</p>
        <button style={styles.retryButton} onClick={fetchPortalData}>إعادة المحاولة</button>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header}>
        {data?.hospital_logo ? (
          <img src={data.hospital_logo} alt="logo" style={styles.logo} />
        ) : (
          <div style={styles.logoPlaceholder}>🏥</div>
        )}
        <h1 style={styles.hospitalName}>{data?.hospital_name}</h1>
        <span style={styles.badge}>بوابة المريض الرقمية</span>
      </header>

      {/* Patient info */}
      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <User size={20} color="#3b82f6" />
          <h2 style={styles.cardTitle}>بيانات الزيارة والمريض</h2>
        </div>
        <div style={styles.infoGrid}>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>اسم المريض</span>
            <span style={styles.infoVal}>{data?.patient_name}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>فصيلة الدم</span>
            <span style={styles.infoVal}>{data?.patient_blood}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>الطبيب المعالج</span>
            <span style={styles.infoVal}>{data?.doctor_name} ({data?.specialty})</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>تاريخ الدخول</span>
            <span style={styles.infoVal}>
              {data?.check_in_time ? new Date(data.check_in_time).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
            </span>
          </div>
        </div>
      </section>

      {/* Billing Invoice */}
      {data?.billing && (
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <DollarSign size={20} color="#10b981" />
            <h2 style={styles.cardTitle}>الفاتورة الطبية والمدفوعات</h2>
          </div>
          
          <div style={styles.billingRow}>
            <span>إجمالي الفاتورة:</span>
            <span style={styles.priceBold}>{(data.billing.total_amount || 0).toLocaleString()} EGP</span>
          </div>
          {data.billing.insurance_covered_amount > 0 && (
            <div style={styles.billingRow}>
              <span>مساهمة شركة التأمين 🛡️:</span>
              <span style={{ ...styles.priceBold, color: '#059669' }}>-{(data.billing.insurance_covered_amount || 0).toLocaleString()} EGP</span>
            </div>
          )}
          <div style={styles.billingRow}>
            <span>المدفوع نقداً:</span>
            <span style={{ ...styles.priceBold, color: '#2563eb' }}>{(data.billing.patient_paid_amount || 0).toLocaleString()} EGP</span>
          </div>
          
          <div style={styles.divider}></div>
          
          <div style={styles.billingRow}>
            <span style={{ fontWeight: 'bold' }}>المتبقي المطلوب سداده:</span>
            <span style={{ ...styles.priceBold, fontSize: '1.2rem', color: '#ef4444' }}>
              {Math.max(0, data.billing.total_amount - data.billing.insurance_covered_amount - data.billing.patient_paid_amount).toLocaleString()} EGP
            </span>
          </div>

          <div style={{
            ...styles.paymentStatusBadge,
            backgroundColor: data.billing.payment_status === 'paid' ? '#ecfdf5' : '#fef2f2',
            color: data.billing.payment_status === 'paid' ? '#065f46' : '#991b1b',
            borderColor: data.billing.payment_status === 'paid' ? '#a7f3d0' : '#fecaca',
          }}>
            {data.billing.payment_status === 'paid' ? 'تم تسوية حساب الزيارة بالكامل ✅' : 'بانتظار سداد باقي الفاتورة بالخزينة ⚠️'}
          </div>
        </section>
      )}

      {/* Prescription */}
      {data?.prescriptions && data.prescriptions.length > 0 && (
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <Pill size={20} color="#ec4899" />
            <h2 style={styles.cardTitle}>الوصفة الطبية (الروشتة الإلكترونية)</h2>
          </div>
          {data.prescriptions.map((presc) => (
            <div key={presc.id} style={styles.prescBlock}>
              <div style={styles.prescMeta}>
                <span>حالة الوصفة:</span>
                <span style={{
                  ...styles.statusTag,
                  backgroundColor: presc.status === 'dispensed' ? '#ecfdf5' : '#eff6ff',
                  color: presc.status === 'dispensed' ? '#065f46' : '#1e40af'
                }}>
                  {presc.status === 'dispensed' ? 'تم صرف العلاج من الصيدلية ✅' : 'بانتظار الصرف بالصيدلية ⏳'}
                </span>
              </div>
              
              <div style={styles.medList}>
                {presc.medications?.map((med, idx) => (
                  <div key={idx} style={styles.medItem}>
                    <div style={styles.medName}>
                      <Pill size={14} style={{ marginLeft: 6, color: '#db2777' }} />
                      <strong>{med.drug_name}</strong>
                    </div>
                    <div style={styles.medDetails}>
                      <span>الكمية: {med.qty} | الجرعة: {med.dosage} ({med.frequency})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Lab Results */}
      {data?.labs && data.labs.length > 0 && (
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <Activity size={20} color="#8b5cf6" />
            <h2 style={styles.cardTitle}>تحاليل المختبر الموصوفة</h2>
          </div>
          <div style={styles.medList}>
            {data.labs.map((lab) => (
              <div key={lab.id} style={styles.orderItem}>
                <div style={styles.orderTitleRow}>
                  <strong>{lab.test_name}</strong>
                  <span style={{
                    ...styles.statusTag,
                    backgroundColor: lab.status === 'completed' ? '#ecfdf5' : '#fff7ed',
                    color: lab.status === 'completed' ? '#065f46' : '#c2410c'
                  }}>
                    {lab.status === 'completed' ? 'النتيجة جاهزة ✅' : 'قيد التحليل بالمختبر 🧪'}
                  </span>
                </div>
                {lab.status === 'completed' && lab.result && (
                  <div style={styles.resultBlock}>
                    <strong>النتيجة الطبية:</strong>
                    <p style={{ margin: '4px 0 0 0', color: '#4b5563' }}>{lab.result}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Radiology Results */}
      {data?.radiology && data.radiology.length > 0 && (
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <ClipboardList size={20} color="#f59e0b" />
            <h2 style={styles.cardTitle}>فحوصات الأشعة</h2>
          </div>
          <div style={styles.medList}>
            {data.radiology.map((rad) => (
              <div key={rad.id} style={styles.orderItem}>
                <div style={styles.orderTitleRow}>
                  <strong>{rad.scan_type}</strong>
                  <span style={{
                    ...styles.statusTag,
                    backgroundColor: rad.status === 'completed' ? '#ecfdf5' : '#fff7ed',
                    color: rad.status === 'completed' ? '#065f46' : '#c2410c'
                  }}>
                    {rad.status === 'completed' ? 'التقرير جاهز ✅' : 'بانتظار الفحص والتصوير 🩻'}
                  </span>
                </div>
                {rad.status === 'completed' && rad.report && (
                  <div style={styles.resultBlock}>
                    <strong>التقرير الطبي:</strong>
                    <p style={{ margin: '4px 0 0 0', color: '#4b5563', whiteSpace: 'pre-line' }}>{rad.report}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer message */}
      <footer style={styles.footerNote}>
        <Info size={16} style={{ marginLeft: 4 }} />
        <span>هذا المستند معتمد رقمياً من نظام TriPro ERP الخاص بالرعاية الصحية.</span>
      </footer>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  wrapper: {
    maxWidth: '500px',
    margin: '0 auto',
    padding: '16px',
    fontFamily: 'Tajawal, sans-serif',
    direction: 'rtl',
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontFamily: 'Tajawal, sans-serif',
    backgroundColor: '#f8fafc',
    padding: '24px',
    textAlign: 'center',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #e2e8f0',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
  },
  loadingText: {
    marginTop: '16px',
    color: '#64748b',
    fontWeight: 'bold',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontFamily: 'Tajawal, sans-serif',
    padding: '24px',
    textAlign: 'center',
    gap: '12px',
  },
  errorTitle: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: 0,
  },
  errorText: {
    color: '#64748b',
    margin: 0,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  header: {
    textAlign: 'center',
    padding: '16px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  logo: {
    height: '48px',
    objectFit: 'contain',
  },
  logoPlaceholder: {
    fontSize: '2.5rem',
  },
  hospitalName: {
    fontSize: '1.2rem',
    fontWeight: '900',
    color: '#0f172a',
    margin: 0,
  },
  badge: {
    fontSize: '0.75rem',
    color: '#3b82f6',
    backgroundColor: '#eff6ff',
    padding: '4px 10px',
    borderRadius: '12px',
    fontWeight: 'bold',
    border: '1px solid #dbeafe',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    border: '1px solid #f1f5f9',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: '1px solid #f1f5f9',
    paddingBottom: '8px',
  },
  cardTitle: {
    fontSize: '0.95rem',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: 0,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  infoLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  infoVal: {
    fontSize: '0.85rem',
    fontWeight: 'bold',
    color: '#334155',
  },
  billingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9rem',
    color: '#475569',
  },
  priceBold: {
    fontWeight: 'bold',
    color: '#0f172a',
  },
  divider: {
    height: '1px',
    backgroundColor: '#f1f5f9',
  },
  paymentStatusBadge: {
    padding: '10px',
    borderRadius: '12px',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: '0.85rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    marginTop: '6px',
  },
  prescBlock: {
    border: '1px dashed #e2e8f0',
    borderRadius: '12px',
    padding: '12px',
  },
  prescMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.8rem',
    color: '#64748b',
    marginBottom: '10px',
  },
  statusTag: {
    fontSize: '0.75rem',
    padding: '2px 8px',
    borderRadius: '6px',
    fontWeight: 'bold',
  },
  medList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  medItem: {
    borderBottom: '1px solid #f8fafc',
    paddingBottom: '8px',
  },
  medName: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.9rem',
    color: '#1e293b',
  },
  medDetails: {
    fontSize: '0.8rem',
    color: '#64748b',
    marginRight: '20px',
  },
  orderItem: {
    backgroundColor: '#f8fafc',
    padding: '12px',
    borderRadius: '12px',
    border: '1px solid #f1f5f9',
  },
  orderTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.9rem',
  },
  resultBlock: {
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '8px',
    marginTop: '8px',
    fontSize: '0.8rem',
  },
  footerNote: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '0.7rem',
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 'auto',
    padding: '16px 0 24px 0',
  }
};
