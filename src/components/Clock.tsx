"use client";
import { useEffect, useState } from "react";

export default function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="clock">&nbsp;</span>;
  return (
    <span className="clock" suppressHydrationWarning>
      {now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })} · {now.toLocaleTimeString([], { hour12: false })}
    </span>
  );
}
