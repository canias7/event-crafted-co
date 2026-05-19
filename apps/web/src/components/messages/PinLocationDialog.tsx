// Pin location — one-shot dialog for the vendor to share a venue
// address as a chat message. We send a normal text body shaped as:
//
//   📍 <address>
//   https://www.google.com/maps?q=<encoded-address>
//
// The maps URL becomes clickable in the bubble via the existing
// linkifying we already do. No special card render needed.

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAddress?: string | null;
  onSend: (body: string) => void;
}

export function PinLocationDialog({
  open,
  onOpenChange,
  defaultAddress,
  onSend,
}: Props) {
  const [address, setAddress] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setAddress(defaultAddress ?? "");
      setSending(false);
    }
  }, [open, defaultAddress]);

  function send() {
    if (sending) return;
    // Strip any http(s):// URLs the vendor might paste into the
    // address field. The message we emit gets linkified by
    // MessageBody on the recipient side, so an attacker-controlled
    // URL inside the address text would render as a tappable link
    // alongside our own google.com/maps URL — phishing surface. The
    // maps link we synthesize from the cleaned text is the ONLY
    // anchor we want in the bubble.
    const cleaned = address.replace(/\bhttps?:\/\/\S+/gi, "").trim();
    if (!cleaned) return;
    setSending(true);
    const maps = `https://www.google.com/maps?q=${encodeURIComponent(cleaned)}`;
    onSend(`📍 ${cleaned}\n${maps}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-editorial text-2xl inline-flex items-center gap-2">
            <MapPin className="w-5 h-5 text-accent" />
            Pin a location
          </DialogTitle>
          <DialogDescription>
            Drops the venue address into the chat with a tappable map link.
          </DialogDescription>
        </DialogHeader>
        <div className="pt-1">
          <label className="text-xs font-medium text-muted-foreground">
            Address
          </label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. 123 Main St, Brooklyn, NY"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            className="mt-1"
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={send}
            disabled={!address.trim() || sending}
            className="rounded-full"
          >
            <MapPin className="w-4 h-4 mr-1.5" />
            Pin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
