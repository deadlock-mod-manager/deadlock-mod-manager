import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { CheckCircle, PencilSimple } from "@phosphor-icons/react";
import { usePersistedStore } from "@/lib/store";

const ReviewStep = () => {
  const { basicInfo, authors, layers, variantGroups, getWizardState } =
    usePersistedStore();

  const state = getWizardState();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className='space-y-6'>
      <div>
        <h3 className='font-semibold text-lg'>Review Package Configuration</h3>
        <p className='text-muted-foreground text-sm'>
          Review all the information below before creating your package.
        </p>
      </div>

      <div className='space-y-6'>
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <h4 className='font-semibold'>Basic Information</h4>
            <Button variant='ghost' size='sm' type='button'>
              <PencilSimple className='mr-2 h-4 w-4' />
              Edit
            </Button>
          </div>
          <Separator />

          {basicInfo ? (
            <div className='grid gap-3'>
              <div className='grid grid-cols-3 gap-2'>
                <span className='text-muted-foreground text-sm'>Name:</span>
                <span className='col-span-2 text-sm font-medium'>
                  {basicInfo.name}
                </span>
              </div>
              <div className='grid grid-cols-3 gap-2'>
                <span className='text-muted-foreground text-sm'>
                  Display Name:
                </span>
                <span className='col-span-2 text-sm font-medium'>
                  {basicInfo.displayName}
                </span>
              </div>
              <div className='grid grid-cols-3 gap-2'>
                <span className='text-muted-foreground text-sm'>Version:</span>
                <span className='col-span-2 text-sm font-medium'>
                  {basicInfo.version}
                </span>
              </div>
              <div className='grid grid-cols-3 gap-2'>
                <span className='text-muted-foreground text-sm'>
                  Description:
                </span>
                <span className='col-span-2 text-sm'>
                  {basicInfo.description}
                </span>
              </div>
              {basicInfo.gameVersion && (
                <div className='grid grid-cols-3 gap-2'>
                  <span className='text-muted-foreground text-sm'>
                    Game Version:
                  </span>
                  <span className='col-span-2 text-sm'>
                    {basicInfo.gameVersion}
                  </span>
                </div>
              )}
              {basicInfo.license && (
                <div className='grid grid-cols-3 gap-2'>
                  <span className='text-muted-foreground text-sm'>
                    License:
                  </span>
                  <span className='col-span-2 text-sm'>
                    {basicInfo.license}
                  </span>
                </div>
              )}
              {basicInfo.homepage && (
                <div className='grid grid-cols-3 gap-2'>
                  <span className='text-muted-foreground text-sm'>
                    Homepage:
                  </span>
                  <span className='col-span-2 truncate text-sm'>
                    {basicInfo.homepage}
                  </span>
                </div>
              )}
              {basicInfo.repository && (
                <div className='grid grid-cols-3 gap-2'>
                  <span className='text-muted-foreground text-sm'>
                    Repository:
                  </span>
                  <span className='col-span-2 truncate text-sm'>
                    {basicInfo.repository}
                  </span>
                </div>
              )}
              {basicInfo.screenshots && basicInfo.screenshots.length > 0 && (
                <div className='grid grid-cols-3 gap-2'>
                  <span className='text-muted-foreground text-sm'>
                    Screenshots:
                  </span>
                  <span className='col-span-2 text-sm'>
                    {basicInfo.screenshots.length} file(s)
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>
              No basic information provided
            </p>
          )}
        </div>

        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <h4 className='font-semibold'>Authors</h4>
            <Button variant='ghost' size='sm' type='button'>
              <PencilSimple className='mr-2 h-4 w-4' />
              Edit
            </Button>
          </div>
          <Separator />

          {authors && authors.length > 0 ? (
            <div className='space-y-2'>
              {authors.map((author, index) => (
                <div key={index} className='rounded-md border p-3'>
                  {typeof author === "string" ? (
                    <p className='text-sm font-medium'>{author}</p>
                  ) : (
                    <div className='space-y-1'>
                      <p className='text-sm font-medium'>{author.name}</p>
                      {author.role && (
                        <p className='text-muted-foreground text-xs'>
                          Role: {author.role}
                        </p>
                      )}
                      {author.url && (
                        <p className='truncate text-xs text-blue-500'>
                          {author.url}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>No authors provided</p>
          )}
        </div>

        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <h4 className='font-semibold'>Layers</h4>
            <Button variant='ghost' size='sm' type='button'>
              <PencilSimple className='mr-2 h-4 w-4' />
              Edit
            </Button>
          </div>
          <Separator />

          {layers && layers.length > 0 ? (
            <div className='space-y-3'>
              {layers.map((layer, index) => (
                <div key={index} className='rounded-md border p-3'>
                  <div className='flex items-start justify-between'>
                    <div className='space-y-1 flex-1'>
                      <div className='flex items-center gap-2'>
                        <p className='text-sm font-medium'>{layer.name}</p>
                        <Badge variant='outline' className='text-xs'>
                          Priority: {layer.priority}
                        </Badge>
                        {layer.required && (
                          <Badge variant='default' className='text-xs'>
                            Required
                          </Badge>
                        )}
                      </div>
                      {layer.description && (
                        <p className='text-muted-foreground text-xs'>
                          {layer.description}
                        </p>
                      )}
                      {layer.vpkFiles && layer.vpkFiles.length > 0 && (
                        <div className='mt-2 space-y-1'>
                          <p className='text-muted-foreground text-xs font-medium'>
                            VPK Files ({layer.vpkFiles.length}):
                          </p>
                          {layer.vpkFiles.map((file, fileIndex) => (
                            <div
                              key={fileIndex}
                              className='flex items-center gap-2 text-xs'>
                              <CheckCircle className='h-3 w-3 text-green-500' />
                              <span className='truncate'>{file.name}</span>
                              <span className='text-muted-foreground'>
                                ({formatFileSize(file.size)})
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>No layers defined</p>
          )}
        </div>

        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <h4 className='font-semibold'>Variant Groups</h4>
            <Button variant='ghost' size='sm' type='button'>
              <PencilSimple className='mr-2 h-4 w-4' />
              Edit
            </Button>
          </div>
          <Separator />

          {variantGroups && variantGroups.length > 0 ? (
            <div className='space-y-4'>
              {variantGroups.map((group, groupIndex) => (
                <div key={groupIndex} className='rounded-md border p-3'>
                  <div className='space-y-3'>
                    <div>
                      <div className='flex items-center gap-2'>
                        <p className='text-sm font-medium'>{group.name}</p>
                        <Badge variant='secondary' className='text-xs'>
                          {group.id}
                        </Badge>
                      </div>
                      {group.description && (
                        <p className='text-muted-foreground text-xs mt-1'>
                          {group.description}
                        </p>
                      )}
                      <p className='text-muted-foreground text-xs mt-1'>
                        Default: {group.default}
                      </p>
                    </div>

                    <div className='space-y-2'>
                      <p className='text-muted-foreground text-xs font-medium'>
                        Variants ({group.variants.length}):
                      </p>
                      {group.variants.map((variant, variantIndex) => (
                        <div
                          key={variantIndex}
                          className='rounded-md bg-muted/50 p-2'>
                          <div className='flex items-center gap-2'>
                            <p className='text-xs font-medium'>
                              {variant.name}
                            </p>
                            <Badge variant='outline' className='text-xs'>
                              {variant.id}
                            </Badge>
                          </div>
                          {variant.description && (
                            <p className='text-muted-foreground text-xs mt-1'>
                              {variant.description}
                            </p>
                          )}
                          <div className='mt-2 flex flex-wrap gap-1'>
                            <span className='text-muted-foreground text-xs'>
                              Layers:
                            </span>
                            {variant.layers.map((layer, layerIndex) => (
                              <Badge
                                key={layerIndex}
                                variant='secondary'
                                className='text-xs'>
                                {layer}
                              </Badge>
                            ))}
                          </div>
                          {variant.preview_image && (
                            <p className='text-muted-foreground text-xs mt-1'>
                              Preview: {variant.preview_image}
                            </p>
                          )}
                          {variant.screenshots &&
                            variant.screenshots.length > 0 && (
                              <p className='text-muted-foreground text-xs mt-1'>
                                Screenshots: {variant.screenshots.length}
                              </p>
                            )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>
              No variant groups defined
            </p>
          )}
        </div>
      </div>

      <Separator />

      <div className='flex justify-center'>
        <Button type='button' size='lg'>
          Create Package
        </Button>
      </div>
    </div>
  );
};

export default ReviewStep;
