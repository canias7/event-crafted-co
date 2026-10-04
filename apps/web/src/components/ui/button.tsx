import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // The one button standard shared with both apps: a pill with a bold
  // label in three heights (36 / 44 / 52). Gold is the primary action.
  // Ink is for selection and status (active chips, done pills), never
  // for buttons.
  "relative overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: champagne fill, ink label. Disabled is solid muted
        // gold with the label still ink, not a faded button.
        default:
          "bg-gold text-foreground hover:bg-gold-hover disabled:bg-gold-muted disabled:opacity-100",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Secondary: white pill with the hairline border.
        outline:
          "border border-border bg-white text-foreground hover:bg-muted",
        secondary:
          "border border-border bg-white text-foreground hover:bg-muted",
        // Quiet: the label alone.
        ghost: "text-foreground hover:bg-muted",
        link: "text-foreground underline-offset-4 hover:text-accent hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-4 text-[13px]",
        lg: "h-[52px] px-7 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, onPointerDown, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const [ripples, setRipples] = React.useState<Ripple[]>([]);

    // Spawn a "wave" ripple at the click point. The ink uses currentColor
    // so it reads as a light wave on dark (default/destructive) buttons
    // and a dark wave on light (outline/ghost/secondary) ones — no
    // per-variant config needed. Sized to 2× the larger edge so it
    // sweeps fully across the button before fading.
    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      setRipples((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          x: e.clientX - rect.left - size / 2,
          y: e.clientY - rect.top - size / 2,
          size,
        },
      ]);
      onPointerDown?.(e);
    };

    const dropRipple = (id: number) =>
      setRipples((prev) => prev.filter((r) => r.id !== id));

    // Slot (asChild) renders into a single arbitrary child and can't host
    // the extra ripple layer, so those pass through untouched.
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          onPointerDown={onPointerDown}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onPointerDown={handlePointerDown}
        {...props}
      >
        {children}
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {ripples.map((r) => (
            <span
              key={r.id}
              className="btn-ripple-ink"
              style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
              onAnimationEnd={() => dropRipple(r.id)}
            />
          ))}
        </span>
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
