# CentrED# Local 0.7.3

Player view provides a character preview of the current map with WASD/arrow
movement, approximate surface and clearance checks, free inspection and an
optional hide-above-player view. Escape or Return to editing restores the
previous camera and display settings. Preview input never edits map tiles.
Character animation comes from the artwork folder supplied by the user.

Real client testing lets you select an existing client executable and optional
arguments, export the current map into a separate folder, and launch that client
in its own window. The client uses its own configured data and server. Install
the export into matching test data before testing; there is no automatic live
sync or embedded game session. Server doors, objects, scripts, equipment and
movement rules are checked in the real client/server.

The two-corner area picker works in the editor and minimap for large operations
and XY view boundaries. Cancel retains previous coordinates; picking never
submits an operation. Inclusive XY boundaries are independent of height, graphic
and hue filters, and belong to each map's display presets. Hidden tiles cannot
be selected for editing. Image export freezes the current bounds; image overlays
and the virtual plane are hidden while bounds are enabled.

Workspace layouts save panel visibility and docking positions separately from
maps, bookmarks and display presets. Named layouts support load, rename and
delete, plus Editing/Inspection panel choices and restoring the previous
arrangement. Replacing, deleting and resetting layouts require confirmation;
applying an arrangement preserves recovery copies first.

Local editing still uses one Windows x64 executable. Supply your own UO data.
No production client files are installed or changed automatically.
