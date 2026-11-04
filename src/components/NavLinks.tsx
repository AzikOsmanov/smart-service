"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={"navlink" + (path === i.href || path.startsWith(i.href + "/") ? " active" : "")}>{i.label}</Link>
      ))}
    </nav>
  );
}
