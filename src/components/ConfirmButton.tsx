"use client";

export default function ConfirmButton({ children, message, className, name, value, formAction }: { children: React.ReactNode; message: string; className?: string; name?: string; value?: string; formAction?: (fd: FormData) => void | Promise<void> }) {
  return <button className={className} name={name} value={value} formAction={formAction} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>{children}</button>;
}
