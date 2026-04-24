import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Transcribble",
    short_name: "Transcribble",
    description: "Voice Memos-style local transcription workspace for imported recordings.",
    start_url: "/?source=pwa",
    scope: "/",
    id: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#1a1a1a",
    theme_color: "#1a1a1a",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Add Recording",
        short_name: "Add",
        url: "/?action=add",
      },
    ],
  };
}
