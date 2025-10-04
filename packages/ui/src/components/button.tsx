import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type * as React from "react";
import { forwardRef, useState } from "react";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm transition-colors duration-250 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-secondary-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        text: "text-primary",
        destructiveOutline: "text-destructive shadow-sm",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        iconExpand: "h-9 transition-all duration-300",
        text: "p-0 text-sm",
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
  isLoading?: boolean;
  icon?: React.ReactNode;
  href?: string;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading,
      icon,
      href,
      children,
      ...props
    },
    ref,
  ) => {
    const [isHovered, setIsHovered] = useState(false);
    const Comp = asChild ? Slot : "button";
    const isIconExpandVariant = size === "iconExpand";

    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        onClick={href ? () => window.open(href, "_blank") : props.onClick}
        className={cn(
          buttonVariants({ variant, size, className }),
          isIconExpandVariant && (isHovered ? "px-4 gap-2" : "px-2 gap-0"),
        )}
        disabled={isLoading || props.disabled}
        onMouseEnter={() => isIconExpandVariant && setIsHovered(true)}
        onMouseLeave={() => isIconExpandVariant && setIsHovered(false)}
        ref={ref}
        {...props}>
        {isLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : icon}
        {isIconExpandVariant && children ? (
          <span
            className={cn(
              "inline-block overflow-hidden whitespace-nowrap transition-all duration-300",
              isHovered ? "max-w-[200px] opacity-100" : "max-w-0 opacity-0",
            )}>
            {children}
          </span>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
