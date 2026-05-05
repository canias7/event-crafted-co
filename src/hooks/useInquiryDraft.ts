import { useEffect, useRef } from "react";

// localStorage-backed inquiry draft. Auto-saves the form state on
// change so abandoning the page (or closing the tab) doesn't lose
// what the host typed. One draft per host (anonymous gets one too).
//
// Discriminated by `key` so different inquiry surfaces can each
// have their own slot — e.g. "blast" vs "inquiry-modal".

const PREFIX = "vendora.inquiryDraft.";

export interface InquiryDraft {
  eventType?: string;
  eventDate?: string;
  guestCount?: string;
  location?: string;
  budgetMin?: string;
  budgetMax?: string;
  specialRequests?: string;
}

export function loadDraft(key: string): InquiryDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as InquiryDraft;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, draft: InquiryDraft) {
  try {
    const cleaned = Object.fromEntries(
      Object.entries(draft).filter(
        ([, v]) => v != null && String(v).trim() !== "",
      ),
    );
    if (Object.keys(cleaned).length === 0) {
      window.localStorage.removeItem(PREFIX + key);
    } else {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(cleaned));
    }
  } catch {
    // Silent — quota errors etc. don't break the flow.
  }
}

export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

// Auto-save hook with a debounce: persists `draft` on change, but
// throttles so we're not writing on every keystroke. 600ms is
// plenty (no perceptible loss on tab close).
export function useAutoSaveDraft(key: string, draft: InquiryDraft) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveDraft(key, draft);
    }, 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, draft]);
}
