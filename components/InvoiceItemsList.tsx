import React, { useEffect, useState } from 'react';
import {
  getInvoiceItems,
  getInvoiceItemsWithTotals,
  calculateInvoiceTotals,
  addInvoiceItem,
  updateInvoiceItem,
  deleteInvoiceItem,
  InvoiceItemWithTotals,
  type InvoiceItemInput
} from '../services/invoiceItems';

interface InvoiceItemsListProps {
  invoiceId: string;
  readOnly?: boolean;
  onItemsChange?: (items: InvoiceItemWithTotals[]) => void;
}

interface FormData {
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
}

const INITIAL_FORM: FormData = {
  description: '',
  quantity: 1,
  unit_price: 0,
  discount: 0,
  tax_rate: 0
};

export const InvoiceItemsList: React.FC<InvoiceItemsListProps> = ({
  invoiceId,
  readOnly = false,
  onItemsChange
}) => {
  const [items, setItems] = useState<InvoiceItemWithTotals[]>([]);
  const [totals, setTotals] = useState({
    subtotal: 0,
    totalDiscount: 0,
    totalTax: 0,
    grandTotal: 0,
    itemCount: 0
  });
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // تحميل البنود والمجاميع
  useEffect(() => {
    loadItems();
  }, [invoiceId]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const itemsData = await getInvoiceItemsWithTotals(invoiceId);
      const totalsData = await calculateInvoiceTotals(invoiceId);
      setItems(itemsData);
      setTotals(totalsData);
      onItemsChange?.(itemsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحميل البنود');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description.trim()) {
      setError('الرجاء إدخال وصف البند');
      return;
    }

    try {
      setError(null);
      const newLineNo = Math.max(...items.map(i => i.line_no), 0) + 1;
      
      await addInvoiceItem(invoiceId, {
        line_no: newLineNo,
        description: formData.description,
        quantity: formData.quantity,
        unit_price: formData.unit_price,
        discount: formData.discount,
        tax_rate: formData.tax_rate
      });

      setFormData(INITIAL_FORM);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في إضافة البند');
    }
  };

  const handleUpdateItem = async (id: string) => {
    try {
      setError(null);
      await updateInvoiceItem(id, {
        description: formData.description,
        quantity: formData.quantity,
        unit_price: formData.unit_price,
        discount: formData.discount,
        tax_rate: formData.tax_rate
      });

      setEditingId(null);
      setFormData(INITIAL_FORM);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحديث البند');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('هل تريد حذف هذا البند؟')) return;

    try {
      setError(null);
      await deleteInvoiceItem(id);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في حذف البند');
    }
  };

  const handleEditClick = (item: InvoiceItemWithTotals) => {
    setEditingId(item.id);
    setFormData({
      description: item.description || '',
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount,
      tax_rate: item.tax_rate
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
  };

  if (loading) return <div className="p-4 text-center">جاري التحميل...</div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* جدول البنود */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-300 px-3 py-2">الرقم</th>
              <th className="border border-gray-300 px-3 py-2">الوصف</th>
              <th className="border border-gray-300 px-3 py-2 text-center">الكمية</th>
              <th className="border border-gray-300 px-3 py-2 text-center">السعر الفردي</th>
              <th className="border border-gray-300 px-3 py-2 text-center">الخصم</th>
              <th className="border border-gray-300 px-3 py-2 text-center">ضريبة %</th>
              <th className="border border-gray-300 px-3 py-2 text-center">المجموع</th>
              {!readOnly && <th className="border border-gray-300 px-3 py-2">الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="border border-gray-300 px-3 py-2">{item.line_no}</td>
                <td className="border border-gray-300 px-3 py-2">
                  {editingId === item.id ? (
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      className="w-full px-2 py-1 border rounded"
                    />
                  ) : (
                    item.description
                  )}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-center">
                  {editingId === item.id ? (
                    <input
                      type="number"
                      value={formData.quantity}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          quantity: parseFloat(e.target.value) || 0
                        })
                      }
                      className="w-20 px-2 py-1 border rounded"
                    />
                  ) : (
                    item.quantity
                  )}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-center">
                  {editingId === item.id ? (
                    <input
                      type="number"
                      value={formData.unit_price}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          unit_price: parseFloat(e.target.value) || 0
                        })
                      }
                      className="w-24 px-2 py-1 border rounded"
                    />
                  ) : (
                    item.unit_price.toLocaleString()
                  )}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-center">
                  {editingId === item.id ? (
                    <input
                      type="number"
                      value={formData.discount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          discount: parseFloat(e.target.value) || 0
                        })
                      }
                      className="w-20 px-2 py-1 border rounded"
                    />
                  ) : (
                    item.discount.toLocaleString()
                  )}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-center">
                  {editingId === item.id ? (
                    <input
                      type="number"
                      value={formData.tax_rate}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tax_rate: parseFloat(e.target.value) || 0
                        })
                      }
                      className="w-20 px-2 py-1 border rounded"
                    />
                  ) : (
                    item.tax_rate
                  )}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-center font-bold">
                  {item.line_total.toLocaleString()}
                </td>
                {!readOnly && (
                  <td className="border border-gray-300 px-3 py-2 text-center space-x-2">
                    {editingId === item.id ? (
                      <>
                        <button
                          onClick={() => handleUpdateItem(item.id)}
                          className="bg-green-500 text-white px-2 py-1 rounded text-sm"
                        >
                          حفظ
                        </button>
                        <button
                          onClick={handleCancel}
                          className="bg-gray-500 text-white px-2 py-1 rounded text-sm"
                        >
                          إلغاء
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleEditClick(item)}
                          className="bg-blue-500 text-white px-2 py-1 rounded text-sm"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="bg-red-500 text-white px-2 py-1 rounded text-sm"
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* نموذج إضافة بند */}
      {!readOnly && !editingId && (
        <form onSubmit={handleAddItem} className="bg-gray-50 p-4 rounded border">
          <h3 className="font-bold mb-3">إضافة بند جديد</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
            <input
              type="text"
              placeholder="الوصف"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="px-2 py-1 border rounded"
            />
            <input
              type="number"
              placeholder="الكمية"
              value={formData.quantity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  quantity: parseFloat(e.target.value) || 0
                })
              }
              className="px-2 py-1 border rounded"
            />
            <input
              type="number"
              placeholder="السعر الفردي"
              value={formData.unit_price}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  unit_price: parseFloat(e.target.value) || 0
                })
              }
              className="px-2 py-1 border rounded"
            />
            <input
              type="number"
              placeholder="الخصم"
              value={formData.discount}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  discount: parseFloat(e.target.value) || 0
                })
              }
              className="px-2 py-1 border rounded"
            />
            <input
              type="number"
              placeholder="ضريبة %"
              value={formData.tax_rate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  tax_rate: parseFloat(e.target.value) || 0
                })
              }
              className="px-2 py-1 border rounded"
            />
            <button
              type="submit"
              className="bg-green-500 text-white px-4 py-1 rounded"
            >
              إضافة
            </button>
          </div>
        </form>
      )}

      {/* ملخص الإجماليات */}
      <div className="bg-blue-50 p-4 rounded border border-blue-200">
        <h3 className="font-bold mb-2">ملخص الفاتورة</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-gray-600 text-sm">الإجمالي الفرعي</p>
            <p className="text-lg font-bold">{totals.subtotal.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">الخصم الكلي</p>
            <p className="text-lg font-bold text-red-600">
              -{totals.totalDiscount.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">الضرائب</p>
            <p className="text-lg font-bold text-orange-600">
              +{totals.totalTax.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">الإجمالي النهائي</p>
            <p className="text-lg font-bold text-green-600">
              {totals.grandTotal.toLocaleString()}
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2">عدد البنود: {totals.itemCount}</p>
      </div>
    </div>
  );
};

export default InvoiceItemsList;
