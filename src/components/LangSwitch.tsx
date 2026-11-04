"use client";
import { useRouter } from "next/navigation";

export default function LangSwitch({ current, label }: { current: string; label: string }) {
  const router = useRouter();
  return (
    <select className="ctl" aria-label={label} value={current} onChange={(e) => {
      document.cookie = `lang=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }}>
      <option value="en">EN</option><option value="ru">RU</option><option value="az">AZ</option>
    </select>
  );
}
