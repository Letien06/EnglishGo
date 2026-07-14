# 003 — Strengthen wayfinding and action hierarchy

- **Status**: DONE
- **Commit**: 4314d0da
- **Severity**: MEDIUM
- **Category**: Missed opportunities & cohesion
- **Estimated scope**: 3 files, shared navigation and style primitives

## Problem

Primary and secondary actions share similar weight in the shared primitives,
while active navigation only gets a very light inset outline. This weakens the
common path and makes it harder to scan where the learner is or what to do next.

```css
/* web/src/app/globals.css:772 — current */
.premium-primary,
.premium-secondary {
  align-items: center;
  justify-content: center;
  border-radius: 0.8rem;
  font-weight: 800;
  text-decoration: none;
}
```

## Target

Create a consistent action hierarchy: primary actions have a clear filled
surface, visible elevation and a small leading indicator; secondary actions
remain bordered and quiet. Active navigation gets a left or bottom indicator,
clearer contrast, and an accessible current-page state. Typography uses tighter
tracking at heading scale and spacious small navigation labels.

## Repo conventions to follow

- Navigation component classes live in `web/src/components/AppShell.tsx` and
  `web/src/components/PublicHeader.tsx`.
- Shared navigation styles live in `web/src/app/globals.css:280-370`.
- Existing card elevation tokens are `--elevation-1` and `--elevation-2`.

## Steps

1. Update shared primary/secondary styles in `globals.css` so their visual
   contrast and elevation are distinct in both light and dark themes.
2. Add a visible active marker to `.app-primary-nav-link[aria-current="page"]`
   and `.public-nav-link.is-active` without changing their layout dimensions.
3. Adjust `AppShell.tsx` and `PublicHeader.tsx` only where needed to expose
   semantic active state and retain 44px minimum tap targets.

## Boundaries

- Do not replace route structure or labels.
- Do not add decorative looping animation.
- Preserve keyboard focus styles and current responsive breakpoints.

## Verification

- **Mechanical**: run `npm run lint` and `npm run build` in `web`.
- **Feel check**: scan desktop and mobile navigation at a glance; the current
  section and one main action should be obvious in under a second.
- **Accessibility**: check light, dark and increased-contrast modes; active
  state and primary action must remain distinguishable without hover.
