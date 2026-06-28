---
version: alpha
name: Hexpert AI Assistant UI Template
description: A technical, high-density AI agent interface optimized for blockchain analysis and smart contract auditing. Features a dark-themed UI with a focus on data visualization and code presentation.
colors:
  primary: "#6366f1"
  background: "#09090b"
  surface: "#121214"
  elevated: "#18181b"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#ef4444"
  text-primary: "#fafafa"
  text-secondary: "#a1a1aa"
typography:
  font-family-ui: "Inter, sans-serif"
  font-family-mono: "Geist Mono, monospace"
  body-sm: "14px"
  label-xs: "10px"
  heading-lg: "24px"
spacing:
  base: "4px"
  container-padding: "32px"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
components:
  button-primary: "bg-zinc-100 text-zinc-950"
  button-secondary: "border-indigo-500/30 text-indigo-400"
  input-field: "bg-[#121214] border-zinc-800/80"
  chat-bubble-user: "bg-zinc-900 border-zinc-800/50"
---

## Overview
Hexpert is a specialized AI interface designed for developers and blockchain auditors. The visual language is defined by a "Dark-as-Night" aesthetic (Zinc-950), emphasizing high-contrast technical data over decorative elements. The UI is dense, utilizing thin borders (`1px`) to separate concerns rather than color blocks. Motion is functional, limited to streaming text effects and subtle state transitions. The layout feels like a professional IDE, balancing conversational space with structured data cards and code blocks.

## Colors
- **Base Palette**: Primary background is `#09090b`. Card surfaces and inputs use a slightly lighter `#121214` to create depth.
- **Accents**: Indigo (`#6366f1`) is the primary brand color, used sparingly for active states, file icons, and button outlines.
- **Status System**: Emerald (`#10b981`) signifies verified status or successful audits. Amber (`#f59e0b`) marks medium-risk findings. Red (`#ef4444`) is reserved for high-risk vulnerabilities and critical errors.
- **Typography Colors**: Headers and active text use Zinc-50 (`#fafafa`). Secondary metadata uses Zinc-500 (`#71717a`).

## Typography
- **UI/Conversational**: Inter is the primary typeface. Font size is set to `text-sm` (14px) for messages to maximize content density.
- **Technical/Code**: Geist Mono is used for all blockchain addresses (e.g., 0x...), code snippets, and metadata labels.
- **Metadata Hierarchy**: Small labels (`text-[10px]`) use uppercase with `tracking-widest` (roughly 0.1em) for a technical "specs" feel.

## Layout
- **Sidebar**: Fixed 256px (`w-64`) left navigation for chat history and design system access. Borders are `border-zinc-800/60`.
- **Main Surface**: A flexible flexbox column containing a fixed 56px (`h-14`) header, a scrollable chat area, and a pinned input zone.
- **Input Zone**: Centered max-width of 768px (`max-w-3xl`) with a floating appearance caused by a bottom-up gradient (`from-[#09090b]`).
- **Drawer**: A slide-over right panel (320px-400px) for settings, utilizing a backdrop-blur filter.

## Elevation & Depth
- **Flatness**: The interface is largely flat, relying on border-strokes for hierarchy.
- **Shadows**: Soft Indigo glow (`shadow-indigo-500/5`) for primary buttons and large `shadow-2xl` for floating panels like the settings drawer.
- **Layering**: The header uses `backdrop-blur-md` and `bg-opacity-80` to maintain a sense of position when content scrolls beneath it.

## Shapes
- **Bubbles**: User messages use a 12px (`rounded-xl`) radius with a sharp corner (`rounded-tr-sm`) to indicate direction.
- **Cards**: Standard data cards use 8px (`rounded-lg`).
- **Interactive Chips**: Pill-shaped or 6px (`rounded-md`) buttons for Human-in-the-Loop (HITL) options.

## Components
- **Thread Navigation**: List items with an indigo left-border indicator (`before:w-0.5 before:bg-indigo-500`) for active states.
- **Wallet Profile Card**: Contains a gradient avatar (`from-indigo-500/20 to-emerald-500/20`), a verified badge, and a grid of monospaced data points.
- **Audit Finding List**: A header with a risk-level badge followed by a vertical stack of findings separated by `divide-zinc-800/60`.
- **Code Block**: Dark background (`#0a0a0c`) with a sticky top bar containing filename and a copy button. Line numbers are right-aligned and muted.
- **Chat Input**: A textarea that auto-expands, featuring integrated file attachment and send buttons within the border frame.

## Page Sections
### Navigation Sidebar
Left-aligned vertical panel. Top contains a "New Chat" button with an Indigo outline. Center contains a list of threads with truncated titles and timestamps. Bottom contains a dedicated "Design System & Docs" button with a custom gradient hover effect.

### Thread Header
Top bar with "HEXPERT" logo in semi-bold tracking-tighter text. Features a mobile hamburger menu on small screens and a global Settings button on the right.

### Chat Stream
Central scroll area. User messages are right-aligned; AI responses are left-aligned. AI responses are often prefixed with metadata tags (e.g., "Wallet", "Audit") and conclude with suggested action chips.

### Settings Drawer
A right-aligned panel for API configuration. Includes a toggle group for provider selection (OpenAI/Anthropic) and password-masked input fields for API keys.

### Design System View
A dedicated layout mode that replaces the chat stream. It displays foundations (colors/typography) and a component library in a single-column scrollable feed, intended for documentation and UI auditing.

## Motion & Interaction
- **Streaming Cursor**: A 6px by 14px Zinc-400 block (`.stream-cursor`) that pulses with an opacity animation (`pulse-opacity`) at 1s intervals to simulate live AI typing.
- **Settings Slide**: The drawer enters from the right using a `cubic-bezier(0.16, 1, 0.3, 1)` transition over 300ms.
- **Hover States**: Thread items and buttons transition background colors over 150-200ms. Code finding rows highlight on hover.

## Do's and Don'ts
- **Do**: Use monospaced fonts for all alphanumeric strings that represent data (hashes, numbers, code).
- **Do**: Use high-transparency borders (`/60` or `/80`) for subtle structural divisions.
- **Don't**: Use bright backgrounds; the interface is strictly dark mode.
- **Don't**: Use rounded-full corners for anything other than icons or circular avatars; maintain the geometric look with XL/L radii.

## Accessibility
- **Contrast**: High contrast text (`Zinc-100` on `Zinc-950`) ensures readability.
- **Interactions**: Selectable text uses a tinted background (`selection:bg-indigo-500/30`) to maintain context.
- **Scaling**: Responsive layout hides the sidebar on mobile, replacing it with a hamburger menu.

## Assets
1. `tailwind-cdn`: https://cdn.tailwindcss.com
2. `iconify-lib`: https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js
3. `google-fonts-root`: https://fonts.googleapis.com
4. `google-fonts-static`: https://fonts.gstatic.com
5. `primary-font-styles`: https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap
