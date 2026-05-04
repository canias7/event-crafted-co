import { useState } from "react";
import { motion } from "framer-motion";
import { Type, Palette, Image, Send, Download, Copy, Eye, ArrowLeft, LayoutDashboard, Store, CalendarDays, FileText, Mail, CheckSquare, ListTodo, CreditCard, Heart } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { MobileNav } from "@/components/shared/MobileNav";
import { SubNavTabs } from "@/components/shared/SubNavTabs";
import { INSPIRATION_HUB_TABS } from "@/data/hubTabs";
import { customerNavItems as navItems } from "@/data/navItems";

const templates = [
  { id: "elegant", name: "Elegant Wedding", style: "serif" },
  { id: "modern", name: "Modern Birthday", style: "sans" },
  { id: "minimal", name: "Minimalist Baby Shower", style: "minimal" },
  { id: "luxury", name: "Luxury Corporate", style: "luxury" },
];

export default function InvitationBuilder() {
  const [template, setTemplate] = useState("elegant");
  const [title, setTitle] = useState("Sarah & James");
  const [subtitle, setSubtitle] = useState("Request the pleasure of your company");
  const [date, setDate] = useState("Saturday, August 15, 2026");
  const [time, setTime] = useState("Six o'clock in the evening");
  const [venue, setVenue] = useState("The Grand Atelier");
  const [dressCode, setDressCode] = useState("Black Tie Optional");
  const [rsvp, setRsvp] = useState("RSVP by July 15");
  const [accentColor, setAccentColor] = useState("#598a72");

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar items={navItems} title="Customer" backPath="/" />

      <main id="main-content" className="flex-1 pb-20 lg:pb-0">
        <div className="border-b border-border bg-card px-4 md:px-8 py-4 sticky top-0 z-40 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-display text-xl">Invitation Builder</h1>
              <p className="text-sm text-muted-foreground">Design your perfect invitation</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9">
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Duplicate
              </Button>
              <Button variant="outline" size="sm" className="h-9">
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export
              </Button>
              <Button size="sm" className="h-9">
                <Send className="w-3.5 h-3.5 mr-1.5" /> Share
              </Button>
            </div>
          </div>
          <SubNavTabs tabs={INSPIRATION_HUB_TABS} />
        </div>

        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-65px)]">
          {/* Controls */}
          <div className="lg:w-80 border-r border-border bg-card p-5 space-y-6 overflow-y-auto">
            <div>
              <p className="font-label text-muted-foreground mb-3">Template</p>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`p-3 rounded-lg text-left text-xs font-medium transition-all ${
                      template === t.id
                        ? "bg-secondary ring-2 ring-accent"
                        : "bg-secondary/50 hover:bg-secondary"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="font-label text-muted-foreground mb-3">Content</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Title / Names</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 rounded-lg bg-secondary border-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Subtitle</label>
                  <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="h-9 rounded-lg bg-secondary border-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                  <Input value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg bg-secondary border-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Time</label>
                  <Input value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded-lg bg-secondary border-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Venue</label>
                  <Input value={venue} onChange={(e) => setVenue(e.target.value)} className="h-9 rounded-lg bg-secondary border-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Dress Code</label>
                  <Input value={dressCode} onChange={(e) => setDressCode(e.target.value)} className="h-9 rounded-lg bg-secondary border-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">RSVP Info</label>
                  <Input value={rsvp} onChange={(e) => setRsvp(e.target.value)} className="h-9 rounded-lg bg-secondary border-none text-sm" />
                </div>
              </div>
            </div>

            <div>
              <p className="font-label text-muted-foreground mb-3">Style</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-9 h-9 rounded-lg border-none cursor-pointer" />
                    <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-9 rounded-lg bg-secondary border-none text-sm flex-1" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="font-label text-muted-foreground mb-3">Sharing</p>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start h-9">
                  <Send className="w-3.5 h-3.5 mr-2" /> Share via Link
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start h-9">
                  <Mail className="w-3.5 h-3.5 mr-2" /> Share via Email
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start h-9">
                  <Image className="w-3.5 h-3.5 mr-2" /> Generate QR Code
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start h-9">
                  <Download className="w-3.5 h-3.5 mr-2" /> Print-Ready PDF
                </Button>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 flex items-center justify-center p-8 bg-secondary/30">
            <motion.div
              layout
              transition={{ type: "spring", duration: 0.4, bounce: 0 }}
              className="bg-card rounded-2xl card-shadow p-8 md:p-16 w-full max-w-lg"
            >
              <div className="border rounded-xl p-8 md:p-12 text-center space-y-5" style={{ borderColor: accentColor + "30" }}>
                <p className="font-label" style={{ color: accentColor }}>You're Invited</p>
                <h2 className="font-display text-3xl md:text-4xl">{title}</h2>
                <p className="text-muted-foreground text-sm">{subtitle}</p>
                <div className="w-12 h-[1px] mx-auto" style={{ backgroundColor: accentColor + "40" }} />
                <div className="text-sm space-y-1.5">
                  <p className="font-medium">{date}</p>
                  <p className="text-muted-foreground">{time}</p>
                  <p className="text-muted-foreground">{venue}</p>
                </div>
                <div className="w-12 h-[1px] mx-auto" style={{ backgroundColor: accentColor + "40" }} />
                <p className="text-xs text-muted-foreground">{dressCode} · {rsvp}</p>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      <MobileNav items={navItems} />
    </div>
  );
}
