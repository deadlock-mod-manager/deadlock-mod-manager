# i18n Implementation Summary

## What was implemented:

### 1. Dependencies Added
- `i18next`: ^25.5.2 (internationalization framework)
- `react-i18next`: ^15.7.3 (React integration)
- `i18next-browser-languagedetector`: ^8.2.0 (automatic language detection)

### 2. Core i18n Configuration (`src/lib/i18n.ts`)
- Configured with fallback language: English (`en`)
- Supported languages: English (`en`), German (`de`), French (`fr`)
- Language detection from localStorage, browser, and HTML tag
- Persistence via localStorage with key `deadlock-language`

### 3. Language Switcher Component (`src/components/language-switcher.tsx`)
- Dropdown menu with flag icons and language names
- Integrated into the toolbar
- Calls `i18n.changeLanguage()` to switch languages
- Automatically persists selection to localStorage

### 4. Menu Integration (`src/components/menu.tsx`)
- Added Language menu to the menubar
- Direct language switching from menu
- Uses translation keys for menu items

### 5. Tauri Integration
- Added `set_language` command in Rust backend (`src-tauri/src/commands.rs`)
- Language change events can be triggered from Tauri backend
- Frontend listens for `set-language` events via `useLanguageListener` hook

### 6. Translation Files Updated
- Extended existing translation files with new keys
- Added common UI elements like "Game Detected", "Launch Vanilla", etc.
- All three languages (EN/DE/FR) have complete translations

## How to use:

### Basic Translation Usage
```tsx
import { useTranslation } from 'react-i18next';

const MyComponent = () => {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('navigation.myMods')}</h1>
      <p>{t('common.loading')}</p>
    </div>
  );
};
```

### Translation with Variables
```tsx
const { t } = useTranslation();

// In translation files: "gameInstalledAt": "Game installed at {{path}}"
<p>{t('common.gameInstalledAt', { path: gamePath })}</p>
```

### Pluralization
```tsx
// In translation files:
// "downloading": "Downloading {{count}} mod"
// "downloading_plural": "Downloading {{count}} mods"

<p>{t('downloads.downloading', { count: modCount })}</p>
```

### Adding New Translations
1. Add keys to all three language files in `public/locales/{lang}/translation.json`
2. Use the `t()` function in your components
3. The system will automatically fall back to English if a translation is missing

### Language Switching
- Users can switch languages via the LanguageSwitcher component in the toolbar
- Users can switch languages via the Language menu in the menubar
- Language preference is automatically saved to localStorage
- Language persists across app restarts

## File Structure:
```
apps/desktop/
├── public/locales/
│   ├── en/translation.json
│   ├── de/translation.json
│   └── fr/translation.json
├── src/
│   ├── lib/i18n.ts                    # i18n configuration
│   ├── components/
│   │   ├── language-switcher.tsx      # Language switcher component
│   │   ├── menu.tsx                   # Updated with language menu
│   │   └── toolbar.tsx                # Updated with translations
│   └── hooks/
│       └── use-language-listener.ts   # Tauri event listener
└── src-tauri/src/
    ├── commands.rs                    # Added set_language command
    └── lib.rs                         # Registered new command
```

The implementation is complete and ready to use! The system supports German, French, and English with English as the default fallback language.
