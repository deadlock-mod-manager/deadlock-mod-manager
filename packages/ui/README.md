# @deadlock-mods/ui

Shared UI components package for Deadlock Mod Manager monorepo.

## Overview

This package contains shadcn/ui components and shared utilities used across the desktop and web applications.

## Usage

### Importing Components

```typescript
import { Button } from "@deadlock-mods/ui/components/button";
import { Dialog } from "@deadlock-mods/ui/components/dialog";
```

### Importing Utilities

```typescript
import { cn } from "@deadlock-mods/ui/lib/utils";
```

### Importing Hooks

```typescript
import { useIsMobile } from "@deadlock-mods/ui/hooks/use-mobile";
```

### Importing Icons

All lucide-react icons are re-exported for convenience:

```typescript
import { ChevronRight, Check, Settings } from "@deadlock-mods/ui/icons";
```

Phosphor Icons are also available with a namespace prefix:

```typescript
import { PhosphorIcons } from "@deadlock-mods/ui/icons";

// Usage
<PhosphorIcons.Heart />
<PhosphorIcons.Package />
```

### Styles

Import the global styles in your application:

```typescript
import "@deadlock-mods/ui/styles/globals.css";
```

## Components

This package includes shadcn/ui components:

- Accordion
- Alert Dialog
- Alert
- Aspect Ratio
- Avatar
- Badge
- Breadcrumb
- Button
- Card
- Carousel
- Checkbox
- Collapsible
- Command
- Context Menu
- Data Table
- Dialog
- Drawer
- Dropdown Menu
- Form
- Hover Card
- Input
- Input OTP
- Label
- Menubar
- Navigation Menu
- Pagination
- Popover
- Progress
- Radio Group
- Resizable
- Scroll Area
- Select
- Separator
- Sheet
- Sidebar
- Skeleton
- Slider
- Sonner (Toast)
- Switch
- Table
- Tabs
- Textarea
- Toggle
- Toggle Group
- Tooltip

## Development

To add new components using shadcn CLI:

```bash
cd packages/ui
pnpm dlx shadcn@latest add [component-name]
```

## Structure

```
packages/ui/
├── src/
│   ├── components/     # UI components
│   ├── hooks/          # Shared hooks
│   ├── lib/            # Utility functions
│   └── styles/         # Global styles
├── components.json     # shadcn configuration
├── package.json
└── tsconfig.json
```
