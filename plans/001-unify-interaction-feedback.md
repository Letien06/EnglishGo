# 001 — Unify tactile interaction feedback

- **Status**: DONE
- **Commit**: 4314d0da
- **Severity**: HIGH
- **Category**: Cohesion & accessibility
- **Estimated scope**: 1 file, global interaction primitives

## Problem

The product has a global pressed scale in `web/src/app/globals.css:209`, but many
controls do not receive a transform transition. Others receive a broad generic
transition later in the stylesheet. This makes press feedback feel inconsistent
and leaves primary actions visually too close to secondary actions.

```css
/* web/src/app/globals.css:209 — current */
:where(button:not(:disabled), a[href], [role="button"]:not([aria-disabled="true"])):active {
  transform: scale(0.975);
}
```

## Target

Keep interaction feedback compositor-only. Give controls a 150ms transform,
color, background, border and shadow transition using the existing strong
`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` token. Primary actions should
retain a visible, token-based elevation; secondary actions should remain quiet.
Respect reduced motion by retaining color feedback but removing transform motion.

## Repo conventions to follow

- Motion tokens live in `web/src/app/globals.css:54-59`.
- Interactive cards already use `transform var(--motion-standard) var(--ease-out)`
  in `web/src/app/globals.css:763`.
- Hover movement is already gated by `(hover: hover) and (pointer: fine)`.

## Steps

1. In `web/src/app/globals.css`, replace the generic feedback block with explicit
   compositor-safe transitions using `var(--motion-fast)` and `var(--ease-out)`.
2. Add a shared primary-action selector covering the existing branded primary
   controls. Give it a 1px highlighted edge and `--primary` elevation; give its
   hover state a `translateY(-1px)` only inside the existing fine-pointer media
   query.
3. Add a `prefers-reduced-motion: reduce` override that removes transform motion
   while retaining opacity, color, border and shadow feedback.

## Boundaries

- Do not add dependencies.
- Do not animate layout properties or use `transition: all`.
- Do not add motion to keyboard-triggered navigation.

## Verification

- **Mechanical**: run `npm run lint` and `npm run build` in `web`.
- **Feel check**: press primary and secondary actions; press feedback must be
  immediate, subtle and return smoothly. On a touch device there must be no
  hover-only effect.
- **Accessibility**: emulate reduced motion; buttons retain visual feedback but
  no longer translate or scale.
