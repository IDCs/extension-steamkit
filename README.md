# steamkit

A Vortex extension that talks to Steam for games Steam installed. It needs Vortex 2.8.0 or later and ships its own
.NET runtime.

- **Verify Files** checks the game's files against Steam's manifests and restores the ones you select.
- **Game Versions** puts the game at an older or newer version by downloading that version's depots, from a
  catalog of known versions plus ones you add.
- **Steam Workshop** browses a game's Workshop and installs items as mods (needs a Steam Web API key).

Owned games need a Steam sign-in: password, Steam Guard, the Steam Mobile app or a QR code. Vortex can remember the
sign-in, encrypted for your Windows account.

## For game extensions

steamkit registers three API calls. Call them through `context.api.ext`, after checking the call exists.

```ts
// Verifies the game's files, asking the user which to restore. Parameters override the game's Steam app and folder.
api.ext.steamkitVerifyFileIntegrity?.(parameters: ISteamKitParameters, gameId: string, callback?: (err) => void);

// The game's versions, built-in first, each with whether the game is at it.
api.ext.steamkitGetGameVersions?.(gameId: string, callback: (err, versions?: Array<{
  source: "builtIn" | "user";
  version: { id: string; label: string; branch?: string; depots: Array<{ depotId: number; manifestId: string }> };
  installed: boolean;
}>) => void);

// Puts the game at one of its versions without asking the user first.
api.ext.steamkitInstallGameVersion?.(gameId: string, versionId: string, callback?: (err) => void);
```

Failures are reported to the user and passed to the callback. A game can hide steamkit's page and actions with
`details.hideSteamKit: true`.

## Development

Needs pnpm (the repo pins Node through `devEngines`) and the .NET 9 SDK.

| Command               | Does                                                                         |
| --------------------- | ---------------------------------------------------------------------------- |
| `pnpm run build`      | Builds the .NET bridge into `dist/dotnet` and the extension into `dist`      |
| `pnpm run test`       | Offline .NET and JS tests                                                    |
| `pnpm run typecheck`  | TypeScript, including `scripts/`                                             |
| `pnpm run typedefs`   | Regenerates `src/types/dotnet` from the bridge; CI fails when they are stale |
| `pnpm run test:steam` | Tests against real Steam, signed in anonymously                              |
| `pnpm run bundle7z`   | Packs `dist` into `steamkit.7z`                                              |

Opt-in Steam tests, never run in CI:

- `STEAM_TEST_USER` and `STEAM_TEST_PASSWORD`: an account owning Skyrim Special Edition, without Steam Guard prompts.
- `STEAM_QR_SIGN_IN=1`: signs in by a QR code written to `%TEMP%\steamkit-sign-in.png`, to scan with the Steam
  Mobile app of an account owning Bannerlord.

To try a build in Vortex, copy `dist/index.js` and `dist/dotnet` into the installed extension's folder
(`%APPDATA%\Vortex\plugins\steamkit`) while Vortex is closed; the .NET assemblies are locked while it runs.

The `DepotDownloader` project is DepotDownloader 3.4.0. Keep changes to its files to small hooks, so they still
diff cleanly against upstream.

## The game version catalog

`catalog.json` lists each game's versions: the depots Steam downloads and the manifest of each. Vortex reads the
copy on `main` when it starts, so a merged change reaches users without a release.

The **Update catalog** workflow runs nightly (`pnpm run catalog:update` locally):

1. It reads Steam's app info for every catalog game, and BUTR's build records for Bannerlord.
2. It adds the builds the catalog doesn't list, matched by the manifests of the game's depots: those of its newest
   version, unless `catalog.sources.json` names others. Nothing listed is changed or removed.
3. It opens or updates one pull request when the catalog changed.

Before merging that pull request:

- Rename any version labelled `Build N`: a default-branch build no source named. Later runs keep your label.
- Check where old builds landed; they are placed by build id, which doesn't always follow the version.

`catalog.sources.json` holds the exceptions: labels for branches whose name doesn't say the version, BUTR feeds (with
`history` for builds no branch serves), and depot overrides. To add a game, add it to `catalog.json` with one version
pinning its depots; the nightly run fills in the rest.

## Releasing

Run the **Publish to Nexus Mods** workflow with the version to release. It builds the package with that version in
`info.json`, uploads it, then commits the version bump and tags it. Vortex only offers the update when `info.json`
matches the version on Nexus Mods.
