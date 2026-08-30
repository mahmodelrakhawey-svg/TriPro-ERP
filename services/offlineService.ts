import Dexie, { Table } from 'dexie';
import { supabase } from '../supabaseClient';

export interface QueuedOrder {
  id?: number; // Primary key for IndexedDB
  payload: any; // The data to be sent to Supabase RPC
  createdAt: Date;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  attempts: number;
  lastAttempt?: Date;
  error?: string;
}

export interface CachedProduct {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  sales_price: number;
  cost: number;
  category_id: string | null;
  stock: number;
  image_url?: string | null;
  is_scale_item?: boolean;
  plu_number?: number | null;
  scale_prefix?: string | null;
  barcode2?: string | null;
  age_restricted?: boolean;
  tax_rate_override?: number | null;
}

export interface QueuedMedicalItem {
  id?: number;
  payload: any;
  createdAt: Date;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  attempts: number;
  lastAttempt?: Date;
  error?: string;
}

class OfflineDB extends Dexie {
  queuedOrders!: Table<QueuedOrder>;
  products!: Table<CachedProduct, string>;
  himsPatients!: Table<any, string>; // Cache for offline patient search
  queuedPatients!: Table<QueuedMedicalItem>;
  queuedVisits!: Table<QueuedMedicalItem>;
  queuedClinicalNotes!: Table<QueuedMedicalItem>;
  queuedPrescriptions!: Table<QueuedMedicalItem>;
  queuedLabOrders!: Table<QueuedMedicalItem>;
  queuedRadiologyOrders!: Table<QueuedMedicalItem>;

  constructor() {
    super('TriProOfflineDB');
    this.version(6).stores({
      queuedOrders: '++id, status, createdAt',
      products: 'id, barcode, sku, name, plu_number, is_scale_item, barcode2',
      himsPatients: 'id, national_id, full_name, phone',
      queuedPatients: '++id, status, createdAt',
      queuedVisits: '++id, status, createdAt',
      queuedClinicalNotes: '++id, status, createdAt',
      queuedPrescriptions: '++id, status, createdAt',
      queuedLabOrders: '++id, status, createdAt',
      queuedRadiologyOrders: '++id, status, createdAt',
    });
  }
}

export const db = new OfflineDB();

export const offlineService = {
  /**
   * Adds a new order to the offline queue.
   */
  async queueOrder(orderPayload: any): Promise<void> {
    try {
      await db.queuedOrders.add({
        payload: orderPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('Order queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue order:', error);
      throw new Error('Failed to save order locally.');
    }
  },

  /**
   * Syncs products from Supabase and stores them locally in IndexedDB.
   */
  async syncProductsLocally(orgId: string): Promise<void> {
    if (!navigator.onLine) return;
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, barcode, sku, sales_price, cost, category_id, stock, image_url, is_scale_item, plu_number, scale_prefix, barcode2, age_restricted, tax_rate_override')
        .eq('organization_id', orgId);
      
      if (error) throw error;
      
      if (data) {
        await db.products.clear();
        const productsToCache: CachedProduct[] = data.map(p => ({
          id: p.id,
          name: p.name,
          barcode: p.barcode || null,
          sku: p.sku || null,
          sales_price: Number(p.sales_price || 0),
          cost: Number(p.cost || 0),
          category_id: p.category_id || null,
          stock: Number(p.stock || 0),
          image_url: p.image_url || null,
          is_scale_item: p.is_scale_item || false,
          plu_number: p.plu_number ? Number(p.plu_number) : null,
          scale_prefix: p.scale_prefix || '22',
          barcode2: p.barcode2 || null,
          age_restricted: p.age_restricted || false,
          tax_rate_override: p.tax_rate_override ? Number(p.tax_rate_override) : null,
        }));
        await db.products.bulkAdd(productsToCache);
        console.log(`Synced ${productsToCache.length} products locally.`);
      }
    } catch (error) {
      console.error('Failed to sync products locally:', error);
    }
  },

  /**
   * Syncs patients from Supabase to IndexedDB for offline HIMS visits check-in.
   */
  async syncPatientsLocally(orgId: string): Promise<void> {
    if (!navigator.onLine) return;
    try {
      const { data, error } = await supabase
        .from('hims_patients')
        .select('id, national_id, full_name, phone, dob, gender, blood_type')
        .eq('organization_id', orgId);

      if (error) throw error;

      if (data) {
        await db.himsPatients.clear();
        await db.himsPatients.bulkAdd(data);
        console.log(`Synced ${data.length} patients locally for HIMS.`);
      }
    } catch (error) {
      console.error('Failed to sync HIMS patients locally:', error);
    }
  },

  /**
   * Queues an offline HIMS patient registration.
   */
  async queuePatient(patientPayload: any): Promise<void> {
    try {
      await db.queuedPatients.add({
        payload: patientPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('Patient registration queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue patient:', error);
      throw new Error('Failed to save patient locally.');
    }
  },

  /**
   * Queues an offline HIMS clinical visit.
   */
  async queueVisit(visitPayload: any): Promise<void> {
    try {
      await db.queuedVisits.add({
        payload: visitPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('HIMS Visit queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue HIMS visit:', error);
      throw new Error('Failed to save visit locally.');
    }
  },

  /**
   * Queues an offline HIMS clinical note (SOAP note).
   */
  async queueClinicalNote(notePayload: any): Promise<void> {
    try {
      await db.queuedClinicalNotes.add({
        payload: notePayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('Clinical SOAP note queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue HIMS clinical note:', error);
      throw new Error('Failed to save clinical note locally.');
    }
  },

  /**
   * Queues an offline HIMS prescription.
   */
  async queuePrescription(prescriptionPayload: any): Promise<void> {
    try {
      await db.queuedPrescriptions.add({
        payload: prescriptionPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('HIMS Prescription queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue HIMS prescription:', error);
      throw new Error('Failed to save prescription locally.');
    }
  },

  /**
   * Queues offline HIMS lab orders.
   */
  async queueLabOrders(ordersPayload: any): Promise<void> {
    try {
      await db.queuedLabOrders.add({
        payload: ordersPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('HIMS Lab orders queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue HIMS lab orders:', error);
      throw new Error('Failed to save lab orders locally.');
    }
  },

  /**
   * Queues offline HIMS radiology orders.
   */
  async queueRadiologyOrders(ordersPayload: any): Promise<void> {
    try {
      await db.queuedRadiologyOrders.add({
        payload: ordersPayload,
        createdAt: new Date(),
        status: 'pending',
        attempts: 0,
      });
      console.log('HIMS Radiology orders queued for offline sync.');
    } catch (error) {
      console.error('Failed to queue HIMS radiology orders:', error);
      throw new Error('Failed to save radiology orders locally.');
    }
  },

  /**
   * Processes all queues (POS and HIMS) when connectivity is restored.
   */
  async processQueue(): Promise<void> {
    if (!navigator.onLine) {
      return;
    }

    // 1. Sync POS Orders
    const pendingOrders = await db.queuedOrders.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingOrders.length > 0) {
      console.log(`Processing ${pendingOrders.length} queued POS orders...`);
      for (const order of pendingOrders) {
        if (!order.id) continue;
        await db.queuedOrders.update(order.id, { status: 'syncing', attempts: order.attempts + 1, lastAttempt: new Date() });
        try {
          const { error } = await supabase.rpc('create_restaurant_order', order.payload);
          if (error) throw error;
          await db.queuedOrders.delete(order.id);
          console.log(`Order ${order.id} synced successfully.`);
        } catch (error: any) {
          console.error(`Failed to sync order ${order.id}:`, error);
          await db.queuedOrders.update(order.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 2. Sync HIMS Patients
    const pendingPatients = await db.queuedPatients.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingPatients.length > 0) {
      console.log(`Processing ${pendingPatients.length} queued medical patients...`);
      for (const patient of pendingPatients) {
        if (!patient.id) continue;
        await db.queuedPatients.update(patient.id, { status: 'syncing', attempts: patient.attempts + 1, lastAttempt: new Date() });
        try {
          const { data, error } = await supabase
            .from('hims_patients')
            .insert(patient.payload)
            .select('id')
            .single();

          if (error) throw error;
          
          const realPatientId = data.id;
          const tempPatientId = `queued-${patient.id}`;

          // Update any queued visits that reference this temporary patient ID
          const visits = await db.queuedVisits.toArray();
          for (const visit of visits) {
            if (visit.payload.patient_id === tempPatientId) {
              visit.payload.patient_id = realPatientId;
              await db.queuedVisits.put(visit);
            }
          }

          await db.queuedPatients.delete(patient.id);
          console.log(`Patient ${patient.id} synced successfully. Mapped to ${realPatientId}`);
        } catch (error: any) {
          console.error(`Failed to sync patient ${patient.id}:`, error);
          await db.queuedPatients.update(patient.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 3. Sync HIMS Visits
    const pendingVisits = await db.queuedVisits.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingVisits.length > 0) {
      console.log(`Processing ${pendingVisits.length} queued medical visits...`);
      for (const visit of pendingVisits) {
        if (!visit.id) continue;
        await db.queuedVisits.update(visit.id, { status: 'syncing', attempts: visit.attempts + 1, lastAttempt: new Date() });
        try {
          // Check if doctor_id is a mock offline ID and resolve to a real UUID
          let realDoctorId = visit.payload.doctor_id;
          if (realDoctorId?.startsWith('offline-doc-')) {
            const { data: docData } = await supabase
              .from('hims_doctors')
              .select('id')
              .eq('organization_id', visit.payload.organization_id)
              .eq('is_active', true)
              .limit(1);
            
            if (docData && docData.length > 0) {
              realDoctorId = docData[0].id;
            } else {
              const { data: fallbackDocs } = await supabase
                .from('hims_doctors')
                .select('id')
                .limit(1);
              if (fallbackDocs && fallbackDocs.length > 0) {
                realDoctorId = fallbackDocs[0].id;
              }
            }
            visit.payload.doctor_id = realDoctorId;
          }

          const { data, error } = await supabase
            .from('hims_visits')
            .insert(visit.payload)
            .select('id')
            .single();

          if (error) throw error;

          const realVisitId = data.id;
          const tempVisitId = `queued-visit-${visit.id}`;

          // Update any queued clinical notes, prescriptions, and lab/rad orders referencing this temporary visit ID
          const notes = await db.queuedClinicalNotes.toArray();
          for (const note of notes) {
            if (note.payload.visit_id === tempVisitId) {
              note.payload.visit_id = realVisitId;
              await db.queuedClinicalNotes.put(note);
            }
          }

          const prescriptions = await db.queuedPrescriptions.toArray();
          for (const pres of prescriptions) {
            if (pres.payload.visit_id === tempVisitId) {
              pres.payload.visit_id = realVisitId;
              await db.queuedPrescriptions.put(pres);
            }
          }

          const labOrders = await db.queuedLabOrders.toArray();
          for (const order of labOrders) {
            let modified = false;
            if (Array.isArray(order.payload)) {
              for (const singleOrder of order.payload) {
                if (singleOrder.visit_id === tempVisitId) {
                  singleOrder.visit_id = realVisitId;
                  modified = true;
                }
              }
            } else if (order.payload && order.payload.visit_id === tempVisitId) {
              order.payload.visit_id = realVisitId;
              modified = true;
            }
            if (modified) {
              await db.queuedLabOrders.put(order);
            }
          }

          const radOrders = await db.queuedRadiologyOrders.toArray();
          for (const order of radOrders) {
            let modified = false;
            if (Array.isArray(order.payload)) {
              for (const singleOrder of order.payload) {
                if (singleOrder.visit_id === tempVisitId) {
                  singleOrder.visit_id = realVisitId;
                  modified = true;
                }
              }
            } else if (order.payload && order.payload.visit_id === tempVisitId) {
              order.payload.visit_id = realVisitId;
              modified = true;
            }
            if (modified) {
              await db.queuedRadiologyOrders.put(order);
            }
          }

          await db.queuedVisits.delete(visit.id);
          console.log(`Visit ${visit.id} synced successfully. Mapped to ${realVisitId}`);
        } catch (error: any) {
          console.error(`Failed to sync visit ${visit.id}:`, error);
          await db.queuedVisits.update(visit.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 4. Sync HIMS Clinical Notes
    const pendingNotes = await db.queuedClinicalNotes.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingNotes.length > 0) {
      console.log(`Processing ${pendingNotes.length} queued clinical notes...`);
      for (const note of pendingNotes) {
        if (!note.id) continue;
        await db.queuedClinicalNotes.update(note.id, { status: 'syncing', attempts: note.attempts + 1, lastAttempt: new Date() });
        try {
          // Resolve correct doctor_id from the online visit to avoid foreign key errors
          const { data: visitData } = await supabase
            .from('hims_visits')
            .select('doctor_id')
            .eq('id', note.payload.visit_id)
            .single();
          if (visitData) {
            note.payload.doctor_id = visitData.doctor_id;
          }

          const { error } = await supabase.from('hims_clinical_notes').insert(note.payload);
          if (error) throw error;
          await db.queuedClinicalNotes.delete(note.id);
          console.log(`Clinical note ${note.id} synced successfully.`);
        } catch (error: any) {
          console.error(`Failed to sync clinical note ${note.id}:`, error);
          await db.queuedClinicalNotes.update(note.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 5. Sync HIMS Prescriptions
    const pendingPrescriptions = await db.queuedPrescriptions.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingPrescriptions.length > 0) {
      console.log(`Processing ${pendingPrescriptions.length} queued medical prescriptions...`);
      for (const pres of pendingPrescriptions) {
        if (!pres.id) continue;
        await db.queuedPrescriptions.update(pres.id, { status: 'syncing', attempts: pres.attempts + 1, lastAttempt: new Date() });
        try {
          // Resolve correct doctor_id from the online visit to avoid foreign key errors
          const { data: visitData } = await supabase
            .from('hims_visits')
            .select('doctor_id')
            .eq('id', pres.payload.visit_id)
            .single();
          if (visitData) {
            pres.payload.doctor_id = visitData.doctor_id;
          }

          const { error } = await supabase.from('hims_prescriptions').insert(pres.payload);
          if (error) throw error;
          await db.queuedPrescriptions.delete(pres.id);
          console.log(`Prescription ${pres.id} synced successfully.`);
        } catch (error: any) {
          console.error(`Failed to sync prescription ${pres.id}:`, error);
          await db.queuedPrescriptions.update(pres.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 6. Sync HIMS Lab Orders
    const pendingLabOrders = await db.queuedLabOrders.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingLabOrders.length > 0) {
      console.log(`Processing ${pendingLabOrders.length} queued medical lab orders...`);
      for (const order of pendingLabOrders) {
        if (!order.id) continue;
        await db.queuedLabOrders.update(order.id, { status: 'syncing', attempts: order.attempts + 1, lastAttempt: new Date() });
        try {
          // Map offline mock test_ids to real online database UUIDs before inserting
          if (Array.isArray(order.payload)) {
            for (const singleOrder of order.payload) {
              let testId = singleOrder.test_id;
              if (testId?.startsWith('offline-lab-')) {
                let name = 'صورة دم كاملة (CBC)';
                let category = 'hematology';
                if (testId === 'offline-lab-2') { name = 'وظائف كلى (Creatinine/Urea)'; category = 'biochemistry'; }
                else if (testId === 'offline-lab-3') { name = 'وظائف كبد (ALT/AST)'; category = 'biochemistry'; }
                else if (testId === 'offline-lab-4') { name = 'تحليل سكر تراكمي (HbA1c)'; category = 'diabetology'; }

                const { data: onlineTest } = await supabase
                  .from('hims_lab_tests')
                  .select('id')
                  .eq('organization_id', singleOrder.organization_id)
                  .eq('test_name', name)
                  .limit(1);

                if (onlineTest && onlineTest.length > 0) {
                  singleOrder.test_id = onlineTest[0].id;
                } else {
                  const { data: newTest, error: insertErr } = await supabase
                    .from('hims_lab_tests')
                    .insert({
                      test_name: name,
                      category: category,
                      price: 150,
                      organization_id: singleOrder.organization_id,
                      normal_range: '3.5 - 5.0',
                      unit: 'g/dL'
                    })
                    .select('id')
                    .single();
                  if (!insertErr && newTest) {
                    singleOrder.test_id = newTest.id;
                  } else {
                    const { data: fallbackTests } = await supabase
                      .from('hims_lab_tests')
                      .select('id')
                      .limit(1);
                    if (fallbackTests && fallbackTests.length > 0) {
                      singleOrder.test_id = fallbackTests[0].id;
                    }
                  }
                }
              }
            }
          }

          const { error } = await supabase.from('hims_lab_orders').insert(order.payload);
          if (error) throw error;
          await db.queuedLabOrders.delete(order.id);
          console.log(`Lab order batch ${order.id} synced successfully.`);
        } catch (error: any) {
          console.error(`Failed to sync lab order batch ${order.id}:`, error);
          await db.queuedLabOrders.update(order.id, { status: 'failed', error: error.message });
        }
      }
    }

    // 7. Sync HIMS Radiology Orders
    const pendingRadOrders = await db.queuedRadiologyOrders.where('status').anyOf('pending', 'failed').limit(10).toArray();
    if (pendingRadOrders.length > 0) {
      console.log(`Processing ${pendingRadOrders.length} queued medical radiology orders...`);
      for (const order of pendingRadOrders) {
        if (!order.id) continue;
        await db.queuedRadiologyOrders.update(order.id, { status: 'syncing', attempts: order.attempts + 1, lastAttempt: new Date() });
        try {
          const { error } = await supabase.from('hims_radiology_orders').insert(order.payload);
          if (error) throw error;
          await db.queuedRadiologyOrders.delete(order.id);
          console.log(`Radiology order batch ${order.id} synced successfully.`);
        } catch (error: any) {
          console.error(`Failed to sync radiology order batch ${order.id}:`, error);
          await db.queuedRadiologyOrders.update(order.id, { status: 'failed', error: error.message });
        }
      }
    }
  }
};