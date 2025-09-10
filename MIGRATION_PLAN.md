# Next.js to Vite Migration Plan

## Overview

Migrating the Next.js app from `apps/web` to the Vite app in `apps/www`. This migration will preserve all functionality except auth-related UI elements (auth logic will be kept).

## Migration Scope

### ✅ Source App (apps/web - Next.js)

- **Framework**: Next.js 15.1.3 with App Router
- **Styling**: Tailwind CSS + Custom fonts
- **Components**:
  - Pages: home, download, status, privacy, terms
  - UI: accordion, badge, button, card, navigation-menu, separator, sheet
  - Core: navbar, hero, features, faq, getting-started, footer, logo
  - Icons: discord, github, linkedin, x
- **Features**:
  - Version fetching and display
  - Status API endpoint
  - SEO optimization
  - Theme provider
  - Responsive design

### ✅ Target App (apps/www - Vite)

- **Framework**: Vite + React + TanStack Router
- **Current State**: Basic auth-focused app with simple layout
- **To Preserve**: Auth logic, orpc utils, existing theme setup

## Migration Tasks

### 1. Dependencies & Configuration

- [ ] Update package.json with required dependencies
- [ ] Migrate font configurations
- [ ] Update Vite config if needed
- [ ] Copy tailwind.config.js settings

### 2. UI Components Migration

- [ ] Migrate `apps/web/components/ui/*` to `apps/www/src/components/ui/`
  - [ ] accordion.tsx
  - [ ] badge.tsx
  - [ ] button.tsx (merge with existing)
  - [ ] card.tsx (merge with existing)
  - [ ] navigation-menu.tsx
  - [ ] separator.tsx
  - [ ] sheet.tsx

### 3. Core Components Migration

- [ ] Migrate `apps/web/components/*` to `apps/www/src/components/`
  - [ ] navbar.tsx (replace current header.tsx)
  - [ ] hero.tsx
  - [ ] features.tsx
  - [ ] faq.tsx
  - [ ] getting-started.tsx
  - [ ] footer.tsx
  - [ ] logo.tsx
  - [ ] status-widget.tsx
  - [ ] theme-provider.tsx (merge with existing)

### 4. Icons Migration

- [ ] Migrate `apps/web/components/icons/*` to `apps/www/src/components/icons/`
  - [ ] discord-icon.tsx
  - [ ] github-icon.tsx
  - [ ] icon.tsx
  - [ ] linkedin-icon.tsx
  - [ ] x-icon.tsx

### 5. Library & Utilities Migration

- [ ] Migrate `apps/web/lib/constants.ts` to `apps/www/src/lib/constants.ts`
- [ ] Merge `apps/web/lib/utils.ts` with existing `apps/www/src/lib/utils.ts`

### 6. Routes Setup

- [ ] Update `apps/www/src/routes/index.tsx` (home page)
- [ ] Create `apps/www/src/routes/download.tsx`
- [ ] Create `apps/www/src/routes/status.tsx`
- [ ] Create `apps/www/src/routes/privacy.tsx`
- [ ] Create `apps/www/src/routes/terms.tsx`
- [ ] Update `apps/www/src/routes/__root.tsx` layout

### 7. Styles & Assets Migration

- [ ] Migrate `apps/web/globals.css` to `apps/www/src/index.css`
- [ ] Copy font files from `apps/web/assets/fonts/` to `apps/www/src/assets/fonts/`
- [ ] Copy public assets from `apps/web/public/` to `apps/www/public/`

### 8. Auth UI Cleanup

- [ ] Remove auth buttons from main components
- [ ] Keep auth logic in existing files:
  - [ ] Keep `user-menu.tsx` (hidden for now)
  - [ ] Keep `sign-in-form.tsx` and `sign-up-form.tsx`
  - [ ] Keep `auth-client.ts`
  - [ ] Remove auth routes from main navigation

### 9. API Integration

- [ ] Setup version fetching utility
- [ ] Create status endpoint integration
- [ ] Ensure API compatibility with existing orpc setup

### 10. Testing & Cleanup

- [ ] Test all migrated pages and components
- [ ] Verify responsive design works
- [ ] Test theme switching
- [ ] Fix any missing dependencies or imports
- [ ] Clean up unused files

## Key Differences to Handle

### 1. Routing

- **From**: Next.js App Router (`app/page.tsx`, `app/layout.tsx`)
- **To**: TanStack Router (`routes/index.tsx`, `routes/__root.tsx`)

### 2. Navigation

- **From**: Next.js `Link` component
- **To**: TanStack Router `Link` component

### 3. Images

- **From**: Next.js `Image` component
- **To**: Standard `img` tag or custom image component

### 4. Fonts

- **From**: Next.js `localFont` and `next/font/google`
- **To**: CSS `@font-face` declarations

### 5. SEO

- **From**: Next.js `Metadata` API
- **To**: TanStack Router head management

## Dependencies to Add

Based on `apps/web/package.json`, need to add:

- `@phosphor-icons/react` or `lucide-react` (icons)
- `@radix-ui/react-accordion`
- `@radix-ui/react-dialog`
- `@radix-ui/react-navigation-menu`
- `@radix-ui/react-separator`
- `@radix-ui/react-slot`
- `react-icons` (if needed)
- `tailwindcss-animate`

## Files to Remove After Migration

From `apps/www/src/components/`:

- `sign-in-form.tsx` (keep but hide)
- `sign-up-form.tsx` (keep but hide)
- `header.tsx` (replace with navbar.tsx)

From `apps/www/src/routes/`:

- `login.tsx` (keep but remove from main navigation)
- `dashboard.tsx` (keep but remove from main navigation)

## Success Criteria

- [ ] All original pages are accessible and functional
- [ ] Visual design matches the original Next.js app
- [ ] Responsive design works correctly
- [ ] Theme switching works
- [ ] No auth-related UI elements are visible in main navigation
- [ ] Auth logic is preserved for future use
- [ ] All links and interactions work correctly
- [ ] Performance is maintained or improved
