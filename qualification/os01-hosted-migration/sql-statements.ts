type ScannerState = "block_comment" | "bracket" | "double_quote" | "line_comment" | "normal" |
  "single_quote" | "backtick";

function isWordStart(character: string): boolean {
  return /[A-Za-z_]/u.test(character);
}

function isWordPart(character: string): boolean {
  return /[A-Za-z0-9_$]/u.test(character);
}

/**
 * Split executable SQLite statements without treating semicolons in comments,
 * strings, quoted identifiers, or CREATE TRIGGER bodies as boundaries.
 *
 * This Worker-safe implementation is the single statement boundary authority
 * for both runtime D1 preparation and predeployment capacity accounting.
 */
export function splitHostedSqlStatements(source: string): string[] {
  const statements: string[] = [];
  let state: ScannerState = "normal";
  let start = 0;
  let index = 0;
  let hasSql = false;
  let isTrigger = false;
  let triggerBodyStarted = false;
  let triggerDepth = 0;
  let caseDepth = 0;
  let statementWords: string[] = [];

  const reset = (nextStart: number) => {
    start = nextStart;
    hasSql = false;
    isTrigger = false;
    triggerBodyStarted = false;
    triggerDepth = 0;
    caseDepth = 0;
    statementWords = [];
  };

  const word = (value: string) => {
    const upper = value.toUpperCase();
    statementWords.push(upper);
    hasSql = true;
    if (!triggerBodyStarted && upper === "TRIGGER" && statementWords[0] === "CREATE") {
      isTrigger = true;
    }
    if (!isTrigger) return;
    if (!triggerBodyStarted && upper === "BEGIN") {
      triggerBodyStarted = true;
      triggerDepth = 1;
      return;
    }
    if (!triggerBodyStarted) return;
    if (upper === "CASE") {
      caseDepth += 1;
    } else if (upper === "BEGIN") {
      triggerDepth += 1;
    } else if (upper === "END") {
      if (caseDepth > 0) caseDepth -= 1;
      else triggerDepth -= 1;
    }
  };

  while (index < source.length) {
    const character = source[index]!;
    const next = source[index + 1];
    if (state === "line_comment") {
      if (character === "\n") state = "normal";
      index += 1;
      continue;
    }
    if (state === "block_comment") {
      if (character === "*" && next === "/") {
        state = "normal";
        index += 2;
      } else index += 1;
      continue;
    }
    if (state === "single_quote" || state === "double_quote" || state === "backtick") {
      const closer = state === "single_quote" ? "'" : state === "double_quote" ? "\"" : "`";
      if (character === closer) {
        if (next === closer) index += 2;
        else {
          state = "normal";
          index += 1;
        }
      } else index += 1;
      continue;
    }
    if (state === "bracket") {
      if (character === "]") state = "normal";
      index += 1;
      continue;
    }
    if (character === "-" && next === "-") {
      state = "line_comment";
      index += 2;
      continue;
    }
    if (character === "/" && next === "*") {
      state = "block_comment";
      index += 2;
      continue;
    }
    if (character === "'") {
      hasSql = true;
      state = "single_quote";
      index += 1;
      continue;
    }
    if (character === "\"") {
      hasSql = true;
      state = "double_quote";
      index += 1;
      continue;
    }
    if (character === "`") {
      hasSql = true;
      state = "backtick";
      index += 1;
      continue;
    }
    if (character === "[") {
      hasSql = true;
      state = "bracket";
      index += 1;
      continue;
    }
    if (isWordStart(character)) {
      let end = index + 1;
      while (end < source.length && isWordPart(source[end]!)) end += 1;
      word(source.slice(index, end));
      index = end;
      continue;
    }
    if (!/\s/u.test(character) && character !== ";") hasSql = true;
    if (character === ";" && (!isTrigger || (triggerBodyStarted && triggerDepth === 0))) {
      if (hasSql) statements.push(source.slice(start, index + 1).trim());
      reset(index + 1);
    }
    index += 1;
  }

  if (state !== "normal" && state !== "line_comment") {
    throw new Error(`unterminated SQLite ${state.replaceAll("_", " ")}`);
  }
  if (isTrigger && triggerBodyStarted && triggerDepth !== 0) {
    throw new Error("unterminated SQLite trigger body");
  }
  if (hasSql) statements.push(source.slice(start).trim());
  return statements;
}
