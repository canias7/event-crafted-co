// Visual preview of an invoice template that mirrors the PDF the
// vendor will download. Each style branches to a distinct layout so
// the preview answers the question "what does this look like?"
// without having to click Save as PDF first.
//
// Kept HTML/Tailwind (not a canvas render of the PDF) so the
// previews stay crisp and responsive inside the modal.

import type { InvoiceTemplate } from "@/data/vendorapayTemplates";

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
      return <Editorial tpl={template} />;
    case "bold":
      return <Bold tpl={template} />;
    case "minimal":
      return <Minimal tpl={template} />;
    case "colorblock":
      return <Colorblock tpl={template} />;
    case "modern":
      return <Modern tpl={template} />;
  }
}

// ----- Editorial -----------------------------------------------------

function Editorial({ tpl }: { tpl: InvoiceTemplate }) {
  const c = compute(tpl);
  return (
    <Sheet>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-editorial text-[22px] leading-tight">
            [Your Business Name]
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            Template preview · {tpl.category}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
            Invoice
          </p>
          <p className="font-editorial italic text-[22px] mt-0.5 tabular-nums">
            VND-0001
          </p>
        </div>
      </div>
      <hr className="my-4" style={{ border: 0, borderTop: "1.5px solid #c4541e" }} />
      <MetaRow />
      <ItemsTable
        tpl={tpl}
        head={{
          bg: "transparent",
          color: "#6b6259",
          borderBottom: "1px solid #f0eeeb",
        }}
        amountSerif
      />
      <TotalsBlock
        tpl={tpl}
        c={c}
        totalStyle={{
          fontFamily: "ui-serif, Georgia, serif",
          fontSize: 18,
        }}
      />
      <NotesBlock tpl={tpl} />
    </Sheet>
  );
}

// ----- Bold ----------------------------------------------------------

function Bold({ tpl }: { tpl: InvoiceTemplate }) {
  const c = compute(tpl);
  return (
    <Sheet padTop={false}>
      {/* Full-bleed dark header */}
      <div className="-mx-6 -mt-6 px-6 py-5 mb-5" style={{ background: "#1a1410", color: "white" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold opacity-75">
              Invoice
            </p>
            <p className="font-bold text-lg mt-1">[Your Business Name]</p>
            <p className="text-[11px] opacity-75 mt-0.5">
              {tpl.category.toUpperCase()} · VND-0001
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider font-semibold opacity-75">
              Amount due
            </p>
            <p className="font-bold text-2xl mt-0.5 tabular-nums">{money(c.total)}</p>
          </div>
        </div>
      </div>
      <MetaRow />
      <ItemsTable
        tpl={tpl}
        head={{
          bg: "#1a1410",
          color: "white",
          borderBottom: "none",
        }}
      />
      <TotalsBlock
        tpl={tpl}
        c={c}
        totalRowStyle={{
          background: "#1a1410",
          color: "white",
          padding: "10px 12px",
          borderRadius: 4,
        }}
        hideTopRule
      />
      <NotesBlock tpl={tpl} />
    </Sheet>
  );
}

// ----- Minimal -------------------------------------------------------

function Minimal({ tpl }: { tpl: InvoiceTemplate }) {
  const c = compute(tpl);
  return (
    <Sheet>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
        <span>Invoice · VND-0001</span>
        <span>{tpl.category}</span>
      </div>
      <hr className="my-3" style={{ border: 0, borderTop: "1px solid #d8d2cb" }} />
      <h2 className="text-xl font-bold tracking-tight">[Your Business Name]</h2>
      <div className="mt-5">
        <MetaRow allCaps />
      </div>
      <ItemsTable
        tpl={tpl}
        head={{
          bg: "transparent",
          color: "#7d776e",
          borderBottom: "1.5px solid #1a1410",
        }}
        bodyAllUpper
      />
      <TotalsBlock tpl={tpl} c={c} />
      <NotesBlock tpl={tpl} />
    </Sheet>
  );
}

// ----- Colorblock ----------------------------------------------------

function Colorblock({ tpl }: { tpl: InvoiceTemplate }) {
  const c = compute(tpl);
  return (
    <Sheet padded={false}>
      <div className="grid grid-cols-[180px_1fr] gap-0 rounded-2xl overflow-hidden bg-white" style={{ border: "0.5px solid rgba(0,0,0,0.06)" }}>
        <aside style={{ background: "#f8f0e8" }} className="p-5">
          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#b45309" }}>
            Invoice
          </p>
          <p className="font-editorial italic text-lg mt-0.5">VND-0001</p>
          <SideMeta label="Bill to" value="[Client Name]" sub="[client@email.com]" />
          <SideMeta label="Issued" value="[Today]" />
          <SideMeta label="Due" value="[Due date]" />
          <SideMeta label="Category" value={tpl.category} />
        </aside>
        <div className="p-5">
          <h2 className="text-lg font-bold tracking-tight">[Your Business Name]</h2>
          <div className="mt-4">
            <ItemsTable
              tpl={tpl}
              head={{
                bg: "transparent",
                color: "#6b6259",
                borderBottom: "1px solid #f0eeeb",
              }}
            />
            <TotalsBlock tpl={tpl} c={c} />
            <NotesBlock tpl={tpl} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}

// ----- Modern --------------------------------------------------------

function Modern({ tpl }: { tpl: InvoiceTemplate }) {
  const c = compute(tpl);
  return (
    <Sheet padTop={false}>
      <div className="-mx-6 -mt-6 h-1.5 mb-5" style={{ background: "rgb(30,80,180)" }} />
      <div className="flex items-start justify-between gap-4 px-0">
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: "rgb(20,24,40)" }}>
            [Your Business Name]
          </h2>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-1">
            {tpl.category}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "rgb(30,80,180)" }}>
            Invoice
          </p>
          <p className="text-base font-bold mt-0.5 tabular-nums">VND-0001</p>
        </div>
      </div>
      <div className="mt-4">
        <MetaRow />
      </div>
      <ItemsTable
        tpl={tpl}
        head={{
          bg: "transparent",
          color: "#6e7482",
          borderBottom: "1px solid #e1e4eb",
        }}
      />
      <TotalsBlock
        tpl={tpl}
        c={c}
        totalRowStyle={{
          background: "rgb(30,80,180)",
          color: "white",
          padding: "10px 12px",
          borderRadius: 4,
        }}
        hideTopRule
      />
      <NotesBlock tpl={tpl} />
    </Sheet>
  );
}

// ----- Shared building blocks ----------------------------------------

function Sheet({
  children,
  padded = true,
  padTop = true,
}: {
  children: React.ReactNode;
  padded?: boolean;
  padTop?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl ${padded ? "p-6" : "p-0"} ${padTop ? "" : ""}`}
      style={{
        border: "0.5px solid rgba(0,0,0,0.06)",
        boxShadow: "0 12px 32px -20px rgba(26,20,16,0.25)",
      }}
    >
      {children}
    </div>
  );
}

function MetaRow({ allCaps = false }: { allCaps?: boolean } = {}) {
  const labelCls = `text-[10px] font-semibold text-muted-foreground ${
    allCaps ? "uppercase tracking-[0.18em]" : "uppercase tracking-wider"
  }`;
  return (
    <div className="grid grid-cols-3 gap-4 text-sm">
      <div>
        <p className={labelCls}>Bill to</p>
        <p className="font-medium mt-1">[Client Name]</p>
        <p className="text-xs text-muted-foreground">[client@email.com]</p>
      </div>
      <div>
        <p className={labelCls}>Issued</p>
        <p className="mt-1">[Today]</p>
      </div>
      <div>
        <p className={labelCls}>Due</p>
        <p className="mt-1">[Due date]</p>
      </div>
    </div>
  );
}

function ItemsTable({
  tpl,
  head,
  amountSerif = false,
  bodyAllUpper = false,
}: {
  tpl: InvoiceTemplate;
  head: { bg: string; color: string; borderBottom: string };
  amountSerif?: boolean;
  bodyAllUpper?: boolean;
}) {
  return (
    <table className="w-full text-[13px] mt-5">
      <thead>
        <tr style={{ borderBottom: head.borderBottom }}>
          {(["Item", "Qty", "Unit price", "Amount"] as const).map((h, i) => (
            <th
              key={h}
              className="py-2 px-2 text-[10px] font-semibold"
              style={{
                background: head.bg,
                color: head.color,
                textAlign: i === 0 ? "left" : "right",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tpl.lineItems.map((it, i) => (
          <tr key={i} className="border-b border-foreground/5">
            <td
              className="py-2.5 px-2"
              style={
                bodyAllUpper
                  ? { textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 12 }
                  : undefined
              }
            >
              {it.name}
            </td>
            <td className="py-2.5 px-2 text-right tabular-nums">{it.qty}</td>
            <td className="py-2.5 px-2 text-right tabular-nums">{money(it.price)}</td>
            <td
              className="py-2.5 px-2 text-right tabular-nums font-semibold"
              style={amountSerif ? { fontFamily: "ui-serif, Georgia, serif" } : undefined}
            >
              {money(it.qty * it.price)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsBlock({
  tpl,
  c,
  totalStyle,
  totalRowStyle,
  hideTopRule = false,
}: {
  tpl: InvoiceTemplate;
  c: Computed;
  totalStyle?: React.CSSProperties;
  totalRowStyle?: React.CSSProperties;
  hideTopRule?: boolean;
}) {
  return (
    <div className="mt-3 flex justify-end">
      <div className="w-[55%] text-[13px] space-y-1">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(c.subtotal)}</span>
        </div>
        {c.tax > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Tax ({tpl.taxPct}%)</span>
            <span className="tabular-nums">{money(c.tax)}</span>
          </div>
        )}
        {totalRowStyle ? (
          <div
            className="flex items-center justify-between font-bold mt-2"
            style={totalRowStyle}
          >
            <span className="text-[10px] uppercase tracking-wider">Total due</span>
            <span className="tabular-nums text-base">{money(c.total)}</span>
          </div>
        ) : (
          <div
            className="flex items-center justify-between pt-2 mt-1"
            style={hideTopRule ? undefined : { borderTop: "1px solid #1a1410" }}
          >
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Total due
            </span>
            <span
              className="tabular-nums font-bold text-base"
              style={totalStyle}
            >
              {money(c.total)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function NotesBlock({ tpl }: { tpl: InvoiceTemplate }) {
  if (!tpl.notes) return null;
  return (
    <div className="mt-5">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        Notes
      </p>
      <p className="text-[12px] mt-1 leading-relaxed text-foreground/80">{tpl.notes}</p>
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
    <div className="mt-4">
      <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="text-[12px] mt-0.5 font-medium">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
