# Fanqie Drafter

Send the active note (or current selection) to your Fanqie (番茄小说) writer
draft box from inside Obsidian. The plugin shells out to the local
fanqie-draft-tool CLI (a Playwright script you must have set up with a valid
login-state file) and streams its progress in a modal.

## Setup (plugin settings)

- **Python path** — e.g. `python` or a full path
- **batch.py path** — absolute path to fanqie-draft-tool's `batch.py`
- **novel_id** — your book's numeric id from the writer-console URL
- Optional: `--headful` (show browser), `--verify` (re-read draft box after upload)

## Usage

1. Open a note (or select the part you want to send).
2. Click the ribbon upload icon, confirm the dialog.
3. The note text is exported to a temp file and passed to
   `batch.py --src <file> --novel <id>`; chapter splitting follows the tool's
   own conventions (第X章 markers). Drafts only — never auto-published.
4. Live log is shown in the modal; the temp file is deleted afterwards.

## Notes

- Desktop only (spawns a local Python process).
- All credentials live in your local Playwright state file; the plugin never
  sees or stores them.
