// Live HILUX demo embedded in the left column of the HILUX agent
// section on /super-agents.
//
// Floating conversation style — no card, no bubbles. Avatars + plain
// text floating directly on the page wash, host (left, dark text) vs
// vendor-replying-via-HILUX (right, amber text). Day divider with
// hairlines. Sheer input pill below so visitors can still type and
// hijack the loop with their own message. Auto-script loops forever
// until the visitor sends a real message.

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip, Smile } from "lucide-react";

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
      "Hi! Yes, Sept 12 is open on my calendar. Where is the wedding taking place?",
  },
  { side: "user", text: "Charlotte, NC. Around 80 guests, ceremony at 4 PM." },
  {
    side: "agent",
    text:
      "Lovely — I shoot in Charlotte often. I'd recommend my 8-hour package for that size.",
  },
  { side: "user", text: "What does that include?" },
  {
    side: "agent",
    text:
      "Two photographers, 600+ edited images delivered in 4 weeks, and an engagement session.",
  },
  { side: "user", text: "Sounds perfect. Can I see some samples?" },
  {
    side: "agent",
    text:
      "Of course — three full galleries are on their way to your inbox. Shall I hold Sept 12?",
  },
  { side: "user", text: "Yes please!" },
  { side: "agent", text: "Done. Soft hold placed. Looking forward to it. ✦" },
];

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

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  // Auto-script loops forever. Visitor typing a real message flips
  // demoRef.current = false and the loop exits permanently.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await sleep(700);
      while (!cancelled && demoRef.current) {
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
        await sleep(3500);
        if (cancelled || !demoRef.current) return;
        setMsgs([]);
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
      className="mx-auto flex flex-col"
      style={{ width: "100%", maxWidth: 560, minHeight: 480 }}
    >
      {/* Floating conversation — no card, no bubbles */}
      <div
        ref={scrollRef}
        className="flex flex-col gap-5 overflow-y-auto no-scrollbar"
        style={{ minHeight: 380, maxHeight: 520, paddingRight: 4 }}
      >
        <DayDivider label="TODAY" />
        {msgs.map((m) => (
          <FloatingMsg key={m.id} msg={m} />
        ))}
      </div>

      {/* Sheer input pill — still here so visitors can hijack the loop */}
      <div className="mt-6">
        <div
          className="flex items-center gap-2 pl-4 pr-1 py-1 rounded-full transition-colors"
          style={{
            background: "rgba(255,255,255,0.32)",
            border: "0.5px solid rgba(255,138,76,0.22)",
            backdropFilter: "blur(8px)",
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

      <style>{`
        @keyframes hiluxMsgIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes hiluxTypingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-4 justify-center text-[10px] uppercase font-medium"
      style={{
        letterSpacing: "2px",
        color: "rgba(26,22,18,0.35)",
        margin: "4px 0 4px",
      }}
    >
      <span
        style={{
          width: 60,
          height: "0.5px",
          background: "rgba(0,0,0,0.15)",
        }}
      />
      <span>{label}</span>
      <span
        style={{
          width: 60,
          height: "0.5px",
          background: "rgba(0,0,0,0.15)",
        }}
      />
    </div>
  );
}

function FloatingMsg({ msg }: { msg: ChatMsg }) {
  const isAgent = msg.side === "agent";
  return (
    <div
      className={`flex gap-3 max-w-[90%] ${
        isAgent ? "self-end flex-row-reverse" : "self-start"
      }`}
      style={{ animation: "hiluxMsgIn 0.5s ease-out" }}
    >
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1"
        style={
          isAgent
            ? {
                background: "linear-gradient(135deg, #ff8a4c 0%, #c4541e 100%)",
                color: "#fff",
                fontSize: 14,
                boxShadow: "0 4px 16px rgba(255,138,76,0.35)",
              }
            : {
                background: "rgba(0,0,0,0.06)",
                color: "#1a1612",
                fontSize: 9.5,
                fontWeight: 500,
                letterSpacing: "0.3px",
                border: "0.5px solid rgba(0,0,0,0.08)",
              }
        }
      >
        <span className={isAgent ? "font-editorial italic" : ""}>
          {isAgent ? "NP" : "H123"}
        </span>
      </div>
      <div className={`flex flex-col gap-1.5 ${isAgent ? "items-end" : ""}`}>
        <div
          className="text-[11px] font-medium inline-flex items-center gap-1.5 px-1"
          style={{
            color: isAgent ? "#c4541e" : "rgba(26,22,18,0.5)",
          }}
        >
          {isAgent ? "North & Pine Studio" : "Host 123"}
          {isAgent && (
            <span
              className="uppercase font-medium rounded-[3px] px-1.5 py-px"
              style={{
                fontSize: "8.5px",
                letterSpacing: "0.8px",
                background: "rgba(255,138,76,0.1)",
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
            className="flex items-center gap-1.5 px-1 py-2"
          >
            <Dot agent={isAgent} delay="0s" />
            <Dot agent={isAgent} delay="0.15s" />
            <Dot agent={isAgent} delay="0.3s" />
          </div>
        ) : (
          <p
            className="px-1"
            style={{
              fontSize: 15,
              lineHeight: 1.55,
              maxWidth: 420,
              color: isAgent ? "#c4541e" : "#1a1612",
              textAlign: isAgent ? "right" : "left",
              margin: 0,
            }}
          >
            {msg.text}
          </p>
        )}
        {msg.time && (
          <div
            className="text-[10.5px] px-1"
            style={{
              color: "rgba(26,22,18,0.35)",
              letterSpacing: "0.5px",
            }}
          >
            {msg.time}
          </div>
        )}
      </div>
    </div>
  );
}

function Dot({ agent, delay }: { agent: boolean; delay: string }) {
  return (
    <span
      className="rounded-full"
      style={{
        width: 8,
        height: 8,
        background: agent ? "#c4541e" : "rgba(26,22,18,0.4)",
        animation: "hiluxTypingBounce 1.2s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
