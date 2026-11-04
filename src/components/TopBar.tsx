import Link from "next/link";
import Clock from "./Clock";
import ThemeSwitch from "./ThemeSwitch";
import LangSwitch from "./LangSwitch";
import NavLinks from "./NavLinks";

type Props = {
  brand: string;
  lang: string;
  labels: { system: string; light: string; dark: string; theme: string; language: string };
  nav?: { href: string; label: string }[];
  userName?: string;
  signOut?: () => Promise<void>;
  signOutLabel?: string;
};

export default function TopBar({ brand, lang, labels, nav, userName, signOut, signOutLabel }: Props) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">{brand}</Link>
      {nav && <NavLinks items={nav} />}
      <div className="right">
        <LangSwitch current={lang} label={labels.language} />
        <ThemeSwitch labels={labels} />
        <Clock />
        {userName && <span className="user">{userName}</span>}
        {signOut && <form action={signOut}><button className="btn ghost">{signOutLabel}</button></form>}
      </div>
    </header>
  );
}
