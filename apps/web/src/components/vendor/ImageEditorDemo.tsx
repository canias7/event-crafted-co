import { useEffect, useRef, useState } from "react";

// Self-running animated walkthrough of the Image Studio flow — used
// in the right column of /vendor/studio so vendors can see the
// editor end-to-end before they try it themselves. Self-contained
// styles + a synthetic cursor make this independent of the rest of
// the app's design tokens; the loop restarts indefinitely until the
// component unmounts.
//
// Both panels read /wedding-demo.jpg from /public — copied from
// /src/assets/hero/wedding.jpg so vite-imagetools (which auto-
// applies as=picture to anything under /assets/hero/) doesn't
// transform it into a PictureSource object that won't render in a
// plain <img>. The "before" panel applies a CSS blur + slight
// desaturate so the same photo reads as a low-res starting point;
// the "after" panel renders the original sharp version.

export default function ImageEditorDemo() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState({
    num: "01",
    text: "Click source to upload",
  });
  const [activePanel, setActivePanel] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [showLowBadge, setShowLowBadge] = useState(false);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const [promptText, setPromptText] = useState("");
  const [showCaret, setShowCaret] = useState(false);
  const [btnArmed, setBtnArmed] = useState(false);
  const [btnPressed, setBtnPressed] = useState(false);
  const [resultActive, setResultActive] = useState(false);
  const [resultShown, setResultShown] = useState(false);
  const [skelOn, setSkelOn] = useState(false);
  const [scanOn, setScanOn] = useState(false);
  const [shimmerOn, setShimmerOn] = useState(false);
  const [show4kBadge, setShow4kBadge] = useState(false);
  const isRunning = useRef(true);

  // Same image for both — the "before" panel uses a CSS filter to
  // simulate the lower-res starting point.
  const LOW_RES = "/wedding-demo.jpg";
  const HIGH_RES = "/wedding-demo.jpg";

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const moveCursor = (x: number, y: number) => {
    if (cursorRef.current) {
      cursorRef.current.style.left = x + "px";
      cursorRef.current.style.top = y + "px";
    }
  };

  const moveTo = (selector: string, offsetY?: number) => {
    if (!stageRef.current) return;
    const target = stageRef.current.querySelector(selector) as HTMLElement;
    if (!target) return;
    const stageRect = stageRef.current.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const x = r.left - stageRect.left + r.width / 2 - 11;
    const y =
      r.top - stageRect.top + (offsetY !== undefined ? offsetY : r.height / 2) - 11;
    moveCursor(x, y);
  };

  const fireClick = () => {
    if (!ringRef.current) return;
    ringRef.current.classList.remove("fire");
    void ringRef.current.offsetWidth;
    ringRef.current.classList.add("fire");
  };

  const typeText = async (str: string, speed: number) => {
    setShowCaret(true);
    for (let i = 0; i < str.length; i++) {
      setPromptText(str.slice(0, i + 1));
      await wait(speed + Math.random() * 30);
    }
    await wait(400);
    setShowCaret(false);
  };

  const reset = async () => {
    setActivePanel(null);
    setUploaded(false);
    setShowLowBadge(false);
    setPlaceholderVisible(true);
    setPromptText("");
    setBtnArmed(false);
    setBtnPressed(false);
    setResultActive(false);
    setResultShown(false);
    setSkelOn(false);
    setScanOn(false);
    setShimmerOn(false);
    setShow4kBadge(false);
    moveCursor(80, 280);
    setStep({ num: "01", text: "Click source to upload" });
  };

  const runOnce = async () => {
    await reset();
    await wait(700);

    setActivePanel(1);
    moveTo("#sourceArea");
    await wait(1100);
    fireClick();
    await wait(400);

    setUploaded(true);
    setShowLowBadge(true);
    setStep({ num: "02", text: "Image loaded — describe the edit" });
    await wait(900);

    setActivePanel(2);
    moveTo(".prompt-box");
    await wait(900);
    fireClick();
    setPlaceholderVisible(false);
    await wait(300);

    await typeText("Upgrade image quality to 4K", 55);
    await wait(500);

    setStep({ num: "03", text: "Generate" });
    moveTo("#genBtn");
    await wait(800);
    setBtnArmed(true);
    await wait(200);
    fireClick();
    setBtnPressed(true);
    await wait(180);
    setBtnPressed(false);
    await wait(300);

    setActivePanel(3);
    setStep({ num: "04", text: "Rendering 4K result…" });
    setResultActive(true);
    setSkelOn(true);
    setShimmerOn(true);
    setScanOn(true);
    moveTo("#resultArea");
    await wait(2400);

    setResultShown(true);
    setSkelOn(false);
    await wait(700);
    setScanOn(false);
    setShimmerOn(false);
    setShow4kBadge(true);
    setStep({ num: "05", text: "Done — 4K upscale ready" });
    await wait(2800);
  };

  useEffect(() => {
    isRunning.current = true;
    (async () => {
      await wait(400);
      while (isRunning.current) {
        await runOnce();
      }
    })();
    return () => {
      isRunning.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replay = () => {
    isRunning.current = false;
    setTimeout(() => {
      isRunning.current = true;
      (async () => {
        while (isRunning.current) {
          await runOnce();
        }
      })();
    }, 100);
  };

  return (
    <div
      style={{
        background: "#0a0b0f",
        padding: "24px 16px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        borderRadius: 12,
      }}
    >
      <style>{`
        .gf-stage { position: relative; background: #0f1115; border-radius: 16px; padding: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
        .gf-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; align-items: start; }
        .gf-panel { background: #1a1d24; border-radius: 10px; padding: 10px; border: 1px solid rgba(255,255,255,0.06); position: relative; transition: border-color .4s ease, box-shadow .4s ease; display: flex; flex-direction: column; }
        .gf-panel.active { border-color: rgba(255,255,255,0.25); box-shadow: 0 0 0 1px rgba(255,255,255,0.08); }
        .gf-label { font-size: 9px; letter-spacing: 0.14em; color: #8a8f9c; text-transform: uppercase; margin-bottom: 8px; font-weight: 500; }
        .gf-label .spark { color: #c8a4ff; margin-right: 4px; }
        .gf-img-area { position: relative; width: 100%; aspect-ratio: 1/1; border-radius: 5px; overflow: hidden; background: rgba(255,255,255,0.02); }
        .gf-drop { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #6b7280; font-size: 10px; text-align: center; padding: 0 6px; transition: opacity .3s; }
        .gf-icon { width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 12px; }
        .gf-meta { font-size: 8px; color: #5b616e; line-height: 1.3; }
        .gf-up { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .5s ease; filter: blur(2.5px) saturate(0.75) contrast(0.92) brightness(0.92); image-rendering: pixelated; transform: scale(1.02); }
        .gf-up.show { opacity: 1; }
        .gf-prompt-area { width: 100%; aspect-ratio: 1/1; display: flex; flex-direction: column; justify-content: space-between; }
        .gf-prompt-box { flex: 1; border-radius: 6px; background: rgba(255,255,255,0.02); padding: 6px; font-size: 10px; color: #d1d5db; line-height: 1.4; position: relative; border: 1px solid rgba(255,255,255,0.05); min-height: 0; }
        .gf-placeholder { color: #4b5563; position: absolute; top: 6px; left: 6px; right: 6px; transition: opacity .3s ease; font-size: 9px; }
        .gf-prompt-text { color: #e5e7eb; min-height: 1em; position: relative; z-index: 2; }
        .gf-caret { display: inline-block; width: 1px; height: 10px; background: #e5e7eb; margin-left: 1px; vertical-align: -2px; animation: gfblink 1s steps(2) infinite; }
        @keyframes gfblink { 50% { opacity: 0; } }
        .gf-presets { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; }
        .gf-preset { padding: 3px 6px; border-radius: 999px; background: rgba(255,255,255,0.03); font-size: 8px; color: #9ca3af; border: 1px solid rgba(255,255,255,0.04); }
        .gf-btn { margin-top: 4px; width: 100%; padding: 5px; border-radius: 999px; background: #9ca3af; color: #1a1d24; font-size: 10px; font-weight: 500; text-align: center; display: flex; align-items: center; justify-content: center; gap: 3px; transition: background .3s ease, transform .15s ease; }
        .gf-btn.armed { background: #e5e7eb; }
        .gf-btn.pressed { transform: scale(0.97); }
        .gf-result-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #6b7280; font-size: 10px; text-align: center; padding: 0 6px; }
        .gf-result-stage { position: absolute; inset: 0; border-radius: 5px; overflow: hidden; background: #000; }
        .gf-result-img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 1.2s ease; }
        .gf-result-img.show { opacity: 1; }
        .gf-shimmer { position: absolute; inset: 0; background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%); background-size: 200% 100%; animation: gfshim 1.6s linear infinite; opacity: 0; transition: opacity .3s ease; pointer-events: none; }
        .gf-shimmer.on { opacity: 1; }
        @keyframes gfshim { 0% { background-position: 120% 0; } 100% { background-position: -20% 0; } }
        .gf-scan { position: absolute; left: 0; right: 0; top: 0; height: 1.5px; background: linear-gradient(90deg, transparent, #c8a4ff, transparent); box-shadow: 0 0 14px #c8a4ff; opacity: 0; transition: opacity .3s ease; }
        .gf-scan.on { opacity: 0.9; animation: gfscan 1.4s ease-in-out infinite; }
        @keyframes gfscan { 0%, 100% { top: 0; } 50% { top: calc(100% - 1.5px); } }
        .gf-skel { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; padding: 2px; opacity: 0; transition: opacity .3s ease; }
        .gf-skel.on { opacity: 1; }
        .gf-tile { background: rgba(200,164,255,0.08); border-radius: 1px; animation: gfpulse 1.4s ease-in-out infinite; }
        .gf-tile:nth-child(2n) { animation-delay: .1s; }
        .gf-tile:nth-child(3n) { animation-delay: .2s; background: rgba(200,164,255,0.14); }
        .gf-tile:nth-child(5n) { animation-delay: .3s; }
        @keyframes gfpulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        .gf-badge-4k { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.7); color: #fff; font-size: 8px; font-weight: 500; letter-spacing: 0.12em; padding: 2px 6px; border-radius: 3px; opacity: 0; transition: opacity .5s ease; z-index: 3; }
        .gf-badge-4k.show { opacity: 1; }
        .gf-badge-low { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.6); color: #9ca3af; font-size: 8px; font-weight: 500; letter-spacing: 0.12em; padding: 2px 6px; border-radius: 3px; opacity: 0; transition: opacity .4s ease; z-index: 3; }
        .gf-badge-low.show { opacity: 1; }
        .gf-cursor { position: absolute; width: 16px; height: 16px; pointer-events: none; z-index: 50; transition: left 1s cubic-bezier(.4,.1,.2,1), top 1s cubic-bezier(.4,.1,.2,1); }
        .gf-cursor svg { width: 100%; height: 100%; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4)); }
        .gf-ring { position: absolute; width: 24px; height: 24px; border-radius: 50%; border: 2px solid #fff; left: 4px; top: 4px; opacity: 0; transform: scale(0.4); pointer-events: none; }
        .gf-ring.fire { animation: gfring .55s ease-out; }
        @keyframes gfring { 0% { opacity: 0.8; transform: scale(0.4); } 100% { opacity: 0; transform: scale(1.6); } }
        .gf-controls { margin-top: 10px; font-size: 9px; color: #6b7280; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500; display: flex; justify-content: space-between; align-items: center; padding: 0 2px; flex-wrap: wrap; gap: 6px; }
        .gf-step span { color: #c8a4ff; }
        .gf-replay { font-size: 9px; color: #9ca3af; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 999px; cursor: pointer; letter-spacing: 0.04em; font-family: inherit; }
        .gf-replay:hover { background: rgba(255,255,255,0.08); color: #e5e7eb; }
        .gf-title { color: #e5e7eb; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 8px; text-align: center; font-weight: 500; }
        .gf-title span { color: #c8a4ff; }
        @media (max-width: 480px) {
          .gf-grid { grid-template-columns: 1fr; }
          .gf-prompt-area { aspect-ratio: auto; }
          .gf-img-area { aspect-ratio: 4/3; }
        }
      `}</style>

      <div className="gf-title">
        Studio <span>·</span> How it works
      </div>

      <div className="gf-stage" ref={stageRef}>
        <div className="gf-grid">
          <div className={`gf-panel ${activePanel === 1 ? "active" : ""}`}>
            <div className="gf-label">SOURCE</div>
            <div className="gf-img-area" id="sourceArea">
              <div
                className="gf-drop"
                style={{ opacity: uploaded ? 0 : 1 }}
              >
                <div className="gf-icon">↑</div>
                <div>Upload</div>
                <div className="gf-meta">PNG · JPG</div>
              </div>
              <div
                className={`gf-badge-low ${showLowBadge ? "show" : ""}`}
              >
                480p
              </div>
              <img
                className={`gf-up ${uploaded ? "show" : ""}`}
                src={LOW_RES}
                alt=""
              />
            </div>
          </div>

          <div className={`gf-panel ${activePanel === 2 ? "active" : ""}`}>
            <div className="gf-label">
              <span className="spark">✨</span>EDIT PROMPT
            </div>
            <div className="gf-prompt-area">
              <div className="gf-prompt-box prompt-box">
                <div
                  className="gf-placeholder"
                  style={{ opacity: placeholderVisible ? 1 : 0 }}
                >
                  e.g. remove background…
                </div>
                <div className="gf-prompt-text">
                  {promptText}
                  {showCaret && <span className="gf-caret" />}
                </div>
              </div>
              <div className="gf-presets">
                <div className="gf-preset">Remove bg</div>
                <div className="gf-preset">Golden hour</div>
                <div className="gf-preset">Cinematic</div>
              </div>
              <div
                id="genBtn"
                className={`gf-btn ${btnArmed ? "armed" : ""} ${
                  btnPressed ? "pressed" : ""
                }`}
              >
                Generate →
              </div>
            </div>
          </div>

          <div className={`gf-panel ${activePanel === 3 ? "active" : ""}`}>
            <div className="gf-label">RESULT</div>
            <div className="gf-img-area" id="resultArea">
              {!resultActive && (
                <div className="gf-result-empty">
                  <div className="gf-icon">▦</div>
                  <div>No result</div>
                  <div className="gf-meta">Yet</div>
                </div>
              )}
              {resultActive && (
                <div className="gf-result-stage">
                  <div
                    className={`gf-badge-4k ${show4kBadge ? "show" : ""}`}
                  >
                    4K
                  </div>
                  <img
                    className={`gf-result-img ${resultShown ? "show" : ""}`}
                    src={HIGH_RES}
                    alt=""
                  />
                  <div className={`gf-skel ${skelOn ? "on" : ""}`}>
                    {Array.from({ length: 48 }).map((_, i) => (
                      <div key={i} className="gf-tile" />
                    ))}
                  </div>
                  <div className={`gf-scan ${scanOn ? "on" : ""}`} />
                  <div className={`gf-shimmer ${shimmerOn ? "on" : ""}`} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="gf-controls">
          <span className="gf-step">
            <span>{step.num}</span> {step.text}
          </span>
          <button className="gf-replay" onClick={replay}>
            ↻
          </button>
        </div>

        <div
          className="gf-cursor"
          ref={cursorRef}
          style={{ left: 80, top: 280 }}
        >
          <div className="gf-ring" ref={ringRef} />
          <svg viewBox="0 0 20 20">
            <path
              d="M2 2 L2 14 L6 11 L9 17 L11 16 L8 10 L13 10 Z"
              fill="#fff"
              stroke="#000"
              strokeWidth="0.8"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
