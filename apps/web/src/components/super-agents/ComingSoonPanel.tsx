// Placeholder right-pane content for agents that aren't built yet
// (RAPTOR, AXION). Shows the agent's name, tagline, and capability
// list with a "Coming soon" stamp so the marketing pitch lives in
// one place and the vendor knows what's on the way.

import { Bot, Sparkles } from "lucide-react";

interface Props {
  name: string;
  role: string;
  tagline: string;
  about: string;
  capabilities: string[];
  accent: string;
  Icon: typeof Bot;
}

export function ComingSoonPanel({
  name,
  role,
  tagline,
  about,
  capabilities,
  accent,
  Icon,
}: Props) {
  return (
    <div className="relative z-10 px-6 md:px-10 pt-24 md:pt-28 pb-12">
      <div className="max-w-3xl mx-auto rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.4)] p-6 md:p-8">
        <div className="flex items-start gap-4 mb-5">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
            style={{ background: accent + "26" }}
          >
            <Icon className="w-6 h-6" style={{ color: accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: accent + "d9" }}>
                {name} · {role}
              </p>
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full bg-black/10 text-black/70">
                <Sparkles className="w-2.5 h-2.5" />
                Coming soon
              </span>
            </div>
            <h3 className="font-editorial text-2xl md:text-3xl text-black leading-tight mt-1">
              {tagline}
            </h3>
            <p className="text-sm text-black/65 mt-2 leading-relaxed">
              {about}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-white/45 border border-black/5 p-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-black/55 mb-3">
            What it'll do
          </p>
          <ul className="space-y-2">
            {capabilities.map((cap, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-black/85">
                <span
                  className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                  style={{ background: accent }}
                />
                <span>{cap}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] text-black/45 italic mt-4 text-center">
          We're shipping HILUX first. {name.split(" ")[0]} is next.
        </p>
      </div>
    </div>
  );
}
