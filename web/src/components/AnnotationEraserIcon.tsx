import type { SVGProps } from "react";

/** Decorative eraser icon; the containing button supplies its accessible label. */
export default function AnnotationEraserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      width="24"
      height="24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <g transform="translate(16 16) rotate(-45)" stroke="#26323B" strokeWidth="1.35" strokeLinejoin="round">
        <path d="M-10-4.25 0-14.25a2.5 2.5 0 0 1 3.54 0l4.71 4.71a2.5 2.5 0 0 1 0 3.54l-10 10a2.5 2.5 0 0 1-3.54 0l-4.71-4.71a2.5 2.5 0 0 1 0-3.54Z" fill="#E9A4AE" />
        <path d="m-7.64-1.89 7.07-7.07 7.07 7.07-7.07 7.07Z" fill="#F4C64C" />
        <path d="m-7.64-1.89 7.07 7.07" stroke="#D99C27" strokeWidth=".9" />
        <path d="m-.57-8.96 7.07 7.07" stroke="#F5F7F8" strokeWidth=".8" />
        <path d="M-10-4.25h7.07v7.07H-10a2.5 2.5 0 0 1 0-7.07Z" fill="#CFD7DC" />
        <path d="M-9.2 2.02h6.25" stroke="#A9B6BD" strokeWidth=".8" />
      </g>
    </svg>
  );
}
