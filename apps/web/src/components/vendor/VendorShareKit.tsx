import { useRef, useState } from "react";
import { Share2, Copy, Check, Download, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Vendor share kit: QR + copyable URL + social-share intents.
// Drives offline → marketplace traffic — vendors print on cards,
// add to email signatures, post on Instagram bio.

export function VendorShareKit({
  slug,
  businessName,
}: {
  slug: string | null;
  businessName: string;
}) {
  const [open, setOpen] = useState(false);

  if (!slug) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled
        title="Set a URL slug first"
      >
        <Share2 className="w-3.5 h-3.5 mr-1.5" />
        Share kit
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={() => setOpen(true)}
      >
        <Share2 className="w-3.5 h-3.5 mr-1.5" />
        Share kit
      </Button>
      <ShareKitDialog
        open={open}
        onOpenChange={setOpen}
        slug={slug}
        businessName={businessName}
      />
    </>
  );
}

function ShareKitDialog({
  open,
  onOpenChange,
  slug,
  businessName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  businessName: string;
}) {
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/v/${slug}`
    : `https://vendora.events/v/${slug}`;
  const [copied, setCopied] = useState<"url" | "embed" | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  function copyText(text: string, key: "url" | "embed") {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Copied");
    setTimeout(() => setCopied(null), 1800);
  }

  function downloadQr() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: "image/svg+xml" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${slug}-qr.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }

  const embedSnippet = `<a href="${url}" rel="noreferrer">Book ${businessName} on Vendora</a>`;
  const shareTitle = `${businessName} on Vendora`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-editorial text-3xl inline-flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            Share kit
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Drop this on a business card, in your Instagram bio, or in
            an email signature — the QR scans straight to your Vendora
            profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div
            ref={qrRef}
            className="flex items-center justify-center bg-card border border-border rounded-sm p-6"
          >
            <QRCodeSVG
              value={url}
              size={180}
              level="M"
              includeMargin={false}
            />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Profile link
            </p>
            <div className="flex gap-2 min-w-0">
              <code className="flex-1 min-w-0 text-xs bg-secondary rounded-sm px-2.5 py-2 truncate font-mono">
                {url}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => copyText(url, "url")}
              >
                {copied === "url" ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Embed for your site
            </p>
            <div className="flex gap-2 min-w-0">
              <code className="flex-1 min-w-0 text-xs bg-secondary rounded-sm px-2.5 py-2 truncate font-mono">
                {embedSnippet}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => copyText(embedSnippet, "embed")}
              >
                {copied === "embed" ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={downloadQr}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download QR
            </Button>
            <a
              href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareTitle)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-xs font-medium border border-border rounded-full px-3 py-1.5 hover:border-foreground/30 transition-colors"
            >
              Share on X
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-xs font-medium border border-border rounded-full px-3 py-1.5 hover:border-foreground/30 transition-colors"
            >
              Share on Facebook
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(url)}`}
              className="inline-flex items-center text-xs font-medium border border-border rounded-full px-3 py-1.5 hover:border-foreground/30 transition-colors"
            >
              Email
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
