import React from 'react';
import { format, differenceInDays, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isPast } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Milestone {
  id: string;
  title: string;
  expected_start_date: string;
  expected_end_date: string;
  progress_percentage: number;
  status: 'pending' | 'in_progress' | 'completed' | 'delayed';
}

interface Props {
  milestones: Milestone[];
  onMilestoneClick?: (milestone: Milestone) => void; // 🏗️ إضافة دالة التفاعل
}

const ProjectGanttChart: React.FC<Props> = ({ milestones, onMilestoneClick }) => {
  if (milestones.length === 0) return null;

  // 1. حساب النطاق الزمني للمخطط
  const startDates = milestones.map(m => new Date(m.expected_start_date));
  const endDates = milestones.map(m => new Date(m.expected_end_date));
  
  const minDate = new Date(Math.min(...startDates.map(d => d.getTime())));
  const chartStartDate = startOfMonth(minDate);
  
  const maxDate = new Date(Math.max(...endDates.map(d => d.getTime())));
  const chartEndDate = endOfMonth(addDays(maxDate, 7)); // إضافة أسبوع إضافي للرؤية

  const totalDays = differenceInDays(chartEndDate, chartStartDate);
  const days = eachDayOfInterval({ start: chartStartDate, end: chartEndDate });

  // حساب موقع خط "اليوم"
  const today = new Date();
  const todayOffset = differenceInDays(today, chartStartDate);

  const getStatusColor = (status: Milestone['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in_progress': return 'bg-blue-500';
      case 'delayed': return 'bg-red-500';
      default: return 'bg-slate-400';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden rtl">
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <div className="relative">
            {/* Header: Months & Days */}
            <div className="flex border-b border-slate-100 bg-slate-50">
              <div className="w-64 p-4 sticky right-0 bg-slate-50 border-l border-slate-200 z-10 font-bold text-slate-700">المرحلة</div>
              <div className="flex flex-1">
                {days.map((day, idx) => {
                  const isFirstDayOfMonth = day.getDate() === 1;
                  const isCurrentDay = isToday(day);
                  return (
                    <div key={idx} className={`flex-shrink-0 w-8 text-center border-l border-slate-100 py-2 ${isFirstDayOfMonth ? 'bg-orange-50' : ''} ${isCurrentDay ? 'bg-blue-50/50 ring-1 ring-blue-200 z-10' : ''}`}>
                      {isFirstDayOfMonth && (
                        <div className="absolute top-0 text-[10px] font-bold text-orange-600 -mt-1 whitespace-nowrap">
                          {format(day, 'MMMM', { locale: ar })}
                        </div>
                      )}
                      <span className={`text-[10px] font-bold ${isCurrentDay ? 'text-blue-600' : 'text-slate-400'}`}>{format(day, 'd')}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-slate-50">
              {milestones.map((milestone) => {
                const mStart = new Date(milestone.expected_start_date);
                const mEnd = new Date(milestone.expected_end_date);
                
                const startOffset = differenceInDays(mStart, chartStartDate);
                const duration = differenceInDays(mEnd, mStart) + 1;
                
                // تنبيه تأخير: إذا انتهى التاريخ ولم تكتمل المهمة
                const isOverdue = isPast(mEnd) && milestone.status !== 'completed';
                
                return (
                  <div key={milestone.id} className="flex group hover:bg-slate-50/50 transition-colors">
                    {/* Milestone Info Side */}
                    <div className="w-64 p-4 sticky right-0 bg-white group-hover:bg-slate-50 border-l border-slate-200 z-10 flex flex-col justify-center">
                      <span className={`font-bold truncate text-sm ${isOverdue ? 'text-red-600' : 'text-slate-800'}`} title={milestone.title}>
                        {milestone.title}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-400">{duration} يوم</span>
                        {isOverdue && <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded animate-pulse">تأخير!</span>}
                      </div>
                    </div>

                    {/* Timeline Bar Area */}
                    <div className="flex-1 relative h-16 py-4 flex items-center min-w-max">
                      {/* Gray track across all days */}
                      <div className="absolute inset-0 flex">
                         {days.map((_, i) => <div key={i} className="w-8 border-l border-slate-50 flex-shrink-0" />)}
                      </div>

                      {/* Today's Vertical Indicator Line */}
                      {todayOffset >= 0 && todayOffset < days.length && (
                        <div 
                          className="absolute top-0 bottom-0 border-r-2 border-blue-400/50 z-10 pointer-events-none"
                          style={{ right: `${todayOffset * 32 + 16}px` }}
                        >
                          <div className="bg-blue-500 text-white text-[8px] px-1 rounded-sm absolute -top-1 right-0 transform translate-x-1/2">اليوم</div>
                        </div>
                      )}

                      {/* Actual Task Bar */}
                      <div 
                        onClick={() => onMilestoneClick?.(milestone)}
                        className="absolute h-8 rounded-full shadow-sm flex items-center px-3 z-0 overflow-hidden transition-all hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 cursor-pointer"
                        style={{ 
                          right: `${startOffset * 32}px`, 
                          width: `${duration * 32}px`,
                        }}
                      >
                        {/* Progress Background */}
                        <div className={`absolute inset-0 opacity-20 ${getStatusColor(milestone.status)}`} />
                        
                        {/* Progress Bar (Fill) */}
                        <div 
                          className={`absolute inset-y-0 right-0 ${getStatusColor(milestone.status)} transition-all`}
                          style={{ width: `${milestone.progress_percentage}%` }}
                        />

                        {/* Label on Bar */}
                        <span className="relative z-10 text-[10px] font-bold text-white drop-shadow-sm whitespace-nowrap overflow-hidden">
                          {milestone.progress_percentage}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-4 text-[10px] font-bold text-slate-500">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500"></div> مكتمل</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-blue-500"></div> قيد التنفيذ</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> متأخر</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-slate-400"></div> قيد الانتظار</div>
      </div>
    </div>
  );
};

export default ProjectGanttChart;