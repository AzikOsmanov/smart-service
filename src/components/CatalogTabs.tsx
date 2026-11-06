import Link from "next/link";

// Same row of boxed tabs on the catalog, function library and technology guide pages, so it stays in place when switching.
export default function CatalogTabs({ active, showLibrary, S }: { active: "catalog" | "functions" | "guide"; showLibrary: boolean; S: Record<string, string> }) {
  const tabs = [
    { id: "catalog", href: "/catalog", label: S.catTitle },
    ...(showLibrary ? [{ id: "functions", href: "/catalog/functions", label: S.fnLibTitle }] : []),
    { id: "guide", href: "/guide", label: S.guideTitle },
  ];
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === active ? "page" : undefined}
          style={{ textDecoration: "none", padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border, #334155)", fontWeight: t.id === active ? 700 : 500, background: t.id === active ? "var(--accent, #2563eb)" : "transparent", color: t.id === active ? "#fff" : "inherit" }}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
