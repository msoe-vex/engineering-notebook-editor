# Compiling the PDF

The editor uses **BusyTeX**, a WebAssembly-powered LaTeX engine that runs entirely in your browser. This means you can generate high-quality engineering notebooks without installing any local software.

## How it Works

When you click the **Compile Notebook** button:

1. **Metadata Update**: The editor synchronizes your latest entries, team info, and project phases into LaTeX source files.
2. **Asset Mapping**: All your images, sketches, and diagrams are bundled into a virtual filesystem.
3. **LaTeX Execution**: The BusyTeX engine runs `XeLaTeX` twice to ensure all references (like the Table of Contents) are correctly resolved.
4. **PDF Generation**: A high-resolution PDF is generated and displayed in the preview pane.

## Compile Modes

The default compile button uses **Quality** mode, which uses the original image data for the best possible output. If you have a large notebook or want faster compilation, you can use the dropdown to use **Compressed** mode. Compressed mode uses compressed images images for quicker results, but with slightly lower visual fidelity. Compressed images will also be used in the editor preview to keep the website responsive.

## Advanced Customization

You can customize the look and feel of your notebook by providing your own templates:

- **`main.tex`**: The primary document structure.
- **`engineering_notebook.sty`**: The LaTeX style definitions for headers, footers, and layouts.

If these files exist in your workspace root, the compiler will prioritize them over the default built-in templates.

## Troubleshooting

If compilation fails or looks "stale":

- **Check the Log**: Open the browser console to see detailed error messages from the LaTeX engine.
- **Image Formats**: Ensure your images are in standard formats (PNG, JPG).
- **Rerun**: Occasionally, a second compilation run fixes reference issues.
- **Refresh**: If the engine gets stuck, a page refresh usually re-initializes the WASM environment.
