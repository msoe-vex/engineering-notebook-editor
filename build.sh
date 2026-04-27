#!/bin/bash
echo "Building LaTeXML..."
latexmlc --path=. main.tex --dest=index.html
echo "Build complete."
