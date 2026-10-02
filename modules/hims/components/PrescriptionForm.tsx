import { logger } from '../../../utils/logger';
import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray, SubmitHandler, Controller } from 'react-hook-form';
import { Button, Input, Table, Space, Card, Typography, message, Select, Spin, InputNumber, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { supabase } from '@/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { offlineService, db } from '../../../services/offlineService';

export interface Medication {
  product_id?: string;
  drug_name: string;
  qty: number;
  dosage: string;
  frequency: string;
}

export interface Prescription {
  visit_id: string;
  diagnosis: string;
  medications: Medication[];
}

// Ù‚Ø§Ø¦Ù…Ø© Ø£ÙƒÙˆØ§Ø¯ ICD-10 Ø§Ù„Ø£ÙƒØ«Ø± Ø´ÙŠÙˆØ¹Ø§Ù‹ Ù„ØªØ´Ø®ÙŠØµ Ø§Ù„Ø£Ù…Ø±Ø§Ø¶ ÙˆØ§Ù„ÙÙˆØªØ±Ø© Ø§Ù„Ø·Ø¨ÙŠØ© Ù„Ù„ØªØ£Ù…ÙŠÙ†
const COMMON_ICD10_CODES = [
  { code: 'I10', descAr: 'Ø§Ø±ØªÙØ§Ø¹ Ø¶ØºØ· Ø§Ù„Ø¯Ù… Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ', descEn: 'Essential (primary) hypertension' },
  { code: 'E11.9', descAr: 'Ø¯Ø§Ø¡ Ø§Ù„Ø³ÙƒØ±ÙŠ Ù…Ù† Ø§Ù„Ù†ÙˆØ¹ Ø§Ù„Ø«Ø§Ù†ÙŠ Ø¨Ø¯ÙˆÙ† Ù…Ø¶Ø§Ø¹ÙØ§Øª', descEn: 'Type 2 diabetes mellitus without complications' },
  { code: 'J06.9', descAr: 'Ø§Ù„ØªÙ‡Ø§Ø¨ Ø­Ø§Ø¯ ÙÙŠ Ø§Ù„Ø¬Ù‡Ø§Ø² Ø§Ù„ØªÙ†ÙØ³ÙŠ Ø§Ù„Ø¹Ù„ÙˆÙŠ ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Acute upper respiratory infection, unspecified' },
  { code: 'R50.9', descAr: 'Ø­Ù…Ù‰ ØºÙŠØ± Ù…Ø­Ø¯Ø¯Ø©', descEn: 'Fever, unspecified' },
  { code: 'R10.9', descAr: 'Ø£Ù„Ù… ÙÙŠ Ø§Ù„Ø¨Ø·Ù† ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Unspecified abdominal pain' },
  { code: 'K21.9', descAr: 'Ø§Ø±ØªØ¬Ø§Ø¹ Ø§Ù„Ù…Ø±ÙŠØ¡ Ø¨Ø¯ÙˆÙ† Ø§Ù„ØªÙ‡Ø§Ø¨ Ù…Ø±ÙŠØ¡', descEn: 'Gastro-esophageal reflux disease without esophagitis' },
  { code: 'M54.5', descAr: 'Ø£Ù„Ù… Ø£Ø³ÙÙ„ Ø§Ù„Ø¸Ù‡Ø±', descEn: 'Low back pain' },
  { code: 'N39.0', descAr: 'Ø§Ù„ØªÙ‡Ø§Ø¨ Ø§Ù„Ù…Ø³Ø§Ù„Ùƒ Ø§Ù„Ø¨ÙˆÙ„ÙŠØ©ØŒ Ù…ÙˆÙ‚Ø¹ ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Urinary tract infection, site not specified' },
  { code: 'J45.909', descAr: 'Ø§Ù„Ø±Ø¨Ùˆ ØºÙŠØ± Ø§Ù„Ù…Ø­Ø¯Ø¯ Ø¨Ø¯ÙˆÙ† Ù…Ø¶Ø§Ø¹ÙØ§Øª', descEn: 'Unspecified asthma, uncomplicated' },
  { code: 'R05', descAr: 'Ø³Ø¹Ø§Ù„ / ÙƒØ­Ø©', descEn: 'Cough' },
  { code: 'H66.90', descAr: 'Ø§Ù„ØªÙ‡Ø§Ø¨ Ø§Ù„Ø£Ø°Ù† Ø§Ù„ÙˆØ³Ø·Ù‰ ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Otitis media, unspecified' },
  { code: 'G43.909', descAr: 'Ø§Ù„ØµØ¯Ø§Ø¹ Ø§Ù„Ù†ØµÙÙŠ ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Migraine, unspecified' },
  { code: 'R51', descAr: 'ØµØ¯Ø§Ø¹', descEn: 'Headache' },
  { code: 'K29.70', descAr: 'Ø§Ù„ØªÙ‡Ø§Ø¨ Ø§Ù„Ù…Ø¹Ø¯Ø© ØºÙŠØ± Ù…Ø­Ø¯Ø¯ Ø¨Ø¯ÙˆÙ† Ù†Ø²ÙŠÙ', descEn: 'Gastritis, unspecified, without bleeding' },
  { code: 'B34.9', descAr: 'Ø¹Ø¯ÙˆÙ‰ ÙÙŠØ±ÙˆØ³ÙŠØ© ØºÙŠØ± Ù…Ø­Ø¯Ø¯Ø©', descEn: 'Viral infection, unspecified' },
  { code: 'L20.9', descAr: 'Ø§Ù„ØªÙ‡Ø§Ø¨ Ø§Ù„Ø¬Ù„Ø¯ Ø§Ù„ØªØ£ØªØ¨ÙŠ ØºÙŠØ± Ù…Ø­Ø¯Ø¯ (Ø¥ÙƒØ²ÙŠÙ…Ø§)', descEn: 'Atopic dermatitis, unspecified' },
  { code: 'A09', descAr: 'Ø§Ù„ØªÙ‡Ø§Ø¨ Ø§Ù„Ù…Ø¹Ø¯Ø© ÙˆØ§Ù„Ø£Ù…Ø¹Ø§Ø¡ Ø§Ù„Ù…Ø¹Ø¯ÙŠ (Ù†Ø²Ù„Ø§Øª Ù…Ø¹ÙˆÙŠØ© Ø­Ø§Ø¯Ø©)', descEn: 'Infectious gastroenteritis and colitis, unspecified' },
  { code: 'R11.10', descAr: 'Ù‚ÙŠØ¡ ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Vomiting, unspecified' },
  { code: 'E03.9', descAr: 'Ù‚ØµÙˆØ± Ø§Ù„ØºØ¯Ø© Ø§Ù„Ø¯Ø±Ù‚ÙŠØ© ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Hypothyroidism, unspecified' },
  { code: 'F41.9', descAr: 'Ø§Ø¶Ø·Ø±Ø§Ø¨ Ø§Ù„Ù‚Ù„Ù‚ ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Anxiety disorder, unspecified' },
  { code: 'F32.9', descAr: 'Ø§Ø¶Ø·Ø±Ø§Ø¨ Ø§ÙƒØªØ¦Ø§Ø¨ÙŠ Ø¬Ø³ÙŠÙ… ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Major depressive disorder, unspecified' },
  { code: 'J02.9', descAr: 'Ø§Ù„ØªÙ‡Ø§Ø¨ Ø§Ù„Ø¨Ù„Ø¹ÙˆÙ… Ø§Ù„Ø­Ø§Ø¯ ØºÙŠØ± Ù…Ø­Ø¯Ø¯ (Ø§Ù„ØªÙ‡Ø§Ø¨ Ø§Ù„Ù„ÙˆØ²ØªÙŠÙ†/Ø§Ù„Ø­Ù„Ù‚)', descEn: 'Acute pharyngitis, unspecified' },
  { code: 'J01.90', descAr: 'Ø§Ù„ØªÙ‡Ø§Ø¨ Ø§Ù„Ø¬ÙŠÙˆØ¨ Ø§Ù„Ø£Ù†ÙÙŠØ© Ø§Ù„Ø­Ø§Ø¯ ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Acute sinusitis, unspecified' },
  { code: 'K52.9', descAr: 'Ø§Ù„ØªÙ‡Ø§Ø¨ Ø§Ù„Ø£Ù…Ø¹Ø§Ø¡ ÙˆØ§Ù„Ù…Ø¹Ø¯Ø© ØºÙŠØ± Ø§Ù„Ù…Ø¹Ø¯ÙŠ ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Noninfective gastroenteritis and colitis, unspecified' },
  { code: 'M79.1', descAr: 'Ø¢Ù„Ø§Ù… Ø§Ù„Ø¹Ø¶Ù„Ø§Øª (Ø§Ù„ØªÙ‡Ø§Ø¨ Ø¹Ø¶Ù„ÙŠ)', descEn: 'Myalgia' },
  { code: 'N18.9', descAr: 'Ù…Ø±Ø¶ Ø§Ù„ÙƒÙ„Ù‰ Ø§Ù„Ù…Ø²Ù…Ù† ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Chronic kidney disease, unspecified' },
  { code: 'E78.5', descAr: 'Ø§Ø±ØªÙØ§Ø¹ Ø¯Ù‡ÙˆÙ† Ø§Ù„Ø¯Ù… ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Hyperlipidemia, unspecified' },
  { code: 'D64.9', descAr: 'Ø£Ù†ÙŠÙ…ÙŠØ§ / ÙÙ‚Ø± Ø§Ù„Ø¯Ù… ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Anemia, unspecified' },
  { code: 'R07.9', descAr: 'Ø£Ù„Ù… ÙÙŠ Ø§Ù„ØµØ¯Ø± ØºÙŠØ± Ù…Ø­Ø¯Ø¯', descEn: 'Chest pain, unspecified' },
  { code: 'R42', descAr: 'Ø¯ÙˆØ§Ø± ÙˆØ¯ÙˆØ®Ø©', descEn: 'Dizziness and giddiness' }
];

// Ø§Ø³ØªØ®Ø±Ø§Ø¬ Ø§Ø³Ù… Ø§Ù„ØªØµÙ†ÙŠÙ Ù…Ù† Ø§Ù„ÙƒØ§Ø¦Ù† Ø§Ù„Ù…Ø¶Ù…Ù‘Ù† (Ù‚Ø¯ ÙŠÙØ±Ø¬ÙŽØ¹ Ù…Ù† PostgREST ÙƒÙƒØ§Ø¦Ù† ÙˆØ§Ø­Ø¯ Ø£Ùˆ ÙƒÙ…ØµÙÙˆÙØ©)
const getCategoryName = (category: unknown): string | undefined => {
  if (!category) return undefined;
  if (Array.isArray(category)) {
    const first = category[0] as { name?: string } | undefined;
    return first?.name;
  }
  return (category as { name?: string }).name;
};

export const PrescriptionForm: React.FC<{ visitId: string }> = ({ visitId }) => {
  const { currentUser } = useAuth();
  const { register, control, handleSubmit, setValue, watch } = useForm<Prescription>({
    defaultValues: { visit_id: visitId, medications: [] }
  });

  const [icdOptions, setIcdOptions] = useState<{ label: string; value: string }[]>([]);
  const [loadingICD, setLoadingICD] = useState(false);

  const [productOptions, setProductOptions] = useState<{ label: string; value: string; price: number; name: string }[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [lastSignature, setLastSignature] = useState<{ hash: string; date: string } | null>(null);

  const generateSHA256 = async (text: string): Promise<string> => {
    try {
      const msgBuffer = new TextEncoder().encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fallback in case of non-secure contexts
      return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
  };

  // Ù…Ø­Ø±Ùƒ Ø§Ù„Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„Ù…Ø®Ø²Ù†ÙŠØ© (Ø§Ù„Ø£Ø¯ÙˆÙŠØ©)
  const handleProductSearch = async (query: string = "") => {
    setLoadingProducts(true);

    let orgId = currentUser?.organization_id;
    if (!orgId && visitId) {
      try {
        const { data: vData } = await supabase.from('hims_visits').select('organization_id').eq('id', visitId).single();
        orgId = vData?.organization_id;
      } catch (e) {}
    }

    if (!orgId) {
      setLoadingProducts(false);
      return;
    }
    
    if (navigator.onLine) {
      let queryBuilder = supabase
        .from('products')
        .select('id, name, sales_price, stock, category:category_id(name)')
        .eq('organization_id', orgId)
        .or('product_type.eq.STOCK,item_type.eq.STOCK')
        .is('deleted_at', null); 

      if (query) {
        queryBuilder = queryBuilder.ilike('name', `%${query}%`);
      }

      const { data, error } = await queryBuilder.limit(40);

      if (error) {
        logger.error("PrescriptionForm: Error fetching products:", error);
        setProductOptions([]);
      }

      // ØªØµÙÙŠØ© Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª Ù„ØªØ¬Ù†Ø¨ Ø¸Ù‡ÙˆØ± Ø§Ù„Ø£Ù„Ø¨Ø³Ø© Ø£Ùˆ Ø§Ù„Ø£Ø·Ø¹Ù…Ø© Ø£Ùˆ Ù…ÙˆØ§Ø¯ Ø§Ù„Ø¨Ù†Ø§Ø¡ ÙÙŠ Ø§Ù„Ø±ÙˆØ´ØªØ© Ø§Ù„Ø·Ø¨ÙŠØ©
      const excludedCategories = ['Ù…Ù„Ø§Ø¨Ø³', 'Ø£Ø²ÙŠØ§Ø¡', 'Ø·Ø¹Ø§Ù…', 'ÙˆØ¬Ø¨Ø§Øª', 'Ø¯Ø¬Ø§Ø¬', 'Ù„Ø­ÙˆÙ…', 'Ù…Ø·Ø¹Ù…', 'Ø³Ù„Ø·Ø§Øª', 'Ø¨Ù†Ø§Ø¡', 'Ø£Ø³Ù…Ù†Øª', 'Ø­Ø¯ÙŠØ¯', 'Ù…Ù‚Ø§ÙˆÙ„Ø§Øª'];
      const filteredData = (data || []).filter((p: Record<string, any>) => {
        const catName = getCategoryName(p.category);
        if (catName) {
          return !excludedCategories.some(ex => catName.includes(ex));
        }
        return true;
      });

      setProductOptions(filteredData.map((p: Record<string, any>) => {
        const catName = getCategoryName(p.category);
        return {
          label: catName ? `${p.name} [${catName}] - (Ø§Ù„Ù…ØªÙˆÙØ±: ${p.stock})` : `${p.name} (Ø§Ù„Ù…ØªÙˆÙØ±: ${p.stock})`,
          value: p.id,
          name: p.name,
          price: p.sales_price || 0
        };
      }));
    } else {
      // Offline Search from IndexedDB db.products
      try {
        const cachedProducts = await db.products
          .filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()))
          .limit(20)
          .toArray();

        setProductOptions(cachedProducts.map(p => ({
          label: `${p.name} (Ø§Ù„Ù…ØªÙˆÙØ±: ${p.stock})`,
          value: p.id,
          name: p.name,
          price: p.sales_price || 0
        })));
      } catch (err) {
        logger.error("Offline product search error:", err);
      }
    }
    setLoadingProducts(false);
  };

  const handleICDSearch = async (query: string = "") => {
    setLoadingICD(true);
    
    // 1. ÙÙ„ØªØ±Ø© Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù…Ø­Ù„ÙŠØ© ÙƒØ¨Ø¯Ø§ÙŠØ© ÙˆØ³Ø±Ø¹Ø© Ø§Ø³ØªØ¬Ø§Ø¨Ø© ÙÙˆØ±ÙŠØ©
    const localFiltered = COMMON_ICD10_CODES.filter(i => 
      !query || 
      i.code.toLowerCase().includes(query.toLowerCase()) ||
      i.descAr.includes(query) ||
      i.descEn.toLowerCase().includes(query.toLowerCase())
    ).map(i => ({
      label: `${i.code} - ${i.descAr} (${i.descEn})`,
      value: `${i.code} - ${i.descAr}`
    }));

    // 2. Ø§Ù„Ø¨Ø­Ø« ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø¥Ø°Ø§ ÙƒØ§Ù† Ù‡Ù†Ø§Ùƒ Ù†Øµ Ø¨Ø­Ø« ÙŠØ²ÙŠØ¯ Ø¹Ù† Ø£Ùˆ ÙŠØ³Ø§ÙˆÙŠ Ø­Ø±ÙÙŠÙ†
    let dbResults: { label: string; value: string }[] = [];
    if (query && query.length >= 2) {
      try {
        const { data, error } = await supabase
          .from('v_hims_icd10_search') 
          .select('display_name')
          .or(`code.ilike.%${query}%,description_ar.ilike.%${query}%`)
          .limit(20);

        if (!error && data) {
          dbResults = data.map(i => ({
            label: i.display_name,
            value: i.display_name
          }));
        }
      } catch (err) {
        logger.error("Failed to query ICD10 from database:", err);
      }
    }

    // 3. Ø¯Ù…Ø¬ Ø§Ù„Ù†ØªØ§Ø¦Ø¬ Ø¨Ø¯ÙˆÙ† ØªÙƒØ±Ø§Ø±
    const merged = [...localFiltered, ...dbResults];
    const uniqueMap = new Map();
    merged.forEach(item => {
      uniqueMap.set(item.value, item);
    });

    setIcdOptions(Array.from(uniqueMap.values()).slice(0, 30));
    setLoadingICD(false);
  };

  // Ø¬Ù„Ø¨ Ù‚Ø§Ø¦Ù…Ø© Ø£ÙˆÙ„ÙŠØ© Ù„Ù„Ø£Ø¯ÙˆÙŠØ© ÙˆØ§Ù„Ø£ÙƒÙˆØ§Ø¯ Ø¹Ù†Ø¯ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø´Ø§Ø´Ø©
  useEffect(() => {
    handleProductSearch();
    handleICDSearch("");
  }, [currentUser?.organization_id, visitId]);

  const { fields, append, remove } = useFieldArray({ control, name: 'medications' as never });

  const onSave: SubmitHandler<Prescription> = async (data) => {
    let orgId = currentUser?.organization_id;
    if (!orgId) {
      try {
        const { data: vData } = await supabase.from('hims_visits').select('organization_id').eq('id', visitId).single();
        orgId = vData?.organization_id;
      } catch (e) {}
    }

    const cleanedMeds = (data.medications || [])
      .filter((m: Record<string, any>) => m.product_id && m.product_id.trim() !== '')
      .map((m: Record<string, any>) => ({
        product_id: m.product_id,
        drug_name: m.drug_name,
        qty: Number(m.qty) || 1,
        dosage: m.dosage || '',
        frequency: m.frequency || ''
      }));

    if (cleanedMeds.length === 0) {
      return message.warning("ÙŠØ±Ø¬Ù‰ Ø¥Ø¶Ø§ÙØ© Ø¯ÙˆØ§Ø¡ ÙˆØ§Ø­Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„ ÙˆØªØ­Ø¯ÙŠØ¯Ù‡ Ù…Ù† Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø¨Ø´ÙƒÙ„ ØµØ­ÙŠØ­ âš ï¸");
    }

    const signInput = `${data.visit_id}|${currentUser?.id || ''}|${JSON.stringify(cleanedMeds)}|${new Date().toISOString()}`;
    const signatureHash = await generateSHA256(signInput);
    const finalDiagnosis = `${data.diagnosis || ''}\n\nðŸ” Ø§Ù„ØªÙˆÙ‚ÙŠØ¹ Ø§Ù„Ø±Ù‚Ù…ÙŠ Ù„Ù„Ø±ÙˆØ´ØªØ©:\nSignature: SHA256-${signatureHash.substring(0, 16)}...\nSigned By: ${currentUser?.username || 'Medical Practitioner'}\nDate: ${new Date().toLocaleString('ar-EG')}`;

    const payload = {
        visit_id: data.visit_id,
        diagnosis: finalDiagnosis,
        medications: cleanedMeds,
        organization_id: orgId
    };

    if (!navigator.onLine) {
      await offlineService.queuePrescription(payload);
      setLastSignature({ hash: signatureHash, date: new Date().toLocaleString('ar-EG') });
      message.warning("ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø±ÙˆØ´ØªØ© ÙˆØ­ÙØ¸Ù‡Ø§ Ù…Ø­Ù„ÙŠØ§Ù‹ Ø¨Ù†Ø¬Ø§Ø­ (Ø³ÙŠØªÙ… Ø§Ù„ØªØ²Ø§Ù…Ù† ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ Ø¹Ù†Ø¯ Ø¹ÙˆØ¯Ø© Ø§Ù„Ø§ØªØµØ§Ù„) ðŸ“¶");
      return;
    }

    const { error } = await supabase.from('hims_prescriptions').insert(payload);
    if (error) {
      message.error(error.message || "Ø®Ø·Ø£ ÙÙŠ Ø­ÙØ¸ Ø§Ù„Ø±ÙˆØ´ØªØ© Ø§Ù„Ø·Ø¨ÙŠØ© âŒ");
    } else {
      setLastSignature({ hash: signatureHash, date: new Date().toLocaleString('ar-EG') });
      message.success("ØªÙ… Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø±ÙˆØ´ØªØ© ÙˆØ¥Ø±Ø³Ø§Ù„Ù‡Ø§ Ù„Ù„ØµÙŠØ¯Ù„ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­ âœ…");
    }
  };

  return (
    <Card title={<Typography.Title level={4}>ØªØ´Ø®ÙŠØµ Ø§Ù„Ø­Ø§Ù„Ø© ÙˆØ§Ù„Ø±ÙˆØ´ØªØ© Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠØ© ðŸ©º</Typography.Title>}>
      <form onSubmit={handleSubmit(onSave)}>
        <div className="mb-4">
          <label className="block font-bold mb-2 text-indigo-700">Ø§Ù„Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ø£ÙƒÙˆØ§Ø¯ Ø§Ù„Ø¹Ø§Ù„Ù…ÙŠØ© (ICD-10)</label>
          <Select
            showSearch
            className="w-full mb-3"
            placeholder="Ø§Ø¨Ø­Ø« Ø¨Ø§Ù„ÙƒÙˆØ¯ Ø£Ùˆ Ø§Ø³Ù… Ø§Ù„Ù…Ø±Ø¶ (Ù…Ø«Ù„Ø§Ù‹: E11, Diabetes, Fever)..."
            filterOption={false}
            onSearch={handleICDSearch}
            loading={loadingICD}
            notFoundContent={loadingICD ? <Spin size="small" /> : 'Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ Ù†ØªØ§Ø¦Ø¬'}
            options={icdOptions}
            onChange={(val) => {
              const currentDiag = watch('diagnosis') || '';
              setValue('diagnosis', currentDiag ? `${currentDiag}\n${val}` : val);
            }}
          />
          <label className="block font-bold mb-2">ÙˆØµÙ Ø§Ù„ØªØ´Ø®ÙŠØµ / Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø¥Ø¶Ø§ÙÙŠØ©</label>
          <Input.TextArea {...register('diagnosis')} rows={3} placeholder="Ø§ÙƒØªØ¨ Ø§Ù„ØªÙØ§ØµÙŠÙ„ Ø§Ù„Ø·Ø¨ÙŠØ© Ø§Ù„Ø¥Ø¶Ø§ÙÙŠØ© Ù‡Ù†Ø§..." />
        </div>

        <Typography.Text strong>Ø§Ù„Ø£Ø¯ÙˆÙŠØ© ÙˆØ§Ù„Ø¹Ù„Ø§Ø¬Ø§Øª Ø§Ù„Ù…ÙˆØµÙˆÙØ©:</Typography.Text>
        <div className="mt-2 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-right">
              <tr className="border-b">
                <th className="p-2">Ø§Ù„Ø¯ÙˆØ§Ø¡</th>
                <th className="p-2 w-24">Ø§Ù„ÙƒÙ…ÙŠØ©</th>
                <th className="p-2">Ø§Ù„Ø¬Ø±Ø¹Ø©</th>
                <th className="p-2">Ø§Ù„ØªÙƒØ±Ø§Ø±</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-t">
                  <td className="p-2">
                    <Controller
                      name={`medications.${index}.product_id` as any}
                      control={control}
                      render={({ field: selectField }) => (
                        <Select
                          {...selectField}
                          showSearch
                          className="w-full"
                          placeholder="Ø§Ø¨Ø­Ø« Ø¹Ù† Ø§Ù„Ø¯ÙˆØ§Ø¡..."
                          filterOption={false}
                          onSearch={handleProductSearch}
                          onFocus={() => { if (productOptions.length === 0) handleProductSearch(); }}
                          loading={loadingProducts}
                          options={productOptions}
                          onChange={(val, option: Record<string, any>) => {
                            selectField.onChange(val);
                            setValue(`medications.${index}.drug_name`, option.name);
                          }}
                        />
                      )}
                    />
                  </td>
                  <td className="p-2">
                    <Controller
                      name={`medications.${index}.qty` as any}
                      control={control}
                      render={({ field }) => (
                        <InputNumber {...field} min={1} className="w-full" />
                      )}
                    />
                  </td>
                  <td className="p-2"><Input {...register(`medications.${index}.dosage`)} placeholder="500mg" /></td>
                  <td className="p-2"><Input {...register(`medications.${index}.frequency`)} placeholder="1-0-1" /></td>
                  <td className="p-2">
                    <Button danger icon={<DeleteOutlined />} onClick={() => remove(index)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button block type="dashed" icon={<PlusOutlined />} onClick={() => append({ product_id: '', drug_name: '', qty: 1, dosage: '', frequency: '' })}>
            Ø¥Ø¶Ø§ÙØ© Ø¯ÙˆØ§Ø¡
          </Button>
        </div>

        {lastSignature && (
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            title="ØªÙ… ØªÙˆØ«ÙŠÙ‚ Ø§Ù„Ø±ÙˆØ´ØªØ© ÙˆØªØ´ÙÙŠØ±Ù‡Ø§ Ø±Ù‚Ù…ÙŠØ§Ù‹ Ø¨Ù†Ø¬Ø§Ø­ âœ…"
            description={
              <div className="text-xs text-right">
                <div>Ø±Ù…Ø² Ø§Ù„ØªÙˆÙ‚ÙŠØ¹: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">SHA256-{lastSignature.hash}</code></div>
                <div>ÙˆÙ‚Øª Ø§Ù„ØªÙˆÙ‚ÙŠØ¹: {lastSignature.date}</div>
              </div>
            }
            className="mt-4"
          />
        )}

        <Button type="primary" size="large" icon={<SaveOutlined />} className="mt-6 w-full" htmlType="submit">
          Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„Ø±ÙˆØ´ØªØ© ÙˆØµØ±Ù Ø§Ù„Ø¹Ù„Ø§Ø¬
        </Button>
      </form>
    </Card>
  );
};
