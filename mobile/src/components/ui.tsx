import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle, type RefreshControlProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePrefs } from "@/lib/prefs";
import StatusStrip from "@/components/StatusStrip";

export function Screen({ children, scroll = true, refreshControl }: { children: ReactNode; scroll?: boolean; refreshControl?: React.ReactElement<RefreshControlProps> }) {
  const { c } = usePrefs();
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusStrip />
      {scroll ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>{children}</ScrollView>
      ) : <View style={{ flex: 1, padding: 16, gap: 12 }}>{children}</View>}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { c } = usePrefs();
  return <View style={[{ backgroundColor: c.card, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 8 }, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  const { c } = usePrefs();
  return <Text style={{ color: c.fg, fontSize: 20, fontWeight: "700" }}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  const { c } = usePrefs();
  return <Text style={{ color: c.fg, fontSize: 16, fontWeight: "700" }}>{children}</Text>;
}
export function Txt({ children, muted, bold, small, color }: { children: ReactNode; muted?: boolean; bold?: boolean; small?: boolean; color?: string }) {
  const { c } = usePrefs();
  return <Text style={{ color: color ?? (muted ? c.muted : c.fg), fontWeight: bold ? "700" : "400", fontSize: small ? 12 : 15 }}>{children}</Text>;
}
export function Err({ children }: { children: ReactNode }) {
  const { c } = usePrefs();
  return children ? <Text style={{ color: c.danger }}>{children}</Text> : null;
}

export function Btn({ title, onPress, kind = "primary", disabled, busy }: { title: string; onPress: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean; busy?: boolean }) {
  const { c } = usePrefs();
  const bg = kind === "primary" ? c.accent : kind === "danger" ? c.danger : "transparent";
  const fg = kind === "ghost" ? c.accent : c.accentFg;
  return (
    <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: bg, borderColor: c.accent, borderWidth: kind === "ghost" ? 1 : 0, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: "600", fontSize: 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...p }: TextInputProps & { label?: string }) {
  const { c } = usePrefs();
  const [show, setShow] = useState(false);
  const secret = p.secureTextEntry === true;   // password fields get an eye button to see what was typed
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text> : null}
      <View>
        <TextInput placeholderTextColor={c.muted} {...p} secureTextEntry={secret && !show}
          style={[{ color: c.fg, backgroundColor: c.bg, borderColor: c.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }, p.multiline ? { minHeight: 90, textAlignVertical: "top" } : null, secret ? { paddingRight: 48 } : null, p.style]} />
        {secret ? (
          <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel={show ? "Hide password" : "Show password"}
            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 46, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 18, opacity: show ? 1 : 0.6 }}>{show ? "🙈" : "👁"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Badge({ text, tone }: { text: string; tone?: "ok" | "warn" }) {
  const { c } = usePrefs();
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: c.chipBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: tone === "ok" ? c.ok : tone === "warn" ? c.danger : c.fg, fontSize: 12, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

// A row of selectable chips (language, theme, status, filters).
export function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const { c } = usePrefs();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)}
            style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: on ? c.accent : c.chipBg }}>
            <Text style={{ color: on ? c.accentFg : c.fg, fontWeight: on ? "700" : "400" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap }}>{children}</View>;
}

export function Loading() {
  const { c } = usePrefs();
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}><ActivityIndicator color={c.accent} size="large" /></View>;
}
