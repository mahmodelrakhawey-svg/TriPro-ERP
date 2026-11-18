import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EmptyState from '../../components/EmptyState';
import CommandPalette from '../../components/CommandPalette';
import { Plus } from 'lucide-react';

describe('🎨 UI & Navigation Enhancements (CommandPalette & EmptyState)', () => {
  it('EmptyState يعرض العنوان والوصف وزر الإجراء ويستجيب للنقر بنجاح', () => {
    const handleClick = vi.fn();

    render(
      <EmptyState
        title="لا توجد فواتير مسجلة"
        description="ابدأ بإضافة أول فاتورة مبيعات في النظام الآن"
        action={{
          label: 'إضافة فاتورة',
          onClick: handleClick,
          icon: Plus
        }}
      />
    );

    expect(screen.getByText('لا توجد فواتير مسجلة')).toBeDefined();
    expect(screen.getByText('ابدأ بإضافة أول فاتورة مبيعات في النظام الآن')).toBeDefined();

    const actionButton = screen.getByRole('button', { name: /إضافة فاتورة/i });
    expect(actionButton).toBeDefined();

    fireEvent.click(actionButton);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('CommandPalette يفتح عند إرسال حدث tripro:open-command-palette ويقوم بتصفية الشاشات', async () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    );

    // في البداية يكون مغلقاً
    expect(screen.queryByPlaceholderText(/ابحث عن أي شاشة أو تقرير/i)).toBeNull();

    // إرسال حدث الفتح داخل act
    act(() => {
      window.dispatchEvent(new CustomEvent('tripro:open-command-palette'));
    });

    // التحقق من ظهور شريط البحث
    const searchInput = screen.getByPlaceholderText(/ابحث عن أي شاشة أو تقرير/i) as HTMLInputElement;
    expect(searchInput).toBeDefined();

    // البحث عن "قيود" داخل act
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'قيود' } });
    });

    // التحقق من ظهور نتائج المحاسبة
    expect(screen.getByText(/دفتر اليومية العامة/i)).toBeDefined();

    // الضغط على مفتاح Escape للإغلاق
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.queryByPlaceholderText(/ابحث عن أي شاشة أو تقرير/i)).toBeNull();
  });
});
