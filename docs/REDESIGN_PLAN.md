# FairShare redesign plan

## Direction

Use the Cursor-inspired Design MD as the visual reference, then adapt it for a private finance app:

- keep the warm cream palette and editorial calm
- use shadcn-style component structure and spacing
- avoid flashy gradients and noisy effects
- make balances, actions, and group state feel crisp and legible

## How the design will blend

### From Design MD / Cursor
- warm page background instead of stark white
- soft bordered surfaces with diffused depth
- compact headings with a refined, product-like feel
- pill filters, mono utility text, premium calm palette

### From shadcn
- reusable primitives: button, card, input, textarea, badge
- consistent radius, border, hover, and focus behavior
- quiet composition with strong information hierarchy

### FairShare-specific adaptation
- money states stay immediate: owed / owe / settled use semantic color accents
- dashboard becomes a financial cockpit, not a generic card list
- group pages feel like workspaces with header, stats, members, activity
- auth flows feel premium and minimal rather than bright startup gradients

## Visual system

### Palette
- base background: warm cream
- elevated surfaces: slightly darker cream panels
- text: warm near-black
- accent: restrained orange for brand/action
- success: muted green
- danger: muted crimson

### Typography
- primary UI: Geist Sans
- mono / codes / invite links: Geist Mono
- optional editorial accent: serif only in tiny doses, not across the product

### Surfaces
- large rounded panels
- thin warm borders
- subtle layered shadows
- active pills and tabs instead of bright solid blocks

## Rollout subtasks

1. add Design MD and document the redesign system
2. build shared primitives and theme tokens
3. redesign shell: root, navbar, authenticated layout
4. redesign auth screens
5. redesign dashboard
6. redesign group detail workspace
7. restyle forms, filters, and activity list
8. polish admin and remaining views
9. build and verify production output

## First implementation slice

This pass focuses on:

- theme tokens and globals
- shadcn-style primitives
- navbar + app shell
- login / register / create group
- dashboard and core group overview blocks

Then we can continue into deeper activity, forms, and admin polish.
