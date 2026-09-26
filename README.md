# UO Asset Library

## UO Asset Studio

[Explore UO Asset Studio](https://uo-asset-library.farthrex.workers.dev/studio/) — a connected Windows workshop for UO artwork, animations, paperdolls, Sphere scripts, sound, houses and generated worlds.

**[Download the Windows installer](https://github.com/Celobra/uo-asset-downloads/releases/download/uo-asset-studio-v0.30.1/UOAssetStudio-Setup-0.30.1.exe)** · [Complete PDF guide](https://uo-asset-library.farthrex.workers.dev/studio/guide/UOAssetStudio-User-Guide-0.30.1.pdf) · [Separate application source](https://github.com/Celobra/uo-asset-downloads/releases/download/uo-asset-studio-v0.30.1/UOAssetStudio-Source-0.30.1.zip)

The dedicated section contains an overview, a detailed workflow tour with actual app screenshots and animated walkthroughs, a downloads/guide page and a searchable [Updates page](https://uo-asset-library.farthrex.workers.dev/studio/updates/). The release bundles a ready-to-run installer; source and offline documentation are separate downloads. This repository contains the website, while the named Studio source ZIP contains the application code.

Maintain release history in `data/studio-updates.json`, newest first. Add verified user-facing changes under `added`, `fixed` or `improved`; use `date` only for a known publication date and `release: true` only when its GitHub release exists. The normal website build generates the static Updates page and keeps its navigation link on the Studio pages. Older entries were reconstructed from application release notes and verified development records; repeated 0.20.2 builds are grouped under that version. Filtering is optional: the complete history is readable without JavaScript.

Version 0.30.1 fixes legacy UOP terrain loading, handles trailing map padding and detects standard map dimensions automatically. Version 0.30.0 added a redesigned Home, navigation sidebar and searchable tool library, with remembered side panels and text-size choices. Map Regions edits Sphere boundaries and guarded, magic and travel rules through reviewed saves. The complete guide contains 68 pages across 33 chapters.

## Asset library

Browse the gallery and use the small Download link on an item to get its files. Open an armour set to inspect or download the complete set or an individual piece.

The library contains 452 listings with 629 ZIP packages. Shared collections stay together when their import tools require the full set.

- Equipment: native 35-action VDs, inventory icons and male/female paperdoll images.
- Creatures and mounts: native VDs and available setup files.
- Effects: PNG frames, animation metadata, import preparation and supplied Sphere scripts.
- World content: sprites and import files, or Sphere house scripts and layouts.
- Interface: PNG designs/components, labelled where UI integration is still required.

Packages are organised under public/gallery/downloads by category. Every package has usage notes and SHA-256 checksums. Creation prompts, design atlases, reference images, private workspace files, accounts, saves and test logs are excluded. GIFs and viewer images are previews; game files are in the ZIP downloads.

Use a development copy, check the chosen IDs and file access, close asset users and back up current data before importing. Read the package instructions and test the result in game. Some effects provide visual art only and require server behaviour. Interface artwork requires assembly. Dragon rider seating requires the supplied client integration patch; no replacement client executable is distributed.

## Website

Open public/index.html locally, or serve public as a static site. The site has search, category filters, complete armour sets with selectable pieces, and action/facing previews. Every equippable item opens with an equipped male/female paperdoll; switch to Animations for walking, running, riding and other actions. Armour checkboxes remove the same piece from both views, with Clear and Full set controls. Paperdoll images are also available in the preview downloads. No accounts, analytics or third-party browser libraries are needed.

Build: node tools/build.mjs
Tests: node --test tests/*.test.mjs

Only public is deployed to Cloudflare Workers. wrangler.jsonc configures that directory. The optional original catalogue builder remains available; the populated gallery is the homepage.


## Travelling Caravan

[Open the animated example](https://uo-asset-library.farthrex.workers.dev/#travelling-caravan) · [Download the test build](public/gallery/downloads/world/travelling-caravan.zip)

![Caravan with horse: travelling and parked](public/gallery/media/travelling-caravan/Caravan-with-horse.gif)

A movable UO-style caravan in two versions, with and without a harness horse. The wheels turn while travelling and stop when parked; chimney smoke continues. Passengers, furniture, loose floor items and cargo containers keep their positions as the caravan moves and turns, including items nested inside containers.

Each version includes a placement deed. Successful placement gives the owner reins in their backpack for boarding, travelling, parking, turning, leaving and securing furniture. The cabin has walkable rear steps, a cargo chest and a bedroll. Travel requires clear, level land with sufficient turning space.

Sphere X test build with a guarded native-data installer and rollback backup. Includes four facings, native wheel/horse/smoke animation, two deeds and setup instructions. After installation, a GM can create the deeds with `.add i_deed_gc_caravan` and `.add i_deed_gc_horse_caravan`.

The isolated tests passed 226 movement/cargo checks, 20 connected-player access checks and installer/rollback checks. Native roof cutaway, lighting and player overlap still require an in-game visual check. The horse is an attached animated part rather than a pet; the rear door is decorative and this build has no redeeding command. Preview GIFs are assembled native frames, not game recordings.

![Caravan without horse](public/gallery/media/travelling-caravan/Caravan-without-horse.gif)


### Caravan placement update

Fixed decimal terrain-coordinate lookup, including placement on flat Green Acres grass. The placer can stand in the footprint and is moved to the rear landing on success; other players, objects and uneven ground still block placement with an explanation. Continuous travel also retains the first-step result reliably. Both deeds were tested on the actual Green Acres map with a connected non-GM player: placement, boarding, driving, passenger position and parking pass. The movement/collision matrix passes 232 checks.

For an existing caravan installation, back up and replace only `scripts/items/travelling_caravan.scp` from the new ZIP, then restart Sphere or resynchronise its scripts. Existing deeds remain valid; no client-art update is needed. The full installer remains for first installation.


## New equipment and timber caravan

The Jedi & Sith collection adds five lightsabers and two complete robe-and-hood outfits. Open an outfit to show or download its robe and hood separately. All nine equipment pieces include 35-action native VDs, male/female paperdolls and inventory icons, with walking, running and riding GIFs plus an eight-view interactive player. Destination IDs are unassigned and in-game fitting remains required; blades are permanently lit artwork without sound, dynamic light or Force abilities.

[Timber Travelling Caravan](https://uo-asset-library.farthrex.workers.dev/gallery/#timber-travelling-caravan) is a separate vehicle with a working native door, walk-through stairs and seated-owner driving, in horse and horseless versions. It includes the tested Sphere installer, scripts, runtime frames and setup guide. It preserves the earlier caravan. Exact client seated appearance, clothing overlap and roof cutaway still need visual checking.

## Custom ClassicUO Update 3

[Client download and screenshots](https://uo-asset-library.farthrex.workers.dev/client/) — Standard edition for Windows x64, without bundled Invicta gumps. Includes the built-in assistant, counters bar, hotkeys, macro library and separate Razor/Orion script modes. The 32-page PDF covers updates, installation, player use and server administration. The master policy and two staff helpers are available together as a separate server-scripts download and are also included beside the client in its ZIP.

The assistant requires the shard's policy reply; GM Tools additionally requires server-confirmed PLEVEL 4 or higher. Scripting implements the documented command subset rather than complete external engines. The download contains no personal settings, UO archives, accounts or world saves.


## Formalwear: five coordinated suit and dress collections

[Black Tie](https://uo-asset-library.farthrex.workers.dev/gallery/#formalwear-black-tie-set), [Royal Navy](https://uo-asset-library.farthrex.workers.dev/gallery/#formalwear-royal-navy-set), [Oxblood Velvet](https://uo-asset-library.farthrex.workers.dev/gallery/#formalwear-oxblood-velvet-set), [Emerald Brocade](https://uo-asset-library.farthrex.workers.dev/gallery/#formalwear-emerald-brocade-set) and [Ivory Wedding](https://uo-asset-library.farthrex.workers.dev/gallery/#formalwear-ivory-wedding-set). Each wardrobe has a long coat, shirt, waistcoat, trousers, neck-slot tie/cravat, shoes, gloves, matching gown and choker. Suit/Dress choices synchronize paperdoll and animation; individual checkboxes and downloads remain available. Coats and gowns have folded backpack icons. Every item includes both human paperdolls and all 35 action groups, with walking/running/riding GIFs and eight-view playback. Destination IDs are unassigned; recipient in-game fitting remains required.


## September 26 complete non-Invicta publication

Added the Dunce Hat, twelve animated spellbooks, seven Wilds & Alchemy wearable sets, four healing companions, twenty architecture styles, twenty-four outdoor terrain families, thirty floor families plus four raised terrain-edge families, and four Sky & Shore transition families. Wearable cards include male/female paperdolls, movement previews, full-set piece toggles and individual downloads. All destination IDs remain unassigned and the packages require development import and in-game verification. Invicta-exclusive material, creation prompts, accounts, saves and private workspace records are excluded.
