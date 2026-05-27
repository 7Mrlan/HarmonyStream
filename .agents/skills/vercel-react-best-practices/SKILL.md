---
name: vercel-react-best-practices
description: React performance guidelines from Vercel Engineering, trimmed for this Expo/React Native + React Web project. Use only for portable React/TypeScript performance reviews: re-render control, async parallelism, safe imports, immutable data, and JS hot paths. Do not apply Next.js-only, RSC, SSR, Server Actions, DOM-only, or deployment rules.
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# Vercel React Best Practices

Trimmed project-local subset of Vercel Engineering React performance guidance. This repository is Expo/React Native + React Web, so only portable React and TypeScript rules are retained.

## When to Apply

Reference these guidelines when:
- Writing or reviewing React components in `apps/*` or `packages/*`
- Refactoring component state, props, hooks, memoization, or derived values
- Optimizing TypeScript array/object hot paths
- Reviewing async work that can run in parallel
- Checking import patterns that may inflate Metro or web bundles

Do not use this skill for:
- Next.js Server Components, Server Actions, route handlers, `next/dynamic`, `after()`, or hydration-specific fixes
- Browser-only DOM APIs unless the target file is explicitly web-only
- UI taste, visual design, poster/artwork aesthetics, or UX audit decisions

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Re-render Optimization | MEDIUM | `rerender-` |
| 4 | Rendering Performance | MEDIUM | `rendering-` |
| 5 | JavaScript Performance | LOW-MEDIUM | `js-` |

## Quick Reference

### 1. Eliminating Waterfalls (CRITICAL)

- `async-cheap-condition-before-await` - Check cheap sync conditions before awaiting flags or remote values
- `async-defer-await` - Move await into branches where actually used
- `async-parallel` - Use Promise.all() for independent operations

### 2. Bundle Size Optimization (CRITICAL)

- `bundle-barrel-imports` - Import directly, avoid barrel files
- `bundle-analyzable-paths` - Prefer statically analyzable import and file-system paths to avoid broad bundles and traces
- `bundle-conditional` - Load modules only when feature is activated

### 3. Re-render Optimization (MEDIUM)

- `rerender-defer-reads` - Don't subscribe to state only used in callbacks
- `rerender-memo` - Extract expensive work into memoized components
- `rerender-memo-with-default-value` - Hoist default non-primitive props
- `rerender-dependencies` - Use primitive dependencies in effects
- `rerender-derived-state` - Subscribe to derived booleans, not raw values
- `rerender-derived-state-no-effect` - Derive state during render, not effects
- `rerender-functional-setstate` - Use functional setState for stable callbacks
- `rerender-lazy-state-init` - Pass function to useState for expensive values
- `rerender-simple-expression-in-memo` - Avoid memo for simple primitives
- `rerender-split-combined-hooks` - Split hooks with independent dependencies
- `rerender-move-effect-to-event` - Put interaction logic in event handlers
- `rerender-transitions` - Use startTransition for non-urgent updates
- `rerender-use-deferred-value` - Defer expensive renders to keep input responsive
- `rerender-use-ref-transient-values` - Use refs for transient frequent values
- `rerender-no-inline-components` - Don't define components inside components

### 4. Rendering Performance (MEDIUM)

- `rendering-hoist-jsx` - Extract static JSX outside components
- `rendering-conditional-render` - Use ternary, not && for conditionals

### 5. JavaScript Performance (LOW-MEDIUM)

- `js-index-maps` - Build Map for repeated lookups
- `js-cache-property-access` - Cache object properties in loops
- `js-cache-function-results` - Cache function results in module-level Map
- `js-combine-iterations` - Combine multiple filter/map into one loop
- `js-length-check-first` - Check array length before expensive comparison
- `js-early-exit` - Return early from functions
- `js-hoist-regexp` - Hoist RegExp creation outside loops
- `js-min-max-loop` - Use loop for min/max instead of sort
- `js-set-map-lookups` - Use Set/Map for O(1) lookups
- `js-tosorted-immutable` - Use toSorted() for immutability
- `js-flatmap-filter` - Use flatMap to map and filter in one pass

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/async-parallel.md
rules/bundle-barrel-imports.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references
