import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  dirtyParticleFiles,
  particleReducer,
  particleSession,
} from "@/lib/particle-colors";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import type { ModdingParticleColorEdit } from "@/types/generated/ModdingParticleColorEdit";
import type { ModdingParticleSave } from "@/types/generated/ModdingParticleSave";

export function useParticleColorSession(
  addonId: string,
  files: ModdingParticleFile[],
  onSaved: () => void,
) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [session, dispatch] = useReducer(
    particleReducer,
    files,
    particleSession,
  );
  const [backup, setBackup] = useState("");
  const changed = async () => {
    onSaved();
    await Promise.all([
      client.invalidateQueries({ queryKey: ["workbench-files", addonId] }),
      client.invalidateQueries({ queryKey: ["workbench-resource", addonId] }),
    ]);
  };
  const compile = useMutation({
    mutationKey: ["workbench-build", addonId],
    mutationFn: (paths?: string[]) =>
      invoke<string>("compile_modding_addon", {
        addonId,
        paths: paths ?? [...session.files.keys()],
      }),
    onSuccess: changed,
  });
  const edit = useMutation({
    mutationFn: async ({
      edits,
      label,
    }: {
      edits: ModdingParticleColorEdit[];
      label: string;
    }) => ({
      files: await invoke<ModdingParticleFile[]>(
        "edit_modding_particle_colors",
        { files: edits },
      ),
      label,
    }),
    onSuccess: ({ files, label }) =>
      dispatch({ type: "edit", files, label, at: Date.now() }),
  });
  const save = useMutation({
    mutationKey: ["workbench-files-change", addonId],
    mutationFn: async ({
      paths,
      compile,
    }: {
      paths: string[];
      compile: boolean;
    }) => {
      const requests: ModdingParticleSave[] = dirtyParticleFiles(session)
        .filter((file) => paths.includes(file.path))
        .map((file) => ({
          path: file.path,
          text: file.text,
          fingerprint: session.baseline.get(file.path)?.fingerprint ?? "",
        }));
      const backup = await invoke<string>("save_modding_particle_files", {
        addonId,
        files: requests,
      });
      return { backup, paths: requests.map((file) => file.path), compile };
    },
    onSuccess: async (result) => {
      setBackup(result.backup);
      dispatch({
        type: "saved",
        paths: result.paths,
        label: t("particleColors.saved"),
        at: Date.now(),
      });
      await changed();
      if (result.compile && result.paths.length) compile.mutate(result.paths);
    },
  });
  const restore = useMutation({
    mutationKey: ["workbench-files-change", addonId],
    mutationFn: async () => {
      await invoke("undo_modding_edit", {
        addonId,
        hierarchy: "content",
        backupId: backup,
      });
      return invoke<ModdingParticleFile[]>("list_modding_particle_colors", {
        addonId,
        scope: "",
      });
    },
    onSuccess: async (files) => {
      compile.reset();
      dispatch({ type: "reload", files });
      setBackup("");
      await changed();
    },
  });
  const dirty = dirtyParticleFiles(session);
  return {
    session,
    dispatch,
    edit,
    save,
    compile,
    restore,
    backup,
    dirty,
    busy:
      edit.isPending ||
      save.isPending ||
      compile.isPending ||
      restore.isPending,
    error: edit.error ?? save.error ?? compile.error ?? restore.error,
  };
}
