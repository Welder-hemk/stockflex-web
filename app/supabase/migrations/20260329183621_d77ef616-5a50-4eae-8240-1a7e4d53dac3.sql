
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('documents', 'documents', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('photos', 'photos', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for 'documents' bucket (comprovantes + fotos de documentos)
CREATE POLICY "Staff can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND public.is_staff(auth.uid())
);

CREATE POLICY "Staff can read all documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND (
    public.is_staff(auth.uid()) OR
    public.is_admin_or_financeiro(auth.uid())
  )
);

CREATE POLICY "Staff can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND public.is_staff(auth.uid())
);

CREATE POLICY "Cliente can read own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
);

-- RLS policies for 'photos' bucket (fotos de autorizados)
CREATE POLICY "Staff can upload photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' AND public.is_staff(auth.uid())
);

CREATE POLICY "Staff can read all photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'photos' AND (
    public.is_staff(auth.uid()) OR
    public.is_admin_or_financeiro(auth.uid())
  )
);

CREATE POLICY "Staff can delete photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos' AND public.is_staff(auth.uid())
);

CREATE POLICY "Cliente can read own photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'photos' AND
  (storage.foldername(name))[1] = public.get_user_client_id(auth.uid())
);

CREATE POLICY "Staff can update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND public.is_staff(auth.uid())
);

CREATE POLICY "Staff can update photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'photos' AND public.is_staff(auth.uid())
);
