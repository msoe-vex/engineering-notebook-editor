# Using the Editor

Our editor is built specifically for Engineering Notebooks, with native support for LaTeX and resource tracking. Here's a quick guide to help you get started and make the most of its features.

## Editor Header

The header of each entry contains important metadata fields:

### Entry Metadata

- **Title**: A descriptive title for your entry.
- **Date**: Automatically set to the current date and time, but can be edited to reflect when the work was done.
- **Author**: The name of the person who created the entry.
- **Phase**: The design process phase that this entry corresponds to. You can customize the available phases in your project settings.

All of these fields should be filled out for each entry to ensure proper organization and formatting. Warnings will appear if any required fields are missing when you try to save.

### LaTeX Preview

The editor has an option to swap between `Editor`, `Split`, and `LaTeX` view modes. The `Editor` mode provides a rich text editing experience, while the `Split` mode allows you to see both the editor and the generated LaTeX code side by side. In `LaTeX` mode, you can focus solely on the generated LaTeX code, which can be copied and used in other contexts if needed.

## Toolbar

The editor toolbar provides quick access to formatting options and tools for linking, inserting images, and more. Hover over each icon to see a tooltip with the corresponding keyboard shortcut for even faster editing.

### Linking & References

To link to another entry or a specific resource (like an image or a heading), use the **Link** tool in the editor toolbar or press `Ctrl + K`. Highlight the text you want to turn into a link and select your target from the list. You can search for an existing entry or resource, or create a link to an external URL. The editor will automatically generate the correct LaTeX code to reference the target, ensuring that your documentation is always interconnected and easy to navigate.

### Rich Text & Images

Drag and drop images directly into the editor. Use the toolbar for bold, italics, tables, and lists. Everything is automatically converted to clean LaTeX in the background.

## Rich Text Area

The main body of the editor is a rich text area where you can write your documentation. It supports all the standard formatting options, as well as LaTeX math and code blocks. You can also insert images, tables, and links to other entries or resources. The editor will automatically convert your rich text into LaTeX code, which is then compiled into a PDF when you save.

### Tips and Tricks

- Copy and paste code snippets directly into the editor. They will be automatically formatted as code blocks.
- Use the `@` symbol to quickly link to other entries or resources without leaving the editor
- Copy and paste tables from Excel or Google Sheets directly into the editor. They will be converted into LaTeX tables automatically.
- Drag and drop images from your computer into the editor. They will be uploaded and embedded in your entry seamlessly.

### Keyboard Shortcuts

Speed up your documentation with these shortcuts:

- **Bold**: `Ctrl + B`
- **Italic**: `Ctrl + I`
- **Underline**: `Ctrl + U`
- **Hyperlink**: `Ctrl + K`
- **Strike-through**: `Ctrl + Shift + X` or `Ctrl + Shift + S`
- **Superscript**: `Ctrl + Shift + =` or `Ctrl + +`
- **Subscript**: `Ctrl + Shift + -` or `Ctrl + _`
- **Clear Formatting**: `Ctrl + \`
- **Undo / Redo**: `Ctrl + Z` / `Ctrl + Y`
- **Save**: `Ctrl + S`

### Editor Command Shortcuts

- **Code**: Type text in between **`** to format text as inline code, or type **```** followed by a space to start a code block.
- **Math**: Type an equation in between **$** to format text as inline math, or type **$$$** followed by a space to start a math block.
- **Link**: Type **@** to create a link to another entry or resource.
