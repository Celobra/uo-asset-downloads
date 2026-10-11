# Celobra Edition 0.7.4

This version extends the verified Celobra Edition 0.7.3 feature baseline.
Original CentrED# attribution and the MIT licence remain unchanged.

## Blank maps

- Create flat terrain with empty statics in a new managed working copy.
- Choose map0 through map5, standard or custom dimensions, land graphic,
  initial elevation and MUL or uncompressed UOP storage.
- Read terrain choices from the selected artwork, show storage estimates,
  stream output with progress/cancellation, and verify it before opening.
- Reject invalid dimensions, incomplete artwork, invalid terrain/elevation,
  unsafe destination overlap and insufficient space before writing a map.

## Prepared map workspace

- Add compatible discovered maps as visible pending tabs and prepare them
  in the background. Equivalent MUL/UOP choices are deduplicated; x variants
  keep their own tabs. Custom dimensions require explicit input.
- Keep ready map backends resident and share artwork from the same folder.
  Switching avoids the repeated full radar scan in earlier versions.
- Retain separate Undo/Redo, view, display and navigation for each open map.
  Persist view/display state for the next launch; session Undo is not saved.
- Save once at the transition and keep the previous tab selected if saving
  fails. Cancel preparation or close unused tabs to release resources.

## Audit fixes

- Hold maps for verified recovery after a failed rollback; block edits,
  saves, exports, automatic writes and shutdown flushing while held.
  Persist this protection across restarting and clear it only after a
  verified restore.
- Use checkpoint history when deleting/replacing existing invalid static
  records locally, so Undo can restore legacy data without invalid packets.
- Display paths, filenames and errors as literal text, including percent
  signs, without passing them to native formatting functions.
- Cancel deep preparation scans promptly and pause inactive map autosaves
  and backups until that map becomes active again.

## Practical limits

Preparing maps requires working-copy disk space and resident memory. The
first copy/scan still takes time; ready switching avoids repeating it.
Artwork changes between different source folders can require loading their
resources. Normal large-edit and image-export guards still apply to switching.

Player view remains an approximate in-editor preview. Exports and real-client
launch remain separate workflows; live shard rules and in-game acceptance
must be tested in the user's receiving client/server. No UO game data is
distributed. This unsigned development release does not prevent copying.

Validation results are recorded with the release package after its checks.
