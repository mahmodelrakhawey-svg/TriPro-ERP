import { supabase } from '../supabaseClient';
import { ModifierGroup, Modifier } from '../types';

export const modifierService = {
  async getModifiersForProduct(productId: string): Promise<ModifierGroup[]> {
    const { data, error } = await supabase
      .from('modifier_groups')
      .select(`
        *,
        modifiers (
          *
        )
      `)
      .eq('product_id', productId)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((group: any) => ({
      ...group,
      modifiers: group.modifiers.sort((a: any, b: any) => a.display_order - b.display_order),
    })) as ModifierGroup[];
  },

  // إضافة مجموعة جديدة
  async createModifierGroup(group: Partial<ModifierGroup>) {
    const { data, error } = await supabase
      .from('modifier_groups')
      .insert([group]) // The insert method expects an array of objects
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // تحديث بيانات المجموعة (الاسم، إجباري، الحد الأقصى، إلخ)
  async updateModifierGroup(id: string, updates: Partial<ModifierGroup>) {
    const { error } = await supabase
      .from('modifier_groups')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },

  // حذف مجموعة
  async deleteModifierGroup(groupId: string) {
    const { error } = await supabase
      .from('modifier_groups')
      .delete()
      .eq('id', groupId);
    if (error) throw error;
  },

  // إضافة خيار جديد (مع التكلفة)
  async createModifier(modifier: Partial<Modifier>) {
    const { data, error } = await supabase
      .from('modifiers')
      .insert([modifier]) // The insert method expects an array of objects
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // تحديث خيار (لتعديل التكلفة والسعر)
  async updateModifier(id: string, updates: Partial<Modifier>) {
    const { error } = await supabase
      .from('modifiers')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },

  // حذف خيار
  async deleteModifier(id: string) {
    const { error } = await supabase
      .from('modifiers')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // تحديث ترتيب العرض لمجموعة من العناصر دفعة واحدة
  async bulkUpdateDisplayOrder(tableName: 'modifier_groups' | 'modifiers', items: { id: string, display_order: number }[]) {
    if (items.length === 0) return;

    const { error } = await supabase
      .from(tableName)
      .upsert(items);

    if (error) throw error;
  },

  // نسخ إعدادات الإضافات من منتج لآخر
  async copyModifiers(sourceProductId: string, targetProductId: string) {
    const { error } = await supabase.rpc('copy_modifiers_to_product', {
      source_product_id: sourceProductId,
      target_product_id: targetProductId
    });
    if (error) throw error;
  }
};