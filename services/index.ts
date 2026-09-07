export type VisitStatus = 'scheduled' | 'arrived' | 'in_consultation' | 'discharged';
export type BedStatus = 'available' | 'occupied' | 'maintenance' | 'cleaning';

export interface Patient {
  id: string;
  full_name: string;
  national_id: string;
  dob: string;
  blood_type: string;
  allergies: string[];
  medical_history: any;
}

export interface PrescriptionItem {
  product_id: string;
  drug_name: string;
  qty: number;
  dosage: string;
  frequency: string;
}

export interface Prescription {
  id: string;
  visit_id: string;
  doctor_id: string;
  diagnosis: string;
  medications: PrescriptionItem[];
}

export interface Surgery {
  id?: string;
  visit_id: string;
  lead_surgeon_id: string;
  surgery_name: string;
  room_number: string;
  scheduled_start: string;
  scheduled_end?: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  doctor?: { profiles: { full_name: string } };
}

export interface InsuranceClaim {
  id?: string;
  insurance_provider_id: string;
  batch_reference: string;
  status: 'draft' | 'submitted' | 'paid';
  total_claim_amount: number;
  submission_date?: string;
}

export interface BloodDonor {
  id: string;
  full_name: string;
  blood_type: string;
  phone: string;
  last_donation_date?: string;
}

export interface BloodBag {
  id: string;
  bag_code: string;
  blood_type: string;
  expiry_date: string;
  status: 'available' | 'reserved' | 'used' | 'expired';
}