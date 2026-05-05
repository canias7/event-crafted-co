import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Lightweight inline error shown below a form field. Pages that don't
// use react-hook-form can drop this in directly: `{error && <FieldError>{error}</FieldError>}`.
// Pair with `aria-invalid` + `aria-describedby` on the input for screen
// readers — the parent form is responsible for that wiring since it
// owns the field id.

interface Props {
  children: React.ReactNode;
  id?: string;
  className?: string;
}

export function FieldError({ children, id, className }: Props) {
  if (!children) return null;
  return (
    <p
      id={id}
      role="alert"
      className={cn(
        "flex items-center gap-1.5 text-xs text-destructive mt-1.5",
        className,
      )}
    >
      <AlertCircle className="w-3 h-3 flex-shrink-0" />
      <span>{children}</span>
    </p>
  );
}
