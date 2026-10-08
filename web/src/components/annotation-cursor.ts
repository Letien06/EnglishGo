import type { CSSProperties } from "react";

type DrawingTool = "pen" | "eraser";

// Keep the cursor inline so choosing a tool never waits for another asset
// request. The hotspot is placed at the pen tip / centre of the eraser.
const PEN_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <g transform="rotate(45 16 16)" stroke="#26323B" stroke-width="1.25" stroke-linejoin="round">
      <path d="M12.5 8.5h7v13h-7z" fill="#F4C64C"/>
      <path d="M12.5 8.5h7v4h-7z" fill="#CFD7DC"/>
      <path d="M12.5 21.5h7L16 28z" fill="#E8C297"/>
      <path d="M15 25.5 16 28l1-2.5z" fill="#26323B"/>
      <path d="M12.5 6.5a3.5 3.5 0 0 1 7 0v2h-7z" fill="#ED7987"/>
      <path d="M14 13v7M18 13v7" stroke="#D99C27" stroke-width=".8"/>
    </g>
  </svg>
`) }") 4 28, crosshair`;

const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <g transform="translate(16 16) rotate(-45)" stroke="#26323B" stroke-width="1.25" stroke-linejoin="round">
      <path d="m-10-4.25 10-10a2.5 2.5 0 0 1 3.54 0l4.71 4.71a2.5 2.5 0 0 1 0 3.54l-10 10a2.5 2.5 0 0 1-3.54 0l-4.71-4.71a2.5 2.5 0 0 1 0-3.54z" fill="#E9A4AE"/>
      <path d="m-7.64-1.89 7.07-7.07 7.07 7.07-7.07 7.07z" fill="#F4C64C"/>
      <path d="m-7.64-1.89 7.07 7.07" stroke="#D99C27" stroke-width=".8"/>
      <path d="M-10-4.25h7.07v7.07H-10a2.5 2.5 0 0 1 0-7.07z" fill="#CFD7DC"/>
    </g>
  </svg>
`) }") 16 16, cell`;

export function annotationCursor(tool: DrawingTool): CSSProperties["cursor"] {
  return tool === "eraser" ? ERASER_CURSOR : PEN_CURSOR;
}

