TASK 20 — Work Item Editing UI (Essential Polish & Correction Tools)
1) WHAT WE WANT

Add a simple and clean Work Item Editing Interface so users can correct or update any work item inside an asset. Specifically, users must be able to:

Edit work item name (work_type label)

Edit item_code (e.g., 311, 208, 701, etc.)

Edit unit (blocks, m³, m², pcs, lm, etc.)

Set or update target_total (optional planned quantity)

Correct wrong auto-created work items

Delete or merge work items (with safety checks)

Important:
This editability is required because field-generated work items can have:

misspelled labels

wrong units

wrong item_code

no target totals

accidental duplicates

This task makes the system fully usable for contractors, DPWH inspectors, and LGU engineers.

2) WHY WE WANT IT

Because real projects are messy.

Without this feature:

Users get stuck with wrong work items

Field logs become messy

Daily Summary becomes confusing

PDF summaries show incorrect values

Units mismatch and supervisors can’t read real progress

Task 20 is essential to:

clean up data

fix mistakes

prepare for dashboards

prepare for Notifications (Task 21)

prepare for full-scale pilot deployment

This is not optional polish — it is core usability for the real world.

3) WHAT THE RESULT SHOULD LOOK LIKE
A. Add “Manage Work Items” button inside Asset view (pwa/index.html)

Inside the Assets tab:

For each Asset row → add an “Edit Work Items” button.

Clicking it opens a modal (or a sidebar panel) showing the list of work items for that asset:

Work Items for ASSET-001 (0+000–0+100 right)

----------------------------------------------
| Work Type:        | PCCP (Concrete Pavement)
| Item Code:        | 311
| Unit:             | blocks
| Target Total:     | [ 22 ] blocks
| Cumulative:       | 12 blocks   (read-only)
| Remaining:        | 10 blocks   (auto)
[ Save ]   [ Delete ]   [ Merge With... ]
----------------------------------------------

| Work Type:        | Base Course
| Item Code:        | 208
| Unit:             | m3
| Target Total:     | [ 500 ] m3
| Cumulative:       | 60 m3      (read-only)
| Remaining:        | 440 m3
[ Save ]   [ Delete ]   [ Merge With... ]
----------------------------------------------

(Add Work Item)

B. Editable Fields (Simple & Safe)

Each work item must allow the following fields to be edited:

work_type (string)

item_code (string or null)

unit (string)

target_total (number or null)

Cumulative must remain read-only.
Remaining is auto-computed if target_total is set.

C. Merge Work Items (optional but powerful)

Add a simple “Merge Work Item” menu:

User selects the target work_item to merge INTO.

All field logs referencing the source work item get reassigned.

Cumulative becomes sum of both.

Delete the source work item after merge.

This fixes accidental duplicates.

D. Delete Work Item (with safety warning)

Only allow deletion if:

It has zero cumulative OR

It has no field entries linked

If user forces delete:

Show safety alert:

“This work item has existing entries.
Deleting it will require reassigning or removing these logs.
Proceed?”

(Safe default: block deletion unless no entries.)

E. Data Persistence

When saving:

Update work item in:

localStorage

Supabase (assets table or normalized work_items table)

Ensure:

updated unit flows down to Daily Summary

updated target_total recalculates remaining

updated name/item_code affects future auto-matching

updated work items do NOT break existing field logs

F. Daily Summary Integration

Daily Summary must reflect all changes immediately:

If unit changed → summary regenerates

If target_total changed → remaining recalculates

If work_type changed → UI updates label

If merged → summed correctly

If deleted → removed from summary (as long as no logs point to it)

G. PDF Integration

PDF must reflect:

updated work_type

updated item_code

updated target_total, cumulative, remaining

merged work items

deleted work items removed

correct grouping by (Asset → Work Item)

H. Acceptance Criteria (short & testable)

Open Asset → Click Edit Work Items → edit name/unit/item_code → Save

Field Entry forms use updated work_type/unit

Daily Summary updates instantly

PDF updates correctly

Update target_total → cumulative & remaining update correctly everywhere.

Merge two work items →

cumulative = sum

entries reassigned

summary + PDF updated

source work item gone

Delete work item with no entries → success

delete with entries → blocked (or requires explicit override)

Supabase sync works with updated fields.

Export & Import JSON reflect new work item fields.

I. Files to Update

pwa/index.html — Add Edit Work Items UI

pwa/app.js — logic for editing, merging, deletion

pwa/style.css — modal styles

pwa/sync_client.js — ensure work item updates sync properly

engine/schema/asset.schema.json — update samples

pwa/README.md — short guide for editing work items