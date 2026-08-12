# AOI LAB Agent Instructions

## Before changing UI

Read `FRONTEND_DESIGN_GUIDELINES.md` completely.

## Visual contract

- Preserve the pure 2D independent-developer-lab style.
- Reuse the color tokens defined in `app/globals.css`.
- Keep the deep navy grid background, cream paper surfaces, cyan primary accent, and sparse orange highlight.
- Do not introduce glassmorphism, pseudo-3D, realistic materials, generic admin-dashboard styling, or unrelated color systems.
- Keep SVG icons flat, outlined, rounded, and visually consistent.
- Maintain keyboard focus, reduced-motion behavior, and mobile responsiveness.

## Architecture

- Keep the homepage focused on discovery and navigation.
- Add each real tool as its own route and focused module.
- Do not place Excel parsing, file generation, or other business logic directly in `app/page.tsx`.
- Extract shared components only after a second real use case exists.
- Preserve `.openai/hosting.json` unless the user explicitly asks to remove Sites support.

## Required verification

After meaningful changes, run:

```bash
npm run lint
npm test
```

Update `FRONTEND_DESIGN_GUIDELINES.md` whenever the project-wide visual system changes.
