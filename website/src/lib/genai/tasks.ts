import type { EntryForAI, ResourceForAI } from "./types";
import { parseGeneratedText, parseImageDataUrl } from "./shared";
import { runGenerate } from "./client";

const NOTEBOOK_CONTEXT = "You write for a student engineering design notebook (VEX / robotics / CAD / lab work).";

function resourceKind(type: string): string {
  switch (type) {
    case "image": return "figure";
    case "table": return "table";
    case "codeBlock": return "code snippet";
    case "mathBlock": return "equation";
    case "rawLatex": return "LaTeX block";
    default: return type || "resource";
  }
}

function resourceContext(resource: ResourceForAI): string {
  const lines = [`This is a ${resourceKind(resource.type)}.`];
  if (resource.language) lines.push(`Language: ${resource.language}.`);
  if (resource.title?.trim()) lines.push(`Current title: ${resource.title.trim()}`);
  if (resource.caption?.trim()) lines.push(`Current caption: ${resource.caption.trim()}`);
  if (resource.text?.trim()) {
    lines.push("Content:");
    lines.push(resource.text.trim().slice(0, 6000));
  }
  if (resource.imageDataUrl) lines.push("An image of the figure is attached.");
  return lines.join("\n");
}

function imagesFrom(resource: ResourceForAI) {
  if (!resource.imageDataUrl) return undefined;
  return [parseImageDataUrl(resource.imageDataUrl)];
}

export async function generateResourceTitle(resource: ResourceForAI): Promise<string> {
  const prompt = `${NOTEBOOK_CONTEXT}
${resourceContext(resource)}
Write a short Title Case label for this ${resourceKind(resource.type)} (max 80 characters).
Reply with the title only. No quotes, no trailing period, no extra commentary.`;
  const text = parseGeneratedText(await runGenerate(prompt, imagesFrom(resource)));
  if (!text) throw new Error("The model returned an empty title.");
  return text.slice(0, 80);
}

export async function generateResourceCaption(resource: ResourceForAI): Promise<string> {
  const prompt = `${NOTEBOOK_CONTEXT}
${resourceContext(resource)}
Write a one- or two-sentence caption describing what this ${resourceKind(resource.type)} shows and why it matters in the design process.
Do not start with "This image", "This table", "This code", or "The photo".
Reply with the caption only.`;
  const text = parseGeneratedText(await runGenerate(prompt, imagesFrom(resource)));
  if (!text) throw new Error("The model returned an empty caption.");
  return text;
}

export async function generateEntryTitle(entry: EntryForAI): Promise<string> {
  const lines = [`${NOTEBOOK_CONTEXT}`, "Write a short Title Case title for this notebook entry (max 80 characters)."];
  if (entry.date) lines.push(`Date: ${entry.date}`);
  if (entry.authors?.length) lines.push(`Authors: ${entry.authors.join(", ")}`);
  if (entry.phase) lines.push(`Phase: ${entry.phase}`);
  if (entry.title?.trim()) lines.push(`Current title: ${entry.title.trim()}`);
  if (entry.body?.trim()) {
    lines.push("Entry text:");
    lines.push(entry.body.trim().slice(0, 6000));
  } else {
    lines.push("The entry body is still empty; infer a reasonable working title from the metadata.");
  }
  lines.push("Reply with the title only. No quotes, no trailing period, no extra commentary.");
  const text = parseGeneratedText(await runGenerate(lines.join("\n")));
  if (!text) throw new Error("The model returned an empty title.");
  return text.slice(0, 80);
}
