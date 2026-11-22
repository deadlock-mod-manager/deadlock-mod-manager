# Preview color edits on the GPU before baking textures

BC7 compression and mip generation are too expensive for interactive color controls. Preview the same recolor math in the fragment shader, then bake and compress when producing the actual asset.
