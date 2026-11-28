import { logger } from '../../../utils/logger';
import { secureStorage } from '../../../utils/securityMiddleware';

export interface PackagingRule {
  unitName: string;
  ratio: number; // كم وحدة أساسية في هذه العبوة (مثلاً 0.25 كجم للكيس، أو 3 كجم للعلبة، أو 12 كجم للكرتونة)
  packagingNote?: string;
  isCustom?: boolean;
  uomId?: string;
  tierLevel?: 'base' | 'small' | 'medium' | 'bulk';
}

export interface SavedPackagingHierarchy {
  bulkUnitName: string;         // مسمى الطرد الأكبر (مثلاً: كرتونة، شيكارة، صندوق، بالتة...)
  mediumUnitsPerBulk: number;   // كم عبوة وسيطة بداخل الطرد الأكبر (مثلاً: 3 أو 4 علب)
  mediumUnitName: string;       // مسمى العبوة الوسيطة (مثلاً: علبة، باكت، جردل، لفة...)
  smallUnitsPerMedium: number;  // كم وحدة تجزئة بداخل كل عبوة وسيطة (مثلاً: 12 كيس)
  smallUnitName: string;        // مسمى وحدة التجزئة والسحب الصغرى (مثلاً: كيس، باكو، زجاجة، قطعة...)
  baseQtyPerSmallUnit: number;  // وزن أو سعة وحدة التجزئة الصغرى بالوحدة المعيارية (مثلاً: 0.25 كجم أو 1 قطعة)
}

export interface TransferItem {
  productId: string;
  productName: string;
  sku?: string;
  baseUnit: string;        // الوحدة الأساسية للصنف في المخزن (مثل: كجم أو لتر أو قطعة)
  baseQuantity: number;    // الكمية الفعلية بالوحدة الأساسية (المخصومة والمرحلة للمخزن)
  selectedUnit: string;    // وحدة الصرف/السحب (مثل: كيس، باكو، علبة، كرتونة، شيكارة، زجاجة...)
  enteredQty: number;      // الكمية بتلك الوحدة (مثل: 8 أكياس، 1 علبة، 2 كرتونة)
  conversionRatio: number; // معامل التحويل: 1 وحدة مسحوبة = X وحدة أساسية
  packagingNote?: string;  // ملاحظة التعبئة والتجزئة التوضيحية
  uomId?: string;
  unit?: string;           // للتوافق مع العرض القديم
  quantity: number;        // للتوافق مع المخططات والحفظ (= baseQuantity)
}

export const DRAFT_STORAGE_KEY = 'tripro_stock_transfer_draft_v2';
export const LEGACY_DRAFT_STORAGE_KEY = 'tripro_stock_transfer_draft';

export interface StockTransferDraftData {
  formData?: {
    date?: string;
    fromWarehouseId?: string;
    toWarehouseId?: string;
    notes?: string;
  };
  items?: TransferItem[];
}

export const getStockTransferDraft = (): StockTransferDraftData | null => {
  try {
    let raw = secureStorage.getItem<any>(DRAFT_STORAGE_KEY);
    if (!raw) {
      raw = secureStorage.getItem<any>(LEGACY_DRAFT_STORAGE_KEY);
    }
    if (!raw) return null;
    while (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        break;
      }
    }
    if (raw && typeof raw === 'object') {
      return raw as StockTransferDraftData;
    }
    return null;
  } catch (err) {
    logger.warn('Failed to parse stock transfer draft', err);
    return null;
  }
};

export const clearStockTransferDraft = () => {
  try {
    secureStorage.removeItem(DRAFT_STORAGE_KEY);
    secureStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
  } catch {}
};

/**
 * استخراج قائمة وحدات وعبوات الصنف المختار (شجرة التعبئة المحفوظة + العبوات الفردية + باركودات الوحدات + النظام)
 */
export function buildAvailablePackagingRules(
  selectedProductObj: Record<string, any> | undefined,
  baseUnit: string,
  systemUoms: any[]
): PackagingRule[] {
  const rules: PackagingRule[] = [
    {
      unitName: baseUnit,
      ratio: 1,
      packagingNote: 'الوحدة الأساسية للمخزن',
      tierLevel: 'base',
    },
  ];

  if (!selectedProductObj) return rules;

  // 1. استرجاع شجرة العبوات الهرمية المحفوظة للصنف (إن وجدت)
  try {
    const savedHierarchy = secureStorage.getItem<SavedPackagingHierarchy>(
      `tripro_pkg_hierarchy_${selectedProductObj.id}`
    );
    if (savedHierarchy) {
      const smallRatio = Number(savedHierarchy.baseQtyPerSmallUnit) || 1;
      const mediumRatio = (Number(savedHierarchy.smallUnitsPerMedium) || 1) * smallRatio;
      const bulkRatio = (Number(savedHierarchy.mediumUnitsPerBulk) || 1) * mediumRatio;
      const totalSmallInBulk =
        (Number(savedHierarchy.mediumUnitsPerBulk) || 1) *
        (Number(savedHierarchy.smallUnitsPerMedium) || 1);

      if (savedHierarchy.smallUnitName && smallRatio > 0) {
        rules.push({
          unitName: savedHierarchy.smallUnitName,
          ratio: smallRatio,
          packagingNote: `1 ${savedHierarchy.smallUnitName} = ${smallRatio} ${baseUnit}`,
          tierLevel: 'small',
        });
      }

      if (
        savedHierarchy.mediumUnitName &&
        mediumRatio > 0 &&
        savedHierarchy.mediumUnitName !== savedHierarchy.smallUnitName
      ) {
        rules.push({
          unitName: savedHierarchy.mediumUnitName,
          ratio: mediumRatio,
          packagingNote: `1 ${savedHierarchy.mediumUnitName} = ${savedHierarchy.smallUnitsPerMedium} ${savedHierarchy.smallUnitName} (${mediumRatio} ${baseUnit})`,
          tierLevel: 'medium',
        });
      }

      if (
        savedHierarchy.bulkUnitName &&
        bulkRatio > 0 &&
        savedHierarchy.bulkUnitName !== savedHierarchy.mediumUnitName
      ) {
        rules.push({
          unitName: savedHierarchy.bulkUnitName,
          ratio: bulkRatio,
          packagingNote: `1 ${savedHierarchy.bulkUnitName} = ${savedHierarchy.mediumUnitsPerBulk} ${savedHierarchy.mediumUnitName} / ${totalSmallInBulk} ${savedHierarchy.smallUnitName} (${bulkRatio} ${baseUnit})`,
          tierLevel: 'bulk',
        });
      }
    }

    // 2. استرجاع العبوات المباشرة الفردية المحفوظة للصنف
    const savedRules = secureStorage.getItem<PackagingRule[]>(
      `tripro_pkg_rules_${selectedProductObj.id}`
    );
    if (savedRules && Array.isArray(savedRules)) {
      savedRules.forEach((r) => {
        if (!rules.some((x) => x.unitName === r.unitName)) {
          rules.push(r);
        }
      });
    }
  } catch (e) {
    logger.error(e);
  }

  // 3. فحص باركودات الوحدات unit_barcodes
  if (selectedProductObj.unit_barcodes && Array.isArray(selectedProductObj.unit_barcodes)) {
    selectedProductObj.unit_barcodes.forEach((ub: Record<string, any>) => {
      const uName = ub.uom_name?.trim();
      if (uName && !rules.some((r) => r.unitName === uName)) {
        let ratio = 1;
        if (ub.uom_id && systemUoms.length > 0) {
          const sys = systemUoms.find((s) => s.id === ub.uom_id);
          if (sys) {
            ratio = Number(sys.ratio) || 1;
            if (sys.uom_type === 'smaller' && ratio > 0) ratio = 1 / ratio;
          }
        }
        rules.push({
          unitName: uName,
          ratio,
          uomId: ub.uom_id,
          packagingNote: `باركود خاص (${ub.barcode})`,
        });
      }
    });
  }

  // 4. إدراج وحدات النظام العامة المتوافقة
  const isWeight = /كجم|كيلو|kg|جرام|جم|gram/i.test(baseUnit);
  const isCount = /قطعة|عدد|حبة|piece|unit/i.test(baseUnit);
  const isVolume = /لتر|مل|liter|ml/i.test(baseUnit);

  systemUoms.forEach((u) => {
    let ratio = Number(u.ratio) || 1;
    if (u.uom_type === 'smaller' && ratio > 0) {
      ratio = 1 / ratio;
    }
    if (!rules.some((r) => r.unitName === u.name)) {
      if (isWeight && /كجم|كيلو|جرام|شيكارة|صفيحة|كيس|علبه|علبة|قالب|لفه|باكو/i.test(u.name)) {
        rules.push({
          unitName: u.name,
          ratio,
          uomId: u.id,
          packagingNote: `${u.name} (${ratio} ${baseUnit})`,
        });
      } else if (isCount && /قطعة|دستة|كرتون|صندوق|علبة|باكت/i.test(u.name)) {
        rules.push({
          unitName: u.name,
          ratio,
          uomId: u.id,
          packagingNote: `${u.name} (${ratio} ${baseUnit})`,
        });
      } else if (isVolume && /لتر|مل|جالون|برميل|زجاجة/i.test(u.name)) {
        rules.push({
          unitName: u.name,
          ratio,
          uomId: u.id,
          packagingNote: `${u.name} (${ratio} ${baseUnit})`,
        });
      }
    }
  });

  return rules;
}
