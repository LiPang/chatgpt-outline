# Changelog

## 1.0.2

- Read the currently visible conversation root instead of the first cached main element.
- Refresh the outline when cached views change visibility, messages load later, or the application replaces its page containers.
- Reset open branches when switching conversations and handle browser back/forward navigation.
- Add browser regression tests for conversation switching without page reloads in current and legacy message layouts.

## 1.0.1

- Require actual title content after a paragraph's numbering prefix.
- Exclude bare part labels and punctuation-only labels from the outline, including labels that introduce formulas.
- Preserve complete numbered headings and progressive three-level navigation.
- Add regression tests using synthetic examples.

## 1.0.0

Initial public release.

- Minimal right-side prompt and heading navigation for ChatGPT.
- Truncated prompt previews and click-to-jump navigation.
- Progressive first-, second-, and third-level heading menus.
- Numbering-aware hierarchy and current/legacy message-container support.
- Local display settings, keyboard navigation, and light/dark appearance.
