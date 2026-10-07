import type { SVGProps } from "react";

export type DashboardIconName = "clock" | "practice" | "reading" | "listening" | "speaking" | "writing" | "vocab" | "video" | "calendar" | "flame" | "target" | "settings" | "chevron" | "close" | "arrow" | "check";
export function DashboardIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: DashboardIconName }) {
  const paths: Record<DashboardIconName, React.ReactNode> = {
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    practice: <><path d="M8 3H5v18h14V7l-4-4H8Z" /><path d="M14 3v5h5M10 12a2 2 0 1 1 3 1.7c-1 .5-1 1-1 1.3M12 18h.01" /></>,
    reading: <><path d="M12 5C8 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-5-1-9 1Z" /><path d="M12 5v15" /></>,
    listening: <><path d="M4 13v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="12" width="5" height="8" rx="2" /><rect x="16" y="12" width="5" height="8" rx="2" /></>,
    speaking: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6" /></>,
    writing: <><path d="m15 4 5 5-10 10-6 1 1-6L15 4ZM13 6l5 5M14 21h7" /></>,
    vocab: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M5 17h14M9 13l3-7 3 7M10 11h4" /></>,
    video: <><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 18h2" /></>,
    flame: <path d="M13 3c1 5-5 6-3 10 2 0 3-2 3-4 5 4 7 7 4 11-3 3-9 2-11-2-3-6 3-9 4-12 0 3 1 4 2 4 2-2 2-5 1-7Z" />,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    settings: <><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3H9Z" /><circle cx="12" cy="12" r="3" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

/** Original vector illustration: stays crisp at every dashboard breakpoint. */
export function StudyCompanion() {
  return <svg viewBox="0 0 220 220" fill="none" aria-hidden="true">
    <ellipse cx="112" cy="203" rx="63" ry="9" fill="#60A5FA" opacity=".12" />
    <path d="M63 174c-25 8-44-12-36-30 3-7 12-7 13 1 2 10 10 12 22 10" fill="#3B82F6" stroke="#1E4F9A" strokeWidth="4" />
    <path d="M74 135c-16 15-19 45-5 59 12 12 24 3 39 3 18 0 30 10 44-3 12-12 8-44-7-59" fill="#60A5FA" stroke="#245BAD" strokeWidth="4" />
    <ellipse cx="111" cy="168" rx="28" ry="30" fill="#EFF7FF" />
    <path d="m52 87-6-44c-1-6 4-8 9-5l30 24m56-1 27-23c6-4 10-1 9 5l-5 43" fill="#60A5FA" stroke="#245BAD" strokeWidth="4" />
    <path d="m55 53 4 26 15-14m80 0 13-12-2 26" fill="#BCDFFF" />
    <path d="M178 101c0 36-27 58-66 58s-66-22-66-58 26-48 66-48 66 12 66 48Z" fill="#60A5FA" stroke="#245BAD" strokeWidth="4" />
    <path d="M62 112c0-25 22-35 49-11 28-24 49-14 49 11 0 27-23 38-49 38s-49-11-49-38Z" fill="#EFF7FF" />
    <circle cx="85" cy="104" r="20" stroke="#17447C" strokeWidth="4" /><circle cx="139" cy="104" r="20" stroke="#17447C" strokeWidth="4" />
    <path d="M105 104h14M66 100l-13-3m106 3 13-3M77 106c4-6 10-6 14 0m41 0c4-6 10-6 14 0" stroke="#17447C" strokeWidth="4" strokeLinecap="round" />
    <path d="m107 122 5 4 5-4" fill="#F39DAE" stroke="#B74E69" strokeWidth="2" /><path d="M103 132c5 7 13 7 18 0" stroke="#17447C" strokeWidth="3" strokeLinecap="round" />
    <path d="m66 53 45-19 45 19-45 18-45-18Z" fill="#17447C" stroke="#78B9FF" strokeWidth="3" /><path d="M82 61v17c17 8 41 8 58 0V61" fill="#245BAD" stroke="#17447C" strokeWidth="3" /><path d="M154 55v24" stroke="#F3BC5C" strokeWidth="4" /><circle cx="154" cy="83" r="5" fill="#F3BC5C" />
    <path d="m32 105 8 3m145-3 8-3m-9 20 8 3" stroke="#F3BC5C" strokeWidth="4" strokeLinecap="round" />
  </svg>;
}
