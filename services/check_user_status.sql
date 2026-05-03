-- تحقق من وجود المستخدم في auth.users
-- استبدل 'your_email@example.com' ببريدك الإلكتروني الحقيقي
SELECT id, email, created_at, last_sign_in_at, email_confirmed_at
FROM auth.users
WHERE email = 'mahmodelrakhawey@gmail.com';

-- تحقق من الملف الشخصي المرتبط (تصحيح: profiles لا يحتوي على email، نربط مع auth.users)
SELECT p.id, u.email, p.organization_id, o.name as organization_name
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
LEFT JOIN public.organizations o ON p.organization_id = o.id
WHERE u.email = 'mahmodelrakhawey@gmail.com';