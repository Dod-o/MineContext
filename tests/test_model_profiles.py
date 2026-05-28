import tempfile
import unittest
from pathlib import Path

import yaml

from opencontext.config.config_manager import ConfigManager


class ModelProfilesConfigTest(unittest.TestCase):
    def test_save_user_settings_preserves_model_profiles(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            user_settings_path = root / "user_setting.yaml"
            config_path = root / "config.yaml"
            config_path.write_text(
                "\n".join(
                    [
                        "user_setting_path: " + str(user_settings_path).replace("\\", "/"),
                        "vlm_model: {}",
                        "embedding_model: {}",
                        "prompts:",
                        "  language: en",
                    ]
                ),
                encoding="utf-8",
            )

            manager = ConfigManager()
            manager.load_config(str(config_path))

            self.assertTrue(
                manager.save_user_settings(
                    {
                        "model_profiles": [
                            {
                                "name": "custom / vision",
                                "config": {
                                    "modelPlatform": "custom",
                                    "modelId": "vision",
                                    "baseUrl": "http://localhost:8000/v1",
                                    "apiKey": "",
                                    "embeddingModelId": "embedding",
                                },
                            }
                        ]
                    }
                )
            )

            saved = yaml.safe_load(user_settings_path.read_text(encoding="utf-8"))

            self.assertEqual(saved["model_profiles"][0]["name"], "custom / vision")


if __name__ == "__main__":
    unittest.main()
