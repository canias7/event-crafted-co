// The top of an invitation: "You're invited", the title in the host's
// lettering, the decoration, an optional frame and the welcome message.
// Used by the guest page and, smaller, by the live preview in the host's
// Invitation window, so both always match.

import { Calendar as CalendarIcon } from "lucide-react";
import { InviteOrnament } from "@/components/invite/InviteOrnament";
import { bodyStyle, messageStyle, titleStyle, type InviteDesign } from "@/lib/inviteDesign";

export function InviteHeader({
  design,
  title,
  invitedLabel,
  coverUrl,
  photo,
  message,
  compact = false,
}: {
  design: InviteDesign;
  title: string;
  invitedLabel: string;
  coverUrl: string | null;
  /** Photo layout: the cover fills the top with the title on it. */
  photo: boolean;
  message: string | null;
  compact?: boolean;
}) {
  const titleRem = compact ? 1.75 : 2.6;
  const body = bodyStyle(design);
  const msg = message?.trim() ? (
    <p
      className={`italic leading-relaxed text-center whitespace-pre-wrap ${compact ? "mt-4 text-sm" : "mt-8 text-lg"}`}
      style={messageStyle(design)}
    >
      {message}
    </p>
  ) : null;

  if (photo && coverUrl) {
    return (
      <>
        <div className={`relative w-full overflow-hidden ${compact ? "h-48 rounded-xl" : "h-[62vh] min-h-[360px]"}`}>
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(10,11,14,0.15) 0%, rgba(10,11,14,0.25) 45%, rgba(10,11,14,0.82) 100%)" }}
          />
          <div className={`absolute inset-x-0 bottom-0 px-5 text-center text-white ${compact ? "pb-4" : "pb-10"}`}>
            <span className="text-[11px] uppercase tracking-[0.25em] font-bold" style={{ fontFamily: body.fontFamily }}>
              {invitedLabel}
            </span>
            <h1 className="mt-2 break-words" style={titleStyle(design, compact ? 1.6 : titleRem * 1.1, !compact)}>
              {title}
            </h1>
            <InviteOrnament kind={design.ornament} className={`text-white/90 ${compact ? "mt-2" : "mt-4"}`} />
          </div>
        </div>
        {msg ? <div className={compact ? "px-2" : "max-w-xl mx-auto px-5"}>{msg}</div> : null}
      </>
    );
  }

  const inner = (
    <>
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          className={`w-full aspect-[3/2] object-cover ${compact ? "mb-4 rounded-lg max-h-28" : "mb-8 rounded-2xl"}`}
        />
      ) : null}
      <span
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.25em] font-bold text-accent"
        style={{ fontFamily: body.fontFamily }}
      >
        <CalendarIcon className="w-3.5 h-3.5" />
        {invitedLabel}
      </span>
      <h1 className="mt-2 break-words" style={titleStyle(design, titleRem, !compact)}>
        {title}
      </h1>
      <InviteOrnament kind={design.ornament} className={`text-gold ${compact ? "mt-3" : "mt-5"}`} />
      {msg}
    </>
  );

  return (
    <div className="text-center">
      {design.frame ? (
        // Double hairline frame in the accent colour.
        <div className={`border border-gold/70 ${compact ? "p-1 rounded-xl" : "p-1.5 rounded-2xl"}`}>
          <div className={`border border-gold/40 ${compact ? "px-4 py-5 rounded-lg" : "px-6 py-10 md:px-10 rounded-xl"}`}>{inner}</div>
        </div>
      ) : (
        inner
      )}
    </div>
  );
}
