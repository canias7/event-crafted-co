// Super Agents — futuristic showcase page for the three agents
// vendors run inside Vendora: HILUX 2.7 (always-on chat), RAPTOR 3.5
// (content / prompt-driven fills), AXION 9.1 (image work).
//
// Visual language is intentionally different from the rest of the
// marketplace — dark cosmic backdrop, layered glass cards floating in
// faux 3D (CSS perspective + framer-motion scroll-driven transforms,
// no Three.js dep), per-agent signature color glows. Each agent gets
// its own sticky-style section so the page scrolls like a Framer
// product launch.

import { useRef } from "react";
import { Link } from "react-router-dom";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { Bot, ImagePlus, Sparkles } from "lucide-react";

interface Agent {
  codename: string;
  version: string;
  role: string;
  tagline: string;
  about: string;
  capabilities: string[];
  /** Accent colors used across the agent's glow / chips / underlines. */
  accent: string;
  accentSoft: string;
  /** Sub-line under the codename, e.g. "ALWAYS ON" */
  status: string;
  Icon: typeof Bot;
}

const AGENTS: Agent[] = [
  {
    codename: "HILUX",
    version: "2.7",
    role: "Always On",
    tagline: "Answers every host inquiry the moment it lands.",
    about:
      "Lives inside your inbox 24/7. Reads context from the listing, the host's event details, and past conversations to qualify leads, answer the easy stuff instantly, and hand the gnarly ones over to you with a one-line brief.",
    capabilities: [
      "Replies in under 60 seconds, any time of day",
      "Books availability into your calendar automatically",
      "Routes hot leads straight to your phone",
      "Drafts you the perfect follow-up two days later",
    ],
    accent: "#ff8a4c",
    accentSoft: "rgba(255, 138, 76, 0.18)",
    status: "24/7 · Live chat",
    Icon: Bot,
  },
  {
    codename: "RAPTOR",
    version: "3.5",
    role: "Wordsmith",
    tagline: "Writes your listing copy in your voice.",
    about:
      "Drops the blank-page anxiety. Studies your past replies, your reviews, and the markets you serve, then drafts every word your listing needs — bio, FAQs, package descriptions — in a voice that sounds like you on your best day.",
    capabilities: [
      "One-prompt bios, FAQs, and package descriptions",
      "Tone-matched to your existing reviews + replies",
      "Multilingual — English, Spanish, French, more",
      "A/B tests headline variants against real inquiries",
    ],
    accent: "#7aa8ff",
    accentSoft: "rgba(122, 168, 255, 0.18)",
    status: "Prompt · Drafting",
    Icon: Sparkles,
  },
  {
    codename: "AXION",
    version: "9.1",
    role: "Visuals",
    tagline: "Turns one phone photo into a portfolio.",
    about:
      "Generates, restyles, and cleans up listing photography on demand. Drop in a snapshot from last week's setup — Axion returns ten editorial-grade variants ready to publish, with consistent color, framing, and brand feel.",
    capabilities: [
      "Phone photo → editorial portfolio in seconds",
      "Restyles existing galleries to one cohesive look",
      "Generates lifestyle hero shots from scratch",
      "Auto-crops + retouches for every aspect ratio",
    ],
    accent: "#d066ff",
    accentSoft: "rgba(208, 102, 255, 0.18)",
    status: "Vision · Generative",
    Icon: ImagePlus,
  },
];

export default function SuperAgentsPage() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="relative min-h-screen overflow-x-hidden text-black"
      style={{ background: "#fafafa" }}
    >
      <AmbientBackdrop disabled={!!reduceMotion} />

      <header className="relative z-20 flex items-center justify-between px-6 py-5 md:px-10 md:py-6">
        <Link to="/" className="font-editorial text-[22px] italic text-black">
          Vendora
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-[13px] text-black/80">
          <Link to="/vendors" className="hover:text-black transition-colors">
            Vendors
          </Link>
          <Link to="/real-events" className="hover:text-black transition-colors">
            Real events
          </Link>
          <span className="inline-flex items-center gap-1.5 text-black">
            Super agents
            <span
              className="text-[9px] tracking-widest rounded-full px-1.5 py-px"
              style={{ border: "0.5px solid rgba(0,0,0,0.35)" }}
            >
              NEW
            </span>
          </span>
        </nav>
        <div className="w-[120px]" aria-hidden />
      </header>

      <Hero />

      <AgentsSection />

      <CapabilitiesGrid />

      <CTA />

      <footer className="relative z-10 border-t border-black/5 px-6 md:px-10 py-10 text-center text-[12px] text-black/45">
        Vendora · Super Agents · Powered by Opus 4.7
      </footer>
    </div>
  );
}

// ─── Ambient backdrop ──────────────────────────────────────────────────
// Matches the auth-shell visual treatment 1:1 (GlassyAuthShell.tsx) so
// Super Agents reads as part of the same site: solid #fafafa base,
// triple amber radial glow, perspective amber grid floor, slowly
// rotating dashed orbital ring, scattered orange particles + stars.
// Fixed position so the canvas stays under content as the user scrolls.
function AmbientBackdrop({ disabled }: { disabled: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Big center amber glow — anchor of the canvas */}
      <div
        aria-hidden
        className="absolute"
        style={{
          top: "28%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "1100px",
          height: "850px",
          background:
            "radial-gradient(ellipse at center, rgba(255,138,76,0.32) 0%, rgba(255,138,76,0.11) 32%, rgba(255,138,76,0.03) 58%, transparent 78%)",
        }}
      />
      {/* Bottom-right secondary glow */}
      <div
        aria-hidden
        className="absolute"
        style={{
          bottom: "-120px",
          right: "-8%",
          width: "680px",
          height: "580px",
          background:
            "radial-gradient(ellipse at center, rgba(255,138,76,0.16) 0%, rgba(255,138,76,0.04) 42%, transparent 72%)",
        }}
      />
      {/* Left-side soft glow */}
      <div
        aria-hidden
        className="absolute"
        style={{
          top: "62%",
          left: "-8%",
          width: "480px",
          height: "480px",
          background:
            "radial-gradient(ellipse at center, rgba(255,178,122,0.10) 0%, transparent 65%)",
        }}
      />

      {/* Perspective amber grid floor — same animation as the auth shell */}
      <div
        aria-hidden
        className="absolute inset-x-0"
        style={{
          bottom: 0,
          height: "500px",
          perspective: "800px",
          overflow: "hidden",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, #000 38%, #000 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, #000 38%, #000 100%)",
        }}
      >
        <div
          className={disabled ? "super-grid-static" : "super-grid-scroll"}
          style={{
            position: "absolute",
            bottom: 0,
            left: "-25%",
            width: "150%",
            height: "800px",
            backgroundImage:
              "linear-gradient(rgba(255,138,76,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,138,76,0.28) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            transform: "rotateX(75deg)",
            transformOrigin: "center bottom",
          }}
        />
      </div>

      {/* Slowly-rotating orbital dashed ring */}
      <div
        aria-hidden
        className={disabled ? "" : "super-ring"}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "720px",
          height: "720px",
          border: "0.5px dashed rgba(255,138,76,0.18)",
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Star decorations */}
      <Star top="120px" left="80px" size={20} opacity={0.35} />
      <Star bottom="100px" right="90px" size={16} opacity={0.3} />
      <Star top="42%" right="10%" size={14} opacity={0.28} />

      {/* Floating peach + amber particles */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className={
            disabled
              ? ""
              : p.variant === "a"
                ? "super-float-a"
                : "super-float-b"
          }
          style={{
            position: "absolute",
            top: p.top,
            left: p.left,
            right: p.right,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.glow}px ${p.color}`,
            borderRadius: "50%",
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* Keyframes — scoped to this page */}
      <style>{`
        @keyframes superGridScroll {
          0% { background-position: 0 0; }
          100% { background-position: 0 60px; }
        }
        .super-grid-scroll { animation: superGridScroll 5s linear infinite; }
        @keyframes superRotSlow {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .super-ring { animation: superRotSlow 80s linear infinite; }
        @keyframes superFloatA {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-30px); opacity: 1; }
        }
        .super-float-a { animation: superFloatA 6s ease-in-out infinite; }
        @keyframes superFloatB {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-24px); opacity: 1; }
        }
        .super-float-b { animation: superFloatB 7s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

function Star({
  top,
  left,
  right,
  bottom,
  size,
  opacity,
}: {
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  size: number;
  opacity: number;
}) {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{ top, left, right, bottom, opacity }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path
          d="M12 2 L13 11 L22 12 L13 13 L12 22 L11 13 L2 12 L11 11 Z"
          fill="#ff8a4c"
        />
      </svg>
    </div>
  );
}

type Particle = {
  variant: "a" | "b";
  top?: string;
  left?: string;
  right?: string;
  size: number;
  color: string;
  glow: number;
  delay: string;
};

const PARTICLES: Particle[] = [
  { variant: "a", top: "20%", left: "12%", size: 3, color: "#ff8a4c", glow: 10, delay: "0s" },
  { variant: "b", top: "38%", left: "26%", size: 2, color: "#ffb27a", glow: 6, delay: "1s" },
  { variant: "a", top: "62%", left: "16%", size: 2, color: "#ff8a4c", glow: 6, delay: "2s" },
  { variant: "b", top: "30%", right: "22%", size: 3, color: "#ffb27a", glow: 8, delay: "0.5s" },
  { variant: "a", top: "52%", left: "8%", size: 2, color: "#ff8a4c", glow: 6, delay: "1.5s" },
  { variant: "b", top: "72%", right: "16%", size: 2, color: "#ffb27a", glow: 6, delay: "2.5s" },
  { variant: "a", top: "14%", right: "30%", size: 3, color: "#ff8a4c", glow: 10, delay: "1s" },
  { variant: "b", top: "78%", left: "32%", size: 2, color: "#ffb27a", glow: 6, delay: "3s" },
];

// ─── Hero ──────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative z-10 px-6 md:px-10 pt-16 pb-24 md:pt-24 md:pb-32 text-center">
      {/* Pre-headline pill */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-black/75"
        style={{
          border: "0.5px solid rgba(0,0,0,0.18)",
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span
          className="rounded-full"
          style={{
            width: 6,
            height: 6,
            background: "#ff8a4c",
            boxShadow: "0 0 8px #ff8a4c",
          }}
        />
        Three agents now live
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="mt-7 font-editorial mx-auto"
        style={{
          fontSize: "clamp(56px, 9vw, 124px)",
          fontWeight: 500,
          lineHeight: 0.95,
          letterSpacing: "-2px",
          maxWidth: 1100,
        }}
      >
        Three agents.
        <br />
        <span
          style={{
            background:
              "linear-gradient(135deg, #ff8a4c 0%, #d066ff 50%, #7aa8ff 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            fontStyle: "italic",
          }}
        >
          One vendor.
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto mt-7 text-[18px] md:text-[20px] text-black/70"
        style={{ maxWidth: 620, lineHeight: 1.55 }}
      >
        Super Agents reply to hosts at 3 a.m., write your listings in your
        voice, and turn one phone photo into a portfolio. You stay the
        artist. They handle the rest.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35 }}
        className="mt-10 flex items-center justify-center text-[13px]"
      >
        <a
          href="#meet"
          className="rounded-full px-6 py-3 text-black/85 hover:text-black transition-colors"
          style={{ border: "0.5px solid rgba(0,0,0,0.25)" }}
        >
          Meet them →
        </a>
      </motion.div>

      {/* Central holographic core — faux-3D layered orb */}
      <div className="mt-20 flex items-center justify-center">
        <HolographicCore />
      </div>
    </section>
  );
}

function HolographicCore() {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className="relative"
      style={{ width: 320, height: 320, perspective: 1200 }}
    >
      {/* Outermost slow-rotating ring */}
      <motion.div
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 24, repeat: Infinity, ease: "linear" }
        }
        className="absolute inset-0 rounded-full"
        style={{
          border: "1px dashed rgba(0,0,0,0.18)",
        }}
      />
      {/* Middle ring */}
      <motion.div
        animate={reduceMotion ? undefined : { rotate: -360 }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 18, repeat: Infinity, ease: "linear" }
        }
        className="absolute inset-8 rounded-full"
        style={{
          border: "0.5px solid rgba(0,0,0,0.22)",
          background:
            "conic-gradient(from 90deg, transparent 0%, rgba(208,102,255,0.32) 25%, transparent 50%, rgba(255,138,76,0.32) 75%, transparent 100%)",
          maskImage: "radial-gradient(circle, transparent 60%, #000 62%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 60%, #000 62%)",
        }}
      />
      {/* Inner core sphere */}
      <motion.div
        animate={
          reduceMotion
            ? undefined
            : { scale: [1, 1.05, 1], opacity: [0.85, 1, 0.85] }
        }
        transition={
          reduceMotion
            ? undefined
            : { duration: 4, repeat: Infinity, ease: "easeInOut" }
        }
        className="absolute inset-20 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, #ffffff 0%, #ffd9b8 18%, #ff8a4c 45%, #d066ff 75%, #15183b 100%)",
          boxShadow:
            "0 0 80px rgba(208,102,255,0.5), 0 0 140px rgba(255,138,76,0.3), inset -20px -30px 60px rgba(0,0,0,0.4)",
        }}
      />
      {/* Glint highlight */}
      <div
        aria-hidden
        className="absolute"
        style={{
          top: 80,
          left: 100,
          width: 36,
          height: 18,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.5)",
          filter: "blur(6px)",
        }}
      />
    </div>
  );
}

// ─── Agents section ────────────────────────────────────────────────────
function AgentsSection() {
  return (
    <section
      id="meet"
      className="relative z-10 px-6 md:px-10 py-24 md:py-32 mx-auto"
      style={{ maxWidth: 1200 }}
    >
      <div className="mb-20 text-center">
        <p className="font-label text-[10px] uppercase tracking-[0.25em] text-black/55">
          Meet the agents
        </p>
        <h2
          className="mt-4 font-editorial italic"
          style={{
            fontSize: "clamp(40px, 6vw, 72px)",
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "-1px",
          }}
        >
          Three minds. One vendor.
        </h2>
      </div>

      <div className="space-y-24 md:space-y-40">
        {AGENTS.map((agent, i) => (
          <AgentCard key={agent.codename} agent={agent} index={i} />
        ))}
      </div>
    </section>
  );
}

function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const visualY = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const visualRotate = useTransform(scrollYProgress, [0, 1], [-6, 6]);
  const reverseRow = index % 2 === 1;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={`grid items-center gap-10 md:gap-16 ${
        reverseRow ? "md:grid-cols-[1fr_1.1fr]" : "md:grid-cols-[1.1fr_1fr]"
      }`}
    >
      {/* Copy column */}
      <div className={reverseRow ? "md:order-2" : ""}>
        <div className="flex items-center gap-3 mb-5">
          <span
            className="rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.2em] font-semibold"
            style={{
              color: agent.accent,
              background: agent.accentSoft,
              border: `0.5px solid ${agent.accent}55`,
            }}
          >
            {agent.status}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <h3
            className="font-editorial"
            style={{
              fontSize: "clamp(40px, 5.5vw, 64px)",
              fontWeight: 500,
              letterSpacing: "-1.5px",
              lineHeight: 1,
            }}
          >
            {agent.codename}
          </h3>
          <span
            className="font-mono text-[18px] tracking-wider"
            style={{ color: agent.accent }}
          >
            {agent.version}
          </span>
        </div>
        <p
          className="mt-3 font-editorial italic text-black/85"
          style={{ fontSize: "clamp(20px, 2.5vw, 28px)", lineHeight: 1.2 }}
        >
          {agent.tagline}
        </p>
        <p className="mt-6 text-[15px] leading-relaxed text-black/65 max-w-md">
          {agent.about}
        </p>
        <ul className="mt-7 space-y-3">
          {agent.capabilities.map((c) => (
            <li
              key={c}
              className="flex items-start gap-3 text-[14px] text-black/85"
            >
              <span
                className="mt-2 h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{
                  background: agent.accent,
                  boxShadow: `0 0 8px ${agent.accent}`,
                }}
              />
              {c}
            </li>
          ))}
        </ul>
      </div>

      {/* Visual column — floating 3D-feel card */}
      <motion.div
        style={
          reduceMotion ? undefined : { y: visualY, rotate: visualRotate }
        }
        className={`relative ${reverseRow ? "md:order-1" : ""}`}
      >
        <AgentVisual agent={agent} />
      </motion.div>
    </motion.div>
  );
}

function AgentVisual({ agent }: { agent: Agent }) {
  const reduceMotion = useReducedMotion();
  const Icon = agent.Icon;
  return (
    <div
      className="relative mx-auto"
      style={{
        width: "min(100%, 440px)",
        aspectRatio: "1 / 1.05",
        perspective: 1400,
      }}
    >
      {/* Soft halo */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[28px] -z-10"
        style={{
          background: `radial-gradient(circle at 50% 40%, ${agent.accent}33 0%, transparent 70%)`,
          filter: "blur(30px)",
        }}
      />

      {/* Main glass card — sits on the cream canvas, light glass + amber tint */}
      <motion.div
        animate={
          reduceMotion ? undefined : { rotateY: [-6, 6, -6] }
        }
        transition={
          reduceMotion
            ? undefined
            : { duration: 12, repeat: Infinity, ease: "easeInOut" }
        }
        className="relative h-full w-full rounded-[28px] overflow-hidden"
        style={{
          background:
            "linear-gradient(145deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.35) 60%)",
          border: "0.5px solid rgba(0,0,0,0.12)",
          backdropFilter: "blur(20px)",
          boxShadow:
            "0 30px 80px rgba(255,138,76,0.18), 0 8px 30px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Top header strip with codename + version */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}
        >
          <span className="text-[10px] uppercase tracking-[0.2em] text-black/55">
            {agent.codename} · {agent.version}
          </span>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: agent.accent,
              boxShadow: `0 0 8px ${agent.accent}`,
            }}
          />
        </div>

        {/* Central icon orb */}
        <div className="relative flex h-[64%] items-center justify-center">
          {/* Pulsing accent ring */}
          <motion.div
            animate={
              reduceMotion
                ? undefined
                : { scale: [1, 1.18, 1], opacity: [0.55, 0.15, 0.55] }
            }
            transition={
              reduceMotion
                ? undefined
                : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
            }
            className="absolute h-44 w-44 rounded-full"
            style={{
              border: `1px solid ${agent.accent}`,
            }}
          />
          {/* Orb */}
          <div
            className="relative h-32 w-32 rounded-full flex items-center justify-center"
            style={{
              background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${agent.accent} 60%, ${agent.accent} 100%)`,
              boxShadow: `0 0 60px ${agent.accent}66, inset -8px -12px 24px rgba(0,0,0,0.18)`,
            }}
          >
            <Icon className="h-9 w-9 text-white" strokeWidth={1.5} />
          </div>
        </div>

        {/* Footer status row */}
        <div className="absolute bottom-0 left-0 right-0 px-5 py-4 flex items-center justify-between text-[11px]">
          <span className="text-black/60">{agent.role}</span>
          <span
            className="inline-flex items-center gap-1.5"
            style={{ color: agent.accent }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: agent.accent,
                boxShadow: `0 0 6px ${agent.accent}`,
              }}
            />
            Online
          </span>
        </div>
      </motion.div>

      {/* Offset "floating" mini-card behind the main card for depth */}
      <div
        aria-hidden
        className="absolute -top-4 -right-4 rounded-2xl h-24 w-32 -z-10"
        style={{
          background: agent.accentSoft,
          border: `0.5px solid ${agent.accent}55`,
          transform: "rotate(8deg)",
          backdropFilter: "blur(4px)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-3 -left-5 rounded-2xl h-20 w-24 -z-10"
        style={{
          background: "rgba(255,255,255,0.55)",
          border: "0.5px solid rgba(0,0,0,0.08)",
          transform: "rotate(-6deg)",
        }}
      />
    </div>
  );
}

// ─── Capabilities grid ─────────────────────────────────────────────────
function CapabilitiesGrid() {
  const items = [
    { label: "Calendar-aware", help: "Reads your real availability before booking." },
    { label: "Tone-matched", help: "Trains on your replies + reviews." },
    { label: "Bilingual+", help: "English, Spanish, French, more." },
    { label: "Editorial photos", help: "Phone snapshot → publish-ready hero." },
    { label: "Auto follow-ups", help: "Nudges leads back 48 hours later." },
    { label: "Smart routing", help: "Hot leads ping your phone." },
    { label: "Brand-safe", help: "Never invents prices or promises." },
    { label: "On standby", help: "Pause any agent in one tap." },
  ];
  return (
    <section className="relative z-10 px-6 md:px-10 py-20 mx-auto" style={{ maxWidth: 1100 }}>
      <p className="font-label text-[10px] uppercase tracking-[0.25em] text-black/55 text-center">
        Under the hood
      </p>
      <h2
        className="mt-4 text-center font-editorial italic"
        style={{
          fontSize: "clamp(34px, 4.5vw, 52px)",
          fontWeight: 500,
          letterSpacing: "-1px",
          lineHeight: 1.05,
        }}
      >
        Capabilities you'd hire a team for.
      </h2>
      <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((it, i) => (
          <motion.div
            key={it.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              duration: 0.5,
              delay: (i % 4) * 0.06,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="rounded-2xl p-5"
            style={{
              background: "rgba(255,255,255,0.55)",
              border: "0.5px solid rgba(0,0,0,0.08)",
              backdropFilter: "blur(8px)",
            }}
          >
            <p className="text-[14px] font-medium text-black">{it.label}</p>
            <p className="mt-1 text-[12px] text-black/60 leading-relaxed">
              {it.help}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ─── CTA ───────────────────────────────────────────────────────────────
function CTA() {
  return (
    <section className="relative z-10 px-6 md:px-10 py-28 text-center">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="font-editorial mx-auto"
        style={{
          fontSize: "clamp(40px, 6vw, 72px)",
          fontWeight: 500,
          letterSpacing: "-1.5px",
          lineHeight: 1.02,
          maxWidth: 900,
        }}
      >
        Sleep through the inquiry.{" "}
        <span
          style={{
            background:
              "linear-gradient(135deg, #ff8a4c 0%, #d066ff 50%, #7aa8ff 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            fontStyle: "italic",
          }}
        >
          Wake up to a booked event.
        </span>
      </motion.h2>
    </section>
  );
}
