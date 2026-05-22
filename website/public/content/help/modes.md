# Workspace Modes

The Engineering Notebook Editor supports two main ways to manage your data and a third option for quick tests. Choose the one that best fits your team's workflow.

## Local Folder

### Best for Individual use

Directly edits files on your computer. Requires a specific folder structure to work correctly. Since it uses the File System Access API, it feels just like a native app.

It's still recommended to create backups of your data, as it is tied to that specific folder and can be lost if the folder is moved or deleted.

## GitHub

### Recommended for Teams

Syncs with a GitHub repository. This is the best way to collaborate with teammates and keep a full history of every change made to your notebook.

It requires an initial setup to connect to a GitHub repository, but once set up, it provides seamless syncing and collaboration features. Your data is stored in the GitHub repository, so it's safe and accessible from anywhere.

## Temporary

### Best for Quick tests

Everything is saved in your browser's cached database. No setup or folders needed, but the data is tied to your browser and can be lost if you clear your site data.

This mode is great for quickly testing out the editor or creating a temporary notebook without any setup. However, it can't be used for long-term projects since the data is cleared when you leave the workspace or reload the page. Always export your data if you want to keep it before leaving a Temporary workspace.
