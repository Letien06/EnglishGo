import type { SVGProps } from "react";

export type ListeningIconName = "image" | "reply" | "conversation" | "broadcast" | "target" | "flame" | "check" | "clock" | "search" | "spark" | "arrow" | "reset" | "headphones" | "bars";

export default function ListeningIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: ListeningIconName }) {
  const paths: Record<ListeningIconName, React.ReactNode> = {
    image: <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1.5" /><path d="m3 16 5-5 4 4 3-3 6 6" /></>,
    reply: <><path d="M20 11a8 8 0 0 1-8 8H4l1-4a8 8 0 1 1 15-4Z" /><path d="M10 8a2 2 0 1 1 3 1.7c-1 .5-1 1.3-1 1.3M12 14h.01" /></>,
    conversation: <><path d="M14 4H5a2 2 0 0 0-2 2v8l4-2h7a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="M9 16v1a2 2 0 0 0 2 2h6l4 2V11a2 2 0 0 0-2-2M7 8h5" /></>,
    broadcast: <><path d="m4 10 13-5v14L4 14ZM17 10h3v4h-3M6 15l1 5h4l-2-4" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    flame: <path d="M13 3s1 5-3 7c-2-1-2-3-2-3s-4 4-4 8a8 8 0 0 0 16 0c0-5-7-12-7-12Zm-1 10c3 3 3 5 0 7-3-2-3-4 0-7Z" />,
    check: <><rect x="3" y="3" width="18" height="18" rx="5" /><path d="m7 12 3 3 7-7" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /></>,
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6" /></>,
    reset: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></>,
    headphones: <><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="3" y="12" width="5" height="8" rx="2" /><rect x="16" y="12" width="5" height="8" rx="2" /></>,
    bars: <><path d="M5 18v-4m7 4V9m7 9V4" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
