import os
import tempfile
import unittest
from pathlib import Path

from opencontext.config.config_manager import ConfigManager


class ConfigEnvOverridesTest(unittest.TestCase):
    def setUp(self):
        self._old_screenshot_dir = os.environ.get("OPENCONTEXT_SCREENSHOT_DIR")
        self._old_retain_screenshot_images = os.environ.get(
            "OPENCONTEXT_RETAIN_SCREENSHOT_IMAGES"
        )

    def tearDown(self):
        if self._old_screenshot_dir is None:
            os.environ.pop("OPENCONTEXT_SCREENSHOT_DIR", None)
        else:
            os.environ["OPENCONTEXT_SCREENSHOT_DIR"] = self._old_screenshot_dir
        if self._old_retain_screenshot_images is None:
            os.environ.pop("OPENCONTEXT_RETAIN_SCREENSHOT_IMAGES", None)
        else:
            os.environ[
                "OPENCONTEXT_RETAIN_SCREENSHOT_IMAGES"
            ] = self._old_retain_screenshot_images

    def test_screenshot_directory_env_overrides_config_storage_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "config.yaml"
            user_setting_path = root / "config" / "user_setting.yaml"
            custom_screenshot_dir = root / "custom-screenshots"
            user_setting_value = str(user_setting_path).replace("\\", "/")
            os.environ["OPENCONTEXT_SCREENSHOT_DIR"] = str(custom_screenshot_dir)

            config_path.write_text(
                "\n".join(
                    [
                        f"user_setting_path: {user_setting_value}",
                        "capture:",
                        "  screenshot:",
                        "    storage_path: ./screenshots",
                    ]
                ),
                encoding="utf-8",
            )

            manager = ConfigManager()
            manager.load_config(str(config_path))

            config = manager.get_config()
            self.assertEqual(
                Path(config["capture"]["screenshot"]["storage_path"]),
                custom_screenshot_dir.resolve(),
            )

    def test_retain_screenshot_images_env_enables_semantic_only_cleanup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "config.yaml"
            user_setting_path = root / "config" / "user_setting.yaml"
            user_setting_value = str(user_setting_path).replace("\\", "/")
            os.environ["OPENCONTEXT_RETAIN_SCREENSHOT_IMAGES"] = "false"

            config_path.write_text(
                "\n".join(
                    [
                        f"user_setting_path: {user_setting_value}",
                        "processing:",
                        "  screenshot_processor:",
                        "    image_retention:",
                        "      delete_after_processing: false",
                    ]
                ),
                encoding="utf-8",
            )

            manager = ConfigManager()
            manager.load_config(str(config_path))

            config = manager.get_config()
            self.assertTrue(
                config["processing"]["screenshot_processor"]["image_retention"][
                    "delete_after_processing"
                ]
            )


if __name__ == "__main__":
    unittest.main()
