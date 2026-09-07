-- =============================================
-- Title: ICD-10 Codes Seeding Script
-- Description: يقوم هذا السكربت بإدراج أشهر أكواد تشخيص الأمراض العالمية (ICD-10) لضمان قبول مطالبات التأمين
-- =============================================

INSERT INTO public.hims_icd10_codes (code, description_ar, description_en, organization_id)
VALUES
  ('I10', 'ارتفاع ضغط الدم الأساسي', 'Essential (primary) hypertension', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('E11.9', 'داء السكري من النوع الثاني بدون مضاعفات', 'Type 2 diabetes mellitus without complications', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('J06.9', 'التهاب حاد في الجهاز التنفسي العلوي غير محدد', 'Acute upper respiratory infection, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('R50.9', 'حمى غير محددة', 'Fever, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('R10.9', 'ألم في البطن غير محدد', 'Unspecified abdominal pain', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('K21.9', 'ارتجاع المريء بدون التهاب مريء', 'Gastro-esophageal reflux disease without esophagitis', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('M54.5', 'ألم أسفل الظهر', 'Low back pain', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('N39.0', 'التهاب المسالك البولية، موقع غير محدد', 'Urinary tract infection, site not specified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('J45.909', 'الربو غير المحدد بدون مضاعفات', 'Unspecified asthma, uncomplicated', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('R05', 'سعال / كحة', 'Cough', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('H66.90', 'التهاب الأذن الوسطى غير محدد', 'Otitis media, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('G43.909', 'الصداع النصفي غير محدد', 'Migraine, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('R51', 'صداع', 'Headache', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('K29.70', 'التهاب المعدة غير محدد بدون نزيف', 'Gastritis, unspecified, without bleeding', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('B34.9', 'عدوى فيروسية غير محددة', 'Viral infection, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('L20.9', 'التهاب الجلد التأتبي غير محدد (إكزيما)', 'Atopic dermatitis, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('A09', 'التهاب المعدة والأمعاء المعدي (نزلات معوية حادة)', 'Infectious gastroenteritis and colitis, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('R11.10', 'قيء غير محدد', 'Vomiting, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('E03.9', 'قصور الغدة الدرقية غير محدد', 'Hypothyroidism, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('F41.9', 'اضطراب القلق غير محدد', 'Anxiety disorder, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('F32.9', 'اضطراب اكتئابي جسيم غير محدد', 'Major depressive disorder, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('J02.9', 'التهاب البلعوم الحاد غير محدد (التهاب اللوزتين/الحلق)', 'Acute pharyngitis, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('J01.90', 'التهاب الجيوب الأنفية الحاد غير محدد', 'Acute sinusitis, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('K52.9', 'التهاب الأمعاء والمعدة غير المعدي غير محدد', 'Noninfective gastroenteritis and colitis, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('M79.1', 'آلام العضلات (التهاب عضلي)', 'Myalgia', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('N18.9', 'مرض الكلى المزمن غير محدد', 'Chronic kidney disease, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('E78.5', 'ارتفاع دهون الدم غير محدد', 'Hyperlipidemia, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('D64.9', 'أنيميا / فقر الدم غير محدد', 'Anemia, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('R07.9', 'ألم في الصدر غير محدد', 'Chest pain, unspecified', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1))),
  ('R42', 'دوار ودوخة', 'Dizziness and giddiness', COALESCE(public.get_my_org(), (SELECT id FROM public.organizations LIMIT 1)))
ON CONFLICT (organization_id, code) DO UPDATE SET
  description_ar = EXCLUDED.description_ar,
  description_en = EXCLUDED.description_en;
