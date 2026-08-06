import { ImageResponse } from "next/og";

export const alt = "ConphiDent — More confident care. One connected clinic.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "66px", background: "linear-gradient(135deg, #f7faff 0%, #eaf0ff 46%, #eee8ff 100%)", color: "#0b1424" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: 34, fontWeight: 800 }}><div style={{ width: "46px", height: "46px", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #3377ff, #6c46e9)", color: "white" }}>C</div>ConphiDent</div>
      <div style={{ display: "flex", flexDirection: "column" }}><div style={{ fontSize: 74, lineHeight: 1.04, fontWeight: 800, letterSpacing: "-4px" }}>More confident care.</div><div style={{ fontSize: 74, lineHeight: 1.04, fontWeight: 800, letterSpacing: "-4px", color: "#355eea" }}>One connected clinic.</div></div>
      <div style={{ display: "flex", fontSize: 25, color: "#5f6f89" }}>The operating system for modern dental clinics</div>
    </div>,
    size,
  );
}
