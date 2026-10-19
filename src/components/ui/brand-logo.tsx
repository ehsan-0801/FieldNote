import Image from "next/image";
import logo from "../../../public/brand/fieldnote-atlas-logo.png";
import logoOnDark from "../../../public/brand/fieldnote-atlas-logo-on-dark.png";

/** The FieldNote Atlas lockup. Use `tone="dark"` on the sidebar so the mark stays legible. */
export function BrandLogo({
  tone = "light",
  height = 32,
  priority = false,
}: {
  tone?: "light" | "dark";
  height?: number;
  priority?: boolean;
}) {
  const source = tone === "dark" ? logoOnDark : logo;
  return (
    <Image
      src={source}
      alt="FieldNote Atlas"
      height={height}
      width={Math.round((source.width / source.height) * height)}
      priority={priority}
      className="h-auto select-none"
      style={{ height, width: "auto" }}
    />
  );
}
