# Design System & UI/UX Guidelines - WhatsApp API Panel

## 1. Design Philosophy
- **Modern Minimalism:** Focus on content and data. Reduce visual noise.
- **Dark Mode First:** Deep charcoal backgrounds (#09090b) reduce eye strain for admin tasks.
- **Hierarchy:** Use font weight and color opacity (text-muted) to guide the eye.
- **Feedback:** Interactive elements must have clear hover and active states.

## 2. Color Palette

### Backgrounds
- **Background:** `#09090b` (Deep Zinc) - Main page background.
- **Surface/Card:** `#18181b` (Zinc 900) - Cards and Sidebar.
- **Surface Highlight:** `#27272a` (Zinc 800) - Hover states / Borders.

### Typography & Content
- **Foreground (Primary):** `#fafafa` (Zinc 50) - Headings, main values.
- **Muted (Secondary):** `#a1a1aa` (Zinc 400) - Labels, subtitles, icons.

### Accents (Brand)
- **Primary (WhatsApp Green):** `#22c55e` (Green 500) - Primary buttons, success states, active indicators.
- **Primary Foreground:** `#ffffff`
- **Danger:** `#ef4444` (Red 500) - Delete actions, disconnected states.
- **Warning:** `#f59e0b` (Amber 500) - Connecting states.

## 3. Typography
- **Font Family:** Geist Sans (Inter alternative).
- **Scale:**
  - H1: 24px (Bold)
  - H2: 20px (SemiBold)
  - Body: 14px (Regular)
  - Small: 12px (Medium)

## 4. Components

### Cards
- Background: Surface (`bg-zinc-900`)
- Border: 1px solid (`border-zinc-800`)
- Radius: `rounded-xl` (12px)
- Shadow: None (Flat design) or subtle `shadow-sm`.

### Buttons
- **Primary:** Green background, white text, subtle hover brightness.
- **Secondary/Outline:** Transparent background, border zinc-800, white text.
- **Ghost:** No background, hover zinc-800.

### Navigation (Sidebar)
- **Active State:** Green text + subtle green background tint (`bg-green-500/10`).
- **Inactive State:** Muted text, hover white.

## 5. Spacing & Layout
- **Grid System:** 4-column grid for stats, 3-column grid for instances.
- **Padding:** 
  - Page: `p-8` (32px)
  - Card: `p-6` (24px)
  - Gap: `gap-6` (24px)

## 6. Accessibility
- Ensure contrast ratio > 4.5:1 for text.
- Interactive elements min-height 44px.
- Focus rings visible on keyboard navigation.
