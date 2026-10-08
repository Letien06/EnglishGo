import type { SVGProps } from "react";

/** Decorative pencil; the containing button supplies its accessible label. */
export default function AnnotationPencilIcon(props: SVGProps<SVGSVGElement>) {
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
      <g transform="translate(16 16) rotate(45)" stroke="#26323B" strokeWidth="1.35" strokeLinejoin="round">
        <path d="M-3.5-8.5v-2.75A2.75 2.75 0 0 1-.75-14h1.5a2.75 2.75 0 0 1 2.75 2.75v2.75Z" fill="#ED7987" />
        <path d="M-3.5-9h7v4h-7Z" fill="#CFD7DC" />
        <path d="M-3.5-5h7V7l-3.5 7-3.5-7Z" fill="#F4C64C" />
        <path d="M-1.2-4.5V6.9M1.2-4.5V6.9" stroke="#D99C27" strokeWidth=".8" />
        <path d="m-3.5 7 2.3 1 1.2-1 1.2 1 2.3-1L0 14Z" fill="#E8C297" />
        <path d="m-1.5 11 1.5 3 1.5-3Z" fill="#26323B" strokeWidth=".8" />
        <path d="M-2.3-7.1h4.6" stroke="#F5F7F8" strokeWidth=".75" />
      </g>
    </svg>
  );
}
