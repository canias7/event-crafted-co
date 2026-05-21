// Bubble-hover action menu shared by both sides of the inquiry chat.
// Renders an emoji-reaction picker as a popover, and (when the
// message belongs to the current user) a small dropdown with
// destructive actions like Delete. Positions itself outside the
// bubble so the trigger doesn't take width.

import { useState } from "react";
import {
  Smile,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Reply,
  Trash2,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "🙏", "😂", "😍"];

interface Props {
  isMine: boolean;
  onReact: (emoji: string) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
}

export function MessageActionMenu({
  isMine,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onRegenerate,
}: Props) {
  const [reactOpen, setReactOpen] = useState(false);
  return (
    <div
      // Render in the hover-only group's revealed state via opacity-0 +
      // group-hover:opacity-100 in the caller. Pointer-events-auto so
      // the buttons accept clicks even when the surrounding hover
      // state is mid-transition.
      className="flex items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <Popover open={reactOpen} onOpenChange={setReactOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="React"
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-background/95 backdrop-blur border border-border shadow-sm hover:bg-secondary"
          >
            <Smile className="w-3.5 h-3.5 text-foreground/70" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align={isMine ? "end" : "start"}
          className="w-auto p-1.5 flex gap-0.5"
        >
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`React with ${e}`}
              onClick={() => {
                onReact(e);
                setReactOpen(false);
              }}
              className="text-lg rounded-md px-1.5 py-1 hover:bg-secondary transition-colors"
            >
              {e}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {onReply || onRegenerate || (isMine && (onEdit || onDelete)) ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More"
              className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-background/95 backdrop-blur border border-border shadow-sm hover:bg-secondary"
            >
              <MoreHorizontal className="w-3.5 h-3.5 text-foreground/70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isMine ? "end" : "start"}>
            {onReply ? (
              <DropdownMenuItem onClick={onReply}>
                <Reply className="w-4 h-4 mr-2" />
                Reply
              </DropdownMenuItem>
            ) : null}
            {isMine && onEdit ? (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
            ) : null}
            {onRegenerate ? (
              <DropdownMenuItem onClick={onRegenerate}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate with HILUX
              </DropdownMenuItem>
            ) : null}
            {isMine && onDelete ? (
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
