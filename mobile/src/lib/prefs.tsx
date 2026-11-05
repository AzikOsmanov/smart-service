import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { TEXTS, fmt, type Key, type Lang } from "@/lib/i18n";
import { PALETTES, type Palette, type ThemeName } from "@/lib/theme";

type Prefs = { lang: Lang; theme: ThemeName; c: Palette; t: (k: Key, v?: Record<string, string | number | null | undefined>) => string; setLang: (l: Lang) => void; setTheme: (t: ThemeName) => void };
const Ctx = createContext<Prefs | null>(null);

function deviceLang(): Lang {
  const code = getLocales()[0]?.languageCode ?? "en";
  return code === "ru" ? "ru" : code === "az" ? "az" : "en";
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(deviceLang());
  const [theme, setThemeState] = useState<ThemeName>("navy");
  useEffect(() => {
    (async () => {
      try {
        const [l, th] = await Promise.all([AsyncStorage.getItem("lang"), AsyncStorage.getItem("theme")]);
        if (l === "en" || l === "ru" || l === "az") setLangState(l);
        if (th === "navy" || th === "dark" || th === "light") setThemeState(th);
      } catch { /* defaults */ }
    })();
  }, []);
  const value = useMemo<Prefs>(() => ({
    lang, theme, c: PALETTES[theme],
    t: (k, v) => fmt(TEXTS[lang][k] ?? TEXTS.en[k], v),
    setLang: (l) => { setLangState(l); AsyncStorage.setItem("lang", l).catch(() => {}); },
    setTheme: (x) => { setThemeState(x); AsyncStorage.setItem("theme", x).catch(() => {}); },
  }), [lang, theme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function usePrefs(): Prefs {
  const v = useContext(Ctx);
  if (!v) throw new Error("PrefsProvider missing");
  return v;
}
