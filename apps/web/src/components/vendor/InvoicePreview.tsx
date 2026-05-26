// Visual preview of an invoice template. Each `style` maps to a
// distinct professional document treatment so vendors see exactly
// what the downloaded PDF will look like.
//
// All five styles share a quiet, restrained aesthetic — distinct
// typography and layout choices rather than loud colors. The job
// is to look like real business stationery, not a gimmick.

import type { InvoiceTemplate } from "@/data/vendorapayTemplates";

const TEXT = "#1a1410";
const MUTED = "#6b6259";
const RULE = "#e8e3dd";
const ACCENT_WARM = "#1a1410";
const ACCENT_COOL = "#1e2840";

function money(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

interface Computed {
  subtotal: number;
  tax: number;
  total: number;
}

function compute(t: InvoiceTemplate): Computed {
  const subtotal = t.lineItems.reduce((s, it) => s + it.qty * it.price, 0);
  const tax = (subtotal * t.taxPct) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

export function InvoicePreview({ template }: { template: InvoiceTemplate }) {
  switch (template.style) {
    case "editorial":
      return <Classic tpl={template} />;
    case "bold":
      return <Letterhead tpl={template} />;
    case "minimal":
      return <Minimal tpl={template} />;
    case "colorblock":
      return <Sidebar tpl={template} />;
    case "modern":
      return <Modern tpl={template} />;
  }
}

// ----- 1. Classic — serif, thin accent rule, conservative ------------

function Classic({ tpl }: { tpl: InvoiceTemplate }) {
  const c = compute(tpl);
  return (
    <Sheet>
      <header className="flex items-start justify-between gap-6 mb-2">
        <div>
          <h2
            style={{ fontFamily: "ui-serif, Georgia, 'Times New Roman', serif" }}
            className="text-2xl font-medium tracking-tight"
          >
            [Your Business Name]
          </h2>
          <p className="text-[11px] mt-1.5" style={{ color: MUTED, letterSpacing: "0.04em" }}>
            {tpl.category}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p
            className="text-[10px] font-semibold"
            style={{ color: MUTED, letterSpacing: "0.22em" }}
          >
            INVOICE
          </p>
          <p
            style={{ fontFamily: "ui-serif, Georgia, serif" }}
            className="text-2xl italic mt-1 tabular-nums"
          >
            VND-0001
          </p>
        </div>
      </header>

      <div className="mt-6" style={{ borderTop: `1px solid ${TEXT}`, paddingTop: 24 }}>
        <MetaRow />
      </div>

      <ItemsTable
        tpl={tpl}
        head={{
          color: MUTED,
          borderBottom: `1px solid ${TEXT}`,
        }}
        amountSerif
      />
      <TotalsBlock
        tpl={tpl}
        c={c}
        totalEmphasis="serif"
      />
      <NotesBlock tpl={tpl} />
    </Sheet>
  );
}

// ----- 2. Letterhead — bold typography, double-rule signature --------

function Letterhead({ tpl }: { tpl: InvoiceTemplate }) {
  const c = compute(tpl);
  return (
    <Sheet>
      <header className="text-center">
        <h2 className="text-3xl font-bold tracking-tight" style={{ color: TEXT }}>
          [Your Business Name]
        </h2>
        <p
          className="text-[10px] font-semibold mt-2"
          style={{ color: MUTED, letterSpacing: "0.28em" }}
        >
          {tpl.category.toUpperCase()}
        </p>
        <div className="mt-5 flex flex-col items-center gap-1">
          <div style={{ height: 2, width: "100%", background: TEXT }} />
          <div style={{ height: 1, width: "100%", background: TEXT, opacity: 0.4 }} />
        </div>
      </header>

      <div className="flex items-end justify-between mt-6">
        <div>
          <p className="text-[10px] font-semibold" style={{ color: MUTED, letterSpacing: "0.18em" }}>
            INVOICE
          </p>
          <p className="text-xl font-bold mt-1 tabular-nums">VND-0001</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold" style={{ color: MUTED, letterSpacing: "0.18em" }}>
            AMOUNT DUE
          </p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{money(c.total)}</p>
        </div>
      </div>

      <div className="mt-6">
        <MetaRow />
      </div>

      <ItemsTable
        tpl={tpl}
        head={{
          color: TEXT,
          borderBottom: `1.5px solid ${TEXT}`,
          bold: true,
        }}
      />
      <TotalsBlock tpl={tpl} c={c} totalEmphasis="bold" />
      <NotesBlock tpl={tpl} />
    </Sheet>
  );
}

// ----- 3. Minimal — hairline rules, no chrome ------------------------

function Minimal({ tpl }: { tpl: InvoiceTemplate }) {
  const c = compute(tpl);
  return (
    <Sheet>
      <div
        className="flex items-center justify-between text-[10px] font-semibold"
        style={{ color: MUTED, letterSpacing: "0.24em" }}
      >
        <span>INVOICE · VND-0001</span>
        <span>{tpl.category.toUpperCase()}</span>
      </div>
      <hr className="my-5" style={{ border: 0, borderTop: `1px solid ${RULE}` }} />

      <h2 className="text-2xl font-semibold tracking-tight">[Your Business Name]</h2>

      <div className="mt-8">
        <MetaRow allCaps />
      </div>

      <ItemsTable
        tpl={tpl}
        head={{
          color: MUTED,
          borderBottom: `1px solid ${RULE}`,
        }}
      />
      <TotalsBlock tpl={tpl} c={c} totalEmphasis="plain" />
      <NotesBlock tpl={tpl} />
    </Sheet>
  );
}

// ----- 4. Sidebar — neutral two-column ------------------------------

function Sidebar({ tpl }: { tpl: InvoiceTemplate }) {
  const c = compute(tpl);
  return (
    <Sheet padded={false}>
      <div
        className="grid grid-cols-[200px_1fr] gap-0 rounded-2xl overflow-hidden bg-white"
        style={{ border: `0.5px solid ${RULE}` }}
      >
        <aside style={{ background: "#f6f2ed" }} className="p-7">
          <p
            className="text-[10px] font-semibold"
            style={{ color: MUTED, letterSpacing: "0.22em" }}
          >
            INVOICE
          </p>
          <p
            style={{ fontFamily: "ui-serif, Georgia, serif" }}
            className="text-xl italic mt-1 tabular-nums"
          >
            VND-0001
          </p>

          <SideMeta label="Bill to" value="[Client Name]" sub="[client@email.com]" />
          <SideMeta label="Issued" value="[Today]" />
          <SideMeta label="Due" value="[Due date]" />
          <SideMeta label="Category" value={tpl.category} />
        </aside>
        <div className="p-7">
          <h2 className="text-xl font-bold tracking-tight" style={{ color: TEXT }}>
            [Your Business Name]
          </h2>
          <div className="mt-6">
            <ItemsTable
              tpl={tpl}
              head={{
                color: MUTED,
                borderBottom: `1px solid ${RULE}`,
              }}
            />
            <TotalsBlock tpl={tpl} c={c} totalEmphasis="bold" />
            <NotesBlock tpl={tpl} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// ----- 5. Modern — sans-serif, single thin accent line ---------------

function Modern({ tpl }: { tpl: InvoiceTemplate }) {
  const c = compute(tpl);
  return (
    <Sheet>
      <header className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: ACCENT_COOL }}>
            [Your Business Name]
          </h2>
          <p
            className="text-[11px] mt-1.5 font-semibold"
            style={{ color: MUTED, letterSpacing: "0.06em" }}
          >
            {tpl.category}
          </p>
          <div
            className="mt-3"
            style={{ width: 40, height: 2, background: ACCENT_COOL }}
          />
        </div>
        <div className="text-right shrink-0">
          <p
            className="text-[10px] font-semibold"
            style={{ color: ACCENT_COOL, letterSpacing: "0.22em" }}
          >
            INVOICE
          </p>
          <p className="text-lg font-bold mt-1 tabular-nums">VND-0001</p>
        </div>
      </header>

      <div className="mt-7">
        <MetaRow />
      </div>

      <ItemsTable
        tpl={tpl}
        head={{
          color: MUTED,
          borderBottom: `1px solid ${RULE}`,
        }}
      />
      <TotalsBlock
        tpl={tpl}
        c={c}
        totalEmphasis="accent"
        accent={ACCENT_COOL}
      />
      <NotesBlock tpl={tpl} />
    </Sheet>
  );
}

// ----- Shared building blocks ----------------------------------------

function Sheet({
  children,
  padded = true,
}: {
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl ${padded ? "p-8 sm:p-10" : "p-0"}`}
      style={{
        border: `0.5px solid ${RULE}`,
        boxShadow: "0 16px 40px -28px rgba(26,20,16,0.30)",
      }}
    >
      {children}
    </div>
  );
}

function MetaRow({ allCaps = false }: { allCaps?: boolean } = {}) {
  const labelCls = `text-[10px] font-semibold ${
    allCaps ? "tracking-[0.22em]" : "tracking-wider"
  }`;
  return (
    <div className="grid grid-cols-3 gap-6 text-sm">
      <div>
        <p className={labelCls} style={{ color: MUTED, textTransform: "uppercase" }}>
          Bill to
        </p>
        <p className="mt-1.5 font-medium" style={{ color: TEXT }}>
          [Client Name]
        </p>
        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
          [client@email.com]
        </p>
      </div>
      <div>
        <p className={labelCls} style={{ color: MUTED, textTransform: "uppercase" }}>
          Issued
        </p>
        <p className="mt-1.5" style={{ color: TEXT }}>
          [Today]
        </p>
      </div>
      <div>
        <p className={labelCls} style={{ color: MUTED, textTransform: "uppercase" }}>
          Due
        </p>
        <p className="mt-1.5" style={{ color: TEXT }}>
          [Due date]
        </p>
      </div>
    </div>
  );
}

interface HeadStyle {
  color: string;
  borderBottom: string;
  bold?: boolean;
}

function ItemsTable({
  tpl,
  head,
  amountSerif = false,
}: {
  tpl: InvoiceTemplate;
  head: HeadStyle;
  amountSerif?: boolean;
}) {
  return (
    <table className="w-full text-[13px] mt-7">
      <thead>
        <tr style={{ borderBottom: head.borderBottom }}>
          {(["Item", "Qty", "Unit price", "Amount"] as const).map((h, i) => (
            <th
              key={h}
              className="py-3 px-2"
              style={{
                color: head.color,
                textAlign: i === 0 ? "left" : "right",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontSize: 10,
                fontWeight: head.bold ? 700 : 600,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tpl.lineItems.map((it, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${RULE}` }}>
            <td className="py-3 px-2" style={{ color: TEXT }}>
              {it.name}
            </td>
            <td className="py-3 px-2 text-right tabular-nums" style={{ color: TEXT }}>
              {it.qty}
            </td>
            <td className="py-3 px-2 text-right tabular-nums" style={{ color: TEXT }}>
              {money(it.price)}
            </td>
            <td
              className="py-3 px-2 text-right tabular-nums font-semibold"
              style={{
                color: TEXT,
                fontFamily: amountSerif ? "ui-serif, Georgia, serif" : undefined,
              }}
            >
              {money(it.qty * it.price)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type TotalEmphasis = "plain" | "bold" | "serif" | "accent";

function TotalsBlock({
  tpl,
  c,
  totalEmphasis,
  accent = ACCENT_WARM,
}: {
  tpl: InvoiceTemplate;
  c: Computed;
  totalEmphasis: TotalEmphasis;
  accent?: string;
}) {
  return (
    <div className="mt-5 flex justify-end">
      <div className="w-full max-w-[260px] text-sm space-y-1.5">
        <div className="flex justify-between" style={{ color: MUTED }}>
          <span>Subtotal</span>
          <span className="tabular-nums">{money(c.subtotal)}</span>
        </div>
        {c.tax > 0 && (
          <div className="flex justify-between" style={{ color: MUTED }}>
            <span>Tax ({tpl.taxPct}%)</span>
            <span className="tabular-nums">{money(c.tax)}</span>
          </div>
        )}
        {(() => {
          if (totalEmphasis === "serif") {
            return (
              <div
                className="flex items-center justify-between pt-3 mt-2"
                style={{ borderTop: `1px solid ${TEXT}` }}
              >
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: MUTED, letterSpacing: "0.18em" }}
                >
                  TOTAL DUE
                </span>
                <span
                  className="tabular-nums"
                  style={{ fontFamily: "ui-serif, Georgia, serif", fontSize: 20, fontWeight: 500 }}
                >
                  {money(c.total)}
                </span>
              </div>
            );
          }
          if (totalEmphasis === "bold") {
            return (
              <div
                className="flex items-center justify-between pt-3 mt-2"
                style={{ borderTop: `1.5px solid ${TEXT}` }}
              >
                <span
                  className="text-[10px] font-bold"
                  style={{ letterSpacing: "0.18em" }}
                >
                  TOTAL DUE
                </span>
                <span className="font-bold tabular-nums text-lg">{money(c.total)}</span>
              </div>
            );
          }
          if (totalEmphasis === "accent") {
            return (
              <div
                className="flex items-center justify-between pt-3 mt-2"
                style={{ borderTop: `2px solid ${accent}` }}
              >
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: accent, letterSpacing: "0.18em" }}
                >
                  TOTAL DUE
                </span>
                <span className="font-bold tabular-nums text-lg" style={{ color: accent }}>
                  {money(c.total)}
                </span>
              </div>
            );
          }
          // plain
          return (
            <div
              className="flex items-center justify-between pt-3 mt-2"
              style={{ borderTop: `1px solid ${RULE}` }}
            >
              <span
                className="text-[10px] font-semibold"
                style={{ color: MUTED, letterSpacing: "0.22em" }}
              >
                TOTAL DUE
              </span>
              <span className="font-semibold tabular-nums">{money(c.total)}</span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function NotesBlock({ tpl }: { tpl: InvoiceTemplate }) {
  if (!tpl.notes) return null;
  return (
    <div className="mt-7 pt-5" style={{ borderTop: `1px solid ${RULE}` }}>
      <p
        className="text-[10px] font-semibold"
        style={{ color: MUTED, letterSpacing: "0.22em" }}
      >
        NOTES
      </p>
      <p className="text-[12px] mt-2 leading-relaxed" style={{ color: TEXT }}>
        {tpl.notes}
      </p>
    </div>
  );
}

function SideMeta({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="mt-5">
      <p
        className="text-[9px] font-semibold"
        style={{ color: MUTED, letterSpacing: "0.22em" }}
      >
        {label.toUpperCase()}
      </p>
      <p className="text-[12px] mt-1 font-medium" style={{ color: TEXT }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px]" style={{ color: MUTED }}>
          {sub}
        </p>
      )}
    </div>
  );
}
