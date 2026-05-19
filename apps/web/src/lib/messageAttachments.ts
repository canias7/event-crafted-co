import { supabase } from "@/integrations/supabase/client";

const BUCKET = "message-attachments";
export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES = 5;
export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  // Voice messages — webm is what MediaRecorder defaults to on
  // Chrome/Firefox, audio/mp4 (m4a) on Safari, ogg on some Linux
  // setups. The recorder hands us a Blob with the actual MIME, so we
  // just need to accept the common ones here.
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
];

export interface MessageAttachment {
  storage_path: string;
  filename: string;
  size: number;
  mime: string;
}

export function attachmentUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Upload a list of files to message-attachments under
 * <pathPrefix>/<uuid>.ext. The prefix scopes uploads to a parent
 * (inquiry id, thread id, etc.) so cleanup-on-delete is one path.
 *
 * Returns the metadata to write into the attachments jsonb column.
 *
 * Files that fail upload are skipped (logged via the error callback)
 * so partial successes still produce a message.
 */
export async function uploadAttachments(
  files: File[],
  pathPrefix: string,
  onError?: (filename: string, msg: string) => void,
): Promise<MessageAttachment[]> {
  const results: MessageAttachment[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (error) {
      onError?.(file.name, error.message);
      continue;
    }
    results.push({
      storage_path: path,
      filename: file.name,
      size: file.size,
      mime: file.type,
    });
  }
  return results;
}

export function validateAttachment(file: File): string | null {
  if (!ACCEPTED_MIME.includes(file.type)) {
    return `${file.name}: only JPG, PNG, WEBP, PDF, or audio`;
  }
  if (file.size > MAX_BYTES) {
    return `${file.name}: max 10 MB`;
  }
  return null;
}
