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
        }}
      >
        <div
          style={{
            display: "flex",
            height: 140,
            width: 140,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 40,
            backgroundColor: "#f6f5f1",
          }}
        >
          <svg viewBox="0 0 24 24" width="88" height="88" fill="#13151a">
            <rect x="3" y="9" width="1.8" height="6" rx="0.9" />
            <rect x="6" y="5.5" width="1.8" height="13" rx="0.9" />
            <rect x="9" y="8" width="1.8" height="8" rx="0.9" />
            <rect x="13" y="7.5" width="8" height="1.6" rx="0.8" />
            <rect x="13" y="11.2" width="8" height="1.6" rx="0.8" />
            <rect x="13" y="14.9" width="5.5" height="1.6" rx="0.8" />
          </svg>
        </div>
      </div>
    ),
    size,
  );
}
