import os
import sys
import json

import addon_utils
import bpy


def source_export_settings(scene):
    if hasattr(scene, "vs"):
        return scene.vs

    modules = {module.__name__: module for module in addon_utils.modules()}
    for name in ("io_scene_valvesource2", "io_scene_valvesource"):
        installed = next(
            (module for module in modules if module.rsplit(".", 1)[-1] == name),
            None,
        )
        if installed is not None:
            addon_utils.enable(installed, default_set=False, persistent=False)
            if hasattr(scene, "vs"):
                return scene.vs
    return None


def configure_source_export(scene, export_directory):
    settings = source_export_settings(scene)
    if settings is None:
        print("DMM: Source Tools exporter not installed; imported model only.")
        return False

    properties = settings.bl_rna.properties
    if "9" not in properties["dmx_encoding"].enum_items.keys():
        print("DMM: Installed Source Tools exporter does not support Binary 9.")
        return False

    formats = properties["dmx_format"].enum_items.keys()
    model_format = "22_modeldoc" if "22_modeldoc" in formats else "22"
    if model_format not in formats:
        print("DMM: Installed Source Tools exporter does not support Source 2 DMX.")
        return False

    # An engine detected from a startup scene would override the manual versions.
    settings.engine_path = ""
    settings.export_path = os.path.abspath(export_directory)
    settings.export_format = "DMX"
    settings.dmx_encoding = "9"
    settings.dmx_format = model_format
    settings.use_kv2 = False
    print(f"DMM: DMX Binary 9 export configured for {settings.export_path}")
    return True


def addon_status():
    settings = source_export_settings(bpy.context.scene)
    ready = False
    if settings is not None:
        properties = settings.bl_rna.properties
        try:
            bpy.ops.import_scene.smd.get_rna_type()
            ready = (
                "9" in properties["dmx_encoding"].enum_items.keys()
                and "22_modeldoc" in properties["dmx_format"].enum_items.keys()
            )
        except RuntimeError:
            pass
    return {
        "ready": ready,
        "installed": settings is not None,
        "installSupported": bpy.app.version >= (4, 4, 0),
        "blenderVersion": ".".join(str(part) for part in bpy.app.version),
    }


def install_addon(archive):
    status = addon_status()
    if status["ready"]:
        return status
    if not status["installSupported"]:
        raise RuntimeError("Blender Source2Tools requires Blender 4.4 or newer.")

    # Keep existing addon files and preferences intact if they need manual repair.
    target = os.path.join(bpy.utils.user_resource("SCRIPTS"), "addons", "io_scene_valvesource2")
    if os.path.exists(target):
        raise RuntimeError(
            "An incompatible Source2Tools installation already exists. "
            "Update it in Blender's Add-ons preferences."
        )
    for module in addon_utils.modules():
        if (
            module.__name__.rsplit(".", 1)[-1] in ("io_scene_valvesource", "io_scene_valvesource2")
            and addon_utils.check(module.__name__)[1]
        ):
            addon_utils.disable(module.__name__, default_set=True)
    bpy.ops.preferences.addon_install(filepath=archive, overwrite=False)
    addon_utils.enable("io_scene_valvesource2", default_set=True, persistent=True)
    status = addon_status()
    if not status["ready"]:
        raise RuntimeError("Source2Tools was installed but its DMX importer could not be enabled.")
    bpy.ops.wm.save_userpref()
    return status


def import_model(model):
    if model.lower().endswith(".dmx"):
        if source_export_settings(bpy.context.scene) is None:
            raise RuntimeError("Install Blender Source2Tools to open DMX models.")
        result = bpy.ops.import_scene.smd(filepath=model)
    else:
        result = bpy.ops.import_scene.gltf(filepath=model)
    if "FINISHED" not in result:
        raise RuntimeError(f"Blender could not import {os.path.basename(model)}.")


def remove_default_cube():
    cube = bpy.context.scene.objects.get("Cube")
    if cube is None or cube.type != "MESH":
        return
    vertices = {tuple(vertex.co) for vertex in cube.data.vertices}
    default_vertices = {(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)}
    if (
        vertices == default_vertices
        and len(cube.data.polygons) == 6
        and tuple(cube.location) == (0, 0, 0)
        and tuple(cube.rotation_euler) == (0, 0, 0)
        and tuple(cube.scale) == (1, 1, 1)
        and cube.parent is None
        and not cube.modifiers
    ):
        bpy.data.objects.remove(cube, do_unlink=True)


def preview_model(model, output):
    remove_default_cube()
    before = set(bpy.context.scene.objects)
    import_model(model)
    imported = set(bpy.context.scene.objects) - before
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("This DMX contains no model geometry to preview.")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in imported:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", use_selection=True, export_animations=False, export_materials="NONE")
    for obj in meshes:
        obj.data.calc_loop_triangles()
    print("DMM_MODEL_STATS=" + json.dumps({
        "vertices": sum(len(obj.data.vertices) for obj in meshes),
        "indices": sum(len(obj.data.loop_triangles) * 3 for obj in meshes),
    }))


def main():
    arguments = sys.argv[sys.argv.index("--") + 1:]
    if arguments == ["probe"]:
        print("DMM_BLENDER_STATUS=" + json.dumps(addon_status()))
        return
    if arguments[0] == "install":
        print("DMM_BLENDER_STATUS=" + json.dumps(install_addon(arguments[1])))
        return
    if arguments[0] == "preview":
        preview_model(*arguments[1:])
        return
    model, export_directory = arguments
    remove_default_cube()
    import_model(model)
    configure_source_export(bpy.context.scene, export_directory)


if __name__ == "__main__":
    main()
