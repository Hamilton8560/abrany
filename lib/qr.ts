import QRCode from "qrcode";

/** A brand-tinted QR (ink modules, transparent background) as a PNG data URL. */
export async function qrDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 240,
      errorCorrectionLevel: "M",
      color: { dark: "#1b2436ff", light: "#00000000" },
    });
  } catch {
    return "";
  }
}
