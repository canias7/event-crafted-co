// Live HILUX demo embedded under the HILUX agent section on
// /super-agents. Shows a vendor inbox (North & Pine Studio) with
// Hilux replying on behalf of the vendor — first auto-plays a
// scripted conversation, then lets the visitor type and get
// keyword-aware replies live.
//
// Ported from a standalone HTML mockup (apps/web/public/agents/
// hilux_chat_vendor.html if checked in). Visual treatment matches
// the page's amber palette and the Cormorant Garamond italic
// vendor name treatment via the existing font-editorial class.

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bolt,
  MapPin,
  Minus,
  Paperclip,
  Smile,
  Star,
  Tag,
  X,
} from "lucide-react";

type Side = "user" | "agent";

interface ChatMsg {
  id: string;
  side: Side;
  text: string;
  time: string;
  typing?: boolean;
}

const DEMO_SCRIPT: Array<{ side: Side; text: string }> = [
  { side: "user", text: "Hi! Are you available for a wedding on Sept 12?" },
  {
    side: "agent",
    text:
      "Hi! Yes, Sept 12 is currently open on my calendar. Where is the wedding taking place?",
  },
  { side: "user", text: "Charlotte, NC. Around 80 guests, ceremony at 4 PM" },
  {
    side: "agent",
    text:
      "Lovely — I shoot regularly in the Charlotte area. For 80 guests with a 4 PM ceremony, I'd recommend my 8-hour package: getting-ready coverage through the first dances.",
  },
  { side: "user", text: "What does that include? And how much?" },
  {
    side: "agent",
    text:
      "The 8-hour package is $3,400. It includes two photographers, 600+ edited high-res images delivered in 4 weeks, an online gallery, and a 30-min engagement session beforehand.",
  },
  { side: "user", text: "Sounds great! Can I see some samples from past weddings?" },
  {
    side: "agent",
    text:
      "Of course — I'll send over three full galleries: one Tuscan-style, one outdoor garden, one sunset ceremony. Want me to put a soft hold on Sept 12 while you review?",
  },
  { side: "user", text: "Yes please, that would be perfect" },
  {
    side: "agent",
    text:
      "Done — Sept 12 is now on soft hold for 7 days. Galleries are on their way to your inbox. Talk soon!",
  },
  { side: "user", text: "Thank you so much!" },
  { side: "agent", text: "Anytime — looking forward to it. ✦" },
];

// Keyword-aware fallback replies for manual chatting after the demo
// finishes. Each pattern returns one canned response in the vendor's
// voice. Order matters — earlier patterns win.
function getReply(text: string): string {
  const t = text.toLowerCase().trim();
  if (/^(hi|hello|hey|yo|sup|hola)\b/.test(t))
    return "Hi! Thanks for reaching out — I'm North & Pine Studio. How can I help?";
  if (
    /(available|free|book|date|when|sept|sep |october|nov|dec|jan|feb|march|april|may|june|july|aug)/.test(
      t,
    )
  )
    return "I'll check my calendar. What date and city are you looking at?";
  if (/(price|cost|how much|fee|charge|rate|package|budget)/.test(t))
    return "My packages start at $2,800 for a 4-hour session and go up to $4,800 for full-day wedding coverage. Want me to share the full breakdown?";
  if (/(what (do|are) you|service|provide|offer|do you do|specialty)/.test(t))
    return "I'm a wedding and editorial photographer based in Asheville. I shoot weddings, engagements, and small private events across NC.";
  if (/(film|digital|style|how do you shoot|gear|camera|aesthetic|look|edit)/.test(t))
    return "Primarily digital with selective 35mm film. My style leans editorial — warm tones, candid moments, lots of natural light.";
  if (/(deliver|turnaround|when.*ready|how long|gallery|edit|finish)/.test(t))
    return "Galleries are delivered in 4 weeks. You'll get 600+ edited high-res images in a private online gallery you can download and share.";
  if (/(engagement|portrait|pre-wedding|couple)/.test(t))
    return "Yes — engagement sessions are 30 mins and included free with any wedding package. We can shoot in Asheville, Charlotte, or anywhere in between.";
  if (/(portfolio|sample|past|see|gallery|example|work|previous)/.test(t))
    return "Of course — I can send three full galleries that match your vibe. Just tell me a bit about your event style.";
  if (/(travel|charlotte|asheville|raleigh|charleston|where|location|outside|fly)/.test(t))
    return "I'm based in Asheville and travel anywhere in NC for free. Out-of-state requires a small travel fee.";
  if (/(contract|deposit|reserve|hold|sign|pay)/.test(t))
    return "Standard deposit is 25% to reserve the date, balance due two weeks before the event. I can send the contract through Vendora.";
  if (/(how many hours|coverage|long|duration|6 hour|8 hour|all day)/.test(t))
    return "Most weddings book the 8-hour package, which covers getting-ready through the first dances. I also offer 4-hour and 10-hour options.";
  if (/(second|two photographers|partner|assistant)/.test(t))
    return "Yes — my 8-hour and 10-hour packages include a second photographer. That way we can cover both partners getting ready, plus capture more angles during the ceremony.";
  if (/(thank|thanks|appreciate)/.test(t))
    return "Of course! Let me know if you have any other questions.";
  if (/(bye|goodbye|talk later)/.test(t))
    return "Take care! Feel free to reach back out anytime.";
  return "Good question — could you tell me a bit more about your event? Date, location, and guest count help me give you the best answer.";
}

function formatTime(d: Date = new Date()) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function HiluxChatDemo() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const demoRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll on every new message.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  // Auto-demo. Plays once on mount; canceled the moment the user
  // sends a real message.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sleep(800);
      for (const step of DEMO_SCRIPT) {
        if (cancelled || !demoRef.current) return;
        const typingId = uid();
        setMsgs((m) => [
          ...m,
          { id: typingId, side: step.side, text: "", time: "", typing: true },
        ]);
        const typingTime = Math.min(2200, 700 + step.text.length * 18);
        await sleep(typingTime);
        if (cancelled || !demoRef.current) return;
        setMsgs((m) =>
          m
            .filter((x) => x.id !== typingId)
            .concat({
              id: uid(),
              side: step.side,
              text: step.text,
              time: formatTime(),
            }),
        );
        await sleep(900);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function send() {
    const text = input.trim();
    if (!text) return;
    demoRef.current = false;
    setMsgs((m) => m.filter((x) => !x.typing));
    setMsgs((m) =>
      m.concat({ id: uid(), side: "user", text, time: formatTime() }),
    );
    setInput("");
    inputRef.current?.focus();

    setTimeout(() => {
      const typingId = uid();
      setMsgs((m) =>
        m.concat({
          id: typingId,
          side: "agent",
          text: "",
          time: "",
          typing: true,
        }),
      );
      const reply = getReply(text);
      const delay = Math.min(1500, 600 + reply.length * 18);
      setTimeout(() => {
        setMsgs((m) =>
          m
            .filter((x) => x.id !== typingId)
            .concat({
              id: uid(),
              side: "agent",
              text: reply,
              time: formatTime(),
            }),
        );
      }, delay);
    }, 400);
  }

  return (
    <div
      className="mx-auto flex flex-col bg-white"
      style={{
        width: "100%",
        maxWidth: 460,
        height: 660,
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 20,
        boxShadow:
          "0 16px 48px rgba(255,138,76,0.18), 0 4px 12px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}
    >
      {/* HEADER — the vendor is identified, Hilux is the reply engine */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
        <div className="flex items-center gap-3">
          <div className="relative w-[42px] h-[42px] flex items-center justify-center">
            <div
              className="w-full h-full rounded-full flex items-center justify-center text-white font-editorial italic text-[17px]"
              style={{
                background:
                  "linear-gradient(135deg, #ff8a4c 0%, #c4541e 100%)",
                letterSpacing: "0.5px",
              }}
            >
              NP
            </div>
            <span
              className="absolute bottom-0 right-0 rounded-full"
              style={{
                width: 11,
                height: 11,
                background: "#34d058",
                border: "2px solid #fff",
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2 font-editorial italic text-[17px] text-[#1a1612]">
              North &amp; Pine Studio
              <span
                className="text-[9px] uppercase font-medium rounded-[4px] px-1.5 py-px not-italic"
                style={{
                  letterSpacing: 1,
                  color: "#c4541e",
                  background: "rgba(255,138,76,0.1)",
                  border: "0.5px solid rgba(255,138,76,0.3)",
                  fontFamily: "inherit",
                }}
              >
                PHOTOGRAPHY
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[rgba(26,22,18,0.55)]">
              <span
                className="rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  background: "#ff8a4c",
                  boxShadow: "0 0 6px #ff8a4c",
                }}
              />
              Replying via{" "}
              <span className="font-editorial italic text-[#c4541e] font-medium">
                Hilux
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[rgba(26,22,18,0.5)] hover:bg-black/[0.04] hover:text-[#1a1612] transition-colors"
            aria-label="Minimize"
          >
            <Minus className="w-[17px] h-[17px]" />
          </button>
          <button
            type="button"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[rgba(26,22,18,0.5)] hover:bg-black/[0.04] hover:text-[#1a1612] transition-colors"
            aria-label="Close"
          >
            <X className="w-[17px] h-[17px]" />
          </button>
        </div>
      </div>

      {/* Vendor meta strip */}
      <div
        className="flex items-center justify-between px-4 py-2.5 text-[11.5px] text-[rgba(26,22,18,0.7)] border-b border-black/[0.04]"
        style={{ background: "rgba(255,138,76,0.05)" }}
      >
        <div className="flex items-center gap-3.5">
          <span className="flex items-center gap-1">
            <MapPin className="w-[13px] h-[13px] text-[#c4541e]" />
            Asheville, NC
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-[13px] h-[13px] fill-[#c4541e] text-[#c4541e]" />
            <span className="text-[#c4541e] font-medium">5.0</span>
          </span>
          <span className="flex items-center gap-1">
            <Tag className="w-[13px] h-[13px] text-[#c4541e]" />
            From $2,800
          </span>
        </div>
        <span className="flex items-center gap-1">
          <Bolt className="w-[13px] h-[13px] text-[#c4541e]" />
          Replies in ~1 min
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-3"
      >
        <div className="text-center text-[11px] text-[rgba(26,22,18,0.4)] mb-2">
          Today
        </div>
        {msgs.map((m) => (
          <MsgRow key={m.id} msg={m} />
        ))}
      </div>

      {/* Input bar */}
      <div className="px-4 pt-3.5 pb-4 border-t border-black/[0.06]">
        <div
          className="flex items-center gap-2 pl-4 pr-1 py-1 rounded-full transition-colors"
          style={{
            background: "#f7f5f1",
            border: "1px solid transparent",
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "#ff8a4c";
            (e.currentTarget as HTMLDivElement).style.background = "#fff";
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor =
              "transparent";
            (e.currentTarget as HTMLDivElement).style.background = "#f7f5f1";
          }}
        >
          <button
            type="button"
            className="w-[30px] h-[30px] flex items-center justify-center text-[rgba(26,22,18,0.4)] hover:text-[#c4541e]"
            aria-label="Attach"
          >
            <Paperclip className="w-[15px] h-[15px]" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message…"
            className="flex-1 bg-transparent border-none outline-none text-[14px] text-[#1a1612] py-2"
            style={{ fontFamily: "inherit" }}
          />
          <button
            type="button"
            className="w-[30px] h-[30px] flex items-center justify-center text-[rgba(26,22,18,0.4)] hover:text-[#c4541e]"
            aria-label="Emoji"
          >
            <Smile className="w-[15px] h-[15px]" />
          </button>
          <button
            type="button"
            onClick={send}
            className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-white hover:scale-105 transition-transform"
            style={{
              background: "linear-gradient(135deg, #ff8a4c, #c4541e)",
              border: "none",
            }}
            aria-label="Send"
          >
            <ArrowUp className="w-[14px] h-[14px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MsgRow({ msg }: { msg: ChatMsg }) {
  const isAgent = msg.side === "agent";
  const avatar = isAgent ? "NP" : "H123";
  return (
    <div
      className={`flex gap-2.5 max-w-[85%] ${
        isAgent ? "self-end flex-row-reverse" : "self-start"
      }`}
      style={{ animation: "msgIn 0.3s ease-out" }}
    >
      <div
        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
        style={
          isAgent
            ? {
                background: "linear-gradient(135deg, #ff8a4c 0%, #c4541e 100%)",
                color: "#fff",
                fontSize: 14,
              }
            : {
                background: "#f0eee9",
                color: "#1a1612",
                fontSize: 9.5,
                fontWeight: 500,
                letterSpacing: "0.3px",
              }
        }
      >
        <span className={isAgent ? "font-editorial italic" : ""}>{avatar}</span>
      </div>
      <div className={`flex flex-col gap-1 ${isAgent ? "items-end" : ""}`}>
        <div
          className={`text-[11px] font-medium inline-flex items-center gap-1.5 px-1.5 ${
            isAgent ? "text-[#c4541e]" : "text-[rgba(26,22,18,0.55)]"
          }`}
        >
          {isAgent ? "North & Pine Studio" : "Host 123"}
          {isAgent && (
            <span
              className="text-[8.5px] uppercase font-medium rounded-[3px] px-1.5 py-px"
              style={{
                letterSpacing: "0.8px",
                background: "rgba(255,138,76,0.12)",
                color: "#c4541e",
                border: "0.5px solid rgba(255,138,76,0.3)",
              }}
            >
              AI · HILUX
            </span>
          )}
        </div>
        {msg.typing ? (
          <div
            className="flex items-center gap-1 px-4 py-3.5 rounded-[16px]"
            style={
              isAgent
                ? {
                    background:
                      "linear-gradient(135deg, #ff8a4c 0%, #c4541e 100%)",
                    borderBottomRightRadius: 4,
                  }
                : {
                    background: "#f0eee9",
                    borderBottomLeftRadius: 4,
                  }
            }
          >
            <Dot agent={isAgent} delay="0s" />
            <Dot agent={isAgent} delay="0.15s" />
            <Dot agent={isAgent} delay="0.3s" />
          </div>
        ) : (
          <div
            className="px-3.5 py-2.5 text-[14px] leading-[1.5] break-words"
            style={
              isAgent
                ? {
                    background:
                      "linear-gradient(135deg, #ff8a4c 0%, #c4541e 100%)",
                    color: "#fff",
                    borderRadius: 16,
                    borderBottomRightRadius: 4,
                  }
                : {
                    background: "#f0eee9",
                    color: "#1a1612",
                    borderRadius: 16,
                    borderBottomLeftRadius: 4,
                  }
            }
          >
            {msg.text}
          </div>
        )}
        {msg.time && (
          <div className="text-[10.5px] text-[rgba(26,22,18,0.4)] px-1.5">
            {msg.time}
          </div>
        )}
      </div>

      {/* Keyframes — scoped, defined once per row mount (cheap) */}
      <style>{`
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function Dot({ agent, delay }: { agent: boolean; delay: string }) {
  return (
    <span
      className="rounded-full"
      style={{
        width: 7,
        height: 7,
        background: agent ? "rgba(255,255,255,0.9)" : "rgba(26,22,18,0.45)",
        animation: "typingBounce 1.2s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
