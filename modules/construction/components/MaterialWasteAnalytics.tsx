import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { useAccounting } from '../../../context/AccountingContext';
import { useToast } from '../../../context/ToastContext';
import * as XLSX from 'xlsx';
import {
  Scale, AlertTriangle, CheckCircle2, TrendingDown, TrendingUp,
  Plus, Search, Filter, FileSpreadsheet, Printer, Layers,
  DollarSign, PackageCheck, AlertCircle, Building2, BarChart2,
  PieChart, RefreshCw, X, Edit3, Trash2, ShieldAlert, Sparkles,
  ArrowRight, FileText, CheckSquare, Zap, Calculator, Compass,
  HelpCircle, Eye
} from 'lucide-react';

interface WasteRecord {
  id: string;
  project_id: string;
  project_name?: string;
  material_name: string;
  unit: string;
  theoretical_quantity: number;
  actual_issued_quantity: number;
  allowed_waste_percentage: number;
  unit_cost: number;
  analysis_date: string;
  notes?: string;
  created_at: string;
}

interface BOQReconciliationItem {
  boq_id: string;
  boq_name: string;
  project_id: string;
  project_name: string;
  boq_unit: string;
  estimated_boq_qty: number;
  executed_certified_qty: number;
  completion_pct: number;
  material_name: string;
  material_unit: string;
  standard_ratio: number; // Ratio per 1 unit of BOQ
  theoretical_needed: number;
  actual_issued: number;
  variance_qty: number;
  waste_pct: number;
  allowed_waste_pct: number;
  unit_cost: number;
  excess_financial_loss: number;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

export default function MaterialWasteAnalytics() {
  const { organization, currentSelectedOrgId, currentUser, products } = useAccounting();
  const { showToast } = useToast();
  const orgId = organization?.id || currentSelectedOrgId || currentUser?.organization_id;

  const [activeTab, setActiveTab] = useState<'RECONCILIATION' | 'AUDIT_LOGS' | 'SIMULATOR'>('RECONCILIATION');
  const [projectsList, setProjectsList] = useState<{ id: string; name: string }[]>([]);
  const [wasteRecords, setWasteRecords] = useState<WasteRecord[]>([]);
  const [boqReconciliations, setBoqReconciliations] = useState<BOQReconciliationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'NORMAL'>('ALL');

  // Manual Audit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formProjectId, setFormProjectId] = useState('');
  const [formMaterialName, setFormMaterialName] = useState('حديد تسليح عالي المقاومة 16مم');
  const [formUnit, setFormUnit] = useState('طن');
  const [formTheoretical, setFormTheoretical] = useState<number>(100);
  const [formActual, setFormActual] = useState<number>(104);
  const [formAllowedWaste, setFormAllowedWaste] = useState<number>(3.0);
  const [formUnitCost, setFormUnitCost] = useState<number>(38000);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');

  // Simulator State
  const [simQty, setSimQty] = useState<number>(250);
  const [simStandardRate, setSimStandardRate] = useState<number>(120); // 120 kg/m3
  const [simActualIssued, setSimActualIssued] = useState<number>(33000); // 33,000 kg (33 ton)
  const [simAllowedWaste, setSimAllowedWaste] = useState<number>(3.0); // 3%
  const [simMaterialPrice, setSimMaterialPrice] = useState<number>(38); // 38 EGP/kg

  // Preset Common Construction Materials
  const presetMaterials = [
    { name: 'حديد تسليح عالي المقاومة (B500D)', unit: 'طن', allowed: 3.0, cost: 38000, defaultRate: 120 },
    { name: 'خرسانة مسلحة جاهزة C30', unit: 'م3', allowed: 2.5, cost: 1450, defaultRate: 1.025 },
    { name: 'أسمنت بورتلاندي معبأ رتبة 42.5N', unit: 'طن', allowed: 3.5, cost: 2300, defaultRate: 0.35 },
    { name: 'رمل نظيف متدرج للخرسانات', unit: 'م3', allowed: 5.0, cost: 120, defaultRate: 0.45 },
    { name: 'سن ومحاجر سن 1 و 2', unit: 'م3', allowed: 4.5, cost: 280, defaultRate: 0.85 },
    { name: 'طوب أسمنتي مصمت 25x12x6', unit: 'ألف طوبة', allowed: 4.0, cost: 1800, defaultRate: 0.055 },
    { name: 'سيراميك أرضيات فرز أول', unit: 'م2', allowed: 6.0, cost: 190, defaultRate: 1.06 },
    { name: 'دهانات بلاستيك داخلي نصف لامع', unit: 'بستلة', allowed: 4.0, cost: 850, defaultRate: 0.12 }
  ];

  // Fetch Full Data & Compute Automated BOQ Reconciliations
  const fetchData = async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      // 1. Fetch Projects
      const { data: pData } = await supabase.from('projects').select('id, name').eq('organization_id', orgId);
      const currentProjects = pData || [];
      setProjectsList(currentProjects);

      // 2. Fetch Manual Waste Records
      let query = supabase
        .from('project_material_waste_analysis')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (selectedProjectId !== 'ALL') {
        query = query.eq('project_id', selectedProjectId);
      }

      const { data: wasteData } = await query;
      setWasteRecords((wasteData || []).map((d: any) => ({
        ...d,
        project_name: currentProjects.find(p => p.id === d.project_id)?.name || 'مشروع عام'
      })));

      // 3. Fetch BOQ Items, Issued Materials & Billings for Automated Reconciliation
      const { data: boqData } = await supabase
        .from('project_boq')
        .select('id, project_id, item_name, unit, estimated_quantity, unit_price, material_cost_per_unit')
        .eq('organization_id', orgId);

      const { data: issueItemsData } = await supabase
        .from('project_material_issue_items')
        .select('boq_item_id, quantity, unit_cost, product_id, products(name, sku)')
        .eq('organization_id', orgId);

      // Safe Billings Query
      let billingsData: any[] = [];
      try {
        const { data: bData, error: bErr } = await supabase
          .from('project_progress_billings')
          .select('id, project_id, completion_percentage, items_progress')
          .eq('organization_id', orgId);

        if (!bErr && bData) {
          billingsData = bData;
        }
      } catch (e) {
        // Safe fallback if table structure differs
      }

      // Aggregate Material Issues by BOQ Item
      const issuedByBoq: { [boqId: string]: { totalQty: number; avgCost: number; productName: string } } = {};
      if (issueItemsData) {
        issueItemsData.forEach((item: any) => {
          if (!item.boq_item_id) return;
          if (!issuedByBoq[item.boq_item_id]) {
            issuedByBoq[item.boq_item_id] = {
              totalQty: 0,
              avgCost: Number(item.unit_cost) || 0,
              productName: item.products?.name || 'خامة موقع'
            };
          }
          issuedByBoq[item.boq_item_id].totalQty += Number(item.quantity) || 0;
        });
      }

      // Compute Executed Quantities from Billings
      const executedByBoq: { [boqId: string]: number } = {};
      if (billingsData && billingsData.length > 0) {
        billingsData.forEach((b: any) => {
          if (b.items_progress && typeof b.items_progress === 'object') {
            Object.entries(b.items_progress).forEach(([bId, progressVal]) => {
              const numVal = Number(progressVal) || 0;
              executedByBoq[bId] = Math.max(executedByBoq[bId] || 0, numVal);
            });
          }
        });
      }

      // Build Automated Live Reconciliation Matrix
      const reconMatrix: BOQReconciliationItem[] = [];
      if (boqData && boqData.length > 0) {
        boqData.forEach((boq: any) => {
          const projName = currentProjects.find(p => p.id === boq.project_id)?.name || 'مشروع عام';
          const estQty = Number(boq.estimated_quantity) || 0;
          
          // If items_progress has percentage, calculate quantity, else use recorded quantity
          let execQty = executedByBoq[boq.id] || 0;
          let completionPct = 0;
          if (execQty <= 100 && estQty > 100) {
            completionPct = execQty;
            execQty = (execQty / 100) * estQty;
          } else {
            completionPct = estQty > 0 ? Math.min(100, Math.round((execQty / estQty) * 100)) : 0;
          }

          // Engineering standard material consumption heuristic based on actual BOQ item
          let standardRatio = 1.0;
          let materialName = 'خرسانة مسلحة جاهزة C30';
          let materialUnit = 'م3';
          let unitCost = Number(boq.material_cost_per_unit) || 1450;
          let allowedWastePct = 3.0;

          const nameLower = (boq.item_name || '').toLowerCase();
          if (nameLower.includes('حديد') || nameLower.includes('تسليح') || nameLower.includes('rebar')) {
            standardRatio = 120; // 120 kg/m3
            materialName = 'حديد تسليح عالي المقاومة';
            materialUnit = 'كجم';
            unitCost = 38;
            allowedWastePct = 3.0;
          } else if (nameLower.includes('خرسانة') || nameLower.includes('concrete')) {
            standardRatio = 1.025;
            materialName = 'خرسانة جاهزة C30';
            materialUnit = 'م3';
            unitCost = 1450;
            allowedWastePct = 2.5;
          } else if (nameLower.includes('طوب') || nameLower.includes('مباني') || nameLower.includes('masonry')) {
            standardRatio = 55; // 55 blocks/m2
            materialName = 'طوب أسمنتي مصمت 25x12x6';
            materialUnit = 'طوبة';
            unitCost = 1.8;
            allowedWastePct = 4.0;
          } else if (nameLower.includes('بياض') || nameLower.includes('محارة') || nameLower.includes('plaster')) {
            standardRatio = 0.35; // 0.35 bag/m2
            materialName = 'أسمنت بورتلاندي للتشطيبات';
            materialUnit = 'شيكارة';
            unitCost = 115;
            allowedWastePct = 5.0;
          } else if (nameLower.includes('سيراميك') || nameLower.includes('رخام') || nameLower.includes('tiles')) {
            standardRatio = 1.06;
            materialName = 'سيراميك أرضيات فرز أول';
            materialUnit = 'م2';
            unitCost = 190;
            allowedWastePct = 6.0;
          }

          // Real executed quantity from billings
          const issuedRecord = issuedByBoq[boq.id];
          const actualIssued = issuedRecord ? Number(issuedRecord.totalQty || 0) : 0;
          const theoreticalNeeded = Math.round(execQty * standardRatio * 100) / 100;
          const varianceQty = Math.round((actualIssued - theoreticalNeeded) * 100) / 100;
          const wastePct = theoreticalNeeded > 0 ? Math.round(((actualIssued - theoreticalNeeded) / theoreticalNeeded) * 1000) / 10 : 0;
          const excessWastePct = Math.max(0, wastePct - allowedWastePct);
          const excessQty = (excessWastePct / 100) * theoreticalNeeded;
          const excessFinancialLoss = Math.round(excessQty * unitCost);

          let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
          if (wastePct > allowedWastePct + 2.5) {
            status = 'CRITICAL';
          } else if (wastePct > allowedWastePct) {
            status = 'WARNING';
          }

          reconMatrix.push({
            boq_id: boq.id,
            boq_name: boq.item_name,
            project_id: boq.project_id,
            project_name: projName,
            boq_unit: boq.unit || 'م3',
            estimated_boq_qty: estQty,
            executed_certified_qty: execQty,
            completion_pct: completionPct,
            material_name: issuedRecord?.productName || materialName,
            material_unit: materialUnit,
            standard_ratio: standardRatio,
            theoretical_needed: theoreticalNeeded,
            actual_issued: actualIssued,
            variance_qty: varianceQty,
            waste_pct: wastePct,
            allowed_waste_pct: allowedWastePct,
            unit_cost: unitCost,
            excess_financial_loss: excessFinancialLoss,
            status
          });
        });
      }

      setBoqReconciliations(reconMatrix);
    } catch (err: any) {
      console.warn('Reconciliation fetch error:', err.message);
      setBoqReconciliations([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId, selectedProjectId]);

  // Filtered Reconciliations
  const filteredReconciliations = useMemo(() => {
    return boqReconciliations.filter(item => {
      const matchSearch =
        item.boq_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.material_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.project_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchProject = selectedProjectId === 'ALL' || item.project_id === selectedProjectId;
      const matchRisk = riskFilter === 'ALL' || item.status === riskFilter;
      return matchSearch && matchProject && matchRisk;
    });
  }, [boqReconciliations, searchTerm, selectedProjectId, riskFilter]);

  // Overall Reconciliations KPIs
  const reconKPIs = useMemo(() => {
    let totalItems = filteredReconciliations.length;
    let totalFinancialLoss = 0;
    let criticalCount = 0;
    let warningCount = 0;
    let normalCount = 0;

    filteredReconciliations.forEach(r => {
      totalFinancialLoss += r.excess_financial_loss;
      if (r.status === 'CRITICAL') criticalCount++;
      else if (r.status === 'WARNING') warningCount++;
      else normalCount++;
    });

    return {
      totalItems,
      totalFinancialLoss,
      criticalCount,
      warningCount,
      normalCount
    };
  }, [filteredReconciliations]);

  // Simulator Dynamic Computation
  const computedSimulator = useMemo(() => {
    const theoreticalNeeded = simQty * simStandardRate;
    const varianceQty = simActualIssued - theoreticalNeeded;
    const actualWastePct = theoreticalNeeded > 0 ? (varianceQty / theoreticalNeeded) * 100 : 0;
    const excessWastePct = Math.max(0, actualWastePct - simAllowedWaste);
    const excessQty = (excessWastePct / 100) * theoreticalNeeded;
    const totalLoss = excessQty * simMaterialPrice;

    return {
      theoreticalNeeded: Math.round(theoreticalNeeded * 100) / 100,
      varianceQty: Math.round(varianceQty * 100) / 100,
      actualWastePct: Math.round(actualWastePct * 10) / 10,
      excessWastePct: Math.round(excessWastePct * 10) / 10,
      excessQty: Math.round(excessQty * 100) / 100,
      totalLoss: Math.round(totalLoss)
    };
  }, [simQty, simStandardRate, simActualIssued, simAllowedWaste, simMaterialPrice]);

  // Export Reconciliation to Excel
  const handleExportReconciliationExcel = () => {
    const exportData = filteredReconciliations.map((r, idx) => ({
      '#': idx + 1,
      'المشروع': r.project_name,
      'بند المقايسة (BOQ)': r.boq_name,
      'وحدة البند': r.boq_unit,
      'كمية المقايسة': r.estimated_boq_qty,
      'كمية الإنجاز بالمستخلص': r.executed_certified_qty,
      'نسبة الإنجاز': `${r.completion_pct}%`,
      'الخامة المصروفة': r.material_name,
      'معدل الاستهلاك المعياري': `${r.standard_ratio} ${r.material_unit}/${r.boq_unit}`,
      'الاستهلاك النظري المطلوب': `${r.theoretical_needed} ${r.material_unit}`,
      'الكمية المصروفة فعلياً': `${r.actual_issued} ${r.material_unit}`,
      'فرق الاستهلاك': `${r.variance_qty} ${r.material_unit}`,
      'نسبة الهدر الفعلي %': `${r.waste_pct}%`,
      'الهدر المسموح به %': `${r.allowed_waste_pct}%`,
      'الخسارة المالية المباشرة (ج.م)': r.excess_financial_loss,
      'تقييم الرقابة': r.status === 'CRITICAL' ? '🚨 هدر فادح ونزيف مالي' : r.status === 'WARNING' ? '⚠️ تجاوز طفيف' : '✅ منضبط ضمن الهدر المسموح'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'مطابقة_استهلاك_الخامات');
    XLSX.writeFile(wb, `BOQ_Material_Reconciliation_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير تقرير مطابقة استهلاك الخامات بنجاح 📊', 'success');
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100 font-sans select-none" dir="rtl">
      
      {/* 🏷️ Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Compass className="text-amber-400" size={28} />
            رادار مطابقة صرف الخامات مع المقايسة والمستخلصات (BOQ Material Reconciliation)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            الربط الهندسي اللحظي بين أذون صرف المواد من مخزن الموقع، بنود المقايسة، وكميات الإنجاز المعتمدة في المستخلصات لكشف الهدر والتسريب فورياً.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-black text-xs shadow-lg shadow-amber-600/20 transition-all flex items-center gap-1.5"
          >
            <Plus size={15} />
            تسجيل فحص هدر يدوي
          </button>

          <button
            onClick={handleExportReconciliationExcel}
            className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all"
            title="تصدير إكسيل"
          >
            <FileSpreadsheet size={16} />
          </button>

          <button
            onClick={() => window.print()}
            className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all"
            title="طباعة التقرير الفني"
          >
            <Printer size={16} />
          </button>

          <button
            onClick={fetchData}
            className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-all"
            title="تحديث البيانات اللحظية"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 🗂️ Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 mb-6 pb-2 text-xs font-black">
        <button
          onClick={() => setActiveTab('RECONCILIATION')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 ${
            activeTab === 'RECONCILIATION'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Zap size={15} />
          📡 رادار المطابقة الحية (BOQ vs أذون الصرف والمستخلصات)
        </button>

        <button
          onClick={() => setActiveTab('SIMULATOR')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 ${
            activeTab === 'SIMULATOR'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Calculator size={15} />
          🧮 محاكي تسعير وتحمل الهدر الهندسي (Tolerance Simulator)
        </button>

        <button
          onClick={() => setActiveTab('AUDIT_LOGS')}
          className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 ${
            activeTab === 'AUDIT_LOGS'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <FileText size={15} />
          📋 سجل الفحوصات والتحاليل المعملية الميدانية
        </button>
      </div>

      {/* 📊 KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <Building2 size={14} className="text-amber-400" /> البنود الخاضعة للرقابة
          </span>
          <div className="text-xl font-black font-mono text-white">{reconKPIs.totalItems} <span className="text-xs font-normal text-slate-500">بند مقايسة</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-400" /> استهلاك منضبط
          </span>
          <div className="text-xl font-black font-mono text-emerald-400">{reconKPIs.normalCount} <span className="text-xs font-normal text-slate-500">ضمن الهدر المسموح</span></div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-rose-400" /> بنود حرجة (تجاوز فادح)
          </span>
          <div className={`text-xl font-black font-mono ${reconKPIs.criticalCount > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
            {reconKPIs.criticalCount} <span className="text-xs font-normal text-slate-500">بند متجاوز</span>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
          <span className="text-slate-400 text-xs font-bold flex items-center gap-1.5">
            <DollarSign size={14} className="text-rose-400" /> إجمالي النزيف المالي الزائد
          </span>
          <div className="text-xl font-black font-mono text-rose-400">
            {reconKPIs.totalFinancialLoss.toLocaleString()} <span className="text-xs font-normal text-slate-500">ج.م / ر.س</span>
          </div>
        </div>
      </div>

      {/* 🎛️ Search & Filter Controls */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3 mb-6">
        <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-xl">
          <div className="relative flex-1">
            <Search size={15} className="absolute right-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="بحث ببند المقايسة، اسم الخامة، اسم المشروع..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-9 pl-4 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-amber-500"
            />
          </div>

          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 outline-none"
          >
            <option value="ALL">جميع المشاريع الإنشائية</option>
            {projectsList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <span className="text-xs text-slate-400 font-bold">مستوى المخاطرة:</span>
          <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex items-center text-xs">
            <button
              onClick={() => setRiskFilter('ALL')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${riskFilter === 'ALL' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              الكل
            </button>
            <button
              onClick={() => setRiskFilter('CRITICAL')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${riskFilter === 'CRITICAL' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              حرجة 🚨
            </button>
            <button
              onClick={() => setRiskFilter('NORMAL')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${riskFilter === 'NORMAL' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              منضبطة ✅
            </button>
          </div>
        </div>
      </div>

      {/* 📡 TAB 1: BOQ LIVE RECONCILIATION RADAR */}
      {activeTab === 'RECONCILIATION' && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">بند المقايسة والمشروع</th>
                  <th className="p-3.5 text-center">كمية المستخلص المعتمدة</th>
                  <th className="p-3.5">الخامة ومعدل الاستهلاك</th>
                  <th className="p-3.5 text-center">الاستهلاك النظري</th>
                  <th className="p-3.5 text-center">المنصرف الفعلي</th>
                  <th className="p-3.5 text-center">فرق الكمية</th>
                  <th className="p-3.5 text-center">نسبة الهدر</th>
                  <th className="p-3.5 text-center">النزيف المالي الزائد</th>
                  <th className="p-3.5 text-center">الحالة الرقابية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {filteredReconciliations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 font-bold">
                      لا توجد بنود مطابقة مطابقة للفلتر المحدد
                    </td>
                  </tr>
                ) : (
                  filteredReconciliations.map((item) => {
                    const isCritical = item.status === 'CRITICAL';
                    const isWarning = item.status === 'WARNING';

                    return (
                      <tr
                        key={item.boq_id}
                        className={`hover:bg-slate-900/40 transition-colors ${
                          isCritical ? 'bg-rose-950/20' : isWarning ? 'bg-amber-950/15' : ''
                        }`}
                      >
                        {/* BOQ Item & Project */}
                        <td className="p-3.5">
                          <div className="font-black text-white text-xs">{item.boq_name}</div>
                          <div className="text-[10px] text-amber-400/90 mt-0.5 flex items-center gap-1.5">
                            <Building2 size={11} /> {item.project_name}
                          </div>
                        </td>

                        {/* Executed / Certified Quantity */}
                        <td className="p-3.5 text-center">
                          <div className="font-mono font-black text-white text-xs">
                            {item.executed_certified_qty.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">{item.boq_unit}</span>
                          </div>
                          <div className="w-20 bg-slate-800 h-1.5 rounded-full mx-auto mt-1 overflow-hidden">
                            <div className="bg-amber-400 h-full rounded-full" style={{ width: `${item.completion_pct}%` }} />
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono">إنجاز %{item.completion_pct}</span>
                        </td>

                        {/* Material Name & Standard Ratio */}
                        <td className="p-3.5">
                          <div className="font-bold text-slate-200">{item.material_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            المعيار: {item.standard_ratio} {item.material_unit}/{item.boq_unit}
                          </div>
                        </td>

                        {/* Theoretical Required */}
                        <td className="p-3.5 text-center font-mono font-bold text-slate-300">
                          {item.theoretical_needed.toLocaleString()} <span className="text-[10px] text-slate-500">{item.material_unit}</span>
                        </td>

                        {/* Actual Issued */}
                        <td className="p-3.5 text-center font-mono font-black text-white">
                          {item.actual_issued.toLocaleString()} <span className="text-[10px] text-slate-500">{item.material_unit}</span>
                        </td>

                        {/* Variance Qty */}
                        <td className={`p-3.5 text-center font-mono font-black ${item.variance_qty > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {item.variance_qty > 0 ? `+${item.variance_qty.toLocaleString()}` : item.variance_qty.toLocaleString()} <span className="text-[10px] text-slate-500">{item.material_unit}</span>
                        </td>

                        {/* Waste % vs Tolerance */}
                        <td className="p-3.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                            isCritical ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                            isWarning ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                            'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            %{item.waste_pct}
                          </span>
                          <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                            المسموح: %{item.allowed_waste_pct}
                          </div>
                        </td>

                        {/* Excess Financial Loss */}
                        <td className="p-3.5 text-center font-mono font-black">
                          {item.excess_financial_loss > 0 ? (
                            <span className="text-rose-400 bg-rose-950/60 px-2 py-1 rounded-lg border border-rose-900/60">
                              {item.excess_financial_loss.toLocaleString()} ج.م
                            </span>
                          ) : (
                            <span className="text-emerald-400 text-[11px]">لا يوجد خسارة</span>
                          )}
                        </td>

                        {/* Risk Status Badge */}
                        <td className="p-3.5 text-center">
                          {isCritical ? (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-rose-900/60 text-rose-200 border border-rose-700 px-2.5 py-1 rounded-xl font-black animate-pulse">
                              <ShieldAlert size={12} /> هدر فادح ونزيف
                            </span>
                          ) : isWarning ? (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-900/60 text-amber-200 border border-amber-700 px-2.5 py-1 rounded-xl font-black">
                              <AlertTriangle size={12} /> تجاوز طفيف
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-900/60 text-emerald-200 border border-emerald-700 px-2.5 py-1 rounded-xl font-black">
                              <CheckCircle2 size={12} /> منضبط
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 🧮 TAB 2: ENGINEERING TOLERANCE SIMULATOR */}
      {activeTab === 'SIMULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
          
          {/* Controls Form */}
          <div className="lg:col-span-6 bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Calculator className="text-amber-400" size={20} />
              حاسبة ومحاكي تسعير وتحمل الهدر قبل الصرف (Pre-Issue Simulator)
            </h2>
            <p className="text-xs text-slate-400">
              قم بإدخال كمية بند المقايسة ومعدل الاستهلاك المعياري لاحتساب الحد الأقصى المسموح بصرفه من المخزن وتوقع الخسارة المالية عند أي زيادة.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">اختر نموذج خامة قياسية</label>
                <div className="grid grid-cols-2 gap-2">
                  {presetMaterials.slice(0, 4).map(p => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => {
                        setSimStandardRate(p.defaultRate);
                        setSimAllowedWaste(p.allowed);
                        setSimMaterialPrice(p.cost > 1000 ? p.cost / 1000 : p.cost);
                      }}
                      className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-right text-[11px] text-slate-300 transition-all truncate"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">كمية البند المنفذة بالـ BOQ (م3 / م2)</label>
                  <input
                    type="number"
                    min={1}
                    value={simQty}
                    onChange={e => setSimQty(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">معدل الاستهلاك المعياري لكل وحدة</label>
                  <input
                    type="number"
                    step="0.01"
                    value={simStandardRate}
                    onChange={e => setSimStandardRate(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">الكمية المصروفة فعلياً من المخزن</label>
                  <input
                    type="number"
                    min={1}
                    value={simActualIssued}
                    onChange={e => setSimActualIssued(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">سعر وحدة الخامة (ج.م / ر.س)</label>
                  <input
                    type="number"
                    value={simMaterialPrice}
                    onChange={e => setSimMaterialPrice(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">الهدر المسموح به تعاقدياً (%): {simAllowedWaste}%</label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={simAllowedWaste}
                  onChange={e => setSimAllowedWaste(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Real-Time Calculation Results */}
          <div className="lg:col-span-6 bg-slate-950 p-6 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4">
            <h3 className="text-sm font-black text-slate-300 flex items-center gap-2">
              <Sparkles className="text-amber-400" size={18} />
              نتيجة التحليل والمطابقة الهندسية اللحظية
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-xs">الاستهلاك النظري الصافي</span>
                <div className="text-lg font-black font-mono text-white mt-1">{computedSimulator.theoreticalNeeded.toLocaleString()}</div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-xs">فرق الكمية المنصرفة</span>
                <div className={`text-lg font-black font-mono mt-1 ${computedSimulator.varianceQty > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {computedSimulator.varianceQty > 0 ? `+${computedSimulator.varianceQty.toLocaleString()}` : computedSimulator.varianceQty.toLocaleString()}
                </div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-xs">نسبة الهدر الفعلي</span>
                <div className="text-lg font-black font-mono text-amber-400 mt-1">%{computedSimulator.actualWastePct}</div>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                <span className="text-slate-400 text-xs">تجاوز نسبة الهدر المسموح</span>
                <div className="text-lg font-black font-mono text-rose-400 mt-1">%{computedSimulator.excessWastePct}</div>
              </div>
            </div>

            <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-rose-300 block">إجمالي الخسارة المالية غير المبررة</span>
                <span className="text-[10px] text-rose-400/80">تكلفة كمية الهدر التي تتجاوز النسبة المسموحة</span>
              </div>
              <div className="text-2xl font-black font-mono text-rose-400">
                {computedSimulator.totalLoss.toLocaleString()} <span className="text-xs font-normal">ج.م / ر.س</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 bg-slate-900 p-3 rounded-xl border border-slate-800">
              💡 <strong>توصية النظام:</strong> {
                computedSimulator.actualWastePct <= simAllowedWaste
                  ? 'الاستهلاك منضبط تماماً ويقع ضمن حدود المواصفة الهندسية المعتمدة ✅'
                  : 'يجب مراجعة أوامر الصرف الميدانية وتطبيق غرامة هدر مواد على مقاول الباطن أو مهندس التنفيذ ⚠️'
              }
            </div>
          </div>

        </div>
      )}

      {/* 📋 TAB 3: MANUAL AUDIT LOGS */}
      {activeTab === 'AUDIT_LOGS' && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl mb-8">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/60">
            <h3 className="text-xs font-black text-slate-300">سجل الفحوصات المعملية والتحاليل الميدانية</h3>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all"
            >
              + إضافة فحص جديد
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">المشروع والخامة</th>
                  <th className="p-3.5 text-center">الكمية النظرية</th>
                  <th className="p-3.5 text-center">المنصرف الفعلي</th>
                  <th className="p-3.5 text-center">نسبة الهدر</th>
                  <th className="p-3.5 text-center">الهدر المسموح</th>
                  <th className="p-3.5 text-center">الخسارة المالية</th>
                  <th className="p-3.5 text-center">تاريخ الفحص</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {wasteRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-bold">
                      لا توجد فحوصات معملية مسجلة حتى الآن
                    </td>
                  </tr>
                ) : (
                  wasteRecords.map(r => {
                    const variance = r.actual_issued_quantity - r.theoretical_quantity;
                    const wastePct = r.theoretical_quantity > 0 ? Math.round((variance / r.theoretical_quantity) * 1000) / 10 : 0;
                    const excessPct = Math.max(0, wastePct - r.allowed_waste_percentage);
                    const lossCost = Math.round((excessPct / 100) * r.theoretical_quantity * r.unit_cost);

                    return (
                      <tr key={r.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3.5">
                          <div className="font-bold text-white">{r.material_name}</div>
                          <div className="text-[10px] text-amber-400 mt-0.5">{r.project_name}</div>
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-slate-300">{r.theoretical_quantity} {r.unit}</td>
                        <td className="p-3.5 text-center font-mono font-bold text-white">{r.actual_issued_quantity} {r.unit}</td>
                        <td className="p-3.5 text-center font-mono font-black text-amber-400">%{wastePct}</td>
                        <td className="p-3.5 text-center font-mono text-slate-400">%{r.allowed_waste_percentage}</td>
                        <td className="p-3.5 text-center font-mono font-black text-rose-400">{lossCost.toLocaleString()} ج.م</td>
                        <td className="p-3.5 text-center font-mono text-slate-400">{r.analysis_date}</td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={async () => {
                              if (!window.confirm('هل تريد حذف سجل الفحص؟')) return;
                              await supabase.from('project_material_waste_analysis').delete().eq('id', r.id);
                              fetchData();
                            }}
                            className="p-1.5 hover:bg-slate-800 text-rose-400 hover:text-rose-300 rounded-lg transition-all"
                            title="حذف"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ✏️ ADD / EDIT AUDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h2 className="font-black text-white text-base flex items-center gap-2">
                <Plus size={18} className="text-amber-400" />
                تسجيل فحص وتحليل هدر لخامة بموقع المشروع
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const payload = {
                    organization_id: orgId,
                    project_id: formProjectId || projectsList[0]?.id,
                    material_name: formMaterialName,
                    unit: formUnit,
                    theoretical_quantity: formTheoretical,
                    actual_issued_quantity: formActual,
                    allowed_waste_percentage: formAllowedWaste,
                    unit_cost: formUnitCost,
                    analysis_date: formDate,
                    notes: formNotes || null
                  };

                  const { error } = await supabase.from('project_material_waste_analysis').insert(payload);
                  if (error) throw error;
                  showToast('تم تسجيل فحص هدر الخامة بنجاح ✅', 'success');
                  setIsModalOpen(false);
                  fetchData();
                } catch (err: any) {
                  showToast('خطأ أثناء الحفظ: ' + err.message, 'error');
                }
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block text-slate-400 font-bold mb-1">المشروع الإنشائي *</label>
                <select
                  required
                  value={formProjectId}
                  onChange={e => setFormProjectId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none focus:border-amber-500"
                >
                  <option value="">-- اختر المشروع --</option>
                  {projectsList.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">اسم الخامة *</label>
                  <input
                    type="text"
                    required
                    value={formMaterialName}
                    onChange={e => setFormMaterialName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">وحدة القياس</label>
                  <input
                    type="text"
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">الكمية النظرية المحسوبة *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formTheoretical}
                    onChange={e => setFormTheoretical(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">الكمية المنصرفة فعلياً *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formActual}
                    onChange={e => setFormActual(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">الهدر المسموح به (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formAllowedWaste}
                    onChange={e => setFormAllowedWaste(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">سعر الوحدة (ج.م / ر.س)</label>
                  <input
                    type="number"
                    value={formUnitCost}
                    onChange={e => setFormUnitCost(Number(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">ملاحظات التحليل وأسباب التجاوز</label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="مثال: فحص معملي لكسر المكعبات أو تالف في التخزين الميداني"
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-black shadow-lg shadow-amber-600/20 transition-all"
                >
                  حفظ الفحص
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
