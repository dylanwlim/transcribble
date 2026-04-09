import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
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
          backgroundImage: "radial-gradient(circle at 20% 20%, rgba(31,79,255,0.35), transparent 42%)",
          color: "white",
          fontFamily: "Manrope, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            height: 320,
            width: 320,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 96,
            backgroundImage: "linear-gradient(180deg, #2d5bff, #1f4fff)",
            boxShadow: "0 32px 120px rgba(31,79,255,0.35)",
            fontSize: 160,
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
