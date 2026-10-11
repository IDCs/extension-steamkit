# Changelog

All notable changes to steamkit. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- A nightly workflow keeps the game version catalog current from Steam's app info and BUTR's Bannerlord builds, and
  opens a pull request with what it found
- Bannerlord versions no Steam branch serves, such as e1.8.0, join the catalog through that pull request

### Changed

- Choosing which files to restore uses steamkit's own dialog: a count, Select all and Select none, and a file list
  that scrolls on its own
- Steam jobs take turns: a job started while another runs waits, with its own notification and Cancel
- The sign-in prompt says which job needs the Steam account
- A game's Workshop page starts afresh when you switch games

### Fixed

- Workshop searches with characters such as `&`, `#` or `+`
- Workshop downloads whose title has no usable file name, or a name Windows reserves, sharing one folder
- Temporary files left behind by Workshop downloads
- A style rule from steamkit changing progress bars elsewhere in Vortex
- A Steam request that times out reported as an unexpected error
- One malformed version in the catalog stopping the whole catalog from loading

## [1.0.1] - 2026-10-10

### Fixed

- The Steam page shows the Steam icon in the sidebar

## [1.0.0] - 2026-10-10

### Added

- Game Versions: install a game version from a built-in catalog of versions for 86 games, or from versions you add,
  with the installed version marked
- The Steam Workshop page shows which items are installed, and installed items carry their title, author, version,
  description and Workshop link
- Sign-in with the Steam Mobile app or a QR code, and remembering the sign-in, encrypted for your Windows account
- Download progress and Cancel on every Steam job

### Changed

- Rebuilt on DepotDownloader 3.4.0 through a .NET bridge, working with Steam's current sign-in and download formats

[Unreleased]: https://github.com/Nexus-Mods/extension-steamkit/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/Nexus-Mods/extension-steamkit/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Nexus-Mods/extension-steamkit/releases/tag/v1.0.0
