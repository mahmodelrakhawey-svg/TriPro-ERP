-- =================================================================
-- == سياسات أمان لحماية القيود المرحلة من التعديل أو الحذف ==
-- =================================================================

-- 1. دالة لمنع تعديل أو حذف رأس القيد (journal_entries) إذا كان مرحّلاً
CREATE OR REPLACE FUNCTION prevent_posted_journal_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- التحقق عند محاولة التعديل أو الحذف
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        -- إذا كانت الحالة القديمة للقيد هي "مرحّل"
        IF OLD.status = 'posted' THEN
            -- ارفض العملية وأظهر رسالة خطأ واضحة
            RAISE EXCEPTION 'CANNOT_MODIFY_POSTED_JOURNAL: لا يمكن تعديل أو حذف قيد مرحّل. رقم القيد: %', OLD.reference;
        END IF;
    END IF;

    -- إذا لم يكن مرحّلاً، اسمح بالعملية
    IF TG_OP = 'UPDATE' THEN
        RETURN NEW; -- اسمح بالتحديث
    ELSE
        RETURN OLD; -- اسمح بالحذف
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. ربط الدالة بجدول القيود (journal_entries)
-- يتم تفعيل هذه الدالة تلقائياً قبل أي عملية تعديل أو حذف
DROP TRIGGER IF EXISTS check_journal_posted_status ON journal_entries;
CREATE TRIGGER check_journal_posted_status
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_modification();


-- 3. دالة لمنع تعديل أو حذف أسطر القيد (journal_lines) إذا كان القيد الأب مرحّلاً
CREATE OR REPLACE FUNCTION prevent_posted_journal_line_modification()
RETURNS TRIGGER AS $$
DECLARE
    parent_status TEXT;
BEGIN
    -- ابحث عن حالة القيد الأب
    SELECT status INTO parent_status FROM journal_entries WHERE id = OLD.journal_entry_id;

    IF parent_status = 'posted' THEN
        RAISE EXCEPTION 'CANNOT_MODIFY_POSTED_JOURNAL_LINE: لا يمكن تعديل أو حذف أسطر تابعة لقيد مرحّل.';
    END IF;

    -- اسمح بالعملية إذا لم يكن القيد الأب مرحّلاً
    IF TG_OP = 'UPDATE' THEN
        RETURN NEW;
    ELSE
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. ربط الدالة بجدول أسطر القيود (journal_lines)
DROP TRIGGER IF EXISTS check_journal_line_posted_status ON journal_lines;
CREATE TRIGGER check_journal_line_posted_status
BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION prevent_posted_journal_line_modification();


COMMENT ON FUNCTION prevent_posted_journal_modification IS 'Ensures that once a journal entry is marked as ''posted'', it cannot be updated or deleted.';
COMMENT ON FUNCTION prevent_posted_journal_line_modification IS 'Ensures that lines of a posted journal entry cannot be modified or deleted.';
