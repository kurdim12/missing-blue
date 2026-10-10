// QR code (qrcode package, rendered to a PNG data URL; works offline) and the crew-view URL it encodes.
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useApi } from "../../api";
import { isLocalHost, rankLan, woApi } from "./api";

export function QrCode({ text, size = 168, alt }: { text: string; size?: number; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: size * 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [text, size]);
  return src ? (
    <img className="wo-qr-img" src={src} width={size} height={size} alt={alt} />
  ) : (
    <span className="wo-qr-img wo-qr-ph" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

/**
 * URL of the crew view for a spot, opened in Arabic. On localhost the laptop's LAN address replaces the host,
 * because a phone cannot open "localhost" (the phone must be on the same Wi-Fi).
 */
export function useCrewUrl(spotId: string) {
  const { protocol, hostname, port, pathname, origin } = window.location;
  const local = isLocalHost(hostname);
  const { data } = useApi(() => (local ? woApi.lan() : Promise.resolve({ addresses: [] as string[] })), [local]);
  const ranked = rankLan(data?.addresses ?? []);
  const [chosen, setChosen] = useState<string | null>(null);
  const addr = chosen && ranked.includes(chosen) ? chosen : ranked[0] ?? null;
  const base = local && addr ? `${protocol}//${addr}${port ? `:${port}` : ""}` : origin;
  const path = `#/crew/${encodeURIComponent(spotId)}?lang=ar`;
  return { url: `${base}${pathname}${path}`, localOnly: local && !addr, usesLan: local && !!addr, addresses: ranked, addr, setAddr: setChosen, path };
}
