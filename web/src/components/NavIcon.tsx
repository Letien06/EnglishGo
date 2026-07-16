import type { SVGProps } from "react";

export type NavIconName =
  | "home"
  | "listen"
  | "read"
  | "writing"
  | "vocab"
  | "practice"
  | "progress"
  | "pet"
  | "leaderboard"
  | "arrow-right"
  | "play";

export default function NavIcon({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}) {
  const props: SVGProps<SVGSVGElement> = {
    className: className ?? "h-4 w-4",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return <svg {...props}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M9 21v-7h6v7" /></svg>;
    case "listen":
      return <svg {...props}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M18 19h-2a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h4v5a2 2 0 0 1-2 2Z" /><path d="M6 19h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H4v5a2 2 0 0 0 2 2Z" /></svg>;
    case "read":
      return <svg {...props}><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H12v18H6.5A2.5 2.5 0 0 0 4 22Z" /><path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H12v18h5.5A2.5 2.5 0 0 1 20 22Z" /></svg>;
    case "writing":
      return <svg {...props}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /><path d="m14 6 3 3" /></svg>;
    case "vocab":
      return <svg {...props}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v17H6.5A2.5 2.5 0 0 0 4 22Z" /><path d="M12 6h5.5A2.5 2.5 0 0 1 20 8.5V22a2.5 2.5 0 0 0-2.5-2H12" /><path d="M7.5 8h2" /><path d="M15 11h2.5" /></svg>;
    case "practice":
      return <svg {...props}><path d="M9 4h6" /><path d="M9 2h6v4H9z" /><path d="M7 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" /><path d="m8 14 2.5 2.5L16 11" /></svg>;
    case "progress":
      return <svg {...props}><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></svg>;
    case "pet":
      return <svg {...props}><path d="M5.5 10.5 4 4l4.5 2.5A9 9 0 0 1 15.5 6L20 4l-1.5 6.5a7 7 0 0 1-13 0Z" /><path d="M8.5 14h.01M15.5 14h.01" /><path d="m10.5 17 1.5 1 1.5-1" /><path d="M12 15h.01" /></svg>;
    case "leaderboard":
      return <svg {...props}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 3h10v5a5 5 0 0 1-10 0Z" /><path d="M7 5H4v1a4 4 0 0 0 4 4" /><path d="M17 5h3v1a4 4 0 0 1-4 4" /></svg>;
    case "arrow-right":
      return <svg {...props}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
    case "play":
      return <svg {...props}><path d="m9 5 10 7-10 7Z" /></svg>;
  }
}
