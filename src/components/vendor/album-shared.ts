import { supabase } from "@/integrations/supabase/client";

// Constants + types + supabase helpers shared between AlbumManager
// (the list view) and AlbumEditor (the photo-management dialog).
// event_albums and event_album_photos are still missing from the
// auto-generated Supabase types — both casts retained until Lovable
// catches up.

export const BUCKET = "event-albums";
export const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per photo (HD originals)
export const MAX_PER_ALBUM = 200;
export const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export interface Album {
  id: string;
  title: string;
  description: string | null;
  share_token: string;
  cover_path: string | null;
  host_consent_given_at: string | null;
  published_at: string | null;
  download_enabled: boolean;
  inquiry_id: string | null;
  host_id: string | null;
  event_id: string | null;
  photo_count?: number;
  created_at: string;
}

export interface Photo {
  id: string;
  storage_path: string;
  caption: string | null;
  display_order: number;
  taken_at: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const albumsTable = () => (supabase as any).from("event_albums");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const photosTable = () => (supabase as any).from("event_album_photos");
