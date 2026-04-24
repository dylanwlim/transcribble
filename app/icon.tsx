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
        }}
      >
        <div
          style={{
            display: "flex",
            height: 384,
            width: 384,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 112,
            backgroundColor: "#f6f5f1",
            boxShadow: "0 32px 120px rgba(15,15,20,0.45)",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="240"
            height="240"
            fill="#13151a"
          >
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
