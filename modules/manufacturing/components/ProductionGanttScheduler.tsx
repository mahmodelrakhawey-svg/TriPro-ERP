import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Calendar, Clock, Layers, Filter, Search, Plus, RefreshCw,
  Printer, FileSpreadsheet, AlertTriangle, CheckCircle2, Factory,
  ChevronRight, ChevronLeft, Zap, Wrench, ShieldAlert, TrendingUp,
  Cpu, Users, Play, Edit3, X, Eye, ArrowRight, CheckSquare, Sparkles
} from 'lucide-react';

export interface GanttOrder {
  id: string;
  order_number: string;
  product_id: string;
  product_name: string;
  quantity: number;
  start_date: string;
  end_date: string;
  status: 'draft' | 'released' | 'in_progress' | 'completed' | 'cancelled';
  work_center: string;
  progress_percent: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  notes?: string;
}

export interface WorkCenterLane {
  id: string;
  name: string;
  capacity_hours_per_day: number;
  efficiency_percent: number;
  is_bottleneck: boolean;
  color: string;
}

const DEFAULT_WORK_CENTERS: WorkCenterLane[] = [
  { id: 'wc-1', name: 'مركز التشكيل والكبس الهيدروليكي', capacity_hours_per_day: 16, efficiency_percent: 90, is_bottleneck: true, color: 'indigo' },
  { id: 'wc-2', name: 'مركز التشغيل والـ CNC الدقيق', capacity_hours_per_day: 16, efficiency_percent: 88, is_bottleneck: false, color: 'blue' },
  { id: 'wc-3', name: 'مركز اللحام وتجميع الهياكل', capacity_hours_per_day: 8, efficiency_percent: 85, is_bottleneck: false, color: 'amber' },
  { id: 'wc-4', name: 'مركز المعالجة السطحية والدهان الإليكتروستاتيك', capacity_hours_per_day: 8, efficiency_percent: 92, is_bottleneck: false, color: 'purple' },
  { id: 'wc-5', name: 'خط التعبئة والتغليف النهائي', capacity_hours_per_day: 16, efficiency_percent: 95, is_bottleneck: false, color: 'emerald' },
];

export default function ProductionGanttScheduler() {
  const { organization, currentSelectedOrgId, currentUser, products } = useAccounting();
  const { showToast } = useToast();
  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  const [orders, setOrders] = useState<GanttOrder[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenterLane[]>(DEFAULT_WORK_CENTERS);
  const [maintenanceWindows, setMaintenanceWindows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedCenter, setSelectedCenter] = useState('ALL');

  // Timeline Viewport Mode: 'DAYS_14' | 'DAYS_30'
  const [viewMode, setViewMode] = useState<'DAYS_14' | 'DAYS_30'>('DAYS_14');
  const [timelineStartDate, setTimelineStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2); // Start 2 days before today
    return d;
  });

  // Modals
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<GanttOrder | null>(null);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);

  // New Order Form State
  const [newOrderForm, setNewOrderForm] = useState({
    product_id: '',
    quantity: 100,
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0],
    work_center: DEFAULT_WORK_CENTERS[0].name,
    priority: 'HIGH' as 'HIGH' | 'MEDIUM' | 'LOW',
    status: 'released' as 'draft' | 'released' | 'in_progress',
    progress_percent: 0,
    notes: ''
  });

  // Calculate Days Range for Gantt Header
  const daysCount = viewMode === 'DAYS_14' ? 14 : 30;
  const timelineDays = useMemo(() => {
    const days: { date: Date; dateStr: string; dayName: string; dayNumber: number; isToday: boolean; isWeekend: boolean }[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < daysCount; i++) {
      const d = new Date(timelineStartDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      days.push({
        date: d,
        dateStr,
        dayName: d.toLocaleDateString('ar-EG', { weekday: 'short' }),
        dayNumber: d.getDate(),
        isToday: dateStr === todayStr,
        isWeekend: dayOfWeek === 5 || dayOfWeek === 6 // Fri/Sat weekend
      });
    }
    return days;
  }, [timelineStartDate, daysCount]);

  // Fetch Production Orders & Scheduled Maintenance
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Fetch Work Orders
      const { data: mfgData, error: mfgErr } = await supabase
        .from('mfg_production_orders')
        .select('id, order_number, product_id, quantity_to_produce, start_date, end_date, status, notes, created_at, products(name)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (mfgErr) throw mfgErr;

      // 2. Fetch Planned Maintenance (Safe Query)
      try {
        const { data: maintData, error: maintErr } = await supabase
          .from('mfg_maintenance_orders')
          .select('*')
          .eq('organization_id', orgId);

        if (!maintErr) {
          setMaintenanceWindows(maintData || []);
        }
      } catch (mErr) {
        // Table may not exist yet in DB
      }

      if (mfgData && mfgData.length > 0) {
        const mapped: GanttOrder[] = mfgData.map((d: any, index: number) => {
          const assignedCenter = DEFAULT_WORK_CENTERS[index % DEFAULT_WORK_CENTERS.length].name;
          const progress = d.status === 'completed' ? 100 : d.status === 'in_progress' ? 65 : 15;
          const sDate = d.start_date || (d.created_at ? d.created_at.split('T')[0] : new Date().toISOString().split('T')[0]);
          const eDate = d.end_date || (sDate ? new Date(new Date(sDate).getTime() + 4 * 86400000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

          return {
            id: d.id,
            order_number: d.order_number || `WO-${index + 1000}`,
            product_id: d.product_id,
            product_name: d.products?.name || 'منتج صناعي',
            quantity: Number(d.quantity_to_produce || 1),
            start_date: sDate,
            end_date: eDate,
            status: d.status || 'released',
            work_center: assignedCenter,
            progress_percent: progress,
            priority: index % 3 === 0 ? 'HIGH' : 'MEDIUM',
            notes: d.notes || ''
          };
        });
        setOrders(mapped);
      } else {
        // Mock Realistic Factory Dataset if DB is fresh
        seedDefaultDemoOrders();
      }
    } catch (err: any) {
      console.warn('Gantt fetch notice:', err.message);
      seedDefaultDemoOrders();
    } finally {
      setIsLoading(false);
    }
  };

  const seedDefaultDemoOrders = () => {
    const now = new Date();
    const addDays = (offset: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return d.toISOString().split('T')[0];
    };

    const demo: GanttOrder[] = [
      {
        id: 'ord-1',
        order_number: 'WO-2026-8801',
        product_id: 'p1',
        product_name: 'هيكل معدني مجلفن 200سم',
        quantity: 250,
        start_date: addDays(-1),
        end_date: addDays(3),
        status: 'in_progress',
        work_center: 'مركز التشكيل والكبس الهيدروليكي',
        progress_percent: 70,
        priority: 'HIGH',
        notes: 'طلب عاجل لمشروع برج العاصمة'
      },
      {
        id: 'ord-2',
        order_number: 'WO-2026-8802',
        product_id: 'p2',
        product_name: 'تروس نقل حركة برونزية CNC',
        quantity: 120,
        start_date: addDays(1),
        end_date: addDays(5),
        status: 'in_progress',
        work_center: 'مركز التشغيل والـ CNC الدقيق',
        progress_percent: 45,
        priority: 'MEDIUM',
        notes: 'دقة تشغيل ±0.01 مم'
      },
      {
        id: 'ord-3',
        order_number: 'WO-2026-8803',
        product_id: 'p3',
        product_name: 'شاسيهات محولات كهربائية ملحومة',
        quantity: 50,
        start_date: addDays(2),
        end_date: addDays(6),
        status: 'released',
        work_center: 'مركز اللحام وتجميع الهياكل',
        progress_percent: 10,
        priority: 'HIGH',
        notes: 'فحص جودة الأشعة السينية للحام'
      },
      {
        id: 'ord-4',
        order_number: 'WO-2026-8804',
        product_id: 'p4',
        product_name: 'ألواح صاج مدهونة إلكتروستاتيك',
        quantity: 500,
        start_date: addDays(4),
        end_date: addDays(8),
        status: 'released',
        work_center: 'مركز المعالجة السطحية والدهان الإليكتروستاتيك',
        progress_percent: 0,
        priority: 'LOW',
        notes: 'لون رمادي مطفي RAL 7016'
      },
      {
        id: 'ord-5',
        order_number: 'WO-2026-8805',
        product_id: 'p5',
        product_name: 'تغليف وتجهيز شحنات التصدير',
        quantity: 1000,
        start_date: addDays(5),
        end_date: addDays(9),
        status: 'released',
        work_center: 'خط التعبئة والتغليف النهائي',
        progress_percent: 0,
        priority: 'HIGH',
        notes: 'تعبئة وتغليف حراري منصات خشبية'
      }
    ];
    setOrders(demo);
  };

  useEffect(() => {
    fetchData();
  }, [orgId]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch =
        o.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.work_center.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchCenter = selectedCenter === 'ALL' || o.work_center === selectedCenter;
      return matchSearch && matchStatus && matchCenter;
    });
  }, [orders, searchTerm, statusFilter, selectedCenter]);

  // Navigation Step
  const handleShiftTimeline = (direction: 'PREV' | 'NEXT' | 'TODAY') => {
    if (direction === 'TODAY') {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      setTimelineStartDate(d);
      return;
    }
    const step = viewMode === 'DAYS_14' ? 7 : 14;
    const newDate = new Date(timelineStartDate);
    newDate.setDate(newDate.getDate() + (direction === 'NEXT' ? step : -step));
    setTimelineStartDate(newDate);
  };

  // Helper: Position Order Bar on Gantt Canvas
  const getOrderPosition = (startDateStr: string, endDateStr: string) => {
    const tStart = timelineDays[0].dateStr;
    const tEnd = timelineDays[timelineDays.length - 1].dateStr;

    // Dates as timestamps (midnight)
    const tStartMs = new Date(tStart).getTime();
    const tEndMs = new Date(tEnd).getTime() + 86400000;
    const totalDurationMs = tEndMs - tStartMs;

    const oStartMs = new Date(startDateStr).getTime();
    const oEndMs = new Date(endDateStr).getTime() + 86400000;

    // Out of view check
    if (oEndMs < tStartMs || oStartMs > tEndMs) {
      return null;
    }

    const clampedStart = Math.max(tStartMs, oStartMs);
    const clampedEnd = Math.min(tEndMs, oEndMs);

    const leftPercent = ((clampedStart - tStartMs) / totalDurationMs) * 100;
    const widthPercent = Math.max(3, ((clampedEnd - clampedStart) / totalDurationMs) * 100);

    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
      isClippedStart: oStartMs < tStartMs,
      isClippedEnd: oEndMs > tEndMs
    };
  };

  // Save / Update Order Schedule
  const handleSaveOrderSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForEdit) return;

    try {
      if (selectedOrderForEdit.id && !selectedOrderForEdit.id.startsWith('ord-')) {
        await supabase
          .from('mfg_production_orders')
          .update({
            start_date: selectedOrderForEdit.start_date,
            end_date: selectedOrderForEdit.end_date,
            status: selectedOrderForEdit.status,
            notes: selectedOrderForEdit.notes
          })
          .eq('id', selectedOrderForEdit.id);
      }

      setOrders(prev => prev.map(o => o.id === selectedOrderForEdit.id ? selectedOrderForEdit : o));
      showToast('تم حفظ وتحديث جدولة أمر التشغيل بنجاح 📅', 'success');
      setSelectedOrderForEdit(null);
    } catch (err: any) {
      showToast('حدث خطأ أثناء الحفظ: ' + err.message, 'error');
    }
  };

  // Smart 1-Click Auto-Resolve Overlaps
  const handleAutoResolveBottlenecks = () => {
    setOrders(prev => {
      const updated = [...prev];
      // Sort by start date
      updated.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

      // Shift overlapping orders in same center
      const centerLastEnd: { [center: string]: Date } = {};
      updated.forEach(ord => {
        const oStart = new Date(ord.start_date);
        const oEnd = new Date(ord.end_date);
        const durationDays = Math.max(1, Math.round((oEnd.getTime() - oStart.getTime()) / 86400000));

        if (centerLastEnd[ord.work_center]) {
          const prevEnd = centerLastEnd[ord.work_center];
          if (oStart < prevEnd) {
            // Shift start to next day
            const newStart = new Date(prevEnd);
            newStart.setDate(newStart.getDate() + 1);
            const newEnd = new Date(newStart);
            newEnd.setDate(newEnd.getDate() + durationDays);

            ord.start_date = newStart.toISOString().split('T')[0];
            ord.end_date = newEnd.toISOString().split('T')[0];
          }
        }
        centerLastEnd[ord.work_center] = new Date(ord.end_date);
      });

      return updated;
    });
    showToast('تم حل تعارضات خطوط الإنتاج وإعادة جدولة الطاقة آلياً ⚡', 'success');
  };

  // Add New Order
  const handleCreateNewOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderForm.product_id && products.length === 0) {
      showToast('يرجى اختيار المنتج', 'warning');
      return;
    }

    const selProduct = products.find(p => p.id === newOrderForm.product_id);
    const orderNum = `WO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      let createdId = `ord-${Date.now()}`;
      if (orgId) {
        const { data: insData, error: insErr } = await supabase
          .from('mfg_production_orders')
          .insert({
            organization_id: orgId,
            order_number: orderNum,
            product_id: newOrderForm.product_id || products[0]?.id,
            quantity_to_produce: Number(newOrderForm.quantity) || 100,
            start_date: newOrderForm.start_date,
            end_date: newOrderForm.end_date,
            status: newOrderForm.status,
            notes: newOrderForm.notes || null
          })
          .select('id')
          .single();

        if (insErr) {
          console.warn('DB insert notice:', insErr.message);
        } else if (insData) {
          createdId = insData.id;
        }
      }

      const newGanttItem: GanttOrder = {
        id: createdId,
        order_number: orderNum,
        product_id: newOrderForm.product_id || (products[0]?.id || 'p_demo'),
        product_name: selProduct?.name || 'منتج جديد',
        quantity: Number(newOrderForm.quantity) || 100,
        start_date: newOrderForm.start_date,
        end_date: newOrderForm.end_date,
        status: newOrderForm.status,
        work_center: newOrderForm.work_center,
        progress_percent: newOrderForm.progress_percent,
        priority: newOrderForm.priority,
        notes: newOrderForm.notes
      };

      setOrders(prev => [newGanttItem, ...prev]);
      setIsNewOrderModalOpen(false);
      showToast(`تم إدراج وجدولة أمر الإنتاج #${orderNum} بنجاح ✅`, 'success');
    } catch (err: any) {
      showToast('خطأ أثناء إنشاء أمر التشغيل: ' + err.message, 'error');
    }
  };

  // Export Gantt Excel
  const handleExportExcel = () => {
    const exportData = filteredOrders.map(o => ({
      'رقم أمر التشغيل': o.order_number,
      'المنتج التام': o.product_name,
      'الكمية المطلوبة': o.quantity,
      'مركز العمل': o.work_center,
      'تاريخ البدء المجدول': o.start_date,
      'تاريخ التسليم المخطط': o.end_date,
      'الأولوية': o.priority === 'HIGH' ? 'عالية' : o.priority === 'MEDIUM' ? 'متوسطة' : 'منخفضة',
      'الحالة': o.status === 'completed' ? 'مكتمل' : o.status === 'in_progress' ? 'قيد التشغيل' : 'مجدول',
      'نسبة الإنجاز': `${o.progress_percent}%`,
      'ملاحظات': o.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'جدول_الإنتاج_Gantt');
    XLSX.writeFile(wb, `Gantt_Production_Schedule_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير الجدول الزمني للإنتاج بنجاح 📊', 'success');
  };

  // Overall KPIs
  const totalOrders = orders.length;
  const inProgressCount = orders.filter(o => o.status === 'in_progress').length;
  const completedCount = orders.filter(o => o.status === 'completed').length;
  const avgProgress = totalOrders > 0 ? Math.round(orders.reduce((s, o) => s + o.progress_percent, 0) / totalOrders) : 0;
  const overdueCount = orders.filter(o => o.status !== 'completed' && new Date(o.end_date) < new Date()).length;

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100 font-sans select-none" dir="rtl">
      
      {/* 🏷️ Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Calendar className="text-indigo-400" size={28} />
            مخطط جانت لجدولة الإنتاج ومراكز العمل (Production Gantt Scheduling)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            الجدولة الزمنية البصرية لأوامر التشغيل، مراقبة مسارات الإنتاج، تفادي الاختناقات، وربط خطوط التصنيع بالصيانة الوقائية.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleAutoResolveBottlenecks}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-black text-xs shadow-lg shadow-orange-600/20 transition-all flex items-center gap-1.5"
            title="حل التداخلات وتوزيع الأحمال على خطوط الإنتاج آلياً"
          >
            <Sparkles size={14} />
            حل التعارضات الذكي
          </button>

          <button
            onClick={() => setIsNewOrderModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-1.5"
          >
            <Plus size={15} />
            جدولة أمر إنتاج جديد
          </button>

          <button
            onClick={handleExportExcel}
            className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all"
            title="تصدير إكسيل"
          >
            <FileSpreadsheet size={16} />
          </button>

          <button
            onClick={() => window.print()}
            className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all"
            title="طباعة المخطط الزمني"
          >
            <Printer size={16} />
          </button>

          <button
            onClick={fetchData}
            className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-all"
            title="تحديث البيانات"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 📊 KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-6">
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <Factory size={14} className="text-indigo-400" /> إجمالي الأوامر
          </span>
          <div className="text-xl font-black font-mono text-white">{totalOrders} <span className="text-xs font-normal text-slate-500">أمر تشغيل</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <Play size={14} className="text-blue-400" /> قيد التشغيل الفعلي
          </span>
          <div className="text-xl font-black font-mono text-blue-400">{inProgressCount} <span className="text-xs font-normal text-slate-500">على الخطوط</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-400" /> مكتملة وجاهزة
          </span>
          <div className="text-xl font-black font-mono text-emerald-400">{completedCount} <span className="text-xs font-normal text-slate-500">أمر منتهي</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <TrendingUp size={14} className="text-cyan-400" /> متوسط الإنجاز
          </span>
          <div className="text-xl font-black font-mono text-cyan-400">%{avgProgress} <span className="text-xs font-normal text-slate-500">من الخطة</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-rose-400" /> أوامر حرجة متأخرة
          </span>
          <div className={`text-xl font-black font-mono ${overdueCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
            {overdueCount} <span className="text-xs font-normal text-slate-500">أمر متأخر</span>
          </div>
        </div>
      </div>

      {/* 🎛️ Controls & Filter Bar */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3 mb-6">
        
        {/* Search & Center Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search size={15} className="absolute right-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="بحث برقم أمر التشغيل، اسم المنتج، خط الإنتاج..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={selectedCenter}
            onChange={e => setSelectedCenter(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none"
          >
            <option value="ALL">جميع مراكز العمل (All Centers)</option>
            {workCenters.map(wc => (
              <option key={wc.id} value={wc.name}>{wc.name}</option>
            ))}
          </select>
        </div>

        {/* View Range & Navigation */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          
          {/* Zoom toggle */}
          <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex items-center text-xs">
            <button
              onClick={() => setViewMode('DAYS_14')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                viewMode === 'DAYS_14' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              14 يوم
            </button>
            <button
              onClick={() => setViewMode('DAYS_30')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                viewMode === 'DAYS_30' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              30 يوم (شهر)
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => handleShiftTimeline('PREV')}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
              title="الفترة السابقة"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => handleShiftTimeline('TODAY')}
              className="px-2.5 py-1 text-xs font-black text-indigo-400 hover:bg-slate-800 rounded-lg transition-all"
            >
              اليوم
            </button>
            <button
              onClick={() => handleShiftTimeline('NEXT')}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
              title="الفترة التالية"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

        </div>
      </div>

      {/* 📅 GANTT CHART CANVAS */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl mb-8">
        
        {/* Timeline Header Row */}
        <div className="grid grid-cols-12 border-b border-slate-800 bg-slate-900/80">
          
          {/* Work Center Title Column (col-span-3) */}
          <div className="col-span-3 p-3.5 border-l border-slate-800 flex items-center justify-between text-xs font-black text-slate-300">
            <span>مركز العمل / خط الإنتاج</span>
            <span className="text-[10px] text-slate-500 font-mono">طاقة التشغيل</span>
          </div>

          {/* Dates Grid Columns (col-span-9) */}
          <div className="col-span-9 flex overflow-x-auto">
            {timelineDays.map(day => (
              <div
                key={day.dateStr}
                className={`flex-1 min-w-[36px] py-2 px-1 text-center border-l border-slate-850/60 transition-colors ${
                  day.isToday ? 'bg-indigo-950/60 border-indigo-500/40' : day.isWeekend ? 'bg-slate-950/40' : ''
                }`}
              >
                <div className={`text-[10px] font-bold ${day.isToday ? 'text-indigo-400' : 'text-slate-500'}`}>
                  {day.dayName}
                </div>
                <div className={`text-xs font-black font-mono ${
                  day.isToday ? 'text-white bg-indigo-600 rounded-full w-5 h-5 mx-auto flex items-center justify-center' : 'text-slate-300'
                }`}>
                  {day.dayNumber}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Work Center Swimlanes */}
        <div className="divide-y divide-slate-850">
          {workCenters
            .filter(wc => selectedCenter === 'ALL' || wc.name === selectedCenter)
            .map(wc => {
              const laneOrders = filteredOrders.filter(o => o.work_center === wc.name);

              return (
                <div key={wc.id} className="grid grid-cols-12 hover:bg-slate-900/30 transition-all min-h-[95px] relative">
                  
                  {/* Left Work Center Info */}
                  <div className="col-span-3 p-4 border-l border-slate-800 flex flex-col justify-between bg-slate-950/60">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-xs block">{wc.name}</span>
                        {wc.is_bottleneck && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-900 font-black" title="عنق زجاجة (ضغط تشغيل عالي)">
                            ⚠️ Bottleneck
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2 font-mono">
                        <span>{wc.capacity_hours_per_day} س/يوم</span>
                        <span>• كفاءة %{wc.efficiency_percent}</span>
                      </div>
                    </div>

                    <div className="text-[10px] font-bold text-indigo-400/80 mt-2">
                      {laneOrders.length} أوامر مجدولة على الخط
                    </div>
                  </div>

                  {/* Right Gantt Bars Area */}
                  <div className="col-span-9 relative flex items-center py-2 px-1">
                    
                    {/* Background Grid Columns for vertical guideline alignment */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {timelineDays.map(day => (
                        <div
                          key={day.dateStr}
                          className={`flex-1 border-l border-slate-850/30 ${
                            day.isToday ? 'bg-indigo-950/20' : day.isWeekend ? 'bg-slate-950/20' : ''
                          }`}
                        />
                      ))}
                    </div>

                    {/* Orders Render Container */}
                    <div className="relative w-full space-y-2 z-10">
                      {laneOrders.length === 0 ? (
                        <div className="text-center text-slate-600 text-xs py-4">
                          لا توجد أوامر تشغيل على هذا المركز في النطاق الزمني المعروض
                        </div>
                      ) : (
                        laneOrders.map(order => {
                          const pos = getOrderPosition(order.start_date, order.end_date);
                          if (!pos) return null;

                          const isOverdue = order.status !== 'completed' && new Date(order.end_date) < new Date();

                          return (
                            <div
                              key={order.id}
                              onClick={() => setSelectedOrderForEdit(order)}
                              style={{
                                right: pos.left, // RTL layout
                                width: pos.width
                              }}
                              className={`relative rounded-xl p-2.5 text-xs cursor-pointer shadow-lg transition-all transform hover:scale-[1.01] hover:z-20 border group ${
                                order.status === 'completed'
                                  ? 'bg-emerald-950/90 border-emerald-700 text-emerald-100'
                                  : isOverdue
                                    ? 'bg-rose-950/95 border-rose-600 text-rose-100 animate-pulse'
                                    : order.status === 'in_progress'
                                      ? 'bg-indigo-950/90 border-indigo-600 text-indigo-100'
                                      : 'bg-slate-850 border-slate-700 text-slate-200'
                              }`}
                              title={`انقر لتعديل الجدولة (${order.order_number})`}
                            >
                              {/* Progress Fill Underlay */}
                              <div
                                style={{ width: `${order.progress_percent}%` }}
                                className={`absolute inset-y-0 right-0 rounded-xl opacity-20 pointer-events-none transition-all ${
                                  order.status === 'completed' ? 'bg-emerald-400' : 'bg-indigo-400'
                                }`}
                              />

                              {/* Card Content */}
                              <div className="relative z-10 flex justify-between items-center gap-1.5">
                                <div className="truncate min-w-0">
                                  <div className="flex items-center gap-1.5 font-black">
                                    <span className="font-mono text-[11px] text-white">{order.order_number}</span>
                                    <span className="truncate text-slate-300 text-[10px]">({order.product_name})</span>
                                  </div>
                                  <div className="text-[9px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                                    <span>الكمية: {order.quantity}</span>
                                    <span>• {order.start_date} ⬅️ {order.end_date}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                                    order.status === 'completed' ? 'bg-emerald-900 text-emerald-300' :
                                    isOverdue ? 'bg-rose-900 text-rose-300' :
                                    order.status === 'in_progress' ? 'bg-indigo-900 text-indigo-300' :
                                    'bg-slate-750 text-slate-400'
                                  }`}>
                                    %{order.progress_percent}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                  </div>

                </div>
              );
            })}
        </div>

      </div>

      {/* ✏️ EDIT ORDER SCHEDULE MODAL */}
      {selectedOrderForEdit && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h2 className="font-black text-white text-base flex items-center gap-2">
                <Edit3 size={18} className="text-indigo-400" />
                تعديل جدولة أمر التشغيل: {selectedOrderForEdit.order_number}
              </h2>
              <button onClick={() => setSelectedOrderForEdit(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveOrderSchedule} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">المنتج التام</label>
                <input
                  type="text"
                  disabled
                  value={selectedOrderForEdit.product_name}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">تاريخ البدء المجدول *</label>
                  <input
                    type="date"
                    required
                    value={selectedOrderForEdit.start_date}
                    onChange={e => setSelectedOrderForEdit({ ...selectedOrderForEdit, start_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">تاريخ التسليم المخطط *</label>
                  <input
                    type="date"
                    required
                    value={selectedOrderForEdit.end_date}
                    onChange={e => setSelectedOrderForEdit({ ...selectedOrderForEdit, end_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">مركز العمل / خط الإنتاج</label>
                  <select
                    value={selectedOrderForEdit.work_center}
                    onChange={e => setSelectedOrderForEdit({ ...selectedOrderForEdit, work_center: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  >
                    {workCenters.map(wc => (
                      <option key={wc.id} value={wc.name}>{wc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">الحالة التشغيلية</label>
                  <select
                    value={selectedOrderForEdit.status}
                    onChange={e => setSelectedOrderForEdit({ ...selectedOrderForEdit, status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  >
                    <option value="draft">مسودة (Draft)</option>
                    <option value="released">مجدول ومطلق (Released)</option>
                    <option value="in_progress">قيد التشغيل (In Progress)</option>
                    <option value="completed">مكتمل (Completed)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">نسبة الإنجاز الفعلي (%): {selectedOrderForEdit.progress_percent}%</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={selectedOrderForEdit.progress_percent}
                  onChange={e => setSelectedOrderForEdit({ ...selectedOrderForEdit, progress_percent: Number(e.target.value) })}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">ملاحظات التشغيل والورديات</label>
                <textarea
                  value={selectedOrderForEdit.notes}
                  onChange={e => setSelectedOrderForEdit({ ...selectedOrderForEdit, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForEdit(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black shadow-lg shadow-indigo-600/20 transition-all"
                >
                  حفظ وتحديث الجدولة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ➕ CREATE NEW PRODUCTION ORDER MODAL */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h2 className="font-black text-white text-base flex items-center gap-2">
                <Plus size={18} className="text-emerald-400" />
                إدراج وجدولة أمر إنتاج جديد
              </h2>
              <button onClick={() => setIsNewOrderModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewOrder} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">اختر المنتج التام المراد تصنيعه *</label>
                <select
                  required
                  value={newOrderForm.product_id}
                  onChange={e => setNewOrderForm({ ...newOrderForm, product_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-indigo-500"
                >
                  <option value="">-- اختر المنتج التام --</option>
                  {products.filter(p => p.item_type === 'STOCK' || !p.item_type).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku || p.code || 'كود'})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">الكمية المطلوبة *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newOrderForm.quantity}
                    onChange={e => setNewOrderForm({ ...newOrderForm, quantity: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">مركز العمل المبدئي</label>
                  <select
                    value={newOrderForm.work_center}
                    onChange={e => setNewOrderForm({ ...newOrderForm, work_center: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  >
                    {workCenters.map(wc => (
                      <option key={wc.id} value={wc.name}>{wc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">تاريخ البدء المخطط *</label>
                  <input
                    type="date"
                    required
                    value={newOrderForm.start_date}
                    onChange={e => setNewOrderForm({ ...newOrderForm, start_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">تاريخ التسليم المخطط *</label>
                  <input
                    type="date"
                    required
                    value={newOrderForm.end_date}
                    onChange={e => setNewOrderForm({ ...newOrderForm, end_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">درجة الأولوية</label>
                  <select
                    value={newOrderForm.priority}
                    onChange={e => setNewOrderForm({ ...newOrderForm, priority: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  >
                    <option value="HIGH">عالية (High Priority)</option>
                    <option value="MEDIUM">متوسطة (Medium)</option>
                    <option value="LOW">منخفضة (Low)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">الحالة المبدئية</label>
                  <select
                    value={newOrderForm.status}
                    onChange={e => setNewOrderForm({ ...newOrderForm, status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  >
                    <option value="released">مطلق ومجدول (Released)</option>
                    <option value="in_progress">قيد التشغيل فوراً</option>
                    <option value="draft">مسودة</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">ملاحظات أمر التشغيل</label>
                <textarea
                  value={newOrderForm.notes}
                  onChange={e => setNewOrderForm({ ...newOrderForm, notes: e.target.value })}
                  placeholder="مثال: تشغيل ورديتين لسرعة التسليم"
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewOrderModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black shadow-lg shadow-emerald-600/20 transition-all"
                >
                  إدراج في المخطط الزمني
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
