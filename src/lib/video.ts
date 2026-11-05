// YouTube / Vimeo links are shown inline; any other https link opens in a new tab.
export function embedUrl(u: string): string | null {
  try {
    const x = new URL(u);
    const h = x.hostname.replace(/^www\./, "");
    if (h === "youtu.be") return `https://www.youtube.com/embed/${x.pathname.slice(1)}`;
    if (h === "youtube.com" || h === "m.youtube.com") {
      const v = x.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      const m = x.pathname.match(/^\/(embed|shorts)\/([\w-]+)/);
      if (m) return `https://www.youtube.com/embed/${m[2]}`;
    }
    if (h === "vimeo.com") { const m = x.pathname.match(/^\/(\d+)/); if (m) return `https://player.vimeo.com/video/${m[1]}`; }
  } catch { /* not a URL */ }
  return null;
}

