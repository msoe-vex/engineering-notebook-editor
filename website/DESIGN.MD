---
name: Technical Precision
colors:
  primary: '#d9282f'
  secondary: '#1e293b'
  tertiary: '#0076bc'
  surface: '#fbf9f8'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e6e5e5'
  surface-container-highest: '#e0dfdf'
  on-surface: '#1c1b1b'
  on-surface-variant: '#444746'
  outline: '#747775'
  outline-variant: '#c4c7c5'

typography:
  font-family: 'Work Sans, sans-serif'
  headings:
    font-weight: 700
    letter-spacing: '-0.02em'
  body:
    font-weight: 400
    line-height: 1.6

components:
  TopNavBar:
    style: high-contrast, technical
    elements: [Product Logo, Nav Links, Export/Share CTAs]
  SideNavBar:
    style: utility-focused, docked
    elements: [Project Explorer, Workspace Tabs, User Profile]
  EditorPane:
    style: paper-like, fluid-text
  PreviewPane:
    style: code-optimized, monospaced
---

# Technical Precision Design System

## Vision
A professional, high-precision workspace for engineers. The aesthetic bridges the gap between modern, fluid digital editing and the rigorous, structured world of LaTeX documentation.

## Color Palette
- **Primary (#d9282f):** Used for branding, primary actions (Share), and critical UI states.
- **Tertiary (#0076bc):** Used for technical links, document status (Synced), and interactive sidebar elements.
- **Surface Palette:** A range of warm greys and off-whites that mimic technical paper and professional hardware interfaces.

## Typography
We use **Work Sans** for its exceptional legibility in technical contexts. 
- **Headings:** Bold and direct to establish clear hierarchy.
- **Body Text:** Balanced line height (1.6) for sustained reading of technical logs.
- **Code:** Monospaced fonts for LaTeX and source code blocks.

## Layout & UI Principles
1. **Split-Pane Workflow:** Efficiency is driven by a side-by-side view of content and code.
2. **High Contrast:** Clear boundaries between workspace, terminal, and preview areas.
3. **Information Density:** Optimized for desktop use, providing access to file trees and document history without cluttering the writing space.
