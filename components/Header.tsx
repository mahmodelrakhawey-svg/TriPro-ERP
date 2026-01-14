import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAccounting } from '../context/AccountingContext';
import { RefreshCw, Trash2, Bell, X, User as UserIcon, Settings, LogOut, ChevronDown, UserCircle, Landmark, Info, MessageCircle, Clock, ShoppingCart } from 'lucide-react';
import { supabase } from '../supabaseClient';

// خريطة بسيطة لأسماء الصفحات بناءً على المسار
const routeTitles: Record<string, string> = {
    '/': 'لوحة القيادة الرئيسية',
    '/financial-ratios': 'التحليل المالي والنسب',
    '/sales-invoice': 'فاتورة مبيعات جديدة',
    '/general-journal': 'دفتر اليومية العام',
    '/products': 'إدارة الأصناف',
    '/accounts': 'دليل الحسابات',
    '/ledger': 'دفتر الأستاذ العام',
    '/trial-balance': 'ميزان المراجعة',
    '/income-statement': 'قائمة الدخل',
    '/balance-sheet': 'الميزانية العمومية',
    '/about': 'حول البرنامج',
    // ... يمكن إضافة باقي المسارات هنا
};

const Header = () => {
    const location = useLocation();
    const { lastUpdated, refreshData, clearCache, settings } = useAccounting();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);
    const [timeLeft, setTimeLeft] = useState('');

    const pageTitle = routeTitles[location.pathname] || 'TriPro ERP';
    const unreadCount = notifications.filter(n => !n.is_read).length;

    const fetchNotifications = async () => {
        const { data } = await supabase
            .from('notifications')
            .select('*')
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (data) setNotifications(data);
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const markAsRead = async (id: string) => {
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);
        
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    // Fetch user data
    useEffect(() => {
        const fetchUserData = async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name, role, avatar_url')
                    .eq('id', user.id)
                    .single();
                setCurrentUser(profile);
            }
          } catch (e: any) {
            console.error(`فشل تحميل بيانات المستخدم: ${e.message}`);
          }
        };
        fetchUserData();
    }, []);

    // Subscribe to new notifications
    useEffect(() => {
        const subscription = supabase
            .channel('public:notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
                fetchNotifications();
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Logout function
    const logout = async () => {
        await supabase.auth.signOut();
        navigate('/login');
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setIsUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [userMenuRef]);
    
    // عداد تنازلي للديمو
    useEffect(() => {
        if (currentUser?.role === 'demo') {
            const calculateTimeLeft = () => {
                const now = new Date();
                const nextReset = new Date();
                nextReset.setHours(24, 0, 0, 0); // منتصف الليل القادم
                
                const diff = nextReset.getTime() - now.getTime();
                
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);

                setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
            };

            const timer = setInterval(calculateTimeLeft, 1000);
            calculateTimeLeft();
            return () => clearInterval(timer);
        }
    }, [currentUser]);

    return (
        <header className="bg-white p-4 border-b border-slate-200 flex justify-between items-center sticky top-0 z-40 print:hidden shadow-sm">
            {/* Page Title */}
            <div className="flex items-center gap-3">
                {settings?.logoUrl ? (
                    <img src={settings.logoUrl} alt="Logo" className="w-10 h-10 object-contain" />
                ) : (
                    <img src="/logo.jpg" alt="Logo" className="w-10 h-10 object-contain" />
                )}
                <h1 className="text-xl font-bold text-slate-800">{pageTitle}</h1>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
                {currentUser?.role === 'demo' && (
                    <>
                        <div className="hidden lg:flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-xs font-bold border border-amber-200 shadow-sm" title="سيتم مسح البيانات تلقائياً عند انتهاء العداد">
                            <Clock size={14} />
                            <span>إعادة الضبط: {timeLeft}</span>
                        </div>
                        <a 
                            href="https://wa.me/201008495405?text=مرحباً، أرغب في شراء النسخة الكاملة من برنامج TriPro ERP"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hidden md:flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            <ShoppingCart size={18} />
                            <span>شراء النسخة الكاملة</span>
                        </a>
                        <a 
                            href="https://wa.me/201008495405?text=مرحباً، أود الاستفسار عن برنامج TriPro ERP"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hidden md:flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition-colors shadow-sm"
                        >
                            <MessageCircle size={18} />
                            <span>تواصل معنا</span>
                        </a>
                    </>
                )}

                <div className="flex items-center gap-3 text-sm text-slate-500">
                    <div className="flex items-center gap-1 cursor-pointer hover:text-amber-600 transition-colors" onClick={() => refreshData()} title="تحديث البيانات">
                        <RefreshCw size={14} />
                        <span>
                            آخر تحديث: {lastUpdated ? lastUpdated.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...'}
                        </span>
                    </div>
                    <button 
                        onClick={() => {
                            if (window.confirm('هل أنت متأكد من مسح التخزين المؤقت (Cache) وإعادة تحميل البيانات بالكامل من الخادم؟')) {
                                clearCache();
                            }
                        }}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1" 
                        title="مسح الكاش وإعادة التحميل بالكامل"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>

                {/* Notification Bell */}
                <div className="relative">
                    <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                {unreadCount}
                            </div>
                        )}
                    </button>

                    {/* Notifications Dropdown */}
                    {showNotifications && (
                        <div className="absolute top-full mt-2 right-0 w-80 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <h3 className="font-bold text-sm text-slate-700">التنبيهات</h3>
                                <button onClick={() => setShowNotifications(false)}><X size={14} className="text-slate-400 hover:text-red-500" /></button>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="p-4 text-center text-xs text-slate-400">لا توجد تنبيهات جديدة</div>
                                ) : (
                                    notifications.map(n => (
                                        <div key={n.id} className="p-3 border-b border-slate-50 hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => markAsRead(n.id)}>
                                            <div className="flex justify-between items-start mb-1">
                                                <span className={`text-xs font-bold ${n.type === 'warning' ? 'text-amber-600' : n.type === 'error' ? 'text-red-600' : 'text-blue-600'}`}>{n.title}</span>
                                                <span className="text-[10px] text-slate-400">{new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                            <p className="text-xs text-slate-600 line-clamp-2">{n.message}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="w-px h-6 bg-slate-200 mx-2"></div>

                {/* User Menu */}
                <div className="relative" ref={userMenuRef}>
                    <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="flex items-center gap-2 hover:bg-slate-100 p-1 pr-3 rounded-full transition-colors">
                        <span className="text-sm font-bold text-slate-700 hidden md:block">{currentUser?.full_name || '...'}</span>
                        <ChevronDown size={16} className="text-slate-400" />
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center ring-2 ring-white overflow-hidden">
                            {currentUser?.avatar_url ? (
                                <img src={currentUser.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <UserIcon size={18} className="text-slate-500" />
                            )}
                        </div>
                    </button>

                    {isUserMenuOpen && (
                        <div className="absolute top-full mt-2 left-0 w-56 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-3 border-b border-slate-100">
                                <p className="font-bold text-sm text-slate-800 truncate">{currentUser?.full_name}</p>
                                <p className="text-xs text-slate-500 capitalize">{currentUser?.role}</p>
                            </div>
                            <div className="p-1">
                                <Link to="/profile" onClick={() => setIsUserMenuOpen(false)} className="w-full text-right flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                                    <UserCircle size={16} />
                                    <span>ملفي الشخصي</span>
                                </Link>
                                <Link to="/settings" onClick={() => setIsUserMenuOpen(false)} className="w-full text-right flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                                    <Settings size={16} />
                                    <span>الإعدادات</span>
                                </Link>
                                <Link to="/about" onClick={() => setIsUserMenuOpen(false)} className="w-full text-right flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                                    <Info size={16} />
                                    <span>حول البرنامج</span>
                                </Link>
                                <button onClick={logout} className="w-full text-right flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                                    <LogOut size={16} />
                                    <span>تسجيل الخروج</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;