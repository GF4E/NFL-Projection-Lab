export async function* parseCsvStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let quoteAtChunkEnd = false;

  const consume = function* (text: string): Generator<string[]> {
    let index = 0;
    if (quoteAtChunkEnd) {
      quoteAtChunkEnd = false;
      if (text[0] === '"') {
        field += '"';
        index = 1;
      } else {
        inQuotes = false;
      }
    }

    for (; index < text.length; index += 1) {
      const character = text[index];
      if (inQuotes) {
        if (character !== '"') {
          field += character;
          continue;
        }
        if (index + 1 >= text.length) {
          quoteAtChunkEnd = true;
          continue;
        }
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }

      if (character === '"' && field.length === 0) {
        inQuotes = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field);
        field = "";
        if (row.some((value) => value.length > 0)) yield row;
        row = [];
      } else if (character !== "\r") {
        field += character;
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const parsed of consume(decoder.decode(value, { stream: true }))) yield parsed;
    }
    for (const parsed of consume(decoder.decode())) yield parsed;
    if (quoteAtChunkEnd) {
      quoteAtChunkEnd = false;
      inQuotes = false;
    }
    if (inQuotes) throw new Error("nflverse CSV validation failed: unterminated quoted field");
    if (field.length || row.length) {
      row.push(field);
      if (row.some((value) => value.length > 0)) yield row;
    }
  } finally {
    reader.releaseLock();
  }
}

export function textStream(text: string, chunkSize = 16_384): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= text.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(text.slice(offset, offset + chunkSize)));
      offset += chunkSize;
    }
  });
}

export function requireColumns(header: readonly string[], required: readonly string[]): Map<string, number> {
  const indexes = new Map(header.map((name, index) => [name, index]));
  const missing = required.filter((name) => !indexes.has(name));
  if (missing.length) {
    throw new Error(`nflverse schema validation failed; missing columns: ${missing.join(", ")}`);
  }
  return indexes;
}
