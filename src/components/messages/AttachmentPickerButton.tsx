import { useRef } from "react";
import { Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ACCEPTED_MIME,
  MAX_FILES,
  MAX_BYTES,
  validateAttachment,
} from "@/lib/messageAttachments";

// Paperclip + queued-files strip for any message composer.
//
// Doesn't upload anything itself — it's a controlled list. The
// parent owns `pending` and uploads when the message is sent. That
// way attachments don't get orphaned in storage if the user
// abandons the message.

export function AttachmentPickerButton({
  pending,
  onChange,
  disabled,
}: {
  pending: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function pick() {
    inputRef.current?.click();
  }

  function add(filesList: FileList | null) {
    if (!filesList) return;
    const files = Array.from(filesList);
    const next = [...pending];
    for (const file of files) {
      if (next.length >= MAX_FILES) {
        toast.warning(`Max ${MAX_FILES} files per message`);
        break;
      }
      const err = validateAttachment(file);
      if (err) {
        toast.error(err);
        continue;
      }
      next.push(file);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(i: number) {
    onChange(pending.filter((_, idx) => idx !== i));
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={pick}
        disabled={disabled || pending.length >= MAX_FILES}
        aria-label="Attach file"
        className="h-9 w-9"
      >
        <Paperclip className="w-4 h-4" />
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_MIME.join(",")}
        onChange={(e) => add(e.target.files)}
        className="sr-only"
      />
      {pending.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 w-full mt-1.5">
          {pending.map((f, i) => {
            const isImage = f.type.startsWith("image/");
            const Icon = isImage ? ImageIcon : FileText;
            return (
              <li
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1.5 text-xs bg-secondary border border-border rounded-full pl-2 pr-1 py-1 max-w-[200px]"
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="p-0.5 rounded-full hover:bg-foreground/10"
                  aria-label="Remove"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// Re-export for use in size hints elsewhere.
export { MAX_FILES, MAX_BYTES };
