// Agent picker — left list on /vendor/super-agents. Two surfaces:
//   - HILUX 2.7 (the always-on inbox agent, runs without the vendor)
//   - Vendora for Claude (the MCP connector, runs WITH the vendor in
//     their Claude client)
//
// Connectors-style: logo + name + selected highlight. Collapses to
// a horizontal scrollable strip on small screens.

import type { ComponentType, SVGProps } from "react";
import { HiluxLogo, VendoraForClaudeLogo } from "./AgentLogos";

export type AgentKey = "HILUX" | "VENDORA_FOR_CLAUDE";

interface PickerAgent {
  key: AgentKey;
  name: string;
  role: string;
  status: "live" | "soon";
  Logo: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
}

export const AGENT_LIST: PickerAgent[] = [
  { key: "HILUX", name: "HILUX 2.7", role: "Always On", status: "live", Logo: HiluxLogo },
  {
    key: "VENDORA_FOR_CLAUDE",
    name: "Vendora for Claude",
    role: "MCP connector",
    status: "live",
    Logo: VendoraForClaudeLogo,
  },
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
            const { Logo } = agent;
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
                <span className="w-8 h-8 rounded-lg overflow-hidden shrink-0 ring-1 ring-black/5">
                  <Logo className="w-full h-full block" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-tight truncate">
                    {agent.name}
                  </span>
                  <span
                    className={`block text-[10.5px] uppercase tracking-wider leading-tight mt-0.5 ${
                      isActive ? "text-white/65" : "text-black/50"
                    }`}
                  >
                    {agent.role}
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
