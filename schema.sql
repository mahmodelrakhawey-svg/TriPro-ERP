-- جدول دليل الحسابات (Chart of Accounts)
-- يدعم الهيكلية الشجرية عبر parent_id
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL, -- رمز الحساب (مثلاً 1010)
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    parent_id INTEGER REFERENCES accounts(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- جدول قيود اليومية (Journal Entries)
-- يمثل "رأس" القيد
CREATE TABLE journal_entries (
    id SERIAL PRIMARY KEY,
    transaction_date DATE NOT NULL,
    description TEXT,
    reference_number VARCHAR(100), -- رقم الفاتورة أو السند
    is_posted BOOLEAN DEFAULT FALSE, -- هل تم الترحيل؟ (لا يمكن التعديل بعد الترحيل)
    created_by INTEGER NOT NULL, -- معرف المستخدم
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- جدول أطراف القيد (Journal Entry Lines)
-- يمثل المدين والدائن
CREATE TABLE journal_entry_lines (
    id SERIAL PRIMARY KEY,
    journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE RESTRICT,
    account_id INTEGER REFERENCES accounts(id) ON DELETE RESTRICT,
    description TEXT, -- شرح فرعي للسطر
    debit DECIMAL(19, 4) DEFAULT 0 CHECK (debit >= 0), -- المدين
    credit DECIMAL(19, 4) DEFAULT 0 CHECK (credit >= 0), -- الدائن
    
    -- ضمان عدم وجود مدين ودائن في نفس السطر (اختياري حسب المدرسة المحاسبية)
    CONSTRAINT check_debit_credit_exclusive CHECK (
        (debit = 0 AND credit > 0) OR (debit > 0 AND credit = 0)
    )
);

-- فهرس لسرعة البحث في كشف الحساب
CREATE INDEX idx_entry_lines_account ON journal_entry_lines(account_id);
CREATE INDEX idx_entries_date ON journal_entries(transaction_date);

-- جدول سجل الرقابة (Audit Log) - هام جداً للمحاسب القانوني
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    old_values JSONB,
    new_values JSONB,
    user_id INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- جدول الشيكات (Cheques)
-- لتتبع دورة حياة الشيك وربطه بالقيود المحاسبية
CREATE TABLE cheques (
    id SERIAL PRIMARY KEY,
    cheque_number VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'incoming' (قبض), 'outgoing' (دفع)
    amount DECIMAL(19, 4) NOT NULL,
    bank_name VARCHAR(100),
    due_date DATE,
    status VARCHAR(20) NOT NULL, -- 'received', 'deposited', 'collected', 'rejected', 'issued', 'cashed'
    party_id INTEGER, -- معرف العميل أو المورد
    party_name VARCHAR(255),
    current_account_id INTEGER REFERENCES accounts(id), -- الحساب الذي يوجد به الشيك حالياً
    related_voucher_id INTEGER, -- رقم سند القبض/الصرف المرتبط
    related_journal_entry_id INTEGER REFERENCES journal_entries(id), -- القيد المحاسبي لآخر عملية
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);