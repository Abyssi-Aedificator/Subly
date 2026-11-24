# Subly repository guidance

Subly is a buildless PWA for tracking online subscriptions. Serve the repository over HTTPS or localhost for installation, offline support, and Dropbox. See README.md for setup.

## Files

- `index.html` defines Overview, Settings, and the subscription editor.
- `style.css` handles responsive layout and light and dark themes.
- `app.js` handles subscription storage, renewal calculations, navigation, and theme preferences.
- `dropbox.js` handles Dropbox authorization, manual backup, and restore.
- `sw.js`, `manifest.webmanifest`, and the PNG icons support offline use and installation.

## Data and Dropbox

- Preserve compatibility with existing browser data and Subly backup files when changing the data model.
- Use local calendar days for renewal countdowns and elapsed time. Maintain month-end and leap-year handling when changing recurrence calculations.
- Keep theme preferences device-local. Dropbox backups contain the subscription list.
- Validate a downloaded backup before replacing local data. Preserve confirmation for replacements and Dropbox revision checks for uploads.
- Use isolated browser storage and mocked Dropbox requests for automated checks. Use a dedicated test account and disposable data for live integration checks.

## PWA and versioning

- Keep relative URLs and the manifest identity, start URL, and scope compatible with existing installs and subdirectory hosting.
- When changing cached files, advance the cache revision in `sw.js` so existing installs receive the update. Keep cache cleanup scoped to Subly's registration.
- For icon-only updates, ship the changed PNGs and the new `sw.js` revision together. Browsers detect the changed worker and Subly offers **Update now** or **Later** once the refreshed icon assets are cached.
- Advance the numeric suffix in `cacheName` independently of the release version. Repository-only documentation changes need no cache revision. `changelog.txt` is part of the cached app shell.

## Releases and changelog

- Change the app version only when explicitly requested. For a generic bump request, inspect the current version and offer Major, Minor, Patch, or Consolidation. Show the resulting versions for Major, Minor, and Patch. Follow an explicitly supplied bump type or target version and clarify any conflict between them.
- Use semantic versioning. Major increments the first component and resets the other two. Minor increments the second component and resets the patch. Patch increments the third component.
- On release, update the `.version-badge` text and accessible label in `index.html` and the release heading in `changelog.txt` together. If runtime release markers are introduced, keep them aligned with the badge.
- Keep release headings newest first. Record user-facing features and fixes under `Unreleased` until they ship, one bullet per line. Omit release-number and cache-revision bookkeeping from the bullets.
- When the user requests consolidation, confirm any missing inclusive version range and target. Combine and deduplicate affected user-facing notes into one release heading, preserve notes outside the range, and update the release markers and cache revision together.

## Git workflow

- Use `main` as the delivery branch unless the user specifies another. Inspect the current branch and working tree before changes.
- When committing, use one focused commit per feature or fix with a short imperative message and omit version numbers. Include related changelog and documentation changes. Fold release version updates into the last related change when preparing a release.

## Validation and delivery

- Inspect the working tree before editing and preserve unrelated changes.
- Run `node --check` on changed JavaScript when Node is available. Parse the manifest as JSON when it changes and run `git diff --check` before delivery.
- Verify affected UI at narrow and wide widths and in both themes when browser testing is available. For PWA changes, check installability and an offline reload.
- Update the README when user-facing behavior or setup instructions change.
- Push only when explicitly requested.
