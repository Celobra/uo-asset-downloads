# SphereX fresh server preview

Version 2026.10.16-preview. Windows x64. Custom SphereServer X Nightly development build.

This package starts a separate blank world with the official Scripts-X library. It does not include Ultima Online client data, UO:PvE scripts, existing player accounts or world saves. Use a new folder and retain a separate backup of any existing shard.

## First run

1. Extract the complete Windows ZIP into a new folder.
2. Run `Setup-Server.cmd`. Read the Nightly warning and accept it if you intend to use this development build.
3. Choose a folder containing your own compatible UO client data. Setup checks for `map0.mul` or `map0LegacyMUL.uop`, `tiledata.mul`, `statics0.mul` and `staidx0.mul`. The stock library enables map0–map5; use a complete matching modern client installation for those facets.
4. Choose your shard name and port. The local default port is 2593.
5. Create an Owner account. The legacy UO password limit is 8–16 printable ASCII characters without spaces. No shared account or default password is distributed.
6. Run `Start-Sphere.cmd`. Connect a compatible UO client to `127.0.0.1` and your selected port.

The shipped configuration begins with local server settings. For a client that sends unencrypted connections, review `UseNoCrypt` in `sphere.ini`; the setup guide in the ZIP explains that setting. Public hosting requires your own network, server-list and access configuration. Setup does not publish the server or configure a router.

The five save files start with no objects, and both account files are empty. Create decorations, vendors and spawns through the normal Sphere tools. Setup does not populate a ready-made shard. Once an account exists, rerunning setup refuses to overwrite the account or configuration; make later configuration changes with the server stopped.

## Console and map

Use the console's text and severity filters and command history to inspect output. Script diagnostics can open the relevant source. `RESYNC` reloads configured resources; `RELOAD scripts/example.scp` loads a particular file. Reloading is not transactional and does not recreate existing objects. Include new resources in the configured script list for later restarts.

The administration map reads the configured client terrain. Select a facet, search characters by name, definition, UID or tracking code, and select markers or list rows. Zoom with the wheel, drag to pan and use Fit to frame the view. Area or Shift+drag selects a rectangle. Offline players show their last saved position, rather than a current connected location.

NPCs, players, pets and recognised quest contacts have distinct markers. Sleep grey represents sleeping sectors. The Paths list can show native cached NPC paths or managed journeys when available; stopped or completed routes are history, rather than active movement. The map is an administrative overview, rather than a full UO game renderer.

## Useful commands

| Command | Purpose |
| --- | --- |
| `CONSOLEHELP` | Native console command reference |
| `INFORMATION` | Current server information |
| `CHAR INFO <uid/code>` | Character information |
| `CHAR FIND -1 <text>` | Search all facets |
| `NPC FIND 0 dragon` | Search NPCs on a facet |
| `CHAR AREA <map> <x1> <y1> <x2> <y2>` | Report matching characters in an area |
| `NPC TRACE <uid> [seconds]` | Bounded movement and combat trace |
| `SAVE 1` | Save the world |
| `RESYNC` | Reload configured script resources |

The matching source's `CONSOLE_TOOLS.md` contains the detailed feature and command reference. Its historical installation examples describe the development installation; use your own extracted server folder. Owner actions such as teleporting, jailing, managed journeys, activity searches and account controls require PLEVEL 7. Server permission checks remain authoritative.

Activity recording can create local JSONL logs containing player and account-related information. Retain those records privately. Recording coverage is incomplete; the existing audit does not establish a complete transaction ledger.

## Maps, optional examples and updates

The current native source supports disabled facets, but changing to a single-facet shard also requires removing or disabling script resources for the other facets. Disabling maps while still loading their region and teleport definitions produces errors. Review configuration and resources together.

The source includes optional courier and faction-patrol examples. They are not part of the fresh stock library and do not start automatically. Their presence in historical screenshots does not mean the blank download contains those NPCs or routes.

Keep public server binaries, private accounts, saves and scripts under your own version and backup policy. Native executable changes require a controlled restart. Never copy a blank-world package over an established shard.

## Checks and limitations

The public rebuild used the exact gameplay source identified by the retained 8 October native build manifest. The existing console-tools tests and isolated fresh-package checks passed. Those checks cover blank startup, first Owner setup and authenticated console login, save/restart and preservation when setup is repeated. Package archive, source correspondence and privacy checks passed.

The previous GUI audit still reports compact-window layout and Pause defects. Expensive searches, activity recording and native pathfinding have additional documented limitations. This publication does not implement the proposed GUI or performance improvements. It is unsigned, based on a Nightly server and remains a development preview. This rebuild has no new production-load, receiving-system or multiplayer-gameplay validation. Earlier benchmark percentages describe their original measured executables.

See `source-provenance.md` for the exact source/build identity and `third-party-notices.txt` for licences. Original projects: https://github.com/Sphereserver/Source-X and https://github.com/Sphereserver/Scripts-X.
