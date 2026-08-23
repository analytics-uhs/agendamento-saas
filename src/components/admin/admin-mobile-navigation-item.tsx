"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { classes } from "@/lib/classes";
import { adminMobileNavItemClass } from "@/lib/admin-navigation";

type CommonProps = {
  label: string;
  Icon: LucideIcon;
  active?: boolean;
};

type AdminMobileNavigationItemProps = CommonProps & (
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void }
);

export function AdminMobileNavigationItem({ label, Icon, active = false, href, onClick }: AdminMobileNavigationItemProps) {
  const className = classes(adminMobileNavItemClass, active ? "text-primary" : "text-muted");
  const content = <><Icon className="h-5 w-5" /><span className="max-w-[82px] truncate">{label}</span></>;

  return href
    ? <Link href={href} className={className}>{content}</Link>
    : <button type="button" onClick={onClick} className={className}>{content}</button>;
}
