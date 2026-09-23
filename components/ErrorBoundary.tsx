import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  moduleName?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🛡️ [ErrorBoundary Caught Error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleCopyError = () => {
    const errorText = `[TriPro Error] Module: ${this.props.moduleName || 'General'}
Message: ${this.state.error?.message || 'Unknown'}
Stack: ${this.state.error?.stack || ''}
ComponentStack: ${this.state.errorInfo?.componentStack || ''}`;

    navigator.clipboard.writeText(errorText);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  public render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || 'حدث خطأ غير متوقع أثناء عرض هذه الشاشة';
      const moduleName = this.props.moduleName;

      return (
        <div className="min-h-[420px] flex items-center justify-center p-6 bg-slate-50/60 rounded-3xl border border-slate-200/80 my-4" dir="rtl">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-rose-100 max-w-xl w-full text-center space-y-6">
            
            {/* أيقونة الخطأ */}
            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto text-rose-500 border border-rose-100">
              <AlertTriangle size={34} />
            </div>

            {/* نصوص التوضيح */}
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800">
                {title}
              </h3>
              {moduleName && (
                <span className="inline-block bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-full font-bold">
                  الوحدة: {moduleName}
                </span>
              )}
              <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
                تم عزل هذا الخطأ لحماية بقية النظام من التوقف. باقي الأقسام تعمل بشكل طبيعي، ويمكنك المحاولة مجدداً.
              </p>
            </div>

            {/* أزرار الإجراءات */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <RotateCcw size={16} />
                إعادة المحاولة
              </button>

              <button
                type="button"
                onClick={() => { window.location.hash = '#/'; window.location.reload(); }}
                className="w-full sm:w-auto px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <Home size={16} />
                الرئيسية
              </button>
            </div>

            {/* تفاصيل فنية قابلة للطي للمطور / الدعم الفني */}
            <div className="pt-2 border-t border-slate-100 text-right">
              <button
                type="button"
                onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
                className="text-xs text-slate-400 hover:text-slate-600 font-bold flex items-center gap-1 mx-auto transition-colors"
              >
                {this.state.showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {this.state.showDetails ? 'إخفاء التفاصيل الفنية' : 'عرض التفاصيل الفنية للدعم'}
              </button>

              {this.state.showDetails && (
                <div className="mt-3 p-4 bg-slate-900 text-slate-200 rounded-2xl text-xs font-mono overflow-x-auto text-left space-y-2 max-h-48 custom-scrollbar">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="text-rose-400 font-bold">Error Stack</span>
                    <button
                      type="button"
                      onClick={this.handleCopyError}
                      className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] bg-slate-800 px-2 py-0.5 rounded"
                    >
                      {this.state.copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      {this.state.copied ? 'تم النسخ' : 'نسخ'}
                    </button>
                  </div>
                  <p className="text-rose-300 font-semibold">{this.state.error?.toString()}</p>
                  <pre className="text-[10px] text-slate-400 whitespace-pre-wrap">{this.state.error?.stack}</pre>
                </div>
              )}
            </div>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
