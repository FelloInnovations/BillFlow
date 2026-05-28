import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: "#4f46e5",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
      }}
    >
      <span
        style={{
          color: "white",
          fontSize: 14,
          fontWeight: 900,
          letterSpacing: "-1px",
          lineHeight: 1,
        }}
      >
        BF
      </span>
    </div>,
    { ...size }
  );
}
