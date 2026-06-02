import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
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
