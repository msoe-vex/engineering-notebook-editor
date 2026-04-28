#!/bin/bash
echo "Building PDF..."
latexmk -pdf -interaction=nonstopmode main.tex
echo "Done. Output: main.pdf"
