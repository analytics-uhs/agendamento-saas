import { Logo } from "@/components/ui/logo";
import { classes } from "@/lib/classes";

const sizes = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-10 w-10 rounded-xl",
  lg: "h-16 w-16 rounded-2xl",
};

export function BusinessLogo({ name, logoUrl, size = "md" }: { name: string; logoUrl: string | null; size?: keyof typeof sizes }) {
  if (!logoUrl) return <Logo name={name} size={size} />;
  return <span role="img" aria-label={`Logo de ${name}`} className={classes("shrink-0 bg-contain bg-center bg-no-repeat", sizes[size])} style={{ backgroundImage: `url(${JSON.stringify(logoUrl).slice(1, -1)})` }} />;
}
