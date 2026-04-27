# VEX Engineering Notebook

This repository contains the LaTeX source and web CMS for compiling our VEX Robotics engineering notebook.

## Setup Instructions (Local Compilation)

Install the following in order. These are necessary to run the automated build script (`latexmk`) and generate the HTML preview (`latexml`).

1. **[MiKTeX](https://miktex.org/download):** The core LaTeX distribution.
2. **[Strawberry Perl](https://strawberryperl.com/):** Required to run the build automation.
3. **[LaTeXML](https://dlmf.nist.gov/LaTeXML/):** Required to generate the static HTML preview for the web app.
    - Run this command in the terminal to install LaTeXML via CPAN:

    ```shell
    cpan LaTeXML
    ```

4. **[LaTeX Workshop](https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop):** The VS Code extension for LaTeX.

### Compile PDF

1. Open `main.tex`.
2. Click the **"Play" icon** (Build LaTeX project) in the top-right corner of the editor, or use the shortcut `Ctrl+Alt+B`.
3. Open the compiled PDF (`main.pdf`) in the same directory to view the output.

### Compile Web HTML Preview

Run the provided build scripts in the terminal:

- **Windows:** `build.bat`
- **Linux/Mac:** `./build.sh`

This generates an `index.html` file that the web CMS will read for the "Compiled PDF" preview tab.
