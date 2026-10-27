import importlib.util
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import Mock, patch


SCRIPT = Path(__file__).parents[1] / "src/commands/modding_blender.py"


class BlenderExportTests(unittest.TestCase):
    def setUp(self):
        self.addons = SimpleNamespace(modules=Mock(return_value=[]), enable=Mock())
        self.bpy = SimpleNamespace(
            context=SimpleNamespace(scene=SimpleNamespace()),
            ops=SimpleNamespace(import_scene=SimpleNamespace(
                smd=Mock(return_value={"FINISHED"}),
                gltf=Mock(return_value={"FINISHED"}),
            )),
            app=SimpleNamespace(version=(5, 2, 2)),
        )
        with patch.dict(sys.modules, addon_utils=self.addons, bpy=self.bpy):
            spec = importlib.util.spec_from_file_location("modding_blender", SCRIPT)
            self.script = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.script)

    def settings(self, encodings=("2", "9"), formats=("1", "22", "22_modeldoc")):
        return SimpleNamespace(
            bl_rna=SimpleNamespace(properties={
                "dmx_encoding": SimpleNamespace(enum_items=dict.fromkeys(encodings)),
                "dmx_format": SimpleNamespace(enum_items=dict.fromkeys(formats)),
            }),
            engine_path="old-sdk/bin",
            export_path="//old-export",
            export_format="SMD",
            dmx_encoding="2",
            dmx_format="1",
            use_kv2=True,
        )

    def test_configures_original_content_directory_and_binary_modeldoc(self):
        settings = self.settings()
        directory = Path.cwd() / "addon with spaces" / "models"
        self.assertTrue(self.script.configure_source_export(
            SimpleNamespace(vs=settings), str(directory)))
        self.assertEqual(settings.export_path, str(directory))
        self.assertEqual(settings.export_format, "DMX")
        self.assertEqual(settings.dmx_encoding, "9")
        self.assertEqual(settings.dmx_format, "22_modeldoc")
        self.assertFalse(settings.use_kv2)
        self.assertEqual(settings.engine_path, "")
        self.addons.enable.assert_not_called()

    def test_missing_exporter_keeps_import_available(self):
        self.assertFalse(self.script.configure_source_export(SimpleNamespace(), "/addon"))
        self.addons.enable.assert_not_called()

    def test_old_exporter_is_not_partially_reconfigured(self):
        settings = self.settings(encodings=("2", "5"))
        self.assertFalse(self.script.configure_source_export(
            SimpleNamespace(vs=settings), "/addon"))
        self.assertEqual(settings.export_path, "//old-export")
        self.assertEqual(settings.export_format, "SMD")

    def test_installed_exporter_is_enabled_only_for_this_session(self):
        scene = SimpleNamespace()
        module = SimpleNamespace(__name__="bl_ext.user.io_scene_valvesource2")
        self.addons.modules.return_value = [module]
        self.addons.enable.side_effect = lambda *args, **kwargs: setattr(
            scene, "vs", self.settings())
        self.assertTrue(self.script.configure_source_export(scene, "/addon"))
        self.addons.enable.assert_called_once_with(
            module.__name__, default_set=False, persistent=False)

    def test_source_tools_without_modeldoc_uses_source2_format(self):
        settings = self.settings(formats=("1", "22"))
        self.assertTrue(self.script.configure_source_export(
            SimpleNamespace(vs=settings), "/addon"))
        self.assertEqual(settings.dmx_format, "22")

    def test_dmx_uses_source_tools_importer_on_original_file(self):
        self.bpy.context.scene.vs = self.settings()
        self.script.import_model("/original addon/models/mesh.DMX")
        self.bpy.ops.import_scene.smd.assert_called_once_with(
            filepath="/original addon/models/mesh.DMX")
        self.bpy.ops.import_scene.gltf.assert_not_called()

    def test_compiled_model_conversion_keeps_gltf_importer(self):
        self.script.import_model("/temporary/model.glb")
        self.bpy.ops.import_scene.gltf.assert_called_once_with(filepath="/temporary/model.glb")
        self.bpy.ops.import_scene.smd.assert_not_called()

    def test_dmx_requires_importer_before_importing(self):
        with self.assertRaisesRegex(RuntimeError, "Install Blender Source2Tools"):
            self.script.import_model("/addon/mesh.dmx")
        self.bpy.ops.import_scene.smd.assert_not_called()

    def test_cancelled_import_is_reported(self):
        self.bpy.ops.import_scene.gltf.return_value = {"CANCELLED"}
        with self.assertRaisesRegex(RuntimeError, "could not import"):
            self.script.import_model("/temporary/model.glb")

    def test_probe_requires_binary9_and_modeldoc_importer(self):
        self.bpy.context.scene.vs = self.settings()
        self.assertEqual(self.script.addon_status(), {
            "ready": True, "installed": True,
            "installSupported": True, "blenderVersion": "5.2.2",
        })
        self.bpy.context.scene.vs = self.settings(formats=("1", "22"))
        self.assertFalse(self.script.addon_status()["ready"])

    def test_probe_without_plugin_offers_supported_install(self):
        self.assertEqual(self.script.addon_status(), {
            "ready": False, "installed": False,
            "installSupported": True, "blenderVersion": "5.2.2",
        })

    def test_removes_default_cube_without_touching_other_scene_objects(self):
        vertices = [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
        cube = SimpleNamespace(type="MESH", location=(0, 0, 0), rotation_euler=(0, 0, 0),
            scale=(1, 1, 1), parent=None, modifiers=[], data=SimpleNamespace(
            vertices=[SimpleNamespace(co=co) for co in vertices], polygons=[None] * 6))
        camera = SimpleNamespace(type="CAMERA")
        self.bpy.context.scene.objects = {"Cube": cube, "Camera": camera}
        self.bpy.data = SimpleNamespace(objects=SimpleNamespace(remove=Mock()))
        self.script.remove_default_cube()
        self.bpy.data.objects.remove.assert_called_once_with(cube, do_unlink=True)

    def test_keeps_customized_startup_cube(self):
        cube = SimpleNamespace(type="MESH", data=SimpleNamespace(
            vertices=[SimpleNamespace(co=(0, 0, 0))], polygons=[]))
        self.bpy.context.scene.objects = {"Cube": cube}
        self.bpy.data = SimpleNamespace(objects=SimpleNamespace(remove=Mock()))
        self.script.remove_default_cube()
        self.bpy.data.objects.remove.assert_not_called()

    def test_dmx_preview_exports_geometry_without_materials(self):
        objects = set()
        mesh = Mock(type="MESH")
        mesh.data.vertices = [None] * 3
        mesh.data.loop_triangles = [None]
        self.bpy.context.scene.objects = objects
        self.bpy.context.view_layer = SimpleNamespace(objects=SimpleNamespace(active=None))
        self.bpy.ops.object = SimpleNamespace(select_all=Mock())
        self.bpy.ops.export_scene = SimpleNamespace(gltf=Mock())
        with patch.object(self.script, "remove_default_cube"), patch.object(
            self.script, "import_model", side_effect=lambda path: objects.add(mesh)
        ):
            self.script.preview_model("/addon/mesh.dmx", "/temporary/preview.glb")
        self.bpy.ops.export_scene.gltf.assert_called_once_with(
            filepath="/temporary/preview.glb", export_format="GLB",
            use_selection=True, export_animations=False, export_materials="NONE")


if __name__ == "__main__":
    unittest.main()
