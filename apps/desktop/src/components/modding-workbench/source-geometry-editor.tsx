import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { FoundryModelViewer } from "@/components/foundry/workbench-model-viewer";
import {
  type GeometryVertex,
  type SourceVertexEdit,
  transformSourceVertices,
} from "@/lib/source-geometry-edit";
import type { ModdingDmxModel } from "@/types/generated/ModdingDmxModel";
import type { ModdingGeometry } from "@/types/generated/ModdingGeometry";
import { SourceGeometryPanel } from "./source-geometry-panel";

interface Props {
  addonId: string;
  path: string;
  geometry: ModdingGeometry;
  model: ModdingDmxModel;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: (backup: string) => void;
}

export function SourceGeometryEditor({
  addonId,
  path,
  geometry,
  model,
  onDirtyChange,
  onSaved,
}: Props) {
  const fullscreen = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<SourceVertexEdit[][]>([[]]);
  const [selected, setSelected] = useState<GeometryVertex[]>([]);
  const [move, setMove] = useState([0, 0, 0]);
  const [scale, setScale] = useState([1, 1, 1]);
  const committed = history.at(-1) ?? [];
  const meshes = useMemo(() => {
    const changes = new Map(
      committed.map((edit) => [`${edit.state}:${edit.vertex}`, edit.position]),
    );
    return geometry.meshes.map((mesh) => ({
      state: mesh.state,
      matrix: mesh.matrix,
      positions: mesh.positions.map(
        (position, vertex) =>
          changes.get(`${mesh.state}:${vertex}`) ?? position,
      ),
    }));
  }, [geometry.meshes, committed]);
  const valid =
    [...move, ...scale].every(Number.isFinite) &&
    scale.every((value) => value > 0);
  const preview = useMemo(() => {
    const changes = new Map(
      committed.map((edit) => [`${edit.state}:${edit.vertex}`, edit]),
    );
    if (valid)
      for (const edit of transformSourceVertices(meshes, selected, move, scale))
        changes.set(`${edit.state}:${edit.vertex}`, edit);
    return [...changes.values()].filter((edit) => {
      const position = geometry.meshes.find((mesh) => mesh.state === edit.state)
        ?.positions[edit.vertex];
      return position?.some(
        (value, axis) => Math.abs(value - edit.position[axis]) > 1e-6,
      );
    });
  }, [committed, geometry.meshes, meshes, selected, move, scale, valid]);
  const save = useMutation({
    mutationFn: () =>
      invoke<string>("save_modding_geometry", {
        addonId,
        path,
        expectedFingerprint: geometry.fingerprint,
        edits: preview,
      }),
    onSuccess: onSaved,
  });
  const dirty = preview.length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty || save.isPending);
  }, [dirty, save.isPending, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const resetTransform = () => {
    setMove([0, 0, 0]);
    setScale([1, 1, 1]);
  };
  const hasTransform =
    selected.length > 0 &&
    (move.some((value) => value !== 0) || scale.some((value) => value !== 1));
  const apply = () => {
    if (valid && hasTransform) setHistory((history) => [...history, preview]);
    resetTransform();
  };
  const choose = (vertices: GeometryVertex[]) => {
    apply();
    setSelected(vertices);
  };
  const controls = {
    meshes: geometry.meshes,
    edits: preview,
    selected,
    onPick: (vertex: GeometryVertex, additive: boolean) => {
      const exists = selected.some(
        (current) =>
          current.state === vertex.state && current.vertex === vertex.vertex,
      );
      choose(
        additive
          ? exists
            ? selected.filter(
                (current) =>
                  current.state !== vertex.state ||
                  current.vertex !== vertex.vertex,
              )
            : [...selected, vertex]
          : [vertex],
      );
    },
  };
  return (
    <div ref={fullscreen} className='flex h-full min-h-0'>
      <div className='relative min-w-0 flex-1'>
        <FoundryModelViewer
          model={model}
          label={path}
          fullscreenTarget={fullscreen}
          geometry={controls}
        />
      </div>
      <SourceGeometryPanel
        selectedCount={selected.length}
        totalCount={geometry.meshes.reduce(
          (count, mesh) => count + mesh.positions.length,
          0,
        )}
        move={move}
        scale={scale}
        busy={save.isPending}
        dirty={dirty}
        canUndo={
          history.length > 1 ||
          move.some((value) => value !== 0) ||
          scale.some((value) => value !== 1)
        }
        error={save.error?.message}
        onMove={(axis, value) =>
          setMove((values) =>
            values.map((current, index) => (index === axis ? value : current)),
          )
        }
        onScale={(axis, value) =>
          setScale((values) =>
            values.map((current, index) => (index === axis ? value : current)),
          )
        }
        onSelectAll={() =>
          choose(
            geometry.meshes.flatMap((mesh) =>
              mesh.positions.map((_, vertex) => ({
                state: mesh.state,
                vertex,
              })),
            ),
          )
        }
        onClearSelection={() => choose([])}
        onApply={apply}
        onUndo={() => {
          resetTransform();
          setHistory((history) =>
            !hasTransform && history.length > 1
              ? history.slice(0, -1)
              : history,
          );
        }}
        onReset={() => {
          setHistory([[]]);
          resetTransform();
        }}
        onSave={() => save.mutate()}
      />
    </div>
  );
}
