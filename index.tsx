import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// مكون صائد الأخطاء (Error Boundary) لمنع الشاشة البيضاء
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'sans-serif', direction: 'rtl', textAlign: 'center', backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{ color: '#dc2626', fontSize: '24px', marginBottom: '16px' }}>عذراً، حدث خطأ غير متوقع في النظام</h1>
          <p style={{ color: '#475569', marginBottom: '24px' }}>يرجى محاولة تحديث الصفحة. إذا استمرت المشكلة، قد تكون البيانات المخزنة تالفة.</p>
          
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0', margin: '0 auto', maxWidth: '600px', textAlign: 'left', direction: 'ltr', overflow: 'auto', maxHeight: '200px', marginBottom: '24px' }}>
            <code style={{ color: '#ef4444' }}>{this.state.error && this.state.error.toString()}</code>
          </div>

          <button 
            onClick={() => {
                if(window.confirm('هل أنت متأكد؟ سيتم مسح جميع البيانات المحلية (مثل الجلسة الحالية) وإعادة تشغيل النظام.')) {
                    localStorage.clear(); 
                    window.location.reload();
                }
            }}
            style={{ padding: '12px 24px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
          >
            إصلاح النظام (إعادة ضبط المصنع)
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
  </React.StrictMode>
);