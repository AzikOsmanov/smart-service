import "./globals.css";
export const metadata = { title: "Smart Service" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><div className="wrap">{children}</div></body></html>;
}
