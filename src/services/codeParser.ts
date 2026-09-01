import { Node, Edge, Position } from "@xyflow/react";
import { NODE_REGISTRY } from "../components/Nodes";

/**
 * Local C Code to Nodes Parser
 * This module handles the conversion of C source code into React Flow nodes and edges
 * without relying on external AI services.
 */

interface ParserState {
  nodes: Node[];
  edges: Edge[];
  currentY: number;
  nodeCount: number;
}

export function parseCodeToNodes(code: string): { nodes: Node[], edges: Edge[] } {
  const state: ParserState = {
    nodes: [],
    edges: [],
    currentY: 0,
    nodeCount: 0
  };

  // 1. Pre-process: Remove comments and normalize whitespace
  const cleanCode = code
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '') // Remove comments
    .replace(/\r\n?/g, '\n')
    .trim();

  // 2. Parse everything through one syntax-driven recursive walker.
  parseBlock(cleanCode, null, 'next', state);

  const layouted = layoutParsedNodes(state.nodes, state.edges);
  return {nodes: layouted.nodes, edges: layouted.edges };
}

function layoutParsedNodes(nodes: Node[], edges: Edge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nextBySource = new Map<string, string>();
  const bodyBySource = new Map<string, string>();
  const incomingCount = new Map<string, number>(nodes.map((node) => [node.id, 0]));

  edges.forEach((edge) => {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);

    if (edge.sourceHandle === 'body') {
      bodyBySource.set(edge.source, edge.target);
      return;
    }

    if ((edge.sourceHandle === 'next' || !edge.sourceHandle) && !nextBySource.has(edge.source)) {
      nextBySource.set(edge.source, edge.target);
    }
  });

  const getRootSortWeight = (node: Node) => {
    const registryItem = NODE_REGISTRY[(node.data as { type?: string })?.type || node.type as string];
    if (registryItem?.hidePrevHandle) return 0;
    if (registryItem?.category === 'Structure') return 1;
    if (registryItem?.category === 'Control') return 2;
    return 3;
  };

  const sortedNodes = [...nodes].sort((a, b) => {
    const aPriority = getRootSortWeight(a);
    const bPriority = getRootSortWeight(b);

    if (aPriority !== bPriority) return aPriority - bPriority;
    if ((a.position?.y ?? 0) !== (b.position?.y ?? 0)) return (a.position?.y ?? 0) - (b.position?.y ?? 0);
    if ((a.position?.x ?? 0) !== (b.position?.x ?? 0)) return (a.position?.x ?? 0) - (b.position?.x ?? 0);
    return a.id.localeCompare(b.id);
  });

  const rootIds = sortedNodes
    .filter((node) => (incomingCount.get(node.id) || 0) === 0)
    .map((node) => node.id);

  const preferredRoots = sortedNodes
    .filter((node) => NODE_REGISTRY[(node.data as { type?: string })?.type || node.type as string]?.hidePrevHandle)
    .map((node) => node.id);

  const orderedRoots = Array.from(new Set([...preferredRoots, ...rootIds]));

  const placed = new Set<string>();
  const blockTrees: Array<Array<{ id: string; indentLevel: number }>> = [];

  const placeBlock = (nodeId: string, indentLevel: number, currentTree: Array<{ id: string; indentLevel: number }>) => {
    if (placed.has(nodeId)) return;

    const node = nodeById.get(nodeId);
    if (!node) return;

    currentTree.push({ id: nodeId, indentLevel });
    placed.add(nodeId);

    const registry = NODE_REGISTRY[(node.data as { type?: string })?.type || node.type as string];
    const bodyTarget = bodyBySource.get(nodeId);

    if (bodyTarget) {
      const isContainer = registry?.category === 'Structure' || registry?.category === 'Control' || registry?.hidePrevHandle;
      const bodyIndentDelta = isContainer ? 1 : 0;
      placeBlock(bodyTarget, indentLevel + bodyIndentDelta, currentTree);
    }

    const nextTarget = nextBySource.get(nodeId);
    if (nextTarget) {
      placeBlock(nextTarget, indentLevel, currentTree);
    }
  };

  orderedRoots.forEach((rootId) => {
    if (placed.has(rootId)) return;
    const tree: Array<{ id: string; indentLevel: number }> = [];
    placeBlock(rootId, 0, tree);
    if (tree.length > 0) {
      blockTrees.push(tree);
    }
  });

  sortedNodes.forEach((node) => {
    if (placed.has(node.id)) return;
    const tree: Array<{ id: string; indentLevel: number }> = [];
    placeBlock(node.id, 0, tree);
    if (tree.length > 0) {
      blockTrees.push(tree);
    }
  });

  const defaultNodeWidth = 220;
  const defaultNodeHeight = 72;
  const startX = 80;
  const minLineGap = 28;
  const sectionGap = 70;
  const indentStep = 210;

  const allPlacements = blockTrees.flat();
  const maxIndent = allPlacements.reduce((max, p) => Math.max(max, p.indentLevel), 0);
  const xByIndent = new Map<number, number>();
  xByIndent.set(0, startX);
  for (let i = 1; i <= maxIndent; i += 1) {
    xByIndent.set(i, startX + i * indentStep);
  }

  const positions = new Map<string, { x: number; y: number }>();
  let currentY = 50;

  blockTrees.forEach((tree, treeIndex) => {
    tree.forEach(({ id, indentLevel }) => {
      const node = nodeById.get(id);
      if (!node) return;

      const nodeHeight = (node as any).measured?.height ?? (node.style as any)?.height ?? defaultNodeHeight;
      const gridAlignedHeight = Math.max(1, Number(nodeHeight) || defaultNodeHeight);

      positions.set(id, {
        x: xByIndent.get(indentLevel) || startX,
        y: currentY,
      });

      currentY += gridAlignedHeight + minLineGap;
    });

    if (treeIndex < blockTrees.length - 1) {
      currentY += sectionGap;
    }
  });

  return {
    nodes: nodes.map((node) => ({
      ...node,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      position: positions.get(node.id) || node.position || { x: 80, y: 50 },
    })),
    edges,
  };
}

function parseBlock(block: string, parentId: string | null, parentHandle: string, state: ParserState): number {
  let remaining = block.trim();
  let prevId = parentId;
  let prevHandle = parentHandle;
  let currentY = state.currentY + 150;

  while (remaining.length > 0) {
    const nodeId = `node-${state.nodeCount++}`;
    let consumed = 0;

    // 1. Structured blocks and labels (syntax ending with { or :)
    const blockMatch = matchBlockStart(remaining);
    if (blockMatch) {
      const { type, consumed: blockHeaderConsumed } = blockMatch;
      const parsedNodeId = type === 'main' ? 'main' : nodeId;
      let data = blockMatch.data;
      consumed = blockHeaderConsumed;

      let innerBody = '';
      if (isLabelSyntaxType(type)) {
        const labelBody = consumeLabelBody(remaining, consumed, type);
        innerBody = labelBody.body;
        consumed = labelBody.consumed;
      } else {
        const bracedBody = consumeBracedBlock(remaining, consumed);
        innerBody = bracedBody.body;
        consumed = bracedBody.consumed;
      }

      const tailResult = consumeTailSyntax(remaining.substring(consumed), NODE_REGISTRY[type].tailSyntax);
      if (tailResult) {
        consumed += tailResult.consumed;
        data = { ...data, ...tailResult.data };
      }

      state.nodes.push({
        id: parsedNodeId,
        type: type,
        position: { x: 250, y: currentY },
        data: { 
          label: NODE_REGISTRY[type].label, 
          type: type,
          ...NODE_REGISTRY[type].defaultData,
          ...data
        }
      });

      if (prevId) {
        state.edges.push({ id: `e-${prevId}-${parsedNodeId}`, source: prevId, target: parsedNodeId, sourceHandle: prevHandle, targetHandle: 'prev' });
      }
      
      const savedY = state.currentY;
      state.currentY = currentY;
      parseBlock(innerBody, parsedNodeId, resolveParserBodyHandle(type), state);
      
      currentY = Math.max(state.currentY + 150, currentY + 300);
      prevId = parsedNodeId;
      prevHandle = 'next';
      remaining = remaining.substring(consumed).trim();

      const followerResult = parseStrictFollowers(remaining, parsedNodeId, currentY, state, type);
      if (followerResult) {
        currentY = followerResult.currentY;
        prevId = followerResult.prevId;
        prevHandle = followerResult.prevHandle;
        remaining = followerResult.remaining;
      }
      continue;
    }

    // 2. Control structures WITHOUT braces (single statement body)
    const singleControlMatch = matchControlHeader(remaining);
    if (singleControlMatch) {
      const { type, data, consumed: headerConsumed } = singleControlMatch;
      let cursor = headerConsumed;
      while (cursor < remaining.length && /\s/.test(remaining[cursor])) cursor++;

      if (remaining[cursor] === '{') {
        const parsedNodeId = type === 'main' ? 'main' : nodeId;
        const bracedBody = consumeBracedBlock(remaining, cursor + 1);
        consumed = bracedBody.consumed;

        const tailResult = consumeTailSyntax(remaining.substring(consumed), NODE_REGISTRY[type].tailSyntax);
        const mergedData = tailResult ? { ...data, ...tailResult.data } : data;
        if (tailResult) {
          consumed += tailResult.consumed;
        }

        state.nodes.push({
          id: parsedNodeId,
          type,
          position: { x: 250, y: currentY },
          data: {
            label: NODE_REGISTRY[type].label,
            type,
            ...NODE_REGISTRY[type].defaultData,
            ...mergedData
          }
        });

        if (prevId) {
          state.edges.push({ id: `e-${prevId}-${parsedNodeId}`, source: prevId, target: parsedNodeId, sourceHandle: prevHandle, targetHandle: 'prev' });
        }

        const savedY = state.currentY;
        state.currentY = currentY;
        parseBlock(bracedBody.body, parsedNodeId, resolveParserBodyHandle(type), state);

        currentY = Math.max(state.currentY + 150, currentY + 300);
        prevId = parsedNodeId;
        prevHandle = 'next';
        remaining = remaining.substring(consumed).trim();

        const followerResult = parseStrictFollowers(remaining, parsedNodeId, currentY, state, type);
        if (followerResult) {
          currentY = followerResult.currentY;
          prevId = followerResult.prevId;
          prevHandle = followerResult.prevHandle;
          remaining = followerResult.remaining;
        }
        continue;
      } else {
        const bodyResult = consumeSingleStatementBody(remaining, cursor);
        if (!bodyResult) {
          continue;
        }
        consumed = bodyResult.consumed;

        state.nodes.push({
          id: nodeId,
          type: type,
          position: { x: 250, y: currentY },
          data: { 
            label: NODE_REGISTRY[type].label,
            type: type,
            ...NODE_REGISTRY[type].defaultData,
            ...data
          }
        });

        if (prevId) {
          state.edges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, sourceHandle: prevHandle, targetHandle: 'prev' });
        }

        const savedY = state.currentY;
        state.currentY = currentY;
        parseBlock(bodyResult.body, nodeId, resolveParserBodyHandle(type), state);
        state.currentY = Math.max(state.currentY, savedY);

        currentY += 300;
        prevId = nodeId;
        prevHandle = 'next';
        remaining = remaining.substring(consumed).trim();

        const followerResult = parseStrictFollowers(remaining, nodeId, currentY, state, type);
        if (followerResult) {
          currentY = followerResult.currentY;
          prevId = followerResult.prevId;
          prevHandle = followerResult.prevHandle;
          remaining = followerResult.remaining;
        }
        continue;
      }
    }

    // 3. Per-line statement fast path
    const lineStatement = consumeSingleLineStatement(remaining);
    if (lineStatement) {
      const node = createNodeFromStatement(lineStatement.statement, nodeId, currentY);
      const nodeType = node ? (node.data as { type?: string }).type || node.type : undefined;
      if (node && nodeType && nodeType !== 'literal' && !NODE_REGISTRY[nodeType]?.body && !isLabelSyntaxType(nodeType)) {
        state.nodes.push(node);
        if (prevId) {
          state.edges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, sourceHandle: prevHandle, targetHandle: 'prev' });
        }
        prevId = nodeId;
        prevHandle = 'next';
        currentY += 150;
        remaining = remaining.substring(lineStatement.consumed).trim();
        continue;
      }
    }

    // 4. Generic statement scan
    const semiIdx = findStatementEnd(remaining);
    if (semiIdx !== -1) {
      const statement = remaining.substring(0, semiIdx).trim();
      consumed = semiIdx + 1;

      const node = createNodeFromStatement(statement, nodeId, currentY);
      if (node) {
        state.nodes.push(node);
        if (prevId) {
          state.edges.push({ id: `e-${prevId}-${nodeId}`, source: prevId, target: nodeId, sourceHandle: prevHandle, targetHandle: 'prev' });
        }
        prevId = nodeId;
        prevHandle = 'next';
        currentY += 150;
      }
      
      remaining = remaining.substring(consumed).trim();
      continue;
    }

    break;
  }

  state.currentY = currentY;
  return currentY;
}

function matchSyntax(stmt: string): { type: string, data: any } | null {
  let best: { type: string, data: any, score: number } | null = null;

  for (const [type, item] of Object.entries(NODE_REGISTRY)) {
    if (!item.syntax) continue;
    const syntaxes = Array.isArray(item.syntax) ? item.syntax : [item.syntax];
    for (const syntax of syntaxes) {
      const result = matchTemplate(stmt, syntax);
      if (result) {
        if (!isValidNodeMatch(type, result)) {
          continue;
        }
        const score = scoreMatch(syntax, result) + scoreNodeSpecificity(type, result);
        if (!best || score > best.score) {
          best = { type, data: result, score };
        }
      }
    }
  }

  return best ? { type: best.type, data: best.data } : null;
}

function matchBlockStart(remaining: string): { type: string, data: any, consumed: number } | null {
  let best: { type: string, data: any, consumed: number, score: number } | null = null;

  for (const [type, item] of Object.entries(NODE_REGISTRY)) {
    if (!item.syntax) continue;
    const syntaxes = Array.isArray(item.syntax) ? item.syntax : [item.syntax];
    for (const syntax of syntaxes) {
      if (!syntax.endsWith('{') && !syntax.endsWith(':')) continue;
      const result = matchTemplateStart(remaining, syntax);
      if (result) {
        if (!isValidNodeMatch(type, result.data)) {
          continue;
        }
        const score = scoreMatch(syntax, result.data);
        if (!best || score > best.score) {
          best = { type, data: result.data, consumed: result.consumed, score };
        }
      }
    }
  }

  return best ? { type: best.type, data: best.data, consumed: best.consumed } : null;
}

function matchTemplateStart(str: string, template: string) {
  const { regex, keys } = prepareRegex(template, true);
  const trimmedStart = str.trimStart();
  const leadingTrim = str.length - trimmedStart.length;

  try {
    const match = trimmedStart.match(regex);
    if (match) {
      const data = buildTemplateData(keys, match);

      return { data, consumed: leadingTrim + match[0].length };
    }
  } catch (e) {}
  return null;
}

function matchTemplate(str: string, template: string) {
  const normalizedStr = str.trim();
  const { regex, keys } = prepareRegex(template, false);

  try {
    const match = normalizedStr.match(regex);
    if (match) {
      return buildTemplateData(keys, match);
    }
  } catch (e) {
    console.error("Regex error for template:", template, e);
  }
  return null;
}

function buildTemplateData(keys: string[], match: RegExpMatchArray): Record<string, string> {
  const data: Record<string, string> = {};
  keys.forEach((key, i) => {
    data[key] = (match[i + 1] || '').trim();
  });
  return data;
}

function prepareRegex(template: string, isStart: boolean) {
  let t = template.replace(/\s+/g, ' ').trim();
  
  const keys: string[] = [];
  t = t.replace(/\{\{(.*?)\}\}/g, (_, key) => {
    keys.push(key);
    return `__PH${keys.length - 1}__`;
  });

  // Normalize spaces around punctuation delimiters so compact forms like if(x){ and }else{ match.
  // Run after placeholder extraction so braces in placeholders do not collapse semantic spaces.
  t = t.replace(/\s*([()\[\],;=:{}+\-*\/%<>!&|#])\s*/g, '$1');

  // 1. Escape all special regex characters
  let regexStr = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 2. Replace delimiters (escaped or plain) with \s*DELIM\s*
  // Delimiters: ()[],;=:{}+-*/%<>!&|#
  const delimiters = /\\?([()\[\],;=:{}+\-*\/%<>!&|#])/g;
  regexStr = regexStr.replace(delimiters, '\\s*\\$1\\s*');

  // 3. Replace remaining literal spaces with \s+ to preserve required token boundaries.
  regexStr = regexStr.replace(/ /g, '\\s+');
  
  // 4. Restore placeholders
  keys.forEach((key, i) => {
    regexStr = regexStr.replace(`__PH${i}__`, '([\\s\\S]+?)');
  });

  // 5. Clean up multiple \s*
  regexStr = regexStr.replace(/(\\s\*)+/g, '\\s*');
  
  return { regex: new RegExp(isStart ? `^${regexStr}` : `^${regexStr}$`), keys };
}

function scoreMatch(template: string, data: Record<string, string>): number {
  const placeholderCount = (template.match(/\{\{.*?\}\}/g) || []).length;
  const literalWeight = template.replace(/\{\{.*?\}\}/g, '').replace(/\s+/g, '').length;
  const capturedChars = Object.values(data).reduce((acc, val) => acc + (val ? val.length : 0), 0);
  return literalWeight * 10 + capturedChars + placeholderCount * 3;
}

function isValidNodeMatch(type: string, data: Record<string, string>): boolean {
  const item = NODE_REGISTRY[type];
  if (!item) return false;

  const fields = item.fields || [];
  const hasTypeSelector = fields.some((field) => field.type === 'type-selector');

  for (const [key, raw] of Object.entries(data)) {
    const value = String(raw || '').trim();
    if (!value) return false;

    if (key.toLowerCase().includes('params') && !isLikelyParameterList(value)) {
      return false;
    }

    const field = fields.find((f) => f.key === key);
    if (!field) continue;

    if (field.type === 'type-selector' && !isLikelyTypeSelectorValue(value)) {
      return false;
    }

    if (key === 'operator' && !isLikelyCompoundAssignmentOperator(value)) {
      return false;
    }

    // For declaration-like nodes (those exposing a type selector), name fields should be plain identifiers.
    if (hasTypeSelector && key.toLowerCase().includes('name') && !isLikelyIdentifier(value)) {
      return false;
    }
  }

  return true;
}

function isLikelyIdentifier(value: string): boolean {
  return /^[A-Za-z_]\w*$/.test(value.trim());
}

function isLikelyTypeSelectorValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (!/[A-Za-z_]/.test(v)) return false;
  return /^[A-Za-z0-9_\s*]+$/.test(v);
}

function isLikelyParameterList(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return !/[{};]/.test(v);
}

function isLikelyCompoundAssignmentOperator(value: string): boolean {
  return ['+', '-', '*', '/', '%'].includes(value.trim());
}

function scoreNodeSpecificity(type: string, data: Record<string, string>): number {
  const item = NODE_REGISTRY[type];
  if (!item) return 0;

  const fields = item.fields || [];
  const hasTypeSelector = fields.some((field) => field.type === 'type-selector');
  let bonus = 0;

  for (const [key, raw] of Object.entries(data)) {
    const value = String(raw || '').trim();
    if (!value) continue;

    if (key.toLowerCase().includes('name')) {
      if (containsWhitespace(value)) {
        bonus += hasTypeSelector ? 8 : -12;
      } else if (isLikelyIdentifier(value)) {
        bonus += 4;
      }
    }

    if (key.toLowerCase().includes('type') && hasTypeSelector && isLikelyTypeSelectorValue(value)) {
      bonus += 6;
    }
  }

  return bonus;
}

function containsWhitespace(value: string): boolean {
  return /\s/.test(value);
}

function normalizeHeaderSyntax(syntax: string): string {
  let normalized = syntax.trim().replace(/^}\s*/, '');
  if (normalized.endsWith('{')) {
    normalized = normalized.slice(0, -1).trimEnd();
  }
  return normalized;
}

function matchControlHeader(
  remaining: string,
  includeTypes?: string[]
): { type: string, data: Record<string, string>, consumed: number } | null {
  let best: { type: string, data: Record<string, string>, consumed: number, score: number } | null = null;

  const includeSet = includeTypes ? new Set(includeTypes) : null;

  for (const [type, item] of Object.entries(NODE_REGISTRY)) {
    if (!item.syntax || !item.body) continue;
    if (includeSet && !includeSet.has(type)) continue;
    if (!includeSet && item.strictPrev && item.strictPrev.length > 0) continue;

    const syntaxes = Array.isArray(item.syntax) ? item.syntax : [item.syntax];
    for (const syntax of syntaxes) {
      if (!syntax.endsWith('{') && !syntax.endsWith(':')) continue;

      const headerSyntax = normalizeHeaderSyntax(syntax);
      if (!headerSyntax) continue;

      const result = matchTemplateStart(remaining, headerSyntax);
      if (!result) continue;
      if (!isValidNodeMatch(type, result.data)) continue;

      const score = scoreMatch(headerSyntax, result.data);
      if (!best || score > best.score) {
        best = { type, data: result.data, consumed: result.consumed, score };
      }
    }
  }

  return best ? { type: best.type, data: best.data, consumed: best.consumed } : null;
}

function consumeSingleStatementBody(remaining: string, startIdx: number): { body: string, consumed: number } | null {
  const statementEnd = findStatementEnd(remaining.substring(startIdx));
  if (statementEnd === -1) return null;
  return {
    body: remaining.substring(startIdx, startIdx + statementEnd + 1).trim(),
    consumed: startIdx + statementEnd + 1
  };
}

function consumeSingleLineStatement(remaining: string): { statement: string, consumed: number } | null {
  const trimmedStart = remaining.trimStart();
  const leadingTrim = remaining.length - trimmedStart.length;
  const newlineIdx = trimmedStart.indexOf('\n');
  if (newlineIdx === -1) {
    const lastLine = trimmedStart.trim();
    if (!lastLine) return null;
    if (lastLine.endsWith(';')) {
      const endIdx = findStatementEnd(lastLine);
      if (endIdx !== lastLine.length - 1) return null;
      return {
        statement: lastLine.slice(0, -1).trim(),
        consumed: remaining.length
      };
    }
    if (lastLine.includes(';') || /[{}:]/.test(lastLine)) {
      return null;
    }
    return {
      statement: lastLine,
      consumed: remaining.length
    };
  }

  const rawLine = trimmedStart.substring(0, newlineIdx).trim();
  if (!rawLine) return null;

  return {
    statement: rawLine.endsWith(';') ? rawLine.slice(0, -1).trim() : rawLine,
    consumed: leadingTrim + newlineIdx + 1
  };
}

function resolveParserBodyHandle(type: string): 'body' | 'next' {
  return NODE_REGISTRY[type].parserBodyHandle || 'body';
}

function getStrictFollowerTypes(prevType: string): string[] {
  return Object.entries(NODE_REGISTRY)
    .filter(([, item]) => (item.strictPrev || []).includes(prevType))
    .map(([type]) => type);
}

function isLabelSyntaxType(type: string): boolean {
  const item = NODE_REGISTRY[type];
  if (!item?.syntax) return false;
  const syntaxes = Array.isArray(item.syntax) ? item.syntax : [item.syntax];
  return syntaxes.some((syntax) => syntax.trim().endsWith(':'));
}

function consumeLabelBody(remaining: string, startIdx: number, currentType: string): { body: string, consumed: number } {
  const afterLabel = remaining.substring(startIdx);
  const nextLabelTypes = getStrictFollowerTypes(currentType).filter(isLabelSyntaxType);
  if (!nextLabelTypes.length) {
    return { body: afterLabel.trim(), consumed: remaining.length };
  }

  const nextOffset = findNextFollowerHeaderOffset(afterLabel, nextLabelTypes);
  if (nextOffset === -1) {
    return { body: afterLabel.trim(), consumed: remaining.length };
  }

  return {
    body: afterLabel.substring(0, nextOffset).trim(),
    consumed: startIdx + nextOffset
  };
}

function findNextFollowerHeaderOffset(code: string, followerTypes: string[]): number {
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inString = false;
  let quote = '';

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const prev = i > 0 ? code[i - 1] : '';

    if (inString) {
      if (ch === quote && prev !== '\\') {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === '\'') {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);

    if (depthParen !== 0 || depthBracket !== 0 || depthBrace !== 0) {
      continue;
    }

    if (i > 0 && code[i - 1] !== '\n') {
      continue;
    }

    const follower = matchControlHeader(code.substring(i), followerTypes);
    if (follower) {
      return i;
    }
  }

  return -1;
}

function consumeTailSyntax(
  remaining: string,
  tailSyntax?: string
): { consumed: number, data: Record<string, string> } | null {
  if (!tailSyntax) return null;
  const matched = matchTemplateStart(remaining, tailSyntax);
  if (!matched) return null;
  return {
    consumed: matched.consumed,
    data: matched.data
  };
}

function parseStrictFollowers(
  remaining: string,
  prevNodeId: string,
  currentY: number,
  state: ParserState,
  prevType: string
): { currentY: number, prevId: string, prevHandle: 'next', remaining: string } | null {
  const followerTypes = Object.entries(NODE_REGISTRY)
    .filter(([, item]) => (item.strictPrev || []).includes(prevType))
    .map(([type]) => type);

  if (!followerTypes.length) return null;

  const follower = matchControlHeader(remaining, followerTypes);
  if (!follower) return null;

  let cursor = follower.consumed;
  while (cursor < remaining.length && /\s/.test(remaining[cursor])) cursor++;

  let body = '';
  let consumed = cursor;
  if (NODE_REGISTRY[follower.type].body) {
    if (isLabelSyntaxType(follower.type)) {
      const labelBody = consumeLabelBody(remaining, cursor, follower.type);
      body = labelBody.body;
      consumed = labelBody.consumed;
    } else if (remaining[cursor] === '{') {
      const block = consumeBracedBlock(remaining, cursor + 1);
      body = block.body;
      consumed = block.consumed;
    } else {
      const singleStatement = consumeSingleStatementBody(remaining, cursor);
      if (!singleStatement) return null;
      body = singleStatement.body;
      consumed = singleStatement.consumed;
    }
  }

  const nodeId = `node-${state.nodeCount++}`;
  state.nodes.push({
    id: nodeId,
    type: follower.type,
    position: { x: 250, y: currentY },
    data: {
      label: NODE_REGISTRY[follower.type].label,
      type: follower.type,
      ...NODE_REGISTRY[follower.type].defaultData,
      ...follower.data
    }
  });

  state.edges.push({ id: `e-${prevNodeId}-${nodeId}`, source: prevNodeId, target: nodeId, sourceHandle: 'next', targetHandle: 'prev' });

  if (body) {
    parseBlock(body, nodeId, resolveParserBodyHandle(follower.type), state);
  }

  let nextCurrentY = Math.max(state.currentY + 150, currentY + 150);
  let nextPrevId = nodeId;
  let nextRemaining = remaining.substring(consumed).trim();

  const chained = parseStrictFollowers(nextRemaining, nodeId, nextCurrentY, state, follower.type);
  if (chained) {
    nextCurrentY = chained.currentY;
    nextPrevId = chained.prevId;
    nextRemaining = chained.remaining;
  }

  return {
    currentY: nextCurrentY,
    prevId: nextPrevId,
    prevHandle: 'next',
    remaining: nextRemaining
  };
}

function consumeBracedBlock(remaining: string, startIdx: number) {
  let braceCount = 1;
  let endIdx = startIdx;
  while (braceCount > 0 && endIdx < remaining.length) {
    if (remaining[endIdx] === '{') braceCount++;
    if (remaining[endIdx] === '}') braceCount--;
    endIdx++;
  }
  return {
    body: remaining.substring(startIdx, endIdx - 1).trim(),
    consumed: endIdx
  };
}

function createNodeFromStatement(stmt: string, id: string, y: number): Node | null {
  const matchedNoSemi = matchSyntax(stmt);
  const matched = matchSyntax(stmt + ';'); // Fallback for semicolon-oriented templates

  const finalMatch = matchedNoSemi || matched;

  if (finalMatch) {
    const registryItem = NODE_REGISTRY[finalMatch.type];
    return {
      id,
      type: finalMatch.type,
      position: { x: 250, y },
      data: { 
        label: registryItem.label, 
        type: finalMatch.type, 
        ...registryItem.defaultData,
        ...finalMatch.data 
      }
    };
  }

  // Fallback to literal so unmatched statements are preserved as raw executable lines
  return {
    id,
    type: 'literal',
    position: { x: 250, y },
    data: { label: NODE_REGISTRY.literal.label, type: 'literal', ...NODE_REGISTRY.literal.defaultData, value: stmt }
  };
}

function findStatementEnd(code: string): number {
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inString = false;
  let quote = '';

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const prev = i > 0 ? code[i - 1] : '';

    if (inString) {
      if (ch === quote && prev !== '\\') {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === '\'') {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);

    if (ch === ';' && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      return i;
    }
  }

  return -1;
}

