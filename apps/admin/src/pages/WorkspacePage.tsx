import { Link } from "react-router-dom";
import { ChevronRight, Mail, Sparkles } from "lucide-react";

// Workspace — internal tools area for the admin team. Unrelated to
// the marketplace (vendors / hosts / listings) data. The hub page
// just lists the tools that live under /workspace/*.

const TOOLS: Array<{
  to: string;
  label: string;
  description: string;
  icon: typeof Mail;
}> = [
  {
    to: "/workspace/email-scraping",
    label: "Email scraping",
    description:
      "Chat with the assistant — find contacts, send outreach, drop them into Email leads.",
    icon: Sparkles,
  },
  {
    to: "/workspace/email-leads",
    label: "Email leads",
    description:
      "Track contacts and outreach. Add, status, notes — no marketplace ties.",
    icon: Mail,
  },
];

export function WorkspacePage() {
  return (
    <div className="p-8">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-ink/50">
          Workspace
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Internal tools</h1>
        <p className="mt-2 text-sm text-ink/60">
          Admin-only utilities that don&apos;t touch marketplace data.
        </p>

        <ul className="mt-8 space-y-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <li key={tool.to}>
                <Link
                  to={tool.to}
                  className="group flex items-start gap-4 rounded-lg border border-ink/10 bg-white p-5 transition-colors hover:border-ink/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{tool.label}</p>
                    <p className="mt-0.5 text-sm text-ink/60">
                      {tool.description}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 self-center text-ink/30 transition-colors group-hover:text-ink/60" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
