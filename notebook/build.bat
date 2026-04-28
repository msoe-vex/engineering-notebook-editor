@echo off
echo Building PDF...
latexmk -pdf -interaction=nonstopmode main.tex
echo.
echo Done. Output: main.pdf