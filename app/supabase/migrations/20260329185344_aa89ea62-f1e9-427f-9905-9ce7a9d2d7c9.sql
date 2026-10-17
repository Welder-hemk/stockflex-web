
-- Drop existing storage policies if they exist and recreate
DROP POLICY IF EXISTS "Staff can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete photos" ON storage.objects;

-- Storage RLS policies for documents bucket
CREATE POLICY "Staff can upload documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can read documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND (
  public.is_staff(auth.uid()) OR public.is_admin_or_financeiro(auth.uid()) OR
  (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
));

CREATE POLICY "Staff can delete documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can upload photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'photos' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can read photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'photos' AND (
  public.is_staff(auth.uid()) OR public.is_admin_or_financeiro(auth.uid()) OR
  (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
));

CREATE POLICY "Staff can delete photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'photos' AND public.is_staff(auth.uid()));
