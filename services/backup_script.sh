#!/bin/bash
# سكربت أخذ نسخة احتياطية لقاعدة بيانات TriPro ERP

# إعدادات الاتصال (يتم جلبها من إعدادات Supabase)
DB_URL="postgresql://postgres:[YOUR_PASSWORD]@db.pjvphxfschfllpawfewn.supabase.co:5432/postgres"
BACKUP_NAME="tripro_erp_backup_$(date +%Y-%m-%d_%H-%M-%S).sql"

echo "🚀 بدء عملية النسخ الاحتياطي..."

# تنفيذ أمر pg_dump
pg_dump $DB_URL > ./backups/$BACKUP_NAME

echo "✅ اكتملت العملية بنجاح: $BACKUP_NAME"

# نصيحة: يمكن إضافة أمر لرفع الملف تلقائياً إلى سحابة خارجية هنا