import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  useReactFlow,
} from '@xyflow/react';
import {
  ERD_COLUMN_TYPES,
  createColumn,
  type ErdColumn,
  type ErdColumnType,
  type ErdTable,
} from '../../lib/erd/erdModel';

export type ErdTableNodeData = {
  name: string;
  columns: ErdColumn[];
};

export type ErdTableNode = Node<ErdTableNodeData, 'erdTable'>;

export function tableToNode(table: ErdTable): ErdTableNode {
  return {
    id: table.id,
    type: 'erdTable',
    position: { x: table.x, y: table.y },
    data: { name: table.name, columns: table.columns },
  };
}

export function ErdTableNodeView({ id, data, selected }: NodeProps<ErdTableNode>) {
  const { setNodes, setEdges } = useReactFlow();

  const patch = (fn: (d: ErdTableNodeData) => ErdTableNodeData) => {
    setNodes((nodes) =>
      nodes.map((n) => {
        if (n.id !== id || n.type !== 'erdTable') return n;
        return { ...n, data: fn(n.data as ErdTableNodeData) };
      }),
    );
  };

  const removeColumn = (colId: string) => {
    patch((d) => ({
      ...d,
      columns: d.columns.filter((c) => c.id !== colId),
    }));
    setEdges((edges) =>
      edges.filter((e) => e.sourceHandle !== colId && e.targetHandle !== colId),
    );
  };

  return (
    <div className={`erd-table-node${selected ? ' erd-table-node--selected' : ''}`}>
      <div className="erd-table-node__head nodrag nopan">
        <input
          className="erd-table-node__title nokey"
          value={data.name}
          onChange={(e) => patch((d) => ({ ...d, name: e.target.value }))}
          spellCheck={false}
          aria-label="Table name"
        />
      </div>
      <ul className="erd-table-node__cols">
        {data.columns.map((col) => (
          <li key={col.id} className="erd-table-node__col">
            <Handle
              type="target"
              id={col.id}
              position={Position.Left}
              className="erd-table-node__handle erd-table-node__handle--in"
              title="Drop a relation here (FK target)"
            />
            <label className="erd-table-node__pk nodrag nopan" title="Primary key">
              <input
                type="checkbox"
                className="nokey"
                checked={!!col.pk}
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    columns: d.columns.map((c) =>
                      c.id === col.id ? { ...c, pk: e.target.checked || undefined } : c,
                    ),
                  }))
                }
                aria-label={`${col.name} primary key`}
              />
              <span>PK</span>
            </label>
            <input
              className="erd-table-node__name nodrag nopan nokey"
              value={col.name}
              onChange={(e) =>
                patch((d) => ({
                  ...d,
                  columns: d.columns.map((c) =>
                    c.id === col.id ? { ...c, name: e.target.value } : c,
                  ),
                }))
              }
              spellCheck={false}
              aria-label="Column name"
            />
            <select
              className="erd-table-node__type nodrag nopan nokey"
              value={col.type}
              onChange={(e) =>
                patch((d) => ({
                  ...d,
                  columns: d.columns.map((c) =>
                    c.id === col.id ? { ...c, type: e.target.value as ErdColumnType } : c,
                  ),
                }))
              }
              aria-label="Column type"
            >
              {ERD_COLUMN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="erd-table-node__remove nodrag nopan nokey"
              aria-label={`Remove ${col.name}`}
              title="Remove column"
              onClick={() => removeColumn(col.id)}
            >
              ×
            </button>
            <Handle
              type="source"
              id={col.id}
              position={Position.Right}
              className="erd-table-node__handle erd-table-node__handle--out"
              title="Drag to another column to create a FK"
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="erd-table-node__add nodrag nopan nokey"
        onClick={() =>
          patch((d) => ({
            ...d,
            columns: [...d.columns, createColumn({ name: `col_${d.columns.length + 1}` })],
          }))
        }
      >
        + Column
      </button>
    </div>
  );
}
