// Backdrop for every sign-in and sign-up page (owner's call, Oct 2026):
// the plain ink page with several thin rings turning at different speeds
// and directions (two carry a small gold dot so the motion reads). No
// ombre, glows or grid floor (owner's call). The vendor and host apps
// draw the same thing (components/AuthBackdrop.tsx in each app).
// Everything is decorative and sits behind the page (z-0).

const RINGS = [
  { size: 360, opacity: 0.32, dashed: false, seconds: 50, reverse: false, dot: true },
  { size: 560, opacity: 0.24, dashed: true, seconds: 80, reverse: true, dot: false },
  { size: 780, opacity: 0.18, dashed: false, seconds: 110, reverse: false, dot: true },
  { size: 1020, opacity: 0.12, dashed: true, seconds: 150, reverse: true, dot: false },
  { size: 1300, opacity: 0.08, dashed: false, seconds: 200, reverse: false, dot: false },
];

export function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Rings */}
      {RINGS.map((r, i) => (
        <div
          key={i}
          className="auth-backdrop-ring absolute"
          style={{
            top: "46%",
            left: "50%",
            width: r.size,
            height: r.size,
            marginLeft: -r.size / 2,
            marginTop: -r.size / 2,
            borderRadius: "50%",
            border: `1px ${r.dashed ? "dashed" : "solid"} rgba(201,168,106,${r.opacity})`,
            animationDuration: `${r.seconds}s`,
            animationDirection: r.reverse ? "reverse" : "normal",
          }}
        >
          {r.dot && (
            <span
              className="absolute rounded-full"
              style={{
                top: -3,
                left: "50%",
                width: 6,
                height: 6,
                marginLeft: -3,
                background: "#c9a86a",
                opacity: Math.min(1, r.opacity * 4),
              }}
            />
          )}
        </div>
      ))}

      <style>{`
        @keyframes authBackdropSpin { to { transform: rotate(360deg); } }
        .auth-backdrop-ring { animation-name: authBackdropSpin; animation-timing-function: linear; animation-iteration-count: infinite; }
        @media (prefers-reduced-motion: reduce) {
          .auth-backdrop-ring { animation: none; }
        }
      `}</style>
    </div>
  );
}
