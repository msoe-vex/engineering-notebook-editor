import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type TextProps = HTMLAttributes<HTMLElement> & {
  as?: "p" | "span" | "div" | "label";
  variant?: "body" | "label" | "caption" | "overline";
  children?: ReactNode;
};

const textVariantClass: Record<NonNullable<TextProps["variant"]>, string> = {
  body: "text-nb-body text-nb-on-surface",
  label: "text-nb-label font-semibold text-nb-on-surface-variant",
  caption: "text-nb-caption text-nb-on-surface-variant",
  overline:
    "text-nb-caption font-semibold uppercase tracking-wider text-nb-on-surface-variant/70",
};

export function Text({
  as: Comp = "p",
  variant = "body",
  className,
  children,
  ...rest
}: TextProps) {
  return (
    <Comp className={cn(textVariantClass[variant], className)} {...rest}>
      {children}
    </Comp>
  );
}

type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3" | "h4";
  variant?: "display" | "title" | "section";
  children?: ReactNode;
};

const headingVariantClass: Record<NonNullable<HeadingProps["variant"]>, string> = {
  display: "text-nb-display font-bold tracking-tight text-nb-on-surface",
  title: "text-nb-title font-semibold text-nb-on-surface",
  section: "text-nb-body font-semibold text-nb-on-surface",
};

export function Heading({
  as,
  variant = "title",
  className,
  children,
  ...rest
}: HeadingProps) {
  const Comp = as || (variant === "display" ? "h1" : variant === "title" ? "h2" : "h3");
  return (
    <Comp className={cn(headingVariantClass[variant], className)} {...rest}>
      {children}
    </Comp>
  );
}
