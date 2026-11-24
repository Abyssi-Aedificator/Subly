# Subly

Subly tracks online subscriptions, upcoming renewals, and recurring costs in CAD. Your subscription list is saved in your browser. Dropbox backup is optional. See the [changelog](changelog.txt) for release notes.

## Getting started

Open `index.html` in your browser for basic tracking. For app installation, offline support, and Dropbox, use HTTPS or serve Subly on localhost. Run this from the Subly folder:

```sh
python -m http.server 8080 --bind 127.0.0.1
```

Open [Subly on localhost](http://127.0.0.1:8080/index.html). Continue using the same browser profile and address to access your saved list.

## Track subscriptions

- Select **Add subscription** and enter the service, price, billing cycle, and renewal date. Subly supports weekly, monthly, and yearly billing.
- **Overview** shows estimated monthly and yearly spending, the active subscription count, and the next three renewals.
- Active services appear in renewal order and show how many days are left. Paused services come next, followed by cancelled services. Their elapsed time is counted from the saved **Renewal date**.
- Search by service name, filter by status, or select **Edit** to update a subscription. Spending and renewal forecasts include active services only.

## Settings

Open **Settings** from Overview. Under **Appearance**, choose **Light**, **Dark**, or **System**. System follows your device's appearance and updates while Subly is open.

### Dropbox backup

1. In the [Dropbox App Console](https://www.dropbox.com/developers/apps), create a Scoped access app with **App folder** access.
2. Enable `files.content.read`, `files.content.write`, and `files.metadata.read`.
3. Register the exact Subly address as an OAuth redirect URI. For the example above, use `http://127.0.0.1:8080/index.html`.
4. In **Settings → Dropbox backup**, enter the Dropbox app key and choose **Connect Dropbox**.

**Back up now** saves your list to `subly-backup.json` in the Dropbox app folder. **Restore backup** replaces this device's list after confirmation. Subly also asks before replacing an existing Dropbox backup. Use the same Dropbox app key and account on each device. Backups and restores are manual. Subly remembers the app key in your browser after successful authorization. Subly also keeps the connection across restarts and renews access when you back up or restore. Existing connections require one reconnection to enable this.

## Install and use offline

Open Subly over HTTPS or localhost and use your browser's **Install** or **Add to Home Screen** option. After Subly finishes loading online, you can track subscriptions and use Settings offline. Dropbox backup and restore require internet access.

Use **Settings → Release notes → Check for updates** to check manually. When a new build is ready, choose **Update now** to reload Subly or **Later** to keep working. You can reopen the prompt from **Update available** in the header.

If your home screen keeps the old icon after applying an update, the browser or operating system may still be using the icon from the original installation. If you reinstall Subly to refresh it, back up your subscriptions first.
