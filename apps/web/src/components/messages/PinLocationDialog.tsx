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

  useEffect(() => {
    if (open) setAddress(defaultAddress ?? "");
  }, [open, defaultAddress]);

  function send() {
    const trimmed = address.trim();
    if (!trimmed) return;
    const maps = `https://www.google.com/maps?q=${encodeURIComponent(trimmed)}`;
    onSend(`📍 ${trimmed}\n${maps}`);
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
            disabled={!address.trim()}
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
