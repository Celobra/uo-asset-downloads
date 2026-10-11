# Celobra Edition 0.7.4: audit and improvement priorities

11 October 2026

The review covered everyday editing, map creation and discovery, tabs, Undo,
saving, recovery, exports and interface usability. This page separates the
changes implemented for 0.7.4 from proposed follow-up work. The numbered list
is a roadmap, not a claim that those suggestions are already available.
Final release checks are recorded separately with the release.

## Changes implemented for 0.7.4

| Area | What changed | What this means for a builder |
| --- | --- | --- |
| Blank maps | A wizard creates a new flat MUL or supported uncompressed UOP terrain map with empty matching statics and index. It offers facet, size, terrain, elevation, storage estimates and preparation cancellation. | A matching artwork folder is enough to begin a new map; an existing map is optional. |
| Prepared map tabs | Compatible discovered maps can be queued together. Tabs show preparation and error states; ready map engines remain available while another prepares. Equivalent MUL/UOP choices are grouped, with extended variants kept separately. | Builders can move between prepared facets without repeating their full minimap preparation on every switch. Initial preparation still takes time and disk space. |
| Per-map session state | Open tabs hold separate Undo/Redo and view/navigation state. Saved tab and display/view preferences can be restored on a later launch. | Returning to an open tab keeps its work context. Closing a tab or restarting starts fresh Undo; checkpoints remain the longer-term recovery tool. |
| Failed recovery | A persistent recovery restriction blocks editing, saving, exports and automatic writes after a rollback fails. Explicit verified restoration clears it. The recovery panel includes Restore last saved map. | Partial failed edits cannot be silently committed by a later automatic save. A damaged operation checkpoint can be bypassed using the verified last-saved recovery copy, when that copy is usable. |
| Legacy object Undo | Local Delete/Replace uses checkpoint history for existing objects whose old artwork ID or hue cannot be inserted through ordinary editing. Replacement data is checked before removing the original. | Undo can restore those exact old records. Normal valid edits retain ordinary Undo; a stroke containing legacy objects can produce several history entries. |
| Interface robustness | Runtime names, paths, percentages and diagnostic messages use literal text rendering. Debug inspection handles missing graphic metadata. Failed map adoption releases its prepared engine so Retry can proceed. | Unusual names and incomplete legacy artwork are handled more clearly, and a failed preparation does not unnecessarily keep its map files locked. |

Existing tools, palettes, blueprints, navigation, workspace layouts, bounded
image export, approximate player preview and separate real-client launch are
carried forward. The editor still needs matching UO data supplied by the user.

## Proposed next work, in priority order

1. **Open a recovery screen even when the map cannot load.**

   **Problem:** If both the working files and their last-saved recovery copy
   are unreadable, map opening can fail before the current recovery panel is
   available. **Action:** Add a recovery-only opening mode that verifies a
   chosen checkpoint, preserves the failed files, and restores without first
   loading the damaged map for editing. **User impact:** A builder can recover
   inside the program instead of manually repairing files.

2. **Show checkpoint space, progress and retention controls.**

   **Problem:** Checkpoints and some Undo actions copy and verify the complete
   map set. On large maps this pauses the editor and consumes substantial disk
   space; an ordinary restore currently keeps more than one safety copy.
   **Action:** Show estimated bytes, free space and progress before copying;
   allow cancellation before mutation; provide a clear retention policy and
   keep one verified safety copy per restore. Never remove a checkpoint still
   referenced by Undo or recovery. **User impact:** Fewer unexplained pauses
   and better control over disk use without weakening recovery.

3. **Keep unavailable saved maps visible and reconnect their artwork.**

   **Problem:** A moved or missing artwork folder can cause a saved working
   map to be omitted from the library even though its map files still exist.
   **Action:** Keep an unavailable row with the reason and add Reconnect
   artwork folder. Verify that the replacement artwork matches before updating
   the saved reference. **User impact:** Moving folders does not make a
   project appear lost, and the builder knows exactly what needs attention.

4. **Only mark a map export complete after every file is ready.**

   **Problem:** Full-map export creates its final folder before its manifest
   and guide are finished. An interrupted export can therefore look complete.
   **Action:** Copy to a temporary export folder, verify the map triplet and
   metadata, then rename it to the final folder. Add progress and cancellation
   like the safer image-export workflow. **User impact:** The receiving client
   or server gets a clearly complete export, with fewer ambiguous leftovers.

5. **Keep large painting selections responsive.**

   **Problem:** Ordinary area strokes still enumerate their selection
   synchronously and can collect many Undo records. Large selections can
   stall the interface. **Action:** Estimate the affected area and route large
   strokes through manageable chunks with preview, progress,
   cancellation and accepted-result Undo. Preserve the exact selected brush
   and chance result. **User impact:** The builder can see and stop expensive
   work while ordinary small strokes stay immediate.

6. **Cancel folder discovery and reuse companion-file checks.**

   **Problem:** Background preparation has cancellation, but folder discovery
   still lacks its own cancellation and can validate the same statics/index
   pair more than once for equivalent terrain formats. **Action:** Add Cancel
   to discovery, cache checks by matching companion pair, and show invalid
   candidates with concise reasons. **User impact:** Large data folders open
   more predictably, and errors explain what is missing or incompatible.

7. **Show the memory cost of keeping maps ready.**

   **Problem:** Every ready tab retains a map engine, minimap and caches.
   Several large facets can consume substantial memory even when their tabs
   are inactive. **Action:** Show ready-map count and measured resource use,
   offer a configurable ready-map budget, and provide an explicit unload
   action that explains any loss of session Undo before proceeding.
   **User impact:** Builders can balance fast switching against the memory
   available on their PC instead of guessing which tabs to close.

8. **Improve keyboard access and visible focus.**

   **Problem:** A docked interface contains many controls, and map movement
   shortcuts must not compete with typing in a field or choosing an action.
   **Action:** Audit keyboard-only navigation, show the focused panel clearly,
   expose useful shortcut labels, provide predictable Escape behaviour, and
   keep confirmation and error actions reachable without a mouse.
   **User impact:** Faster repetitive editing and better access for people
   who depend on keyboard controls.

9. **Balance panels and make status readable without colour alone.**

   **Problem:** Dense tool panels can crowd the map on smaller windows, while
   subtle contrast and colour-only status make problems harder to spot.
   **Action:** Add a compact beginner layout and a detailed builder layout,
   sensible panel size limits, scalable text, stronger readable contrast,
   and text/icon labels for pending, ready and failed tabs. Check normal
   window sizes as well as high-resolution displays. **User impact:** More
   useful map space and clearer actions without sacrificing advanced tools.

10. **Make the player-view handoff easier to verify in the real game.**

    **Problem:** The animated editor preview uses approximate surface and
    clearance rules. Doors, scripts, equipment, live shard objects and server
    movement rules can behave differently in the game. **Action:** Keep the
    preview's limits visible, improve its missing-animation guidance, and
    provide a short checklist for exporting to disposable test data and
    walking the build in the intended original client and test server.
    **User impact:** Builders know which observations are useful previews
    and which still need an actual gameplay check.

11. **Make map-format and companion errors easier to resolve.**

    **Problem:** Recognising a MUL or UOP terrain file is only part of opening
    a map; its dimensions and matching statics/index must also be valid.
    A long list of low-level errors can obscure the next useful action.
    **Action:** Group errors by facet, show the selected terrain and companion
    filenames together, explain why one compatible MUL/UOP choice was selected,
    and offer an explicit matching-pair picker for advanced users. Keep custom
    dimensions visible and explain that UOP terrain still uses matching MUL
    statics/index. **User impact:** Less trial and error when opening custom
    data, without incorrectly treating every UOP archive as a complete map.

## Limits and credits

These proposals do not promise perfect recovery after disk damage, persistent
Undo after restart, zero-cost map switching, an embedded full game client or
live synchronisation. Keep independent backups and verify exported work in
the intended client/server. The public editor packages do not supply game
maps, artwork, accounts or world saves.

Celobra is this edition's publisher and maintainer. The original CentrED#
author, kaczy93, retains the original copyright and credit; the MIT licence
and third-party notices remain. Branding does not prevent permitted copying
or imply sole authorship of the original program.
