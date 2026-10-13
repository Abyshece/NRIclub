// A guide's text as blocks: headings (lines in CAPITALS), bullet lists
// ("• " lines) and paragraphs. The guide pages and the build use the same
// blocks, so the page Google reads matches the page people see.
export function guideBlocks(text) {
  const blocks = [];
  let list = null;
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) { list = null; continue; }
    if (line.startsWith("• ")) {
      if (!list) { list = { type: "ul", items: [] }; blocks.push(list); }
      list.items.push(line.slice(2));
      continue;
    }
    list = null;
    // A trailing "(Non-Resident External)" doesn't stop a heading being one.
    const head = line.replace(/\s*\(.*\)\s*$/, "");
    const heading = line.length <= 60 && /[A-Z]/.test(head) && head === head.toUpperCase();
    blocks.push({ type: heading ? "h" : "p", text: line });
  }
  return blocks;
}
