import { useEffect, useRef, useState, type ReactNode } from "react";

const PIN = "9236";
const STORAGE_KEY = "vendora-admin-pin-ok";

export function PinGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    return typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
  });
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!unlocked) inputs.current[0]?.focus();
  }, [unlocked]);

  if (unlocked) return <>{children}</>;

  const submit = (next: string[]) => {
    const code = next.join("");
    if (code.length < 4) return;
    if (code === PIN) {
      localStorage.setItem(STORAGE_KEY, "1");
      setUnlocked(true);
    } else {
      setError("Incorrect PIN.");
      setDigits(["", "", "", ""]);
      inputs.current[0]?.focus();
    }
  };

  const onChange = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, "").slice(-1);
    if (!v && raw !== "") return;
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    setError(null);
    if (v && i < 3) inputs.current[i + 1]?.focus();
    if (i === 3 && v) submit(next);
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bone p-6">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-ink/50">Vendora</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Admin access</h1>
        <p className="mt-2 text-sm text-ink/60">Enter the 4-digit PIN to continue.</p>

        <div className="mt-6 flex justify-between gap-3">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              value={d}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              inputMode="numeric"
              autoComplete="off"
              maxLength={1}
              className="h-14 w-14 rounded-lg border border-ink/15 bg-white text-center font-mono text-2xl text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/40"
            />
          ))}
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : null}

        <p className="mt-6 text-xs text-ink/40">
          Authorized personnel only. Activity is logged.
        </p>
      </div>
    </div>
  );
}
