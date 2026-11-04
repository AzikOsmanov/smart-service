"use client";
import { useEffect, useRef, useState } from "react";

type Props = { name: string; defaultValue?: string; required?: boolean; placeholder?: string; minLength?: number };

// Serial number field: type it, scan the barcode / QR code with the camera, or take a photo of the label.
export default function SnInput({ name, defaultValue = "", required, placeholder, minLength }: Props) {
  const [value, setValue] = useState(defaultValue);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const stop = useRef<(() => void) | null>(null);

  const clean = (s: string) => s.replace(/\s+/g, "").toUpperCase();

  function close() { stop.current?.(); stop.current = null; setScanning(false); }
  useEffect(() => () => { stop.current?.(); }, []);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video.current!, (result) => {
          if (result && !cancelled) { setValue(clean(result.getText())); setNote("Scanned. Check the number before saving."); close(); }
        });
        if (cancelled) controls.stop(); else stop.current = () => controls.stop();
      } catch {
        setNote("Camera is not available. Allow camera access, or take a photo of the label instead.");
        setScanning(false);
      }
    })();
    return () => { cancelled = true; stop.current?.(); stop.current = null; };
  }, [scanning]);

  async function fromPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setNote("Reading the photo…");
    const url = URL.createObjectURL(f);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const r = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      setValue(clean(r.getText())); setNote("Read from the photo. Check the number before saving.");
    } catch {
      setNote("No barcode or QR code found in the photo. Type the serial number instead.");
    } finally { URL.revokeObjectURL(url); }
  }

  return (
    <div>
      <div className="row">
        <input name={name} value={value} onChange={(e) => setValue(e.target.value)} required={required} minLength={minLength} placeholder={placeholder ?? "Serial number"} autoComplete="off" style={{ flex: 1 }} />
        <button type="button" onClick={() => { setNote(""); setScanning(true); }}>Scan with camera</button>
        <label className="btn" style={{ cursor: "pointer" }}>Photo of label<input type="file" accept="image/*" capture="environment" onChange={fromPhoto} hidden /></label>
      </div>
      {scanning && (
        <div style={{ marginTop: 8 }}>
          <video ref={video} muted playsInline style={{ width: "100%", maxWidth: 420, borderRadius: 8, background: "#000" }} />
          <div><button type="button" onClick={close}>Cancel</button></div>
        </div>
      )}
      {note && <p><small>{note}</small></p>}
    </div>
  );
}
