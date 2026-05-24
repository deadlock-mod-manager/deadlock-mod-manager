# Design System Notes

Deadlock Mod Manager is a dark, asset-heavy desktop application with a persistent
sidebar, dense mod grids, compact toolbars, and game/mod media as the main visual
material. The interface should feel like a capable local utility, not a landing
page.

## Visual Direction

- Dark neutral foundation with warm cream/gold accents and red danger states.
- Real mod imagery and gameplay screenshots are preferred over abstract
  decoration.
- Keep cards tight, with small radii and predictable action placement.
- Use contrast, grouping, and state labels to separate active work from history.
- Avoid pure black or pure white as broad surface colors; use tinted neutrals.

## Components

- Sidebar: persistent primary navigation, compact labels, clear active state.
- Toolbar: search, filters, sort, view mode, update actions, and library actions.
- Mod cards: image/audio preview area, title, author, state toggle/action, and
  destructive controls in consistent positions.
- Alerts: reserve large alerts for blocking or high-risk states. Repair prompts
  should default to compact rows with expandable details when possible.
- Downloads: active downloads need progress. Completed downloads should read as
  compact history.
- Settings: grouped controls, clear section labels, and searchable/common tasks
  for high-frequency maintenance actions.

## Interaction Rules

- Bulk operations should use an explicit selection mode with a sticky action bar
  showing selected count and available actions.
- Delete, reset, repair, and file mutation flows should disclose affected count
  and scope before committing.
- Icon buttons need accessible labels and useful tooltips.
- Loading and empty states should explain the next useful action, not restate the
  page title.

## UX Review Checklist

- Can a user tell whether the game, profile, downloads, and mod library are in a
  healthy state within five seconds?
- Is the primary action on each page obvious without reading every card?
- Are active problems visually distinct from routine history?
- Can power users act on many mods without repetitive one-card-at-a-time work?
- Does every destructive action explain what local files or app state are
  affected?
