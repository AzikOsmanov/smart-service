import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { usePrefs } from "@/lib/prefs";
import { FN_GROUPS, fnDesc, fnName, useFunctions } from "@/lib/pm";
import { Card, Field, H2, Screen, Txt } from "@/components/ui";

// Technology guide: the same function with its Dahua and UNV name and a short description.
export default function Guide() {
  const { t, lang, c } = usePrefs();
  const fns = useFunctions();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? fns.filter((f) => [f.name_en, f.name_ru, f.name_az, f.dahua_name, f.unv_name, f.desc_en, f.desc_ru, f.desc_az].some((x) => (x ?? "").toLowerCase().includes(term))) : fns;
  }, [fns, q]);
  return (
    <Screen>
      <Txt muted small>{t("x_guideHint")}</Txt>
      <Field value={q} onChangeText={setQ} placeholder={t("x_guideSearch")} autoCapitalize="none" autoCorrect={false} />
      {list.length === 0 && <Txt muted>{t("x_guideNone")}</Txt>}
      {FN_GROUPS.map((g) => {
        const items = list.filter((f) => f.grp === g);
        if (!items.length) return null;
        return (
          <Card key={g}>
            <H2>{t(`x_fnGrp_${g}` as never)}</H2>
            {items.map((f) => (
              <View key={f.id} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border }}>
                <Txt bold>{fnName(f, lang)}</Txt>
                {fnDesc(f, lang) ? <Txt muted small>{fnDesc(f, lang)}</Txt> : null}
                <Text style={{ color: c.fg, fontSize: 13 }}>Dahua: {f.dahua_name ?? "—"}</Text>
                <Text style={{ color: c.fg, fontSize: 13 }}>UNV: {f.unv_name ?? "—"}</Text>
              </View>
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}
