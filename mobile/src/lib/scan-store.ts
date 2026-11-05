// The scanner screen hands its result back to the screen that opened it.
let pending: { target: string; code: string } | null = null;
export function putScan(target: string, code: string) { pending = { target, code }; }
export function takeScan(target: string): string | null {
  if (pending?.target !== target) return null;
  const code = pending.code; pending = null; return code;
}
