// Agent picker — vertical list of HILUX / RAPTOR / AXION on the
// left of /vendor/super-agents. Tap one to swap the right pane.
// Connectors-style: icon + name + selected highlight, nothing else.
// Collapses to a horizontal scrollable strip on small screens.

import { Bot, ImagePlus, Sparkles } from "lucide-react";

export type AgentKey = "HILUX" | "RAPTOR" | "AXION";

interface PickerAgent {
  key: AgentKey;
  name: string;
  role: string;
  status: "live" | "soon";
  Icon: typeof Bot;
  accent: string;
}

export const AGENT_LIST: PickerAgent[] = [
  { key: "HILUX", name: "HILUX 2.7", role: "Always On", status: "live", Icon: Bot, accent: "#ff8a4c" },
  { key: "RAPTOR", name: "RAPTOR 3.5", role: "Wordsmith", status: "soon", Icon: Sparkles, accent: "#7aa8ff" },
  { key: "AXION", name: "AXION 9.1", role: "Visuals", status: "soon", Icon: ImagePlus, accent: "#d066ff" },
];

interface Props {
  selected: AgentKey;
  onSelect: (key: AgentKey) => void;
}

export function AgentPicker({ selected, onSelect }: Props) {
  return (
    <aside
      className="md:w-64 shrink-0 md:border-r md:border-black/10 md:bg-white/[0.04] md:backdrop-blur-xl md:min-h-[calc(100vh-0px)]"
    >
      <div className="px-4 md:px-5 pt-6 md:pt-28 pb-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-black/55 mb-3 px-1">
          Agents
        </p>
        <nav className="flex md:flex-col gap-1.5 md:gap-0.5 overflow-x-auto md:overflow-visible -mx-1 px-1">
          {AGENT_LIST.map((agent) => {
            const isActive = selected === agent.key;
            const { Icon } = agent;
            return (
              <button
                key={agent.key}
                type="button"
                onClick={() => onSelect(agent.key)}
                className={`shrink-0 md:shrink flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
                  isActive
                    ? "bg-black text-white"
                    : "bg-white/55 md:bg-transparent text-black hover:bg-white/70 md:hover:bg-white/40"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.12)" : agent.accent + "26",
                  }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: isActive ? "#fff" : agent.accent }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-tight truncate">
                    {agent.name}
                  </span>
                  <span className={`block text-[10.5px] uppercase tracking-wider leading-tight mt-0.5 ${isActive ? "text-white/65" : "text-black/50"}`}>
                    {agent.role}
                    {agent.status === "soon" ? " · Coming soon" : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
