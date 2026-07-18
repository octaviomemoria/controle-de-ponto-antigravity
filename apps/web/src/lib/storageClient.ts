import { resolveCompanyId, isUuid } from "./profileRepo";
import { supabase } from "./supabase";

export type UploadResult = {
  path: string;
  signedUrl?: string;
};

export function normalizeFileName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "upload.bin";
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return safe || "upload.bin";
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl.includes(",")) return null;
  const [header, base64] = dataUrl.split(",");
  if (!header || !base64) return null;
  const mimeMatch = header.match(/data:([^;]+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";

  try {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 60 * 60 * 24 * 7
): Promise<string | null> {
  if (!supabase) return null;
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function uploadUserFile(params: {
  userId: string;
  bucket: string;
  file: File | Blob;
  fileName: string;
  prefix?: string;
  contentType?: string;
}): Promise<UploadResult | null> {
  if (!supabase) return null;
  const { userId, bucket, file, fileName, prefix, contentType } = params;
  if (!isUuid(userId)) return null;

  const companyId = await resolveCompanyId(userId);
  if (!companyId) return null;

  const safeName = normalizeFileName(fileName);
  const folder = prefix ? normalizeFileName(prefix) : "";
  const pathParts = [companyId, userId, folder, `${Date.now()}-${safeName}`].filter(Boolean);
  const storagePath = pathParts.join("/");

  const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
    contentType,
    upsert: true
  });

  if (error) {
    throw new Error(error.message);
  }

  const signedUrl = await createSignedUrl(bucket, storagePath);
  return {
    path: storagePath,
    signedUrl: signedUrl ?? undefined
  };
}

export function isRemoteUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");
}
