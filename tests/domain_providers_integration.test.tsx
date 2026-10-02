import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { CustomerProvider, useCustomerDomain } from '../context/domains/CustomerContext';
import { SupplierProvider, useSupplierDomain } from '../context/domains/SupplierContext';
import { BankingProvider, useBankingDomain } from '../context/domains/BankingContext';
import { ProductProvider, useProductDomain } from '../context/domains/ProductContext';
import { SalesProvider, useSalesDomain } from '../context/domains/SalesContext';
import { GeneralLedgerProvider, useGeneralLedgerDomain } from '../context/domains/GeneralLedgerContext';
import { SettingsProvider, useSettingsDomain } from '../context/domains/AccountingSettingsContext';
import { Cheque, Product } from '../types';

describe('Domain Context Providers & Hooks Integration (اختبار تكامل موفري النطاقات)', () => {
  it('CustomerProvider يوفر بيانات العملاء ودوال الإدارة بشكل سليم', () => {
    const mockCustomers = [
      { id: 'c1', name: 'حلواني لينزا - فرع المنصورة', phone: '01000000001' }
    ];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CustomerProvider initialCustomers={mockCustomers}>
        {children}
      </CustomerProvider>
    );

    const { result } = renderHook(() => useCustomerDomain(), { wrapper });
    expect(result.current.customers).toHaveLength(1);
    expect(result.current.customers[0].name).toBe('حلواني لينزا - فرع المنصورة');
    expect(typeof result.current.addCustomer).toBe('function');
  });

  it('SupplierProvider يوفر بيانات الموردين وفواتير الشراء', () => {
    const mockSuppliers = [
      { id: 's1', name: 'مطاحن الدقيق الفاخر', phone: '01000000002' }
    ];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SupplierProvider initialSuppliers={mockSuppliers}>
        {children}
      </SupplierProvider>
    );

    const { result } = renderHook(() => useSupplierDomain(), { wrapper });
    expect(result.current.suppliers).toHaveLength(1);
    expect(result.current.suppliers[0].name).toBe('مطاحن الدقيق الفاخر');
    expect(typeof result.current.approvePurchaseInvoice).toBe('function');
  });

  it('BankingProvider يوفر الشيكات وسندات الصرف والقبض', () => {
    const mockCheques = [
      { id: 'ch1', cheque_number: 'CHQ-9901', amount: 50000, status: 'RECEIVED' as const }
    ] as unknown as Cheque[];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BankingProvider initialCheques={mockCheques}>
        {children}
      </BankingProvider>
    );

    const { result } = renderHook(() => useBankingDomain(), { wrapper });
    expect(result.current.cheques).toHaveLength(1);
    expect(result.current.cheques[0].amount).toBe(50000);
    expect(typeof result.current.updateChequeStatus).toBe('function');
  });

  it('ProductProvider يوفر المنتجات والمستودعات والتصنيفات', () => {
    const mockProducts = [
      { id: 'p1', name: 'جاتوه سواريه مشكل', price: 250, cost: 150, stock: 100 }
    ] as unknown as Product[];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ProductProvider initialProducts={mockProducts}>
        {children}
      </ProductProvider>
    );

    const { result } = renderHook(() => useProductDomain(), { wrapper });
    expect(result.current.products).toHaveLength(1);
    expect(result.current.products[0].name).toBe('جاتوه سواريه مشكل');
    expect(typeof result.current.recalculateStock).toBe('function');
  });

  it('SalesProvider يوفر فواتير المبيعات ومندوبي البيع', () => {
    const mockInvoices = [
      { id: 'inv1', invoice_number: 'INV-2026-001', customer_id: 'c1', total_amount: 1500, date: '2026-10-01', due_date: '2026-10-15', items: [], subtotal: 1500, tax_amount: 0 }
    ];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SalesProvider initialInvoices={mockInvoices}>
        {children}
      </SalesProvider>
    );

    const { result } = renderHook(() => useSalesDomain(), { wrapper });
    expect(result.current.invoices).toHaveLength(1);
    expect(result.current.invoices[0].invoice_number).toBe('INV-2026-001');
    expect(typeof result.current.approveInvoice).toBe('function');
  });

  it('GeneralLedgerProvider يوفر قيود اليومية ومراكز التكلفة والسنوات المالية', () => {
    const mockEntries = [
      { id: 'je1', date: '2026-10-01', description: 'قيد إثبات إيرادات مبيعات', status: 'posted' as const, is_posted: true, lines: [], created_at: '2026-10-01' }
    ];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GeneralLedgerProvider initialEntries={mockEntries} initialYear={2026}>
        {children}
      </GeneralLedgerProvider>
    );

    const { result } = renderHook(() => useGeneralLedgerDomain(), { wrapper });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.selectedFiscalYear).toBe(2026);
    expect(typeof result.current.addEntry).toBe('function');
  });

  it('SettingsProvider يوفر إعدادات المنشأة والحسابات العامة', () => {
    const mockAccounts = [
      { id: 'acc1', code: '1231', name: 'الصندوق الرئيسي', type: 'ASSET', balance: 75000, is_group: false, is_active: true }
    ];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsProvider initialAccounts={mockAccounts}>
        {children}
      </SettingsProvider>
    );

    const { result } = renderHook(() => useSettingsDomain(), { wrapper });
    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.accounts[0].code).toBe('1231');
    expect(typeof result.current.getSystemAccount).toBe('function');
  });
});
