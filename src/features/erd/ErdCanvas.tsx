import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type DragEvent,
} from 'react';
import {
  Background,
  BackgroundVariant,
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
  emptyErdDocument,
  ERD_DOC_VERSION,
  erdDocumentToJson,
  parseErdDocument,
  sampleErdDocument,
  type ErdDocument,
  type ErdRelation,
  type ErdTable,
} from '../../lib/erd/erdModel';
import { uuid } from '../../lib/uuid';
import { useTheme } from '../../providers/ThemeContext';
import { ErdTableNodeView, tableToNode, type ErdTableNode } from './ErdTableNode';

const nodeTypes = { erdTable: ErdTableNodeView };

export type ErdCanvasHandle = {
  getDocument: () => ErdDocument;
  loadDocument: (doc: ErdDocument) => void;
  newBlank: () => void;
};

export type ErdCanvasProps = {
  /** Fired after the user edits the canvas (not on programmatic load). */
  onDirty?: () => void;
  /** Gate destructive replaces (Import / Load sample). Return false to cancel. */
  onBeforeReplace?: () => boolean | Promise<boolean>;
};

function edgeStroke(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#b3b3b3'
  );
}

function docToFlow(doc: ErdDocument): { nodes: ErdTableNode[]; edges: Edge[] } {
  const stroke = edgeStroke();
  const nodes = doc.tables.map(tableToNode);
  const edges: Edge[] = doc.relations.map((r) => ({
    id: r.id,
    source: r.fromTableId,
    sourceHandle: r.fromColumnId,
    target: r.toTableId,
    targetHandle: r.toColumnId,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: stroke },
    label: 'FK',
    style: { strokeWidth: 1.5, stroke },
    labelStyle: { fill: 'var(--text)', fontSize: 10, fontWeight: 600 },
    labelBgStyle: { fill: 'var(--panel)' },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 4,
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
  return { version: ERD_DOC_VERSION, tables, relations };
}

const ErdCanvasInner = forwardRef<ErdCanvasHandle, ErdCanvasProps>(function ErdCanvasInner(
  { onDirty, onBeforeReplace },
  ref,
) {
  const { theme } = useTheme();
  const initial = useMemo(() => docToFlow(emptyErdDocument()), []);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState(initial.edges);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { fitView, getNodes, getEdges, screenToFlowPosition } = useReactFlow();
  const selectedRef = useRef<{ nodes: string[]; edges: string[] }>({ nodes: [], edges: [] });
  const suppressDirtyRef = useRef(false);
  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;
  const onBeforeReplaceRef = useRef(onBeforeReplace);
  onBeforeReplaceRef.current = onBeforeReplace;
  const applyRafRef = useRef<number | null>(null);

  const markDirty = useCallback(() => {
    if (suppressDirtyRef.current) return;
    onDirtyRef.current?.();
  }, []);

  const onNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeBase>[0]) => {
      onNodesChangeBase(changes);
      if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')) markDirty();
    },
    [onNodesChangeBase, markDirty],
  );

  const onEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChangeBase>[0]) => {
      onEdgesChangeBase(changes);
      if (changes.some((c) => c.type !== 'select')) markDirty();
    },
    [onEdgesChangeBase, markDirty],
  );

  useEffect(() => {
    return () => {
      if (applyRafRef.current != null) cancelAnimationFrame(applyRafRef.current);
    };
  }, []);

  const applyDoc = useCallback(
    (doc: ErdDocument) => {
      if (applyRafRef.current != null) {
        cancelAnimationFrame(applyRafRef.current);
        applyRafRef.current = null;
      }
      suppressDirtyRef.current = true;
      const flow = docToFlow(doc);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      applyRafRef.current = requestAnimationFrame(() => {
        fitView({ padding: 0.2 });
        applyRafRef.current = requestAnimationFrame(() => {
          suppressDirtyRef.current = false;
          applyRafRef.current = null;
        });
      });
    },
    [fitView, setNodes, setEdges],
  );

  const confirmReplace = useCallback(async (): Promise<boolean> => {
    const gate = onBeforeReplaceRef.current;
    if (!gate) return true;
    return gate();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getDocument: () => flowToDoc(getNodes(), getEdges()),
      loadDocument: (doc) => applyDoc(doc),
      newBlank: () => applyDoc(emptyErdDocument()),
    }),
    [applyDoc, getNodes, getEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
        return;
      }
      if (connection.source === connection.target && connection.sourceHandle === connection.targetHandle) {
        return;
      }
      const stroke = edgeStroke();
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: uuid(),
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: stroke },
            label: 'FK',
            style: { strokeWidth: 1.5, stroke },
            labelStyle: { fill: 'var(--text)', fontSize: 10, fontWeight: 600 },
            labelBgStyle: { fill: 'var(--panel)' },
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 4,
          },
          eds,
        ),
      );
      markDirty();
    },
    [setEdges, markDirty],
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
    markDirty();
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
    markDirty();
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
      void (async () => {
        try {
          const raw = JSON.parse(String(reader.result ?? ''));
          const parsed = parseErdDocument(raw);
          if (!parsed.ok) {
            window.alert(parsed.error);
            return;
          }
          if (!(await confirmReplace())) return;
          if (!importAlive.current) return;
          applyDoc(parsed.doc);
          markDirty();
        } catch {
          window.alert('Could not parse that JSON file.');
        }
      })();
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
    markDirty();
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
            void (async () => {
              if (!(await confirmReplace())) return;
              applyDoc(sampleErdDocument());
              markDirty();
            })();
          }}
        >
          Load sample
        </button>
      </div>
      <p className="muted small erd-hint">
        Drag from a column’s right handle to another column’s left handle to create a foreign key.
        Use Save above to keep a named copy in your workspace — Export for a file on disk.
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
          colorMode={theme}
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1}
            color={
              getComputedStyle(document.documentElement).getPropertyValue('--border-strong').trim() ||
              'rgba(127,127,127,0.35)'
            }
          />
          <Controls />
          <MiniMap
            pannable
            zoomable
            maskColor={theme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.08)'}
            nodeColor={() =>
              getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c4a574'
            }
          />
        </ReactFlow>
      </div>
    </div>
  );
});

export const ErdCanvas = forwardRef<ErdCanvasHandle, ErdCanvasProps>(function ErdCanvas(props, ref) {
  return (
    <ReactFlowProvider>
      <ErdCanvasInner ref={ref} {...props} />
    </ReactFlowProvider>
  );
});
