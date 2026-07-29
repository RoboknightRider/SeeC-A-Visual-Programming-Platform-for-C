import { Edge, Node } from '@xyflow/react';
import { NODE_REGISTRY } from '../components/Nodes';

/**
 * Generates C source code from a set of React Flow nodes and edges.
 * 
 * @param nodes Array of React Flow nodes
 * @param edges Array of React Flow edges
 * @returns Generated C code string
 */
export function generateCCode(nodes: Node[], edges: Edge[]): string {
  let code = '';
  
  // 1. Process Includes
  const includes = nodes.filter(n => n.data.type === 'include');
  
  includes.forEach(n => {
    const registryItem = NODE_REGISTRY['include'];
    if (registryItem) {
      code += registryItem.toCode({ 
        node: n, 
        nodes, 
        edges, 
        visited: new Set(), 
        indentLevel: 0, 
        traverse: () => '',
        getFieldValue: (key: string) => (n.data as any)[key] || ''
      });
    }
  });
  
  if (includes.length > 0) code += '\n';

  // 2. Global Function Definitions (excluding main)
  const functionDefs = nodes.filter(n => n.data.type === 'function-def');
  const visited = new Set<string>();

  /**
   * Recursively traverses the flow starting from a node.
   * 
   * @param currentId ID of the node to start from
   * @param indentLevel Current indentation level
   * @returns Generated code for the sub-flow
   */
  function traverse(currentId: string, indentLevel: number): string {
    if (visited.has(currentId)) return '';
    visited.add(currentId);

    const node = nodes.find(n => n.id === currentId);
    if (!node) return '';

    const data = node.data as any;
    const registryItem = NODE_REGISTRY[data.type as string];
    let blockCode = '';

    /**
     * Retrieves the value of a field, either from the node data or from a connected expression node.
     */
    const getFieldValue = (targetNode: Node, fieldKey: string): string => {
      const fieldEdge = edges.find(e => e.target === targetNode.id && e.targetHandle === `field:${fieldKey}`);
      if (fieldEdge) {
        const sourceNode = nodes.find(n => n.id === fieldEdge.source);
        const sourceRegistry = sourceNode ? NODE_REGISTRY[sourceNode.data.type as string] : null;
        
        if (sourceRegistry?.toExpression) {
          return sourceRegistry.toExpression({
            node: sourceNode!,
            nodes,
            edges,
            visited: new Set(),
            indentLevel: 0,
            traverse: () => '',
            getFieldValue: (key: string) => getFieldValue(sourceNode!, key)
          });
        }
      }
      return (targetNode.data as any)[fieldKey] || '';
    };

    if (registryItem?.toCode) {
      blockCode += registryItem.toCode({
        node,
        nodes,
        edges,
        visited,
        indentLevel,
        traverse,
        getFieldValue: (key: string) => getFieldValue(node, key)
      });
    }

    // Find next node in the linear execution flow
    const nextEdge = edges.find(e => e.source === currentId && (e.sourceHandle === 'next' || !e.sourceHandle));
    if (nextEdge) {
      blockCode += traverse(nextEdge.target, indentLevel);
    }

    return blockCode;
  }

  // Generate Function Bodies
  functionDefs.forEach(func => {
    const registryItem = NODE_REGISTRY['function-def'];
    if (registryItem) {
      code += registryItem.toCode({
        node: func,
        nodes,
        edges,
        visited,
        indentLevel: 0,
        traverse,
        getFieldValue: (key: string) => (func.data as any)[key] || ''
      });
    }
  });

  // 3. Main Function Generation
  const mainNode = nodes.find(n => n.data.type === 'main');
  if (!mainNode) return "// Add a 'Main' node to start generating code.\n" + code;

  code += 'int main() {\n';
  const startEdge = edges.find(e => e.source === mainNode.id);
  if (startEdge) {
    code += traverse(startEdge.target, 1);
  }

  // Ensure main returns 0 if no return statement was explicitly added
  if (!code.includes('return')) {
    code += '    return 0;\n';
  }
  code += '}\n';

  return code;
}
