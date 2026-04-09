import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#13151a",
          color: "white",
          fontFamily: "Manrope, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            height: 112,
            width: 112,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 34,
            backgroundImage: "linear-gradient(180deg, #2d5bff, #1f4fff)",
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "-0.08em",
          }}
        >
          T
        </div>
      </div>
    ),
    size,
  );
}
