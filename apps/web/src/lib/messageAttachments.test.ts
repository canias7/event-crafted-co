import { describe, it, expect, vi } from "vitest";

// messageAttachments imports the supabase client (for attachmentUrl), which
// reads env at module load. The guards under test are pure, so stub the
// client rather than requiring real credentials — same approach as
// MySpaceChat.initialload.test.tsx.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } },
}));

import {
  isFileAttachment,
  isVendorCard,
  type MessageAttachmentItem,
} from "./messageAttachments";

// The attachments jsonb column now holds two shapes: file attachments (no
// `kind`) and shared vendor cards (kind: "vendor_card"). The renderer
// dereferences `mime`/`storage_path`, so a mis-routed item would throw and
// take the whole message thread down with it. These guards are the only
// thing standing between a bad row and that crash.

const file: MessageAttachmentItem = {
  storage_path: "inq/1.png",
  filename: "1.png",
  size: 10,
  mime: "image/png",
};

const card: MessageAttachmentItem = {
  kind: "vendor_card",
  vendor_id: "v1",
  business_name: "Bloom Florals",
  category: "Florist",
  location: "Charlotte, NC",
  logo_url: null,
};

describe("attachment type guards", () => {
  it("identifies a vendor card", () => {
    expect(isVendorCard(card)).toBe(true);
    expect(isVendorCard(file)).toBe(false);
  });

  it("identifies a file attachment", () => {
    expect(isFileAttachment(file)).toBe(true);
  });

  it("keeps vendor cards out of the file renderer", () => {
    // Without this, MessageAttachments would call card.mime.startsWith().
    expect(isFileAttachment(card)).toBe(false);
  });

  it("rejects malformed rows missing the fields the renderer dereferences", () => {
    const noPath = { filename: "x", size: 1, mime: "image/png" };
    const noMime = { storage_path: "p", filename: "x", size: 1 };
    expect(isFileAttachment(noPath as MessageAttachmentItem)).toBe(false);
    expect(isFileAttachment(noMime as MessageAttachmentItem)).toBe(false);
  });
});
