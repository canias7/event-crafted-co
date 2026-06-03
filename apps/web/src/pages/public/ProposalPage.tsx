// Public proposal page. A client lands here from a "View proposal" link the
// vendor sent in chat. They read the proposal (the vendor's saved template,
// merge fields filled) and accept it. Backed by the SECURITY DEFINER RPCs
// get_proposal_for_viewing / accept_proposal (token-gated, no auth needed).
//
// Rendered in the Ink / Mono palette: white card, near-black ink, a single
// neutral accent, and a dark "Ready to move forward?" accept block — matching
// the original proposal anatomy (Prepared for · intro · What's included ·
// Investment · terms · CTA), just as a shareable page instead of a chat blob.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Proposal {
  id: string;
  title: string;
  body: string;
  status: string;
  recipient_name: string | null;
  accepted_name: string | null;
  accepted_at: string | null;
  vendor_business_name: string | null;
}

// Ink / Mono palette.
const C = {
  bg: "#ececea",
  card: "#ffffff",
  ink: "#1a1a1a",
  sub: "#6b665e",
  faint: "#8a857c",
  soft: "#f5f5f4",
  border: "#e2e2df",
  hair: "rgba(0,0,0,0.08)",
  foot: "#1a1a1a",
  footInk: "#f0efed",
  footSub: "#a8a6a1",
};

const KNOWN_HEADINGS = new Set([
  "what's included",
  "whats included",
  "what you get",
  "investment",
  "scope",
  "deliverables",
  "what's next",
  "next steps",
  "timeline",
  "add-ons",
  "optional add-ons",
  "terms",
]);

type Block =
  | { type: "prep"; text: string }
  | { type: "heading"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "investment"; label: string; amount: string }
  | { type: "para"; text: string };

// Tolerant parser for the proposal template format. Recognises the "Prepared
// for" line, known section headings, "- " bullets, and the Investment line
// ("<Package> — <Amount>"). Anything else degrades to a paragraph, so a vendor
// who edits freely still gets a clean render.
function parseProposal(body: string): Block[] {
  const lines = body.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }
    if (blocks.length === 0 && /^prepared for/i.test(line)) {
      blocks.push({ type: "prep", text: line.replace(/^prepared for\s*/i, "") });
      i++;
      continue;
    }
    if (/^[-•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-•]\s+/, ""));
        i++;
      }
      blocks.push({ type: "bullets", items });
      continue;
    }
    const low = line.toLowerCase();
    if (KNOWN_HEADINGS.has(low)) {
      blocks.push({ type: "heading", text: line });
      i++;
      if (low === "investment") {
        while (i < lines.length && !lines[i].trim()) i++;
        if (i < lines.length) {
          const inv = lines[i].trim();
          const parts = inv.split(/\s+[—–-]\s+/);
          if (parts.length >= 2) {
            blocks.push({
              type: "investment",
              label: parts.slice(0, -1).join(" — "),
              amount: parts[parts.length - 1],
            });
          } else {
            blocks.push({ type: "investment", label: inv, amount: "" });
          }
          i++;
        }
      }
      continue;
    }
    // Paragraph: gather consecutive lines until a blank / bullet / heading.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l || /^[-•]\s+/.test(l) || KNOWN_HEADINGS.has(l.toLowerCase())) break;
      para.push(l);
      i++;
    }
    blocks.push({ type: "para", text: para.join(" ") });
  }
  return blocks;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProposalPage() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc(
      "get_proposal_for_viewing",
      { p_token: token },
    );
    const row = Array.isArray(data) ? (data[0] as Proposal | undefined) : null;
    if (error || !row) {
      setProposal(null);
    } else {
      setProposal(row);
      setName((prev) => prev || row.recipient_name || "");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept() {
    if (!token || !agreed || !name.trim() || accepting) return;
    setAccepting(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("accept_proposal", {
      p_token: token,
      p_name: name.trim(),
    });
    setAccepting(false);
    if (error) {
      toast.error("Couldn't record your acceptance. Please try again.");
      return;
    }
    if (data === "accepted") {
      toast.success("Accepted — thank you!");
      setProposal((p) =>
        p
          ? {
              ...p,
              status: "accepted",
              accepted_name: name.trim(),
              accepted_at: new Date().toISOString(),
            }
          : p,
      );
    } else {
      void load();
    }
  }

  if (loading) {
    return (
      <div
        style={{ background: C.bg, minHeight: "100vh" }}
        className="flex items-center justify-center"
      >
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.faint }} />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div
        style={{ background: C.bg, minHeight: "100vh" }}
        className="flex items-center justify-center px-6 text-center"
      >
        <div>
          <h1 style={{ fontFamily: "Georgia, serif", color: C.ink }} className="text-3xl mb-2">
            Proposal not found
          </h1>
          <p style={{ color: C.sub }} className="text-sm">
            This link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  const blocks = parseProposal(proposal.body);
  const isAccepted = proposal.status === "accepted";
  const isOpen = proposal.status === "sent";
  const label: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: C.ink,
    fontWeight: 700,
    margin: "28px 0 13px",
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "38px 16px" }}>
      <div style={{ maxWidth: 660, margin: "0 auto" }}>
        <div
          style={{ color: C.ink, fontWeight: 600 }}
          className="flex items-center gap-2 text-[13px] mb-3.5"
        >
          <FileText className="w-4 h-4" />
          {proposal.vendor_business_name
            ? `${proposal.vendor_business_name} · Proposal`
            : "Proposal"}
        </div>

        <div
          style={{
            background: C.card,
            border: "0.5px solid rgba(0,0,0,0.08)",
            borderRadius: 20,
            boxShadow: "0 18px 50px -26px rgba(0,0,0,0.28)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "38px 42px" }}>
            <h1
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: 33,
                fontWeight: 400,
                letterSpacing: "-0.4px",
                lineHeight: 1.1,
                color: C.ink,
              }}
            >
              {proposal.title}
            </h1>

            {blocks.map((b, idx) => {
              if (b.type === "prep") {
                return (
                  <div
                    key={idx}
                    style={{
                      fontSize: 13.5,
                      color: C.faint,
                      marginTop: 10,
                      borderBottom: `1px solid ${C.hair}`,
                      paddingBottom: 20,
                    }}
                  >
                    {b.text}
                  </div>
                );
              }
              if (b.type === "heading") {
                return (
                  <div key={idx} style={label}>
                    {b.text}
                  </div>
                );
              }
              if (b.type === "bullets") {
                return (
                  <div key={idx}>
                    {b.items.map((it, j) => (
                      <div
                        key={j}
                        style={{
                          fontSize: 15,
                          color: C.ink,
                          opacity: 0.9,
                          padding: "7px 0 7px 22px",
                          position: "relative",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 14,
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: C.ink,
                          }}
                        />
                        {it}
                      </div>
                    ))}
                  </div>
                );
              }
              if (b.type === "investment") {
                return (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 16,
                      background: C.soft,
                      border: `1px solid ${C.border}`,
                      borderRadius: 14,
                      padding: "18px 22px",
                      marginTop: 4,
                    }}
                  >
                    <div style={{ fontSize: 15, color: C.ink }}>{b.label}</div>
                    {b.amount ? (
                      <div
                        style={{
                          fontFamily: "Georgia, serif",
                          fontSize: 30,
                          color: C.ink,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.amount}
                      </div>
                    ) : null}
                  </div>
                );
              }
              // paragraph
              return (
                <p
                  key={idx}
                  style={{
                    fontSize: 15.5,
                    color: C.ink,
                    opacity: 0.85,
                    lineHeight: 1.7,
                    marginTop: 18,
                  }}
                >
                  {b.text}
                </p>
              );
            })}
          </div>

          {/* Accept block */}
          {isAccepted ? (
            <div
              style={{ background: C.soft, borderTop: `1px solid ${C.border}`, padding: "26px 42px" }}
            >
              <div className="flex items-center gap-3">
                <div
                  style={{ background: C.ink }}
                  className="w-9 h-9 rounded-full text-white inline-flex items-center justify-center shrink-0"
                >
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <p style={{ color: C.ink }} className="font-semibold">
                    Accepted by {proposal.accepted_name}
                  </p>
                  <p style={{ color: C.sub }} className="text-sm">
                    {fmtDate(proposal.accepted_at)}
                  </p>
                </div>
              </div>
            </div>
          ) : isOpen ? (
            <div style={{ background: C.foot, color: C.footInk, padding: "30px 42px 38px" }}>
              <h3
                style={{ fontFamily: "Georgia, serif", fontSize: 23, fontWeight: 400 }}
                className="text-center mb-1.5"
              >
                Ready to move forward?
              </h3>
              <p style={{ color: C.footSub }} className="text-center text-[13px] mb-5">
                Accept and we'll send the agreement and invoice.
              </p>
              <div style={{ maxWidth: 420, margin: "0 auto" }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Type your full name to accept"
                  style={{
                    width: "100%",
                    background: "#2a2a2a",
                    border: "1px solid #3a3a3a",
                    borderRadius: 10,
                    color: C.footInk,
                    fontSize: 14,
                    padding: "12px 14px",
                  }}
                />
                <label
                  style={{ color: C.footSub }}
                  className="flex items-start gap-2 text-[13px] mt-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I've reviewed this proposal and I'm ready to proceed.</span>
                </label>
                <button
                  type="button"
                  onClick={() => void accept()}
                  disabled={!agreed || !name.trim() || accepting}
                  style={{
                    background: agreed && name.trim() ? "#ffffff" : "#5a5a5a",
                    color: agreed && name.trim() ? C.ink : "#bdbdbd",
                  }}
                  className="w-full mt-4 inline-flex items-center justify-center gap-1.5 font-bold text-[15px] py-3.5 rounded-full transition-colors disabled:cursor-not-allowed"
                >
                  {accepting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Accept proposal
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{ background: C.soft, borderTop: `1px solid ${C.border}`, padding: "24px 42px" }}
            >
              <p style={{ color: C.sub }} className="text-sm">
                This proposal is {proposal.status} and can no longer be accepted.
              </p>
            </div>
          )}
        </div>

        <p style={{ color: "#a39e95" }} className="text-center text-[11px] mt-4">
          Powered by Vendora
        </p>
      </div>
    </div>
  );
}
