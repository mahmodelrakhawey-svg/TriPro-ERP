-- إصلاح علاقة الربط في جدول تقارير العجز
-- Fix relationship for Deficit Report

-- تعديل عمود rejected_by ليشير إلى جدول profiles بدلاً من auth.users
-- هذا يسمح لـ PostgREST باكتشاف العلاقة وجلب اسم المستخدم
ALTER TABLE public.rejected_cash_closings
DROP CONSTRAINT IF EXISTS rejected_cash_closings_rejected_by_fkey;

ALTER TABLE public.rejected_cash_closings
ADD CONSTRAINT rejected_cash_closings_rejected_by_fkey
FOREIGN KEY (rejected_by) REFERENCES public.profiles(id);