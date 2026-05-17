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
  type MotionValue,
} from "framer-motion";
import { ArrowRight, Bot, ImagePlus, Sparkles } from "lucide-react";

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
  const { scrollYProgress } = useScroll();
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06080f] text-white">
      <CosmicBackdrop scrollYProgress={scrollYProgress} disabled={!!reduceMotion} />

      <header className="relative z-20 flex items-center justify-between px-6 py-5 md:px-10 md:py-6">
        <Link to="/" className="font-editorial text-[22px] italic text-white/95">
          Vendora
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-[13px] text-white/80">
          <Link to="/vendors" className="hover:text-white transition-colors">
            Vendors
          </Link>
          <Link to="/real-events" className="hover:text-white transition-colors">
            Real events
          </Link>
          <span className="inline-flex items-center gap-1.5 text-white">
            Super agents
            <span
              className="text-[9px] tracking-widest rounded-full px-1.5 py-px"
              style={{ border: "0.5px solid rgba(255,255,255,0.4)" }}
            >
              NEW
            </span>
          </span>
        </nav>
        <Link
          to="/signup"
          className="rounded-full px-5 py-2.5 text-[13px] font-medium text-black"
          style={{ background: "linear-gradient(135deg, #fff 0%, #ffd9b8 100%)" }}
        >
          Activate agents
        </Link>
      </header>

      <Hero />

      <AgentsSection />

      <CapabilitiesGrid />

      <CTA />

      <footer className="relative z-10 border-t border-white/5 px-6 md:px-10 py-10 text-center text-[12px] text-white/40">
        Vendora · Super Agents · Powered by Opus 4.7
      </footer>
    </div>
  );
}

// ─── Cosmic backdrop ───────────────────────────────────────────────────
// Layered gradients + animated particles + a wide aurora ellipse that
// drifts as the user scrolls, giving the page a sense of depth.
function CosmicBackdrop({
  scrollYProgress,
  disabled,
}: {
  scrollYProgress: MotionValue<number>;
  disabled: boolean;
}) {
  const auroraY = useTransform(scrollYProgress, [0, 1], [0, -260]);
  const auroraRotate = useTransform(scrollYProgress, [0, 1], [0, 35]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Base radial — deep navy → near-black corners */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 20%, #15183b 0%, #0a0c1e 40%, #06080f 75%)",
        }}
      />

      {/* Aurora — amber + violet ellipse drifting up as user scrolls */}
      <motion.div
        aria-hidden
        style={
          disabled
            ? undefined
            : { y: auroraY, rotate: auroraRotate }
        }
        className="absolute -left-[10%] top-[18%] h-[700px] w-[140%]"
      >
        <div
          className="h-full w-full opacity-70"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(208,102,255,0.30) 0%, rgba(255,138,76,0.18) 35%, rgba(122,168,255,0.12) 60%, transparent 80%)",
            filter: "blur(40px)",
          }}
        />
      </motion.div>

      {/* Faint dot grid — gives the void a measurable scale */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, #000 12%, #000 80%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, #000 12%, #000 80%, transparent 100%)",
        }}
      />

      {/* Three faint floating orbs — far back, slow parallax via CSS */}
      <FloatingOrb top="20%" left="8%" size={140} color="#7aa8ff" delay={0} />
      <FloatingOrb top="55%" left="82%" size={180} color="#d066ff" delay={2} />
      <FloatingOrb top="78%" left="22%" size={120} color="#ff8a4c" delay={4} />
    </div>
  );
}

function FloatingOrb({
  top,
  left,
  size,
  color,
  delay,
}: {
  top: string;
  left: string;
  size: number;
  color: string;
  delay: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      animate={
        reduceMotion
          ? undefined
          : { y: [0, -22, 0], x: [0, 12, 0] }
      }
      transition={
        reduceMotion
          ? undefined
          : {
              duration: 14,
              repeat: Infinity,
              ease: "easeInOut",
              delay,
            }
      }
      className="absolute rounded-full"
      style={{
        top,
        left,
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color}55 0%, ${color}10 50%, transparent 70%)`,
        filter: "blur(20px)",
      }}
    />
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative z-10 px-6 md:px-10 pt-16 pb-24 md:pt-24 md:pb-32 text-center">
      {/* Pre-headline pill */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/80"
        style={{
          border: "0.5px solid rgba(255,255,255,0.25)",
          background: "rgba(255,255,255,0.04)",
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
        className="mx-auto mt-7 text-[18px] md:text-[20px] text-white/70"
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
        className="mt-10 flex items-center justify-center gap-3 text-[13px]"
      >
        <Link
          to="/signup"
          className="rounded-full px-6 py-3 font-medium text-black"
          style={{
            background: "linear-gradient(135deg, #fff 0%, #ffd9b8 100%)",
          }}
        >
          Activate your agents
        </Link>
        <a
          href="#meet"
          className="rounded-full px-6 py-3 text-white/90 hover:text-white transition-colors"
          style={{ border: "0.5px solid rgba(255,255,255,0.25)" }}
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
          border: "1px dashed rgba(255,255,255,0.18)",
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
          border: "0.5px solid rgba(255,255,255,0.25)",
          background:
            "conic-gradient(from 90deg, transparent 0%, rgba(208,102,255,0.25) 25%, transparent 50%, rgba(255,138,76,0.25) 75%, transparent 100%)",
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
        <p className="font-label text-[10px] uppercase tracking-[0.25em] text-white/50">
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
          className="mt-3 font-editorial italic text-white/80"
          style={{ fontSize: "clamp(20px, 2.5vw, 28px)", lineHeight: 1.2 }}
        >
          {agent.tagline}
        </p>
        <p className="mt-6 text-[15px] leading-relaxed text-white/65 max-w-md">
          {agent.about}
        </p>
        <ul className="mt-7 space-y-3">
          {agent.capabilities.map((c) => (
            <li
              key={c}
              className="flex items-start gap-3 text-[14px] text-white/85"
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

      {/* Main glass card */}
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
            "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 60%)",
          border: "0.5px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(20px)",
          boxShadow:
            "0 30px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Top header strip with codename + version */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}
        >
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">
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
                : { scale: [1, 1.18, 1], opacity: [0.6, 0.2, 0.6] }
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
              background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${agent.accent} 55%, #0a0c1e 100%)`,
              boxShadow: `0 0 60px ${agent.accent}88, inset -10px -16px 30px rgba(0,0,0,0.4)`,
            }}
          >
            <Icon className="h-9 w-9 text-white" strokeWidth={1.5} />
          </div>
        </div>

        {/* Footer status row */}
        <div className="absolute bottom-0 left-0 right-0 px-5 py-4 flex items-center justify-between text-[11px]">
          <span className="text-white/55">{agent.role}</span>
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
          border: `0.5px solid ${agent.accent}66`,
          transform: "rotate(8deg)",
          backdropFilter: "blur(4px)",
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-3 -left-5 rounded-2xl h-20 w-24 -z-10"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "0.5px solid rgba(255,255,255,0.08)",
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
      <p className="font-label text-[10px] uppercase tracking-[0.25em] text-white/50 text-center">
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
              background: "rgba(255,255,255,0.03)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
            }}
          >
            <p className="text-[14px] font-medium text-white">{it.label}</p>
            <p className="mt-1 text-[12px] text-white/55 leading-relaxed">
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
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="mt-10 flex items-center justify-center gap-3"
      >
        <Link
          to="/signup"
          className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[14px] font-medium text-black"
          style={{
            background: "linear-gradient(135deg, #fff 0%, #ffd9b8 100%)",
          }}
        >
          Activate your agents
          <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.div>
    </section>
  );
}
