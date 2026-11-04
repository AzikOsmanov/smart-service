"use client";

export default function ConfirmButton({ children, message, className, name, value }: { children: React.ReactNode; message: string; className?: string; name?: string; value?: string }) {
  return <button className={className} name={name} value={value} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>{children}</button>;
}
