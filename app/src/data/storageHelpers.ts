import { supabase } from "@/integrations/supabase/client";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_DOC_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"];

function validateFile(file: File, allowPdf: boolean): string | null {
  if (file.size > MAX_FILE_SIZE) return "Archivo muy grande (máx 5MB)";
  const allowed = allowPdf ? ALLOWED_DOC_TYPES : ALLOWED_IMAGE_TYPES;
  if (!allowed.includes(file.type)) {
    return `Tipo no permitido. Aceptados: ${allowed.map(t => t.split("/")[1]).join(", ")}`;
  }
  return null;
}

function getExtension(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext) return ext;
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
  };
  return map[file.type] || "bin";
}

/**
 * Upload a file to a storage bucket.
 * Path format: {clienteId}/{prefix}_{timestamp}.{ext}
 */
export async function uploadFile(
  bucket: "documents" | "photos",
  file: File,
  clienteId: string,
  prefix: string,
  allowPdf = false
): Promise<string> {
  const validationError = validateFile(file, allowPdf);
  if (validationError) throw new Error(validationError);

  const ext = getExtension(file);
  const timestamp = Date.now();
  const path = `${clienteId}/${prefix}_${timestamp}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw new Error(`Error al subir archivo: ${error.message}`);

  // Get the public URL (signed for private buckets)
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
  if (!data?.signedUrl) {
    // fallback: store path only, resolve URL when needed
    return `${bucket}:${path}`;
  }

  return data.signedUrl;
}

/**
 * Get a fresh signed URL for a stored file path.
 */
export async function getSignedUrl(storedUrl: string): Promise<string | null> {
  // If it's already an HTTP URL, return as-is (legacy or already signed)
  if (storedUrl.startsWith("http")) return storedUrl;
  // If it's a data URL (base64 legacy), return as-is
  if (storedUrl.startsWith("data:")) return storedUrl;

  // Parse bucket:path format
  const match = storedUrl.match(/^(documents|photos):(.+)$/);
  if (!match) return storedUrl;

  const [, bucket, path] = match;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60); // 1 hour
  return data?.signedUrl || null;
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(storedUrl: string): Promise<void> {
  const match = storedUrl.match(/^(documents|photos):(.+)$/);
  if (!match) return; // Can't delete legacy or external URLs

  const [, bucket, path] = match;
  await supabase.storage.from(bucket).remove([path]);
}
