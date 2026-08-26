/**
 * ==============================================================================
 * Waiter Paging & Table Service Calls
 * TriPro ERP — services/waiterPagingService.ts
 * ==============================================================================
 */

import { secureStorage } from '../utils/securityMiddleware';

export interface WaiterCallRequest {
  id: string;
  table_id?: string;
  table_name: string;
  request_type: 'CALL_WAITER' | 'REQUEST_BILL' | 'ASSISTANCE' | 'WATER_REFILL';
  status: 'PENDING' | 'ACKNOWLEDGED' | 'COMPLETED';
  notes?: string;
  created_at: string;
  completed_at?: string;
}

const LOCAL_WAITER_CALLS_KEY = 'tripro_waiter_calls_v1';

class WaiterPagingService {
  public getCalls(): WaiterCallRequest[] {
    const calls = secureStorage.getItem<WaiterCallRequest[]>(LOCAL_WAITER_CALLS_KEY);
    if (calls && Array.isArray(calls)) return calls;
    return [];
  }

  public getPendingCalls(): WaiterCallRequest[] {
    return this.getCalls().filter(c => c.status !== 'COMPLETED');
  }

  public sendCall(tableName: string, requestType: WaiterCallRequest['request_type'], notes?: string): WaiterCallRequest {
    const newCall: WaiterCallRequest = {
      id: `call_${Date.now()}`,
      table_name: tableName,
      request_type: requestType,
      status: 'PENDING',
      notes,
      created_at: new Date().toISOString()
    };

    const current = this.getCalls();
    secureStorage.setItem(LOCAL_WAITER_CALLS_KEY, [newCall, ...current]);
    return newCall;
  }

  public acknowledgeCall(id: string): void {
    const current = this.getCalls();
    const updated = current.map(c => (c.id === id ? { ...c, status: 'ACKNOWLEDGED' as const } : c));
    secureStorage.setItem(LOCAL_WAITER_CALLS_KEY, updated);
  }

  public completeCall(id: string): void {
    const current = this.getCalls();
    const updated = current.map(c => (c.id === id ? { ...c, status: 'COMPLETED' as const, completed_at: new Date().toISOString() } : c));
    secureStorage.setItem(LOCAL_WAITER_CALLS_KEY, updated);
  }
}

export const waiterPagingService = new WaiterPagingService();
