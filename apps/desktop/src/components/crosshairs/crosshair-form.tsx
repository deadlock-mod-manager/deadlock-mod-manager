import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import { DEFAULT_CROSSHAIR_CONFIG } from "@deadlock-mods/crosshair/types";
import { DeadlockHeroes } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "react-query";
import { publishCrosshair } from "@/lib/api";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { CrosshairCanvas } from "./crosshair/crosshair-canvas";
import { CrosshairControls } from "./crosshair/crosshair-controls";

const ALL_HEROES = Object.values(DeadlockHeroes);

export const CrosshairForm = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAuthenticated, setActiveCrosshair } = usePersistedStore();
  const [config, setConfig] = useState<CrosshairConfig>(
    DEFAULT_CROSSHAIR_CONFIG,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [heroes, setHeroes] = useState<string[]>(["Default"]);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const applyCrosshairMutation = useMutation({
    mutationFn: (crosshairConfig: CrosshairConfig) =>
      invoke("apply_crosshair_to_autoexec", { config: crosshairConfig }),
    onSuccess: () => {
      toast.success(t("crosshairs.appliedRestart"));
      queryClient.invalidateQueries("autoexec-config");
    },
    onError: (error) => {
      logger.error(error);
      toast.error(t("crosshairs.form.applyError"));
    },
  });

  const handleApply = () => {
    setActiveCrosshair(config);
    applyCrosshairMutation.mutate(config);
  };

  const handlePublish = async () => {
    if (!isAuthenticated) {
      toast.error(t("crosshairs.form.loginRequired"));
      return;
    }

    if (!name.trim() || name.length < 3 || name.length > 50) {
      toast.error(t("crosshairs.form.nameValidation"));
      return;
    }

    if (description && description.length > 500) {
      toast.error(t("crosshairs.form.descriptionValidation"));
      return;
    }

    if (heroes.length === 0 || heroes.length > 5) {
      toast.error(t("crosshairs.form.heroesValidation"));
      return;
    }

    setIsPublishing(true);
    try {
      await publishCrosshair({
        name: name.trim(),
        description: description.trim() || undefined,
        config,
        tags,
        heroes,
      });
      toast.success(t("crosshairs.form.published"));
      setName("");
      setDescription("");
      setTags([]);
      setHeroes(["Default"]);
      setConfig(DEFAULT_CROSSHAIR_CONFIG);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("crosshairs.form.publishError"),
      );
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className='flex flex-col gap-6'>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <div className='space-y-6'>
          <div className='space-y-4'>
            <h3 className='text-lg font-semibold'>
              {t("crosshairs.form.metadata")}
            </h3>

            <div className='space-y-2'>
              <Label htmlFor='name'>
                {t("crosshairs.form.name")}{" "}
                <span className='text-destructive'>*</span>
              </Label>
              <Input
                id='name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("crosshairs.form.namePlaceholder")}
                maxLength={50}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='description'>
                {t("crosshairs.form.description")}
              </Label>
              <Textarea
                id='description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("crosshairs.form.descriptionPlaceholder")}
                maxLength={500}
                rows={3}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='tags'>{t("crosshairs.form.tags")}</Label>
              <div className='flex gap-2'>
                <Input
                  id='tags'
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagInputKeyDown}
                  placeholder={t("crosshairs.form.tagsPlaceholder")}
                  disabled={tags.length >= 10}
                />
                <Button
                  type='button'
                  onClick={handleAddTag}
                  disabled={!tagInput.trim() || tags.length >= 10}>
                  {t("crosshairs.form.addTag")}
                </Button>
              </div>
              {tags.length > 0 && (
                <div className='flex flex-wrap gap-2 mt-2'>
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant='secondary'
                      className='cursor-pointer'
                      onClick={() => handleRemoveTag(tag)}>
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className='space-y-2'>
              <Label>
                {t("crosshairs.form.heroes")}{" "}
                <span className='text-destructive'>*</span>
              </Label>
              <div className='border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto'>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='hero-default'
                    checked={heroes.includes("Default")}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setHeroes(["Default"]);
                      } else {
                        setHeroes([]);
                      }
                    }}
                  />
                  <Label htmlFor='hero-default' className='cursor-pointer'>
                    Default
                  </Label>
                </div>
                {ALL_HEROES.map((hero) => {
                  const isSelected = heroes.includes(hero);
                  return (
                    <div key={hero} className='flex items-center space-x-2'>
                      <Checkbox
                        id={`hero-${hero}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const newHeroes = heroes.filter(
                              (h) => h !== "Default",
                            );
                            if (newHeroes.length < 5) {
                              setHeroes([...newHeroes, hero]);
                            }
                          } else {
                            setHeroes(heroes.filter((h) => h !== hero));
                          }
                        }}
                        disabled={
                          !isSelected &&
                          heroes.length >= 5 &&
                          !heroes.includes("Default")
                        }
                      />
                      <Label
                        htmlFor={`hero-${hero}`}
                        className='cursor-pointer flex-1'>
                        {hero}
                      </Label>
                    </div>
                  );
                })}
              </div>
              {heroes.length > 0 && (
                <div className='flex flex-wrap gap-2 mt-2'>
                  {heroes.map((hero) => (
                    <Badge
                      key={hero}
                      variant='secondary'
                      className='cursor-pointer'
                      onClick={() =>
                        setHeroes(heroes.filter((h) => h !== hero))
                      }>
                      {hero} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <CrosshairControls config={config} onChange={setConfig} />
        </div>

        <div className='space-y-4'>
          <div className='sticky top-4'>
            <h3 className='text-lg font-semibold mb-4'>
              {t("crosshairs.form.preview")}
            </h3>
            <div className='bg-zinc-800 rounded-lg overflow-hidden p-4'>
              <CrosshairCanvas config={config} interactive />
            </div>
          </div>
        </div>
      </div>

      <div className='flex gap-2'>
        <Button
          disabled={applyCrosshairMutation.isLoading}
          onClick={handleApply}
          isLoading={applyCrosshairMutation.isLoading}
          variant='outline'
          className='flex-1'>
          {applyCrosshairMutation.isLoading
            ? t("common.loading")
            : t("crosshairs.form.apply")}
        </Button>
        <Button
          onClick={handlePublish}
          disabled={!isAuthenticated || isPublishing}
          className='flex-1'>
          {isPublishing
            ? t("crosshairs.form.publishing")
            : t("crosshairs.form.publish")}
        </Button>
      </div>
    </div>
  );
};
