// Shared email-sender helpers for VendoraPay edge functions.
//
// senderFrom() builds the From header for buyer-facing email so
// every send respects:
//   - the vendor's verified domain (if hooked up via
//     vendorapay-email-domain → status='verified'), so emails come
//     from noreply@<their-domain> with the vendor's brand
//   - the platform fallback ("<Business Name> via VendoraPay
//     <invoices@eventvendora.com>") when no verified domain is set
//
// Quoting + encoding follows RFC 5322 / 2047:
//   - control characters (C0, DEL, BIDI overrides + isolates) are
//     stripped to block header-injection / display spoofing
//   - non-ASCII display names are MIME encoded-word base64 (so
//     "Björk's Studio" doesn't break delivery on strict relays)
//   - ASCII names with specials are quoted-string-escaped
//
// Sharing this across vendorapay-notify (buyer receipts) and
// vendorapay-invoice-send (the initial invoice email) keeps the
// vendor's branding identical on both touchpoints — previously
// invoice-send hardcoded the platform From while notify used the
// verified domain, leading to brand confusion.

export function senderFrom(
  businessName: string,
  verifiedDomain: string | null,
  platformMailbox = "invoices@eventvendora.com",
): string {
  const stripped = businessName
    .replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();
  const baseDisplay = stripped.length ? stripped : "Vendor";

  // Bake the "via VendoraPay" disclosure INTO the display string
  // before quoting so it survives. Concatenating outside a quoted
  // string would have mail clients render only the quoted portion.
  const fullDisplay = verifiedDomain
    ? baseDisplay
    : `${baseDisplay} via VendoraPay`;

  const isAscii = /^[\x20-\x7e]*$/.test(fullDisplay);
  let displayEncoded: string;
  if (!isAscii) {
    const utf8 = new TextEncoder().encode(fullDisplay);
    let binary = "";
    for (let i = 0; i < utf8.length; i++) binary += String.fromCharCode(utf8[i]);
    displayEncoded = `=?utf-8?B?${btoa(binary)}?=`;
  } else {
    const needsQuoting = /[,;:()<>@\[\]\\."]/.test(fullDisplay);
    if (needsQuoting) {
      const escaped = fullDisplay
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
      displayEncoded = `"${escaped}"`;
    } else {
      displayEncoded = fullDisplay;
    }
  }

  const mailbox = verifiedDomain
    ? `noreply@${verifiedDomain}`
    : platformMailbox;
  return `${displayEncoded} <${mailbox}>`;
}
