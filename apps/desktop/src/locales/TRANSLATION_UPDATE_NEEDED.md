# Translation Update Required

The filter system has been refactored to simplify the UI and make it more intuitive.

## Changes Made

The following translation keys have been **removed**:
- `filters.mode` - "Filter Mode"
- `filters.include` - "Include"
- `filters.exclude` - "Exclude"
- `filters.content` - "Content"
- `filters.hideOutdated` - "Hide Outdated"
- `filters.showOutdated` - "Show Outdated"
- `filters.showNSFWContent` - "Show NSFW Content"
- `filters.hideNSFWContent` - "Hide NSFW Content"
- `filters.excludeAudioMods` - "Hide Audio Mods"
- `filters.includingFilters` - "Including Filters:"
- `filters.excludingFilters` - "Excluding Filters:"
- `filters.showNSFW` - "Show NSFW"
- `filters.hideNSFW` - "Hide NSFW"
- `filters.audioOnly` - "Audio Mods"
- `filters.hideAudio` - "Hide Audio"
- `filters.hideOutdatedBadge` - "Hide Outdated"
- `filters.showOutdatedBadge` - "Show Outdated"

The following translation keys have been **added**:
- `filters.contentFilters` - "Content Filters"
- `filters.safeContent` - "Safe Content"
- `filters.nsfwContent` - "NSFW Content"
- `filters.outdatedContent` - "Outdated Content"
- `filters.audioModsOnly` - "Audio Mods" (replaces old audioModsOnly)
- `filters.safeContentHidden` - "Safe Content Hidden"
- `filters.nsfwContentShown` - "NSFW Content Shown"
- `filters.outdatedContentShown` - "Outdated Content Shown"
- `filters.audioModsHidden` - "Audio Mods Hidden"

## Files That Need Updating

All language files need to be updated with these new keys:

- [ ] `/locales/ar/translation.json` (Arabic)
- [ ] `/locales/de/translation.json` (German)
- [ ] `/locales/fr/translation.json` (French)
- [ ] `/locales/gsw/translation.json` (Swiss German)
- [ ] `/locales/pl/translation.json` (Polish)
- [ ] `/locales/ru/translation.json` (Russian)
- [ ] `/locales/tr/translation.json` (Turkish)
- [ ] `/locales/zh-CN/translation.json` (Chinese Simplified)

## Reference

See `/locales/en/translation.json` for the English version of these keys (lines 244-268).
