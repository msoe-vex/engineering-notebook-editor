# GitHub Collaboration

Syncing with GitHub allows multiple team members to work on the notebook while keeping a full history of every change.

## 1. Download the Template

### Option 1: Template Repository

Go to the [Template Repository](https://github.com/msoe-vex/engineering-notebook-template) and download the ZIP file or clone the code.

### Option 2: Export from Editor

Open a new Temporary workspace. Click on the project name at the top of the workspace and select the option to export the data. This will download a ZIP file containing the necessary folder structure and example entries.

## 2. Extract to Folder

Extract the files into a folder on your computer (e.g., "Engineering Notebook 2024").

## 3. Create GitHub Repository

Create a new repository on GitHub to host your notebook. We recommend making it private initally, though you can choose to make it public as well. Then you can run these commands in your terminal to connect your local folder to the GitHub repository:

### Option 1: Command Line

If you're comfortable with Git commands, navigate to your notebook folder in the terminal and run the following commands, replacing `<your-repo-URL>` with the URL of your GitHub repository:

```bash
cd <path/to/your/notebook/folder>

git init
git add .
git commit -m "Initial commit"

git remote add origin <your-repo-URL>
git branch -M main
git push -u origin main
```

### Option 2: Upload ZIP

If you're not comfortable with Git commands, you can simply upload the files from the extracted ZIP file to your GitHub repository using the web interface. Just go to your repository, click "Add file" > "Upload files", and select all the files from your extracted folder.

## 4. Connect in Editor

In the home page, select the "GitHub" option to create a new project and authenticate with your GitHub account. Then select the repository you just created to connect it to the editor. The editor will now sync your notebook data with GitHub, allowing you to collaborate with teammates and keep a full history of changes.

## Staging Changes

When you save an entry, it is stored locally in your browser first. These are called "Pending Changes". You can see them in the sidebar with a blue dot indicator. All pending changes will also be visible in the bottom of the sidebar.

You can leave the folder as the root of the repository, unless you want to keep other files in the same repository. If you want to use a subfolder (e.g., "notebook") just make sure to move all the files into that folder and push the changes to GitHub. Then you can select that subfolder as the root when connecting in the editor.

## Pushing to GitHub

Use the "Push to GitHub" button in the sidebar to upload all your pending changes to the repository at once. This creates a "commit" on GitHub. You can add an optional commit message to describe the changes you made. Once pushed, the blue dot indicators will disappear, indicating that your local changes are now synced with GitHub.

## Pulling Changes

When you open a GitHub workspace, the editor automatically fetches the latest changes from the repository. If you have been working on a different computer, your work will be synced automatically.
