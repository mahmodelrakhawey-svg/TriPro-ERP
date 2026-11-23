import { describe, it, expect, beforeEach } from 'vitest';
import { 
  INDUSTRY_PRESETS, 
  AVAILABLE_VERTICAL_MODULES 
} from '../components/settings/IndustryModulesTab';
import { 
  isModuleAllowedForOrganization 
} from '../utils/permissionEngine';
import { 
  isRouteAllowedForPrefetch, 
  setPrefetchAllowedModules 
} from '../utils/routePrefetcher';

describe('🧩 Modular Industry Packaging & Presets Engine (تجزئة الموديولات وقوالب الأنشطة)', () => {
  beforeEach(() => {
    setPrefetchAllowedModules(null);
  });

  describe('1. Industry One-Click Presets (قوالب الأنشطة الجاهزة بنقرة واحدة)', () => {
    it('قالب الحلواني والمخابز يحتوي على التصنيع ونقاط البيع والمخازن والمحاسبة', () => {
      const bakeryPreset = INDUSTRY_PRESETS.find(p => p.id === 'bakery_confectionery');
      expect(bakeryPreset).toBeDefined();
      expect(bakeryPreset?.modules).toContain('accounting');
      expect(bakeryPreset?.modules).toContain('inventory');
      expect(bakeryPreset?.modules).toContain('manufacturing');
      expect(bakeryPreset?.modules).toContain('pos');
      expect(bakeryPreset?.modules).toContain('retail');
      // لا يحتوي على المستشفيات أو الملاعب أو المقاولات
      expect(bakeryPreset?.modules).not.toContain('hims');
      expect(bakeryPreset?.modules).not.toContain('stadium');
      expect(bakeryPreset?.modules).not.toContain('construction');
    });

    it('قالب المطاعم والكافيهات يحتوي على نقاط بيع المطاعم وموديول المطاعم والمشتريات', () => {
      const restaurantPreset = INDUSTRY_PRESETS.find(p => p.id === 'restaurant_cafe');
      expect(restaurantPreset).toBeDefined();
      expect(restaurantPreset?.modules).toContain('restaurant');
      expect(restaurantPreset?.modules).toContain('pos');
      expect(restaurantPreset?.modules).toContain('purchases');
      expect(restaurantPreset?.modules).toContain('accounting');
    });

    it('قالب التجزئة والسوبرماركت يحتوي على نقاط البيع والباركود والمخزون', () => {
      const retailPreset = INDUSTRY_PRESETS.find(p => p.id === 'retail_supermarket');
      expect(retailPreset).toBeDefined();
      expect(retailPreset?.modules).toContain('retail');
      expect(retailPreset?.modules).toContain('pos');
      expect(retailPreset?.modules).toContain('inventory');
    });

    it('قالب المراكز الطبية والمستشفيات يحتوي على HIMS والعيادات والصيدلية', () => {
      const himsPreset = INDUSTRY_PRESETS.find(p => p.id === 'healthcare_clinic');
      expect(himsPreset).toBeDefined();
      expect(himsPreset?.modules).toContain('hims');
      expect(himsPreset?.modules).toContain('accounting');
    });

    it('قالب المنشآت الرياضية يحتوي على موديول الاستاد والملاعب والاشتراكات', () => {
      const clubPreset = INDUSTRY_PRESETS.find(p => p.id === 'sports_club');
      expect(clubPreset).toBeDefined();
      expect(clubPreset?.modules).toContain('stadium');
      expect(clubPreset?.modules).toContain('accounting');
    });

    it('قالب المقاولات والتشييد يحتوي على المستخلصات وإدارة المشاريع والعمالة', () => {
      const constructionPreset = INDUSTRY_PRESETS.find(p => p.id === 'construction_projects');
      expect(constructionPreset).toBeDefined();
      expect(constructionPreset?.modules).toContain('construction');
      expect(constructionPreset?.modules).toContain('hr');
      expect(constructionPreset?.modules).toContain('inventory');
    });
  });

  describe('2. Strict Vertical Gating (تشديد حارس الصلاحيات للقطاعات الرأسية)', () => {
    it('يمنع مالك المنشأة (owner) من رؤية المستشفيات أو الملاعب إن لم تكن في باقة منشأته', () => {
      const bakeryOrg = {
        allowed_modules: ['accounting', 'inventory', 'sales', 'purchases', 'retail', 'pos', 'manufacturing']
      };

      // مسموح في الباقة
      expect(isModuleAllowedForOrganization('manufacturing', bakeryOrg, 'owner')).toBe(true);
      expect(isModuleAllowedForOrganization('retail', bakeryOrg, 'owner')).toBe(true);
      expect(isModuleAllowedForOrganization('accounting', bakeryOrg, 'owner')).toBe(true);

      // محجوب تماماً عن المالك لأنها قطاعات رأسية غير مشمولة في باقته
      expect(isModuleAllowedForOrganization('hims', bakeryOrg, 'owner')).toBe(false);
      expect(isModuleAllowedForOrganization('stadium', bakeryOrg, 'owner')).toBe(false);
      expect(isModuleAllowedForOrganization('construction', bakeryOrg, 'owner')).toBe(false);
    });

    it('يسمح فقط للسوبر أدمن (super_admin) بالوصول لجميع الموديولات دون قيد', () => {
      const restrictiveOrg = {
        allowed_modules: ['accounting']
      };

      expect(isModuleAllowedForOrganization('hims', restrictiveOrg, 'super_admin')).toBe(true);
      expect(isModuleAllowedForOrganization('stadium', restrictiveOrg, 'super_admin')).toBe(true);
      expect(isModuleAllowedForOrganization('construction', restrictiveOrg, 'super_admin')).toBe(true);
      expect(isModuleAllowedForOrganization('restaurant', restrictiveOrg, 'super_admin')).toBe(true);
    });

    it('يحافظ على النواة الأساسية للنظام (Core ERP) متاحة للجميع دائماً', () => {
      const emptyOrg = { allowed_modules: [] };
      expect(isModuleAllowedForOrganization('accounting', emptyOrg, 'user')).toBe(true);
      expect(isModuleAllowedForOrganization('sales', emptyOrg, 'user')).toBe(true);
      expect(isModuleAllowedForOrganization('inventory', emptyOrg, 'user')).toBe(true);
      expect(isModuleAllowedForOrganization('purchases', emptyOrg, 'user')).toBe(true);
      expect(isModuleAllowedForOrganization('reports', emptyOrg, 'user')).toBe(true);
    });
  });

  describe('3. Module-Aware Route Prefetcher (التحميل المسبق الواعي بالموديولات)', () => {
    it('يمنع الجلب المسبق للشاشات التابعة لموديولات معطلة', () => {
      // عميل لديه فقط المحاسبة والمبيعات
      setPrefetchAllowedModules(['accounting', 'sales']);

      // مسموح
      expect(isRouteAllowedForPrefetch('/sales/invoices')).toBe(true);
      expect(isRouteAllowedForPrefetch('/accounting/journal')).toBe(true);

      // محجوب وممنوع من التحميل المسبق لتوفير الباقة والإنترنت
      expect(isRouteAllowedForPrefetch('/pos')).toBe(false);
      expect(isRouteAllowedForPrefetch('/manufacturing/recipes')).toBe(false);
      expect(isRouteAllowedForPrefetch('/hr/payroll')).toBe(false);
    });

    it('يسمح بالجلب المسبق لشاشات نقاط البيع عند تفعيل التجزئة أو الكاشير', () => {
      setPrefetchAllowedModules(['accounting', 'sales', 'retail', 'pos']);

      expect(isRouteAllowedForPrefetch('/pos')).toBe(true);
      expect(isRouteAllowedForPrefetch('/sales/invoices')).toBe(true);
      expect(isRouteAllowedForPrefetch('/accounting/journal')).toBe(true);

      // موديول التصنيع ما زال محجوباً
      expect(isRouteAllowedForPrefetch('/manufacturing/recipes')).toBe(false);
    });
  });
});
