// Tool schemas for the My Space chat function.
//
// Static JSON-schema definitions sent to Claude on every turn. Kept
// in a dedicated module so index.ts can stay focused on the request
// handler + streaming loop; this file is data, not behavior.
//
// To add a tool: append a schema here, add the dispatch case +
// handler in index.ts, and (if it mutates) add the name to
// WRITE_TOOL_NAMES. The frontend's TOOL_LABELS map controls the
// status-line text while the tool is running.

const TOOLS = [
  {
    name: "search_inquiries",
    description:
      "Search the vendor's host inquiries. Returns a list with summary fields (host name, event type, event date, status, lead score). Use when the vendor asks about specific leads, recent activity, or wants to filter by status/quality.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["new", "replied", "closed", "any"],
          description:
            "Filter by inquiry status. 'replied' covers any inquiry that's not new or closed. Default 'any'.",
        },
        lead_score: {
          type: "string",
          enum: ["hot", "warm", "cold", "any"],
          description: "Filter by AI-assessed lead quality. Default 'any'.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Max results to return. Default 10.",
        },
      },
    },
  },
  {
    name: "get_inquiry",
    description:
      "Get full details for a single inquiry: event details, budget, special requests, and the most recent ~10 messages in the thread.",
    input_schema: {
      type: "object",
      required: ["inquiry_id"],
      properties: {
        inquiry_id: {
          type: "string",
          description: "UUID of the inquiry to fetch.",
        },
      },
    },
  },
  {
    name: "check_availability",
    description:
      "Check if the vendor is available on a specific date. Returns whether the day is free, recurring-closed, manually blocked, or has an existing booking.",
    input_schema: {
      type: "object",
      required: ["date"],
      properties: {
        date: {
          type: "string",
          description: "Date to check, format YYYY-MM-DD.",
        },
      },
    },
  },
  {
    name: "get_business_info",
    description:
      "Look up structured info about the vendor's business — FAQs, portfolio, upcoming appointments, reviews, past bookings, team, subscription tier, or verification status. Pass `section` to pick what to fetch. Use this instead of asking the vendor to repeat themselves; treat results as authoritative.",
    input_schema: {
      type: "object",
      required: ["section"],
      properties: {
        section: {
          type: "string",
          enum: [
            "faqs",
            "portfolio",
            "appointments",
            "reviews",
            "past_bookings",
            "team",
            "subscription",
            "verification",
          ],
          description:
            "Which slice to return. faqs=Q&A pairs; portfolio=images; appointments=upcoming consultations/walkthroughs; reviews=released reviews; past_bookings=completed appointments; team=team members; subscription=tier+status; verification=insurance/license/ID docs.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description:
            "Max results for list-style sections. Default 12. Ignored for subscription / verification which return a single record. Also ignored for faqs / team which return everything.",
        },
        days: {
          type: "integer",
          minimum: 1,
          maximum: 180,
          description:
            "Only used when section='appointments' — look-ahead window in days. Default 30.",
        },
        status: {
          type: "string",
          enum: [
            "proposed",
            "accepted",
            "declined",
            "cancelled",
            "completed",
            "any",
          ],
          description:
            "Only used when section='appointments' — filter by status. Default 'any' (excludes cancelled + declined).",
        },
      },
    },
  },
  {
    name: "list_recent_notifications",
    description:
      "Return the signed-in vendor's most recent notifications (new inquiries, hot-lead alerts, reply notifications, etc.).",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Max notifications to return. Default 10.",
        },
        only_unread: {
          type: "boolean",
          description: "If true, return only notifications that haven't been read.",
        },
      },
    },
  },
  {
    name: "search_messages",
    description:
      "Full-text search across all of the vendor's host-conversation messages (both sides). Returns matching messages with surrounding context.",
    input_schema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Free-text query. Matched case-insensitively against message bodies.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Max matches to return. Default 10.",
        },
      },
    },
  },
  {
    name: "send_host_reply",
    description:
      "Send a message to a host on the vendor's behalf, posted into the host-vendor direct message thread for an inquiry. WRITE ACTION — only call after the vendor has confirmed the exact reply text. The message is attributed to the vendor (not flagged as AI-generated).",
    input_schema: {
      type: "object",
      required: ["inquiry_id", "body"],
      properties: {
        inquiry_id: { type: "string", description: "UUID of the inquiry." },
        body: {
          type: "string",
          description: "The exact message body to send to the host.",
        },
      },
    },
  },
  {
    name: "manage_appointment",
    description:
      "Create, update, or respond to an appointment with a host. WRITE ACTION — confirm date/time/kind with the vendor first. action='create' schedules a new one; 'update' reschedules/edits; 'accept' confirms a host-PROPOSED appointment; 'decline' declines a host-proposed one. (accept/decline just need appointment_id.)",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["create", "update", "accept", "decline"] },
        appointment_id: {
          type: "string",
          description: "UUID of the appointment. Required when action='update'.",
        },
        inquiry_id: {
          type: "string",
          description:
            "UUID of the inquiry the appointment is tied to. Required when action='create'.",
        },
        kind: {
          type: "string",
          enum: ["consultation", "walkthrough", "tasting", "fitting", "phone_call"],
          description: "Type of appointment. Required when action='create'.",
        },
        status: {
          type: "string",
          enum: ["proposed", "accepted", "declined", "cancelled", "completed"],
          description: "Only used when action='update'.",
        },
        scheduled_at: {
          type: "string",
          description:
            "Full ISO-8601 datetime (use the vendor's local time if known; otherwise ask). Required for create; optional for reschedule.",
        },
        duration_minutes: {
          type: "integer",
          minimum: 5,
          maximum: 480,
          description: "Default 60 on create.",
        },
        title: { type: "string" },
        location: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "update_inquiry_status",
    description:
      "Change the status on an inquiry (e.g. mark as replied, closed, declined). WRITE ACTION.",
    input_schema: {
      type: "object",
      required: ["inquiry_id", "status"],
      properties: {
        inquiry_id: { type: "string", description: "UUID of the inquiry." },
        status: {
          type: "string",
          enum: ["new", "replied", "closed", "declined"],
        },
      },
    },
  },
  {
    name: "manage_calendar",
    description:
      "Block or unblock the vendor's calendar. WRITE ACTION. action='block_date' marks one date unavailable; 'unblock_date' removes a manual block; 'block_range' blocks a contiguous range; 'recurring_block_weekday' marks a weekday permanently unavailable every week (e.g. never works Sundays); 'recurring_unblock_weekday' re-opens that weekday.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: [
            "block_date",
            "unblock_date",
            "block_range",
            "recurring_block_weekday",
            "recurring_unblock_weekday",
          ],
        },
        date: {
          type: "string",
          description:
            "YYYY-MM-DD. Required when action='block_date' or 'unblock_date'.",
        },
        start_date: {
          type: "string",
          description:
            "YYYY-MM-DD inclusive. Required when action='block_range'.",
        },
        end_date: {
          type: "string",
          description:
            "YYYY-MM-DD inclusive. Required when action='block_range'.",
        },
        day_of_week: {
          type: "integer",
          minimum: 0,
          maximum: 6,
          description:
            "0=Sunday … 6=Saturday. Required for recurring_block_weekday / recurring_unblock_weekday.",
        },
      },
    },
  },
  {
    name: "mark_notifications_read",
    description:
      "Mark notifications as read. Either pass specific notification IDs OR set all_unread=true to clear everything in one go. WRITE ACTION.",
    input_schema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Specific notification IDs to mark read.",
        },
        all_unread: {
          type: "boolean",
          description:
            "If true, mark every unread notification for this vendor as read.",
        },
      },
    },
  },
  {
    name: "create_payment_link",
    description:
      "Create a shareable VendoraPay payment link the vendor can send to a host (deposit, balance, retainer, etc.). Returns the public URL. WRITE ACTION — confirm amount + title with the vendor before calling.",
    input_schema: {
      type: "object",
      required: ["title", "amount_usd"],
      properties: {
        title: {
          type: "string",
          description:
            "Short label shown on the checkout page (e.g. 'Wedding photography deposit').",
        },
        amount_usd: {
          type: "number",
          description:
            "Amount in US dollars (e.g. 2000 for $2,000). Will be converted to cents server-side.",
        },
        description: {
          type: "string",
          description:
            "Optional longer description shown on the checkout page.",
        },
        host_email: {
          type: "string",
          description:
            "Optional email for the host paying — pre-fills checkout.",
        },
        expires_in_days: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description:
            "Optional expiry; link expires this many days from now.",
        },
      },
    },
  },
  // ─── More write tools ───────────────────────────────────────────
  {
    name: "toggle_auto_reply",
    description:
      "Flip the vendor's inbox auto-reply settings: either the master `enabled` switch or one of the action toggles (use_calendar, use_first_name, detect_frustration, decline_negotiation, offer_call, notify_on_reply, notify_on_hot_lead, daily_summary, cap_replies_per_inquiry). WRITE ACTION.",
    input_schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        action_key: {
          type: "string",
          enum: [
            "use_calendar",
            "use_first_name",
            "detect_frustration",
            "decline_negotiation",
            "offer_call",
            "notify_on_reply",
            "notify_on_hot_lead",
            "daily_summary",
            "cap_replies_per_inquiry",
          ],
        },
        value: { type: "boolean" },
      },
    },
  },
  {
    name: "manage_faq",
    description:
      "Add, update, or delete a vendor FAQ entry. WRITE ACTION — confirm the question + answer with the vendor first.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["add", "update", "delete"] },
        id: { type: "string", description: "Required for update/delete." },
        question: { type: "string" },
        answer: { type: "string" },
      },
    },
  },
  {
    name: "update_profile",
    description:
      "Edit fields on the vendor's profile (business name, bio, location, category, base price). WRITE ACTION — confirm the change with the vendor first.",
    input_schema: {
      type: "object",
      properties: {
        business_name: { type: "string" },
        bio: { type: "string" },
        location: { type: "string" },
        category: { type: "string" },
        base_price_usd: { type: "number" },
      },
    },
  },
  {
    name: "send_email",
    description:
      "Send an off-platform email via Resend on behalf of the vendor (from noreply@eventvendora.com). WRITE ACTION — show recipient + subject + body to the vendor before calling.",
    input_schema: {
      type: "object",
      required: ["to", "subject", "body"],
      properties: {
        to: { type: "string", description: "Recipient email." },
        subject: { type: "string" },
        body: { type: "string", description: "Plain text body." },
      },
    },
  },
  {
    name: "manage_scheduled_action",
    description:
      "List, schedule, or cancel future actions for the vendor. action='list' returns pending actions; action='schedule' queues a new one to run later (\"at 5pm send Jamie the contract\") — args shape matches the corresponding immediate tool (e.g. send_host_reply needs { inquiry_id, body }); action='cancel' removes one by id. WRITE ACTION when action='schedule' or 'cancel' — confirm everything with the vendor first.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["list", "schedule", "cancel"] },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Only used when action='list'. Default 20.",
        },
        run_at: {
          type: "string",
          description:
            "Full ISO datetime, e.g. 2026-05-27T17:00:00Z. Required when action='schedule'.",
        },
        kind: {
          type: "string",
          enum: ["send_host_reply", "send_email", "mark_notifications_read"],
          description:
            "What kind of action to schedule. Required when action='schedule'.",
        },
        args: {
          type: "object",
          description:
            "Action-specific args (same shape as the immediate version of the tool). Required when action='schedule'.",
        },
        id: {
          type: "string",
          description:
            "Scheduled-action id to cancel. Required when action='cancel'.",
        },
      },
    },
  },
  {
    name: "edit_image",
    description:
      "Restyle / edit an existing image (typically one the vendor just uploaded) by passing its URL + a prompt to gpt-image-2's edits endpoint. Returns the new image URL — render it inline in your reply as a Markdown image (e.g. `![](url)`) so the vendor sees the result. WRITE ACTION (consumes image-gen budget) — confirm the prompt with the vendor first.",
    input_schema: {
      type: "object",
      required: ["source_image_url", "prompt"],
      properties: {
        source_image_url: {
          type: "string",
          description: "Public URL of the source image to edit (e.g. an attachment the vendor uploaded).",
        },
        prompt: {
          type: "string",
          description: "What to change about the image (e.g. 'make it warmer and more cinematic').",
        },
      },
    },
  },
  {
    name: "set_chat_preferences",
    description:
      "Persist a free-form preferences blob on the vendor's profile that gets injected into every future My Space conversation (e.g. 'always sign as Jamie', 'reply formally to hosts', 'prefer Friday meetings'). Pass an empty string to clear. WRITE ACTION — confirm the exact text with the vendor first.",
    input_schema: {
      type: "object",
      required: ["preferences"],
      properties: {
        preferences: {
          type: "string",
          description: "Free-form text. Replaces any prior preferences.",
        },
      },
    },
  },
  // ─── Knowledge base ─────────────────────────────────────────────
  {
    name: "manage_knowledge",
    description:
      "Save, edit, or remove a durable fact about the vendor's business (pricing rules, services, brand voice, FAQs, policies). Use action='add' when the vendor says 'remember…' / 'from now on…' or shares a new fact; 'update' when they correct an existing entry; 'delete' when they say 'forget that' / 'remove…'. Existing entries are auto-loaded into the system prompt every turn — no need to list them. WRITE ACTION.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["add", "update", "delete"] },
        id: {
          type: "string",
          description:
            "Entry UUID. Required when action='update' or 'delete'.",
        },
        category: {
          type: "string",
          enum: ["pricing", "services", "brand_voice", "faq", "policies", "other"],
          description: "Required for action='add'.",
        },
        title: {
          type: "string",
          description:
            "Short label, 1-200 chars (e.g. 'Hourly rate'). Required for action='add'.",
        },
        content: {
          type: "string",
          description:
            "Full fact, 1-4000 chars. Required for action='add'.",
        },
      },
    },
  },
  // ─── Sales analytics ────────────────────────────────────────────
  {
    name: "get_sales_analytics",
    description:
      "Numeric reports about the vendor's sales. Pick a report: 'summary' (total revenue + per-month breakdown — render as a chart); 'repeat_hosts' (hosts who booked more than once); 'funnel' (inquiries received → quotes sent → bookings confirmed over a window). Render with a fenced ```chart code block when the shape is bar/line/pie-friendly.",
    input_schema: {
      type: "object",
      required: ["report"],
      properties: {
        report: {
          type: "string",
          enum: ["summary", "repeat_hosts", "funnel"],
        },
        since: {
          type: "string",
          enum: ["week", "month", "quarter", "year", "all_time"],
          description: "Time window. Used by 'summary' and 'funnel'. Default 'month'.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max rows for list-style reports ('repeat_hosts').",
        },
      },
    },
  },
  // ─── Bulk operations ────────────────────────────────────────────
  {
    name: "bulk_update_inquiry_status",
    description:
      "Set the same status on multiple inquiries at once. WRITE ACTION — confirm the inquiry_ids list with the vendor first.",
    input_schema: {
      type: "object",
      required: ["inquiry_ids", "status"],
      properties: {
        inquiry_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 },
        status: {
          type: "string",
          enum: ["new", "replied", "closed", "declined"],
        },
      },
    },
  },
  {
    name: "bulk_send_reply",
    description:
      "Send the same message body to multiple host threads. Each inquiry gets the body posted as a vendor-side message. WRITE ACTION — show the full body + exact recipient list to the vendor first.",
    input_schema: {
      type: "object",
      required: ["inquiry_ids", "body"],
      properties: {
        inquiry_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 25 },
        body: { type: "string" },
      },
    },
  },
  // ─── Summarization ──────────────────────────────────────────────
  {
    name: "summarize_inquiry_thread",
    description:
      "Collapse a host conversation thread into 3-5 bullet points (host's needs, key questions, current status, blockers). Uses Claude internally.",
    input_schema: {
      type: "object",
      required: ["inquiry_id"],
      properties: {
        inquiry_id: { type: "string" },
      },
    },
  },
  {
    name: "create_invoice",
    description:
      "Create a proper line-item invoice (separate from a simple payment link). Computes subtotal + tax + total server-side. Returns the public checkout URL. WRITE ACTION — confirm bill-to + items with the vendor first.",
    input_schema: {
      type: "object",
      required: ["bill_to_name", "items"],
      properties: {
        bill_to_name: { type: "string" },
        bill_to_email: { type: "string" },
        bill_to_phone: { type: "string" },
        bill_to_address: { type: "string" },
        due_date: {
          type: "string",
          description: "YYYY-MM-DD (optional).",
        },
        notes: { type: "string" },
        tax_rate_pct: {
          type: "number",
          description:
            "Tax percent applied to subtotal (e.g. 8.5 for 8.5%). Default 0.",
        },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          description: "Line items.",
          items: {
            type: "object",
            required: ["description", "quantity", "unit_price_usd"],
            properties: {
              description: { type: "string" },
              quantity: { type: "number", minimum: 0 },
              unit_price_usd: { type: "number", minimum: 0 },
            },
          },
        },
      },
    },
  },
  {
    name: "create_document",
    description:
      "Create a sendable CONTRACT or PROPOSAL from text YOU draft. First write the full document body in the chat — proposals: 'Prepared for [Client Name] · [Event Date] · [Venue / Location]', then a short intro, 'What's included' bullets, 'Investment' (<package> — [Total Amount]), and retainer/validity terms; contracts: concise numbered sections (Parties, Services, Payment, Cancellation, Rescheduling, Liability, Agreement) with [Client Name]/[Event Date]/[Venue / Location]/[Total Amount] placeholders and NO signature lines. Then call this with the final body to create the instance and return a shareable link (proposal → review-and-accept page; contract → e-signature page). For a CONTRACT you MUST pass recipient_email (or inquiry_id) so the signing code can reach the client. WRITE ACTION — confirm with the vendor first.",
    input_schema: {
      type: "object",
      required: ["kind", "title", "body"],
      properties: {
        kind: { type: "string", enum: ["contract", "proposal"] },
        title: { type: "string", description: "Short document title." },
        body: { type: "string", description: "The full document body text you drafted." },
        recipient_name: { type: "string", description: "Client's name (optional)." },
        recipient_email: {
          type: "string",
          description:
            "Client email — REQUIRED for a contract so the signing code reaches them; optional for a proposal.",
        },
        inquiry_id: {
          type: "string",
          description:
            "Optional inquiry UUID to link the document to; for contracts it binds the recipient from the host.",
        },
      },
    },
  },
  {
    name: "manage_contact",
    description:
      "View, add, or update the vendor's saved customers/contacts. action='list' searches by name/email; 'add' creates a contact; 'update' edits one by id. WRITE for add/update.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["list", "add", "update"] },
        id: { type: "string", description: "Contact UUID — required for update." },
        query: { type: "string", description: "Search text for action='list' (optional)." },
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        company: { type: "string" },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "manage_expense",
    description:
      "Track business expenses. action='list' returns recent expenses; 'add' records a new one. WRITE for add. (Refunds and payouts stay manual — refunds move money out and live payouts are in Stripe.)",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["list", "add"] },
        amount_usd: { type: "number", minimum: 0, description: "Expense amount in USD — required for add." },
        occurred_on: { type: "string", description: "YYYY-MM-DD; defaults to today." },
        category: { type: "string", description: "e.g. equipment, travel, software." },
        description: { type: "string" },
        paid_to: { type: "string", description: "Vendor/payee name." },
      },
    },
  },
  {
    name: "add_portfolio_image",
    description:
      "Add an image to the vendor's public portfolio/gallery. Pass the URL of an image (e.g. one you just generated or that the vendor uploaded) and it's uploaded to their portfolio. WRITE ACTION.",
    input_schema: {
      type: "object",
      required: ["image_url"],
      properties: {
        image_url: { type: "string", description: "Public URL of the image to add." },
        caption: { type: "string", description: "Optional caption." },
      },
    },
  },
  {
    name: "manage_listing",
    description:
      "Manage the vendor's listing lifecycle. action='get_status' returns the listing's approval status; 'submit_for_review' submits the listing to Vendora for approval so it can go live. (Use update_profile to edit listing fields like name, bio, category, price.) WRITE for submit_for_review.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["get_status", "submit_for_review"] },
      },
    },
  },
  {
    name: "manage_invoice",
    description:
      "Manage existing invoices. action='list' shows recent invoices + statuses; 'send' emails the invoice to its bill-to contact (and stamps it sent); 'mark_paid' marks an invoice paid (e.g. they paid by cash/transfer); 'cancel' voids an invoice. Identify the invoice by invoice_number (e.g. INV-2026-0007) or invoice_id. (Use create_invoice to make a new one.) WRITE for send/mark_paid/cancel — confirm with the vendor first.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["list", "send", "mark_paid", "cancel"] },
        invoice_number: { type: "string", description: "e.g. INV-2026-0007." },
        invoice_id: { type: "string", description: "Invoice UUID (alternative to invoice_number)." },
        to_email: { type: "string", description: "Optional override recipient for action='send'." },
      },
    },
  },
  {
    name: "list_documents",
    description:
      "List the contracts and proposals the vendor has sent, with their status (contracts: sent/awaiting vs signed; proposals: sent/awaiting vs accepted) and the shareable link. READ-ONLY.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["all", "contract", "proposal"],
          description: "Filter. Default 'all'.",
        },
      },
    },
  },
  {
    name: "list_listings",
    description:
      "List the vendor listings this account can manage, each with its id, name, and whether it's the one currently active for My Space. Use this when the account has more than one listing and you need to ask the vendor which to work on. READ-ONLY.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "set_active_listing",
    description:
      "Set which listing My Space works on for this account. Pass the vendor_id (from list_listings) of the listing the vendor chose. The choice persists across conversations until changed. Call this once the vendor tells you which listing to use; afterwards, everything you read or write applies to that listing.",
    input_schema: {
      type: "object",
      required: ["vendor_id"],
      properties: {
        vendor_id: {
          type: "string",
          description: "The id of the listing to make active (from list_listings).",
        },
      },
    },
  },
] as const;

export { TOOLS };
