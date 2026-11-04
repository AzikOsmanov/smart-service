import TopBar from "@/components/TopBar";
import { getT } from "@/lib/i18n";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = await getT();
  return (
    <>
      <TopBar brand="Acom Smart Service" lang={lang} labels={{ system: t("system"), light: t("light"), dark: t("dark"), theme: t("theme"), language: t("language") }} />
      <main className="page narrow">{children}</main>
    </>
  );
}
