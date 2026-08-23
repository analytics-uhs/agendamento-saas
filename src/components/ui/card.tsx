import type { HTMLAttributes } from "react";
import { classes } from "@/lib/classes";

type CardElement = "article" | "div" | "header" | "section";
type CardPadding = "none" | "sm" | "md" | "lg";

export function Card({
  as: Component = "div",
  padding = "none",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: CardElement;
  padding?: CardPadding;
}) {
  return (
    <Component
      className={classes(
        "rounded-xl border bg-background",
        padding === "sm" && "p-4",
        padding === "md" && "p-4 sm:p-5",
        padding === "lg" && "p-5",
        className,
      )}
      {...props}
    />
  );
}
