#!/bin/bash
echo "Building LaTeXML..."
latexmlc --path=. main.tex --dest=../website/public/notebook/index.html
echo "Build complete. Preview in website/public/notebook/index.html"
