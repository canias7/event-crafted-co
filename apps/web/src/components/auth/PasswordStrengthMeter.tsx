// Small password strength meter. Shows a 4-segment bar that fills
// based on basic heuristics (length + character-class diversity)
// and a one-word label below. Doesn't BLOCK anything — purely
// informational. Server-side rejection (e.g. Supabase's leaked-
// password HIBP check) still gates the actual save if enabled in
// the dashboard.

import { useMemo } from "react";

interface Props {
  password: string;
}

interface Scored {
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

function score(pw: string): Scored {
  if (!pw)
    return { level: 0, label: "", color: "transparent" };

  let s = 0;
  // Length contributes most.
  if (pw.length >= 8) s += 1;
  if (pw.length >= 12) s += 1;
  if (pw.length >= 16) s += 1;
  // Character-class diversity.
  let classes = 0;
  if (/[a-z]/.test(pw)) classes += 1;
  if (/[A-Z]/.test(pw)) classes += 1;
  if (/[0-9]/.test(pw)) classes += 1;
  if (/[^A-Za-z0-9]/.test(pw)) classes += 1;
  if (classes >= 3) s += 1;
  if (classes === 4) s += 1;
  // Penalize repeats / sequences.
  if (/(.)\1\1/.test(pw)) s -= 1;
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(pw))
    s -= 1;

  const level = Math.max(0, Math.min(4, s)) as Scored["level"];
  const labels = ["Too short", "Weak", "Fair", "Strong", "Very strong"];
  const colors = [
    "#dc2626", // red — too short
    "#dc2626", // red — weak
    "#f59e0b", // amber — fair
    "#16a34a", // green — strong
    "#16a34a", // green — very strong
  ];
  return { level, label: labels[level], color: colors[level] };
}

export function PasswordStrengthMeter({ password }: Props) {
  const { level, label, color } = useMemo(() => score(password), [password]);

  if (!password) return null;

  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="flex-1 h-1 rounded-full transition-colors"
            style={{
              background: i < level ? color : "rgba(0,0,0,0.08)",
            }}
            aria-hidden
          />
        ))}
      </div>
      <p
        className="mt-1"
        style={{
          fontSize: "11px",
          color,
          fontWeight: 500,
        }}
      >
        {label}
      </p>
    </div>
  );
}
