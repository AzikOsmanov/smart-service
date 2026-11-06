const headers = [
  { key: "X-Frame-Options", value: "DENY" },                       // the site cannot be shown inside another site's frame (clickjacking)
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
export default {
  serverExternalPackages: ["exceljs"],
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  poweredByHeader: false,
  async headers() { return [{ source: "/:path*", headers }]; },
};
