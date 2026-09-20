# UO Asset Library

Browse the gallery and use the small Download link on an item to get its files. Open an armour set to inspect or download the complete set or an individual piece.

The library contains 332 listings with 418 ZIP packages. Shared collections stay together when their import tools require the full set.

- Equipment: native 35-action VDs, inventory icons and male/female paperdoll images.
- Creatures and mounts: native VDs and available setup files.
- Effects: PNG frames, animation metadata, import preparation and supplied Sphere scripts.
- World content: sprites and import files, or Sphere house scripts and layouts.
- Interface: PNG designs/components, labelled where UI integration is still required.

Packages are organised under public/gallery/downloads by category. Every package has usage notes and SHA-256 checksums. Creation prompts, design atlases, reference images, private workspace files, accounts, saves and test logs are excluded. GIFs and viewer images are previews; game files are in the ZIP downloads.

Use a development copy, check the chosen IDs and file access, close asset users and back up current data before importing. Read the package instructions and test the result in game. Some effects provide visual art only and require server behaviour. Interface artwork requires assembly. Dragon rider seating requires the supplied client integration patch; no replacement client executable is distributed.

## Website

Open public/index.html locally, or serve public as a static site. The site has search, category filters, complete armour sets with selectable pieces, and action/facing previews. No accounts, analytics or third-party browser libraries are needed.

Build: node tools/build.mjs
Tests: node --test tests/*.test.mjs

Only public is deployed to Cloudflare Workers. wrangler.jsonc configures that directory. The optional original catalogue builder remains available; the populated gallery is the homepage.
