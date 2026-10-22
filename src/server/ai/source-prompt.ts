import type { UserContent } from "ai";
import type { SourcePassage } from "../../lib/analysis";

// Keep image bytes out of text prompts and attach a shared asset only once.
export function sourcePrompt(prompt: string, sources: SourcePassage[]) {
  const images = new Map<string, string[]>();
  for (const source of sources) if (source.imageDataUrl) {
    images.set(source.imageDataUrl, [...(images.get(source.imageDataUrl) ?? []), source.sourceId]);
  }
  if (!images.size) return { prompt };
  const content: UserContent = [{ type: "text", text: prompt }];
  for (const [data, sourceIds] of images) content.push(
    { type: "text", text: `Untrusted embedded image for sourceIds: ${sourceIds.join(", ")}.` },
    { type: "file", mediaType: "image/jpeg", data },
  );
  return { messages: [{ role: "user" as const, content }] };
}
