import React, { useEffect, useState, useCallback } from 'react';
import {
  Row, Col, Card, Badge, Statistic, Typography,
  Tag, Spin, Alert, Empty, Tooltip, Progress
} from 'antd';
import { HomeOutlined, DesktopOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { getOrgId } from '../himsHelpers';
import { HimsBed } from '../hims.types';

const { Title, Text } = Typography;

// ألوان حالة السرير
const BED_STATUS_CONFIG: Record<string, { color: string; label: string; badgeStatus: 'success' | 'error' | 'warning' | 'default' }> = {
  available:   { color: 'border-emerald-400 bg-emerald-50', label: 'متاح',       badgeStatus: 'success' },
  occupied:    { color: 'border-blue-500 bg-blue-50',       label: 'مشغول',      badgeStatus: 'error'   },
  maintenance: { color: 'border-orange-400 bg-orange-50',   label: 'صيانة',      badgeStatus: 'warning' },
  reserved:    { color: 'border-purple-400 bg-purple-50',   label: 'محجوز',      badgeStatus: 'default' },
};

export const InpatientDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [beds, setBeds] = useState<HimsBed[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBeds = useCallback(async () => {
    const orgId = getOrgId(currentUser);
    if (!orgId) {
      setError('لا يمكن تحديد المنظمة. يرجى إعادة تسجيل الدخول.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('hims_beds')
        .select('*, hims_wards(id, name), hims_patients(id, full_name)')
        .eq('organization_id', orgId)
        .order('bed_number');

      if (dbError) throw dbError;
      setBeds(data || []);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError('خطأ في جلب بيانات الأسرة: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchBeds();
  }, [fetchBeds]);

  // Realtime subscription لتحديث الأسرة فور تغير حالتها
  useEffect(() => {
    const orgId = getOrgId(currentUser);
    if (!orgId) return;

    const channel = supabase
      .channel(`inpatient-beds-${orgId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'hims_beds',
        filter: `organization_id=eq.${orgId}`,
      }, () => { fetchBeds(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser, fetchBeds]);

  // إحصائيات ملخص
  const totalBeds   = beds.length;
  const occupied    = beds.filter(b => b.status === 'occupied').length;
  const available   = beds.filter(b => b.status === 'available').length;
  const maintenance = beds.filter(b => b.status === 'maintenance').length;
  const occupancyRate = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;

  return (
    <div className="p-6 rtl text-right space-y-6">
      {/* ─── رأس الصفحة ─── */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <Title level={3} className="!mb-0 flex items-center gap-2">
          <HomeOutlined className="text-blue-600" /> حالة الأجنحة والأسرة
        </Title>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <Text type="secondary" className="text-xs">
              آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG')}
            </Text>
          )}
          <Tooltip title="تحديث البيانات">
            <button
              onClick={fetchBeds}
              disabled={loading}
              className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              <ReloadOutlined spin={loading} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ─── خطأ ─── */}
      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          onClose={() => setError(null)}
        />
      )}

      {/* ─── بطاقات الإحصاء ─── */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl border-none shadow-sm text-center">
            <Statistic title="إجمالي الأسرة" value={totalBeds} prefix={<DesktopOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl border-none shadow-sm text-center">
            <Statistic title="مشغولة" value={occupied} styles={{ content: { color: '#3b82f6' } }} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl border-none shadow-sm text-center">
            <Statistic title="متاحة" value={available} styles={{ content: { color: '#10b981' } }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card className="rounded-2xl border-none shadow-sm text-center">
            <Statistic title="نسبة الإشغال" value={occupancyRate} suffix="%" />
            <Progress
              percent={occupancyRate}
              showInfo={false}
              strokeColor={occupancyRate > 85 ? '#ef4444' : occupancyRate > 70 ? '#f59e0b' : '#10b981'}
              className="mt-2"
            />
          </Card>
        </Col>
      </Row>

      {/* ─── قائمة الأسرة ─── */}
      <Spin spinning={loading} description="جاري تحميل بيانات الأسرة...">
        {!loading && beds.length === 0 && !error ? (
          <Empty description="لا توجد أسرة مسجلة في هذه المنظمة" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Row gutter={[16, 16]}>
            {beds.map(bed => {
              const statusCfg = BED_STATUS_CONFIG[bed.status] || BED_STATUS_CONFIG['available'];
              return (
                <Col xs={24} sm={12} md={8} lg={6} key={bed.id}>
                  <Card
                    hoverable
                    className={`rounded-2xl border-2 transition-all duration-200 ${statusCfg.color}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <Statistic
                        title={<span className="text-xs text-slate-500">رقم السرير</span>}
                        value={bed.bed_number}
                        prefix={<DesktopOutlined className="text-slate-600" />}
                        styles={{ content: { fontSize: 20, fontWeight: 700 } }}
                      />
                      <Badge
                        status={statusCfg.badgeStatus}
                        text={
                          <Tag color={
                            bed.status === 'occupied'    ? 'blue'   :
                            bed.status === 'available'   ? 'green'  :
                            bed.status === 'maintenance' ? 'orange' : 'purple'
                          } className="rounded-lg font-bold">
                            {statusCfg.label}
                          </Tag>
                        }
                      />
                    </div>

                    <p className="text-slate-500 text-sm m-0 mb-1">
                      🏥 الجناح: <strong>{bed.hims_wards?.name || 'غير محدد'}</strong>
                    </p>

                    {bed.status === 'occupied' && bed.hims_patients && (
                      <div className="bg-white/70 backdrop-blur-sm p-2 rounded-xl mt-2 border border-blue-200">
                        <p className="text-xs text-blue-500 font-bold m-0">المريض الحالي:</p>
                        <p className="text-sm font-bold text-blue-800 m-0 truncate">
                          {bed.hims_patients.full_name}
                        </p>
                      </div>
                    )}

                    {bed.status === 'maintenance' && (
                      <div className="bg-orange-100 p-2 rounded-xl mt-2 text-center">
                        <span className="text-xs text-orange-600 font-bold">🔧 تحت الصيانة</span>
                      </div>
                    )}
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Spin>
    </div>
  );
};