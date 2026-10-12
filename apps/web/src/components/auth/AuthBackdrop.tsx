// Backdrop for every sign-in and sign-up page (owner's call, Oct 2026):
// a champagne ombre over the ink page, several thin rings turning at
// different speeds and directions (two carry a small gold dot so the
// motion reads), and the perspective grid floor. The vendor and host
// apps draw the same thing (components/AuthBackdrop.tsx in each app).
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
      {/* Ombre: warm champagne at the top fading into ink, a soft glow
          behind the headline and a warmer pool at the bottom. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(201,168,106,0.16) 0%, rgba(201,168,106,0.06) 28%, rgba(20,22,26,0) 55%, rgba(138,111,62,0.10) 100%)",
        }}
      />
      <div
        className="absolute"
        style={{
          top: "34%",
          left: "50%",
          width: "70rem",
          height: "52rem",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(ellipse at center, rgba(201,168,106,0.16) 0%, rgba(201,168,106,0.07) 35%, rgba(201,168,106,0.02) 60%, transparent 75%)",
        }}
      />

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
                boxShadow: "0 0 10px rgba(201,168,106,0.8)",
                opacity: Math.min(1, r.opacity * 4),
              }}
            />
          )}
        </div>
      ))}

      {/* Grid floor */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: 420,
          perspective: "800px",
          overflow: "hidden",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 38%, #000 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, #000 38%, #000 100%)",
        }}
      >
        <div
          className="auth-backdrop-grid absolute"
          style={{
            bottom: 0,
            left: "-25%",
            width: "150%",
            height: 800,
            backgroundImage:
              "linear-gradient(rgba(201,168,106,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,106,0.07) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            transform: "rotateX(75deg)",
            transformOrigin: "center bottom",
          }}
        />
      </div>

      <style>{`
        @keyframes authBackdropSpin { to { transform: rotate(360deg); } }
        .auth-backdrop-ring { animation-name: authBackdropSpin; animation-timing-function: linear; animation-iteration-count: infinite; }
        @keyframes authBackdropGrid { to { background-position: 0 60px; } }
        .auth-backdrop-grid { animation: authBackdropGrid 5s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .auth-backdrop-ring, .auth-backdrop-grid { animation: none; }
        }
      `}</style>
    </div>
  );
}
