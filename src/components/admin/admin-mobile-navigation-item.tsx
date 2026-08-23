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
  return <Link
    href={href ?? "#instalar"}
    className={className}
    onClick={onClick ? (event) => {
      event.preventDefault();
      onClick();
    } : undefined}
  >
    <Icon className="h-5 w-5" />
    <span className="max-w-[82px] truncate">{label}</span>
  </Link>;
}
