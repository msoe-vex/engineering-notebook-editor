"use client";

interface TableContent {
  rows: string[][];
  cols: number;
  caption?: string;
}

export default function TableBlock({ content, onChange }: { content: TableContent, onChange: (content: TableContent) => void }) {
  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = [...content.rows];
    newRows[rowIndex][colIndex] = value;
    onChange({ ...content, rows: newRows });
  };

  const addRow = () => {
    const newRow = new Array(content.cols).fill("");
    onChange({ ...content, rows: [...content.rows, newRow] });
  };

  const addCol = () => {
    const newRows = content.rows.map(r => [...r, ""]);
    onChange({ ...content, rows: newRows, cols: content.cols + 1 });
  };

  return (
    <div className="flex flex-col gap-4 p-2 overflow-x-auto">
      <table className="border-collapse border dark:border-zinc-700 min-w-full text-sm">
        <tbody>
          {content.rows.map((row, rIdx) => (
            <tr key={rIdx}>
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="border dark:border-zinc-800 p-0">
                  <input 
                    className="w-full bg-transparent p-2 outline-none focus:bg-blue-50 dark:focus:bg-blue-900/20"
                    value={cell}
                    onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      
      <div className="flex justify-between items-center text-xs text-gray-500">
        <div className="flex gap-4">
            <button onClick={addRow} className="hover:text-blue-500 font-medium">+ Add Row</button>
            <button onClick={addCol} className="hover:text-blue-500 font-medium">+ Add Column</button>
        </div>
        <input 
          placeholder="Table caption..."
          className="bg-transparent border-b dark:border-zinc-800 focus:border-blue-500 outline-none p-1 w-1/2 text-right"
          value={content.caption || ""}
          onChange={(e) => onChange({ ...content, caption: e.target.value })}
        />
      </div>
    </div>
  );
}
