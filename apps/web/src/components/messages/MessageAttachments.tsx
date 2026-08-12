import { FileText, Image as ImageIcon, Download } from "lucide-react";
import {
  attachmentUrl,
  isFileAttachment,
  isVendorCard,
  type MessageAttachmentItem,
} from "@/lib/messageAttachments";
import { AudioBubble } from "@/components/messages/AudioBubble";
import { SharedVendorCard } from "@/components/messages/SharedVendorCard";

interface Props {
  attachments: MessageAttachmentItem[];
  /** Light = lighter card backgrounds, dark = darker bubbles. */
  variant?: "neutral" | "tinted";
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageAttachments({ attachments }: Props) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {attachments.map((item, i) => {
        // Shared vendor profile — a host introducing a vendor into the chat.
        if (isVendorCard(item)) {
          return <SharedVendorCard key={`vc-${item.vendor_id}-${i}`} card={item} />;
        }
        // Anything that isn't a well-formed file attachment is skipped rather
        // than crashing the whole thread on a malformed row.
        if (!isFileAttachment(item)) return null;
        const a = item;
        const url = attachmentUrl(a.storage_path);
        const isImage = a.mime.startsWith("image/");
        const isAudio = a.mime.startsWith("audio/");
        if (isImage) {
          return (
            <a
              key={a.storage_path}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-xs rounded-sm overflow-hidden border border-border hover:border-foreground/30 transition-colors"
            >
              <img
                src={url}
                alt={a.filename}
                loading="lazy"
                className="w-full h-auto"
              />
            </a>
          );
        }
        if (isAudio) {
          return (
            <AudioBubble
              key={a.storage_path}
              src={url}
              filename={a.filename}
            />
          );
        }
        return (
          <a
            key={a.storage_path}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-sm bg-background/60 border border-border hover:border-foreground/30 transition-colors max-w-sm"
          >
            <div className="w-9 h-9 rounded bg-secondary flex items-center justify-center flex-shrink-0">
              {isImage ? (
                <ImageIcon className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{a.filename}</p>
              <p className="text-xs text-muted-foreground tnum">
                {fmtSize(a.size)}
              </p>
            </div>
            <Download className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          </a>
        );
      })}
    </div>
  );
}
