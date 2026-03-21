import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon(): Promise<ImageResponse> {
  const fontData = await readFile(join(process.cwd(), "fonts", "golden-rooster.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          color: "#f1f5f9",
          fontSize: 20,
          fontFamily: "SynapseWordmark"
        }}
      >
        N
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "SynapseWordmark", data: fontData, style: "normal", weight: 600 }]
    }
  );
}
