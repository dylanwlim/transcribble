import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Transcribble",
    short_name: "Transcribble",
    description: "Private voice workspace for turning recordings into searchable, editable knowledge on this device.",
    start_url: "/",
    display: "standalone",
    background_color: "#efe9dc",
    theme_color: "#13151a",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
