import { useCallback, useEffect, useMemo, useRef, type DragEvent } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import {
  createTable,
  downloadDataUrl,
  downloadTextFile,
  erdDocumentToJson,
  parseErdDocument,
  sampleErdDocument,
  type ErdDocument,
  type ErdRelation,
  type ErdTable,
} from '../../lib/erd/erdModel';
import { uuid } from '../../lib/uuid';
import { ErdTableNodeView, tableToNode, type ErdTableNode } from './ErdTableNode';

const nodeTypes = { erdTable: ErdTableNodeView };

function docToFlow(doc: ErdDocument): { nodes: ErdTableNode[]; edges: Edge[] } {
  const nodes = doc.tables.map(tableToNode);
  const edges: Edge[] = doc.relations.map((r) => ({
    id: r.id,
    source: r.fromTableId,
    sourceHandle: r.fromColumnId,
    target: r.toTableId,
    targetHandle: r.toColumnId,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    label: 'FK',
    style: { strokeWidth: 1.5 },
  }));
  return { nodes, edges };
}

function flowToDoc(nodes: Node[], edges: Edge[]): ErdDocument {
  const tables: ErdTable[] = nodes
    .filter((n): n is ErdTableNode => n.type === 'erdTable')
    .map((n) => ({
      id: n.id,
      name: n.data.name,
      x: n.position.x,
      y: n.position.y,
      columns: n.data.columns,
    }));
  const relations: ErdRelation[] = edges
    .filter((e) => e.source && e.target && e.sourceHandle && e.targetHandle)
    .map((e) => ({
      id: e.id,
      fromTableId: e.source,
      fromColumnId: String(e.sourceHandle),
      toTableId: e.target,
      toColumnId: String(e.targetHandle),
    }));
  return { version: 1, tables, relations };
}

function ErdCanvasInner() {
  const initial = useMemo(() => docToFlow(sampleErdDocument()), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { fitView, getNodes, getEdges, screenToFlowPosition } = useReactFlow();
  const selectedRef = useRef<{ nodes: string[]; edges: string[] }>({ nodes: [], edges: [] });

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
        return;
      }
      if (connection.source === connection.target && connection.sourceHandle === connection.targetHandle) {
        return;
      }
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: uuid(),
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            label: 'FK',
            style: { strokeWidth: 1.5 },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    selectedRef.current = {
      nodes: params.nodes.map((n) => n.id),
      edges: params.edges.map((e) => e.id),
    };
  }, []);

  const addTable = () => {
    const t = createTable({
      name: `table_${getNodes().length + 1}`,
      x: 120 + getNodes().length * 24,
      y: 120 + getNodes().length * 16,
    });
    setNodes((ns) => [...ns, tableToNode(t)]);
  };

  const deleteSelected = () => {
    const sel = selectedRef.current;
    if (sel.nodes.length === 0 && sel.edges.length === 0) return;
    setNodes((ns) => ns.filter((n) => !sel.nodes.includes(n.id)));
    setEdges((es) =>
      es.filter(
        (e) =>
          !sel.edges.includes(e.id) &&
          !sel.nodes.includes(e.source) &&
          !sel.nodes.includes(e.target),
      ),
    );
  };

  const exportJson = () => {
    const doc = flowToDoc(getNodes(), getEdges());
    downloadTextFile(`cadence-erd-${Date.now()}.json`, erdDocumentToJson(doc));
  };

  const exportPng = async () => {
    const el = wrapperRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!el) return;
    try {
      const dataUrl = await toPng(el, {
        cacheBust: true,
        backgroundColor:
          getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#1a1a1a',
        pixelRatio: 2,
      });
      downloadDataUrl(`cadence-erd-${Date.now()}.png`, dataUrl);
    } catch {
      window.alert('Could not export PNG. Try zooming to fit, then export again.');
    }
  };

  const importAlive = useRef(true);
  useEffect(() => {
    importAlive.current = true;
    return () => {
      importAlive.current = false;
    };
  }, []);

  const importJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!importAlive.current) return;
      try {
        const raw = JSON.parse(String(reader.result ?? ''));
        const parsed = parseErdDocument(raw);
        if (!parsed.ok) {
          window.alert(parsed.error);
          return;
        }
        const flow = docToFlow(parsed.doc);
        setNodes(flow.nodes);
        setEdges(flow.edges);
        requestAnimationFrame(() => fitView({ padding: 0.2 }));
      } catch {
        window.alert('Could not parse that JSON file.');
      }
    };
    reader.onerror = () => {
      if (importAlive.current) window.alert('Could not read that file.');
    };
    reader.readAsText(file);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/cadence-erd');
    if (type !== 'table') return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const t = createTable({
      name: `table_${getNodes().length + 1}`,
      x: position.x,
      y: position.y,
    });
    setNodes((ns) => [...ns, tableToNode(t)]);
  };

  return (
    <div className="erd-workspace">
      <div className="erd-toolbar" role="toolbar" aria-label="ERD tools">
        <button type="button" className="btn btn--primary btn--small" onClick={addTable}>
          Add table
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/cadence-erd', 'table');
            e.dataTransfer.effectAllowed = 'move';
          }}
          title="Drag onto the canvas to place a table"
        >
          Drag table
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={deleteSelected}>
          Delete selected
        </button>
        <span className="erd-toolbar__sep" aria-hidden />
        <button type="button" className="btn btn--ghost btn--small" onClick={exportJson}>
          Export JSON
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => void exportPng()}>
          Export PNG
        </button>
        <label className="btn btn--ghost btn--small erd-toolbar__file">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJsonFile(f);
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => {
            const flow = docToFlow(sampleErdDocument());
            setNodes(flow.nodes);
            setEdges(flow.edges);
            requestAnimationFrame(() => fitView({ padding: 0.2 }));
          }}
        >
          Load sample
        </button>
      </div>
      <p className="muted small erd-hint">
        Drag from a column’s right handle to another column’s left handle to create a foreign key.
        Nothing is saved to your workspace — use Export JSON / PNG.
      </p>
      <div className="erd-canvas" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} size={1} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}

export function ErdCanvas() {
  return (
    <ReactFlowProvider>
      <ErdCanvasInner />
    </ReactFlowProvider>
  );
}
