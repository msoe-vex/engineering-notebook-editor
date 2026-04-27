"use client";

import React, { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Block } from "./App";
import TextBlock from "@/components/blocks/TextBlock";
import ImageBlock from "@/components/blocks/ImageBlock";
import TableBlock from "@/components/blocks/TableBlock";
import CodeBlock from "@/components/blocks/CodeBlock";
import { GripVertical, Trash2, PlusCircle, Type, ImageIcon, Table as TableIcon, Code } from "lucide-react";

interface BlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

interface SortableItemProps {
  id: string;
  block: Block;
  onUpdate: (id: string, content: any) => void;
  onDelete: (id: string) => void;
}

function SortableBlock({ id, block, onUpdate, onDelete }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  const renderBlock = () => {
    switch (block.type) {
      case "text":
        return <TextBlock content={block.content} onChange={(c) => onUpdate(block.id, c)} />;
      case "image":
        return <ImageBlock content={block.content} onChange={(c) => onUpdate(block.id, c)} />;
      case "table":
        return <TableBlock content={block.content} onChange={(c) => onUpdate(block.id, c)} />;
      case "code":
        return <CodeBlock content={block.content} onChange={(c) => onUpdate(block.id, c)} />;
      default:
        return <div>Unknown block type</div>;
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative mb-4 bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-2 p-2">
        <div {...attributes} {...listeners} className="mt-2 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <GripVertical size={20} />
        </div>
        
        <div className="flex-1 min-w-0">
          {renderBlock()}
        </div>

        <button 
          onClick={() => onDelete(block.id)}
          className="mt-2 p-1 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}

export default function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      onChange(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const updateBlock = (id: string, content: any) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, content } : b)));
  };

  const deleteBlock = (id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
  };

  const addBlock = (type: Block["type"]) => {
    const newBlock: Block = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content: type === "text" ? "" : type === "table" ? { rows: [["", ""]], cols: 2 } : type === "image" ? { src: "", caption: "", initials: "" } : { code: "", lang: "cpp" },
    };
    onChange([...blocks, newBlock]);
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((block) => (
            <SortableBlock key={block.id} id={block.id} block={block} onUpdate={updateBlock} onDelete={deleteBlock} />
          ))}
        </SortableContext>
      </DndContext>

      <div className="mt-8 flex justify-center gap-4 border-t dark:border-zinc-800 pt-6">
        <button onClick={() => addBlock("text")} className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-zinc-800 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition">
          <Type size={18} /> Text
        </button>
        <button onClick={() => addBlock("image")} className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-zinc-800 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition">
          <ImageIcon size={18} /> Image
        </button>
        <button onClick={() => addBlock("table")} className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-zinc-800 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition">
          <TableIcon size={18} /> Table
        </button>
        <button onClick={() => addBlock("code")} className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-zinc-800 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition">
          <Code size={18} /> Code
        </button>
      </div>
    </div>
  );
}
