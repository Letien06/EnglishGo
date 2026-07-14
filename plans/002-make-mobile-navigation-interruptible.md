# 002 — Make mobile navigation interruptible

- **Status**: DONE
- **Commit**: 4314d0da
- **Severity**: HIGH
- **Category**: Interruptibility & spatial consistency
- **Estimated scope**: 2 files, mobile navigation state and styles

## Problem

The mobile navigation is immediately unmounted at
`web/src/components/MobileNavigationMenu.tsx:54`, while its sheet only has an
entering keyframe at `web/src/app/globals.css:1205`. Closing therefore cuts off
the surface instead of returning it to rest.

```tsx
/* web/src/components/MobileNavigationMenu.tsx:54 — current */
{open && createPortal(
```

```css
/* web/src/app/globals.css:1205 — current */
.mobile-navigation-sheet { animation: mobile-sheet-in var(--motion-slow) var(--ease-drawer) both; }
```

## Target

Keep the portal mounted during a 220ms exit. Use CSS transitions on `opacity`
and `transform` only, with `var(--ease-drawer)` for the sheet and
`var(--ease-out)` for the backdrop. The open and close paths must both be
vertical and the closing action must be safe to trigger repeatedly. Under
`prefers-reduced-motion: reduce`, use opacity only.

## Repo conventions to follow

- The sheet is a full-screen dialog in `MobileNavigationMenu.tsx`.
- Existing motion tokens live in `web/src/app/globals.css:54-59`.
- Mobile styles currently live near `web/src/app/globals.css:1195`.

## Steps

1. In `MobileNavigationMenu.tsx`, separate the requested-open state from the
   mounted state. Create a single close callback for Escape, backdrop, close
   button and link navigation; wait 220ms before unmounting.
2. Render state classes for opening and closing, and prevent re-opening/closing
   races with a single timer ref cleaned up on unmount.
3. Replace the two `@keyframes` in `globals.css` with transition-based open and
   closing styles. Start the sheet at `opacity: 0; transform: translateY(-1rem)
   scale(0.985)` and finish at `opacity: 1; transform: translateY(0) scale(1)`.
4. Add a reduced-motion variant that keeps the opacity transition and removes
   transforms.

## Boundaries

- Do not add a motion library.
- Do not change navigation destinations or focus trapping.
- Do not animate `top`, `height`, `padding`, or other layout properties.

## Verification

- **Mechanical**: run `npm run lint` and `npm run build` in `web`.
- **Feel check**: open, immediately close, and reopen the menu several times.
  The sheet must reverse cleanly, never jump, and always use the same vertical
  path. Check Escape and backdrop close too.
- **Accessibility**: emulate reduced motion and verify the menu cross-fades
  without translation.
