# Updating

The installed app checks GitHub for a newer release. The check uses the latest release’s `latest.json`.

## On launch

Each time the app opens, it checks quietly.

- A newer version shows a banner with the version, **Install**, and **Later**.
- **Install** downloads the installer, checks its signature, and runs it. The installer updates the current-user install and the app exits.
- **Later** hides the banner until the next time you open the app.
- If you are offline, or the check fails, the app does not show an error.

## From About

1. Open **Help > About**.
2. The dialog shows the running version, which opens the GitHub releases page, plus **Files**, **Folders**, and **Size on disk**.
3. Click **Check for updates**.
4. If a newer release exists, the dialog names that version and shows **Install**. Click **Install** to download and run it.
5. If this install is already current, the dialog says **You're up to date.**
6. If the check cannot reach GitHub, the dialog shows the error. A failure here does not remove an update the launch check already found.

**View README on GitHub** opens the project readme. **Close** dismisses the dialog.
