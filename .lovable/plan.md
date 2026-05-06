## Goal
Replace the entire Calendar tab content with a clean, minimal blank monthly calendar grid (like the reference image).

## Changes — `src/pages/vendor/VendorAppointmentsPage.tsx`

Strip out everything currently on the page (appointments list, weekly availability, block-dates calendar, blocked-dates chips, busy-events sync, related Supabase queries, realtime, toggle logic) and replace with a single static-looking month calendar.

### New layout
- Keep `DashboardSidebar` + `MobileNav` shell and the page header ("Calendar").
- Center a large blank calendar:
  - Title "Month:" in a large display font (top-left of the card).
  - Small uppercase label "BLANK CALENDAR" centered above.
  - 7-column grid header: SUN, MON, TUE, WED, THU, FRI, SAT (small uppercase tracked labels).
  - 5 rows × 7 columns of empty bordered cells with a clean thin black border, white background, square aspect.
  - No dates, no events, no controls — purely the empty grid as in the reference.

### Cleanup
- Remove unused imports (`Calendar` from ui, `AppointmentsList`, `RecurringAvailabilityCard`, `Skeleton`, `Button`, `Loader2`, `X`, `toast`, `supabase`, `useRealtime`, `useAuth`, `useEffect`, `useMemo`, `useState`).
- Keep only `CalendarIcon` if used in header (optional) and `DashboardSidebar`, `MobileNav`, `navItems`.
- Component becomes a small presentational function — no data fetching.

No database or routing changes.