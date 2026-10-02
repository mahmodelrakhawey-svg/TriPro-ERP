import { logger } from '../utils/logger';
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAccounting } from '../context/AccountingContext';
import { useAuth } from '../context/AuthContext';
import { secureStorage } from '../utils/securityMiddleware';
import { RefreshCw, Trash2, Bell, X, User as UserIcon, Settings, LogOut, ChevronDown, UserCircle, Landmark, Info, MessageCircle, Clock, ShoppingCart, Loader2, ArrowLeftCircle, Calendar, Layers, Smartphone, Menu } from 'lucide-react';
import { supabase } from '../supabaseClient';
import NotificationCenter from './NotificationCenter';
import { useNotifications } from '../utils/useNotifications';

import { getRouteTitle } from '../utils/routeTitles';

export interface HeaderProps {
  onToggleMobileSidebar?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleMobileSidebar }) => {
    const location = useLocation();
    const { lastUpdated, refreshData, clearCache, settings, isLoading, selectedFiscalYear, setSelectedFiscalYear } = useAccounting();
    const { can } = useAuth();
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isReturning, setIsReturning] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);
    const [timeLeft, setTimeLeft] = useState('');
    const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
    const { unreadCount, refreshNotifications } = useNotifications();

    // Ø­Ø§Ù„Ø© Ø¥Ø¸Ù‡Ø§Ø±/Ø¥Ø®ÙØ§Ø¡ Ø´Ø±ÙŠØ· ØªØ¨ÙˆÙŠØ¨Ø§Øª Ø§Ù„Ø´Ø§Ø´Ø§Øª Ø§Ù„Ù…ÙØªÙˆØ­Ø©
    const [showTabsBar, setShowTabsBar] = useState<boolean>(() => {
        try {
            const saved = secureStorage.getItem<boolean>('tripro_workspace_tabs_enabled');
            return saved !== false;
        } catch {
            return true;
        }
    });

    useEffect(() => {
        const handleTabsToggle = (e: Event) => {
            const val = (e as CustomEvent).detail !== undefined ? (e as CustomEvent).detail : (secureStorage.getItem<boolean>('tripro_workspace_tabs_enabled') !== false);
            setShowTabsBar(val);
        };
        window.addEventListener('workspace-tabs-visibility-changed', handleTabsToggle);
        window.addEventListener('storage', handleTabsToggle);
        return () => {
            window.removeEventListener('workspace-tabs-visibility-changed', handleTabsToggle);
            window.removeEventListener('storage', handleTabsToggle);
        };
    }, []);

    const toggleTabsBar = () => {
        const nextState = !showTabsBar;
        setShowTabsBar(nextState);
        try {
            secureStorage.setItem('tripro_workspace_tabs_enabled', nextState);
            window.dispatchEvent(new CustomEvent('workspace-tabs-visibility-changed', { detail: nextState }));
        } catch (e) {}
    };

    const pageTitle = getRouteTitle(location.pathname);

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
          } catch (e) {
            if (process.env.NODE_ENV === 'development') logger.error(`ÙØ´Ù„ ØªØ­Ù…ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…: ${e.message}`);
          }
        };
        fetchUserData();
    }, []);

    const handleReturnToAdmin = async () => {
        const originalOrgId = secureStorage.getItem('admin_original_org_id');
        // Ø¥Ø°Ø§ Ù„Ù… ØªÙˆØ¬Ø¯ Ù‚ÙŠÙ…Ø©ØŒ Ù†Ù…Ø³Ø­ Ø§Ù„Ù…ÙØªØ§Ø­ ÙˆÙ†ØºÙ„Ù‚ Ø§Ù„Ù…Ù‡Ù…Ø©
        if (!originalOrgId) {
            secureStorage.removeItem('admin_original_org_id');
            return;
        }

        try {
            setIsReturning(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„Ù‚ÙŠÙ…Ø© 'main' ØªØ¹Ù†ÙŠ Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„ÙˆØ¶Ø¹ Ø¨Ø¯ÙˆÙ† Ø´Ø±ÙƒØ© (Super Admin)
            let targetOrgId = originalOrgId === 'main' ? null : originalOrgId;

            // 1. Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„Ù…Ù†Ø¸Ù…Ø© Ø§Ù„Ø£ØµÙ„ÙŠØ© ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ organization_id: targetOrgId })
                .eq('id', user.id);

            // ðŸ›¡ï¸ Ø¥Ø°Ø§ ÙØ´Ù„ Ø§Ù„ØªØ­Ø¯ÙŠØ« Ø¨Ø³Ø¨Ø¨ Ø­Ø°Ù Ø§Ù„Ø´Ø±ÙƒØ© (Ø®Ø·Ø£ Ø§Ù„Ù…ÙØªØ§Ø­ Ø§Ù„Ø£Ø¬Ù†Ø¨ÙŠ 23503)
            if (updateError) {
                if (updateError.code === '23503') {
                    targetOrgId = null; // Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„ÙˆØ¶Ø¹ Ø§Ù„Ø­Ø±
                    await supabase
                        .from('profiles')
                        .update({ organization_id: null })
                        .eq('id', user.id);
                } else {
                    throw updateError;
                }
            }

            // 2. ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù€ Metadata Ù„Ø¶Ù…Ø§Ù† ØªØ­Ø¯ÙŠØ« Ø§Ù„Ù€ Token (JWT)
            await supabase.auth.updateUser({
                data: { ...user.user_metadata, org_id: targetOrgId }
            });

            secureStorage.removeItem('admin_original_org_id');
            window.location.reload(); // Ø¥Ø¹Ø§Ø¯Ø© ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ù†Ø¸Ø§Ù… Ø¨Ø§Ù„Ù‡ÙˆÙŠØ© Ø§Ù„Ø£ØµÙ„ÙŠØ©
        } catch (error) {
            logger.error("Error returning to admin:", error);
            // ðŸ›¡ï¸ ØµÙ…Ø§Ù… Ø£Ù…Ø§Ù†: Ø¥Ø°Ø§ ÙØ´Ù„Øª Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ø£ÙŠ Ø³Ø¨Ø¨ (Ù…Ø«Ù„ Ø­Ø°Ù Ø§Ù„Ø´Ø±ÙƒØ©)ØŒ Ù†Ù…Ø³Ø­ Ø§Ù„Ù…ÙØªØ§Ø­ Ù„ÙÙƒ ØªØ¹Ù„ÙŠÙ‚ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…
            if (secureStorage.getItem('admin_original_org_id')) {
                secureStorage.removeItem('admin_original_org_id');
                window.location.reload();
            }
        } finally {
            setIsReturning(false);
        }
    };

    // --- ØªØ­Ø³ÙŠÙ† Ø§Ù„Ø¯ÙŠÙ…Ùˆ: ØªÙØ¹ÙŠÙ„ Ø§Ù„Ø¬ÙˆÙ„Ø© Ø§Ù„ØªØ¹Ø±ÙŠÙÙŠØ© ---
    useEffect(() => {
        if (currentUser?.role === 'demo') {
            const tourSeen = secureStorage.getItem('demo_tour_seen');
            if (!tourSeen) {
                window.dispatchEvent(new CustomEvent('start-demo-tour'));
            }
        }
    }, [currentUser]);
    const { logout: authLogout } = useAuth();
    // Logout function
    const logout = async () => {
        await authLogout();
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
    
    // Ø¹Ø¯Ø§Ø¯ ØªÙ†Ø§Ø²Ù„ÙŠ Ù„Ù„Ø¯ÙŠÙ…Ùˆ
    useEffect(() => {
        if (currentUser?.role === 'demo') {
            const calculateTimeLeft = () => {
                const now = new Date();
                const nextReset = new Date();
                nextReset.setHours(24, 0, 0, 0); // Ù…Ù†ØªØµÙ Ø§Ù„Ù„ÙŠÙ„ Ø§Ù„Ù‚Ø§Ø¯Ù…
                
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
        <header className="bg-white/95 backdrop-blur-md px-6 py-3 border-b border-slate-200/80 flex justify-between items-center sticky top-0 z-40 print:hidden shadow-xs">
            {/* Page Title & Mobile Menu Toggle */}
            <div className="flex items-center gap-3">
                {onToggleMobileSidebar && (
                    <button
                        type="button"
                        onClick={onToggleMobileSidebar}
                        className="p-2 -mr-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl lg:hidden focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        title="ÙØªØ­ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¬Ø§Ù†Ø¨ÙŠØ©"
                    >
                        <Menu size={22} />
                    </button>
                )}
                {settings?.logoUrl ? (
                    <img src={settings.logoUrl} alt="Logo" className="w-9 h-9 object-contain rounded-lg shrink-0" />
                ) : (
                    <img src="/logo.jpg" alt="Logo" className="w-9 h-9 object-contain rounded-lg shrink-0" />
                )}
                <h1 className="text-base sm:text-lg font-black text-slate-800 tracking-tight truncate max-w-[180px] sm:max-w-none">{pageTitle}</h1>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
                {Boolean(secureStorage.getItem('admin_original_org_id')) && (
                    <button 
                        onClick={handleReturnToAdmin}
                        disabled={isReturning}
                        className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-xl font-black text-sm hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 animate-pulse"
                    >
                        {isReturning ? <Loader2 size={18} className="animate-spin" /> : <ArrowLeftCircle size={18} />}
                        <span>Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„Ù†Ø¸Ø§Ù… Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ</span>
                    </button>
                )}

                {currentUser?.role === 'demo' && (
                    <>
                        <div className="hidden lg:flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-xs font-bold border border-amber-200 shadow-sm" title="Ø³ÙŠØªÙ… Ù…Ø³Ø­ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ Ø§Ù†ØªÙ‡Ø§Ø¡ Ø§Ù„Ø¹Ø¯Ø§Ø¯">
                            <Clock size={14} />
                            <span>Ø¥Ø¹Ø§Ø¯Ø© Ø§Ù„Ø¶Ø¨Ø·: {timeLeft}</span>
                        </div>
                        <a 
                            href="https://wa.me/201008495405?text=Ù…Ø±Ø­Ø¨Ø§Ù‹ØŒ Ø£Ø±ØºØ¨ ÙÙŠ Ø´Ø±Ø§Ø¡ Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„ÙƒØ§Ù…Ù„Ø© Ù…Ù† Ø¨Ø±Ù†Ø§Ù…Ø¬ TriPro ERP"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hidden md:flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            <ShoppingCart size={18} />
                            <span>Ø´Ø±Ø§Ø¡ Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„ÙƒØ§Ù…Ù„Ø©</span>
                        </a>
                        <a 
                            href="https://wa.me/201008495405?text=Ù…Ø±Ø­Ø¨Ø§Ù‹ØŒ Ø£ÙˆØ¯ Ø§Ù„Ø§Ø³ØªÙØ³Ø§Ø± Ø¹Ù† Ø¨Ø±Ù†Ø§Ù…Ø¬ TriPro ERP"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hidden md:flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition-colors shadow-sm"
                        >
                            <MessageCircle size={18} />
                            <span>ØªÙˆØ§ØµÙ„ Ù…Ø¹Ù†Ø§</span>
                        </a>
                    </>
                )}

                {/* ðŸ“… Ù…Ø­Ø¯Ø¯ ÙˆÙ…Ø¤Ø´Ø± Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù†Ø´Ø·Ø© */}
                <div 
                  className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl transition-all shadow-sm"
                  title={`Ø§Ù„Ø³Ù†Ø© Ø§Ù„Ù…Ø§Ù„ÙŠØ© Ø§Ù„Ù…Ø­Ø¯Ø¯Ø© ÙÙŠ Ø§Ù„Ù†Ø¸Ø§Ù…: ${selectedFiscalYear}`}
                >
                    <Calendar size={15} className="text-blue-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-500 hidden sm:inline">Ø§Ù„Ø³Ù†Ø©:</span>
                    <select 
                      value={selectedFiscalYear}
                      onChange={(e) => {
                        const newYear = Number(e.target.value);
                        setSelectedFiscalYear(newYear);
                        refreshData();
                      }}
                      className="bg-transparent font-black text-xs text-slate-800 focus:outline-none cursor-pointer pr-1"
                    >
                      {[2029, 2028, 2027, 2026, 2025, 2024, 2023].map(y => (
                        <option key={y} value={y}>
                          {y} {settings?.lastClosedYear && y <= settings.lastClosedYear ? '(Ù…ØºÙ„Ù‚Ø© ðŸ”’)' : '(Ù†Ø´Ø·Ø© ðŸŸ¢)'}
                        </option>
                      ))}
                    </select>
                    <span 
                      className={`w-2 h-2 rounded-full ${settings?.lastClosedYear && selectedFiscalYear <= settings.lastClosedYear ? 'bg-amber-500' : 'bg-emerald-500 ring-2 ring-emerald-200 animate-pulse'}`}
                      title={settings?.lastClosedYear && selectedFiscalYear <= settings.lastClosedYear ? 'Ø³Ù†Ø© Ù…ØºÙ„Ù‚Ø© Ù…Ø­Ø§Ø³Ø¨ÙŠØ§Ù‹' : 'Ø³Ù†Ø© Ù…Ø§Ù„ÙŠØ© Ù†Ø´Ø·Ø© ÙˆÙ…ÙØªÙˆØ­Ø© Ù„Ù„ØªØ³Ø¬ÙŠÙ„'}
                    ></span>
                </div>

                <div className="flex items-center gap-3 text-sm text-slate-500">
                    <div className="flex items-center gap-2 cursor-pointer hover:text-amber-600 transition-colors" onClick={() => refreshData()} title="ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª">
                        {isLoading ? (
                            <Loader2 size={14} className="animate-spin text-blue-600" />
                        ) : (
                            <RefreshCw size={14} />
                        )}
                        <span>
                            Ø¢Ø®Ø± ØªØ­Ø¯ÙŠØ«: {lastUpdated ? lastUpdated.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...'}
                        </span>
                    </div>
                    <button 
                        onClick={() => {
                            if (window.confirm('Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ù…Ø³Ø­ Ø§Ù„ØªØ®Ø²ÙŠÙ† Ø§Ù„Ù…Ø¤Ù‚Øª (Cache) ÙˆØ¥Ø¹Ø§Ø¯Ø© ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ Ù…Ù† Ø§Ù„Ø®Ø§Ø¯Ù…ØŸ')) {
                                clearCache();
                            }
                        }}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1" 
                        title="Ù…Ø³Ø­ Ø§Ù„ÙƒØ§Ø´ ÙˆØ¥Ø¹Ø§Ø¯Ø© Ø§Ù„ØªØ­Ù…ÙŠÙ„ Ø¨Ø§Ù„ÙƒØ§Ù…Ù„"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>

                {/* Ø²Ø± Ø¥Ø¸Ù‡Ø§Ø± / Ø¥Ø®ÙØ§Ø¡ Ø´Ø±ÙŠØ· ØªØ¨ÙˆÙŠØ¨Ø§Øª Ø§Ù„Ø´Ø§Ø´Ø§Øª Ø§Ù„Ù…ÙØªÙˆØ­Ø© */}
                <button
                    type="button"
                    onClick={toggleTabsBar}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xs ${
                        showTabsBar 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400' 
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
                    }`}
                    title={showTabsBar ? "Ø´Ø±ÙŠØ· Ø§Ù„ØªØ¨ÙˆÙŠØ¨Ø§Øª Ù…ÙØ¹Ù‘Ù„ (Ø§Ù†Ù‚Ø± Ù„Ù„Ø¥Ø®ÙØ§Ø¡)" : "Ø´Ø±ÙŠØ· Ø§Ù„ØªØ¨ÙˆÙŠØ¨Ø§Øª Ù…Ø¹Ø·Ù‘Ù„ (Ø§Ù†Ù‚Ø± Ù„Ù„ØªÙØ¹ÙŠÙ„)"}
                >
                    <Layers size={15} className={showTabsBar ? "text-emerald-600" : "text-slate-400"} />
                    <span className="hidden md:inline">{showTabsBar ? "Ø´Ø±ÙŠØ· Ø§Ù„ØªØ¨ÙˆÙŠØ¨Ø§Øª" : "Ø§Ù„ØªØ¨ÙˆÙŠØ¨Ø§Øª Ù…Ø¹Ø·Ù„Ø©"}</span>
                </button>

                {/* ðŸ“± Ø²Ø± ÙˆØ¶Ø¹ Ø§Ù„Ù…ÙˆØ¨Ø§ÙŠÙ„ Ø§Ù„Ù…ÙŠØ¯Ø§Ù†ÙŠ (PWA Mobile Companion) - ÙŠØ¸Ù‡Ø± ÙÙ‚Ø· Ù„Ù…Ù† Ù„Ø¯ÙŠÙ‡ Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© */}
                {can('mobile', 'view') && (
                    <button
                        type="button"
                        onClick={() => navigate('/mobile')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all shadow-xs"
                        title="ÙØªØ­ ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ù…ÙˆØ¨Ø§ÙŠÙ„ Ø§Ù„Ù…ÙŠØ¯Ø§Ù†ÙŠ (Ù…Ø§Ø³Ø­ Ø§Ù„Ø¨Ø§Ø±ÙƒÙˆØ¯ Ø¨Ø§Ù„ÙƒØ§Ù…ÙŠØ±Ø§ØŒ ÙÙˆØ§ØªÙŠØ± Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ØŒ ÙˆÙ„ÙˆØ­Ø© ØªØ­ÙƒÙ… Ø§Ù„Ù…Ø¯ÙŠØ±)"
                    >
                        <Smartphone size={15} className="text-indigo-600" />
                        <span className="hidden sm:inline">ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ù…ÙˆØ¨Ø§ÙŠÙ„</span>
                    </button>
                )}

                {/* Smart Notification Bell */}
                <div className="relative">
                    <button 
                        onClick={() => setNotificationCenterOpen(true)}
                        className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
                        title="Ø§Ù„Ø¥Ø®Ø·Ø§Ø±Ø§Øª Ø§Ù„Ø°ÙƒÙŠØ©"
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-pulse">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </div>
                        )}
                    </button>
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
                                    <span>Ù…Ù„ÙÙŠ Ø§Ù„Ø´Ø®ØµÙŠ</span>
                                </Link>
                                <Link to="/settings" onClick={() => setIsUserMenuOpen(false)} className="w-full text-right flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                                    <Settings size={16} />
                                    <span>Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª</span>
                                </Link>
                                <Link to="/about" onClick={() => setIsUserMenuOpen(false)} className="w-full text-right flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                                    <Info size={16} />
                                    <span>Ø­ÙˆÙ„ Ø§Ù„Ø¨Ø±Ù†Ø§Ù…Ø¬</span>
                                </Link>
                                <button onClick={logout} className="w-full text-right flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                                    <LogOut size={16} />
                                    <span>ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø±ÙˆØ¬</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Notification Center Modal */}
            <NotificationCenter 
                isOpen={notificationCenterOpen} 
                onClose={() => {
                    setNotificationCenterOpen(false);
                    refreshNotifications();
                }}
            />
        </header>
    );
};

export default Header;
