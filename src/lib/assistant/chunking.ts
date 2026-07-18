import { createHash } from "node:crypto";

export type AssistantChunk = { heading: string | null; content: string; chunkIndex: number };

const FENCE = /```[\s\S]*?```/g;
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK = /\[([^\]]+)\]\([^)]*\)/g;
const MARKUP = /[*_~`>|]/g;

function cleanMarkdown(value: string) {
  return value
    .replace(FENCE, " ")
    .replace(IMAGE, "$1")
    .replace(LINK, "$1")
    .replace(MARKUP, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function contentVersion(input: { title: string; slug: string; contentMd: string }) {
  return createHash("sha256").update(`${input.title}\0${input.slug}\0${input.contentMd}`).digest("hex");
}

export function chunkPost(contentMd: string, maxChars = 1_200): AssistantChunk[] {
  const sections: { heading: string | null; text: string }[] = [];
  let heading: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    const text = cleanMarkdown(lines.join("\n"));
    if (text) sections.push({ heading, text });
    lines = [];
  };
  for (const line of contentMd.replace(/\r\n?/g, "\n").split("\n")) {
    const match = /^#{1,6}\s+(.+)$/.exec(line);
    if (match) {
      flush();
      heading = cleanMarkdown(match[1]);
    } else {
      lines.push(line);
    }
  }
  flush();

  const output: AssistantChunk[] = [];
  for (const section of sections) {
    const paragraphs = section.text.split(/\n{2,}|(?<=[。！？.!?])\s+/u).filter(Boolean);
    let current = "";
    const emit = () => {
      if (!current.trim()) return;
      output.push({ heading: section.heading, content: current.trim(), chunkIndex: output.length });
      current = "";
    };
    for (const paragraph of paragraphs) {
      if (paragraph.length > maxChars) {
        emit();
        for (let start = 0; start < paragraph.length; start += maxChars) {
          output.push({ heading: section.heading, content: paragraph.slice(start, start + maxChars), chunkIndex: output.length });
        }
      } else if (!current || current.length + paragraph.length + 1 <= maxChars) {
        current += `${current ? "\n" : ""}${paragraph}`;
      } else {
        emit();
        current = paragraph;
      }
    }
    emit();
  }
  return output;
}
