import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import Logo from '../src/components/ui/Logo';

// Render the component to a string
// We pass a className that won't do much in a raw SVG, 
// but we want to make sure the currentColor is handled.
// Since the Logo component uses stroke="currentColor", we can wrap it or 
// just replace the string later.
// 1. Render the logo component
const markup = renderToStaticMarkup(<Logo size={256} />);

// 2. Extract just the inner paths/lines from the SVG markup
const innerContent = markup.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)?.[1] || "";

// 3. Create a composite SVG with a rounded red background and white logo
// We scale the logo to 80% (0.8) and center it (offset by 10% = 25.6px)
// We also explicitly set fill="none" to ensure the logo paths aren't filled.
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="256" height="256" viewBox="0 0 256 256" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="64" fill="#d9282f" />
  <g transform="translate(25.6, 25.6) scale(0.8)" fill="none">
    ${innerContent.replace(/currentColor/g, 'white')}
  </g>
</svg>`;

const outputPath = path.join(process.cwd(), 'public', 'logo.svg');

fs.writeFileSync(outputPath, svgContent);

console.log(`Successfully exported branded logo to ${outputPath}`);
