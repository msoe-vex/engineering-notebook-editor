"use client";

import React from "react";
import EditorTextarea from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/themes/prism-dark.css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';

interface CodeContent {
  code: string;
  lang: string;
}

export default function CodeBlock({ content, onChange }: { content: CodeContent, onChange: (content: CodeContent) => void }) {
  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex justify-between items-center bg-gray-50 dark:bg-zinc-800 p-2 rounded-t-lg border-x border-t dark:border-zinc-700">
        <select 
          className="bg-white dark:bg-zinc-900 border dark:border-zinc-700 text-xs rounded px-2 py-1 outline-none"
          value={content.lang}
          onChange={(e) => onChange({ ...content, lang: e.target.value })}
        >
          <option value="cpp">C++ (VEX V5)</option>
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
        </select>
        <span className="text-[10px] font-bold text-gray-400">Code Snippet</span>
      </div>
      
      <div className="border dark:border-zinc-700 rounded-b-lg overflow-hidden bg-[#2d2d2d]">
        <EditorTextarea
          value={content.code}
          onValueChange={(code) => onChange({ ...content, code })}
          highlight={code => Prism.highlight(code, Prism.languages[content.lang] || Prism.languages.cpp, content.lang)}
          padding={15}
          className="font-mono text-sm dark:text-gray-300 outline-none w-full"
          style={{
            fontFamily: '"Fira code", "Fira Mono", monospace',
          }}
        />
      </div>
    </div>
  );
}
