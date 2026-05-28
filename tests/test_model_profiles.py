import tempfile
import unittest
from pathlib import Path

import yaml

from opencontext.config.config_manager import ConfigManager


ROOT = Path(__file__).resolve().parents[1]
SETTINGS_ROUTE = ROOT / "opencontext" / "server" / "routes" / "settings.py"
CONFIG_MANAGER = ROOT / "opencontext" / "config" / "config_manager.py"
SETTINGS_PAGE = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "settings" / "settings.tsx"
SETTINGS_SERVICE = ROOT / "frontend" / "src" / "renderer" / "src" / "services" / "Settings.ts"


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

    def test_saved_model_profiles_are_loaded_and_switched_from_settings_page(self):
        route = SETTINGS_ROUTE.read_text(encoding="utf-8")
        config_manager = CONFIG_MANAGER.read_text(encoding="utf-8")
        page = SETTINGS_PAGE.read_text(encoding="utf-8")
        service = SETTINGS_SERVICE.read_text(encoding="utf-8")

        self.assertIn('if "model_profiles" in settings:', config_manager)
        self.assertIn('@router.get("/api/model_settings/profiles")', route)
        self.assertIn('@router.post("/api/model_settings/profiles/delete")', route)
        self.assertIn('"model_profiles": _upsert_model_profile(existing_profiles, cfg)', route)
        self.assertIn("getModelProfilesAPI", service)
        self.assertIn("axiosInstance.get('/api/model_settings/profiles')", service)
        self.assertIn("const [modelProfiles, setModelProfiles]", page)
        self.assertIn("const switchModelProfile = useMemoizedFn((profileName: string) => {", page)
        self.assertIn("setFormFromConfig(profile.config)", page)
        self.assertIn("updateModelSettings(profile.config)", page)
        self.assertIn("Saved model profiles", page)
        self.assertIn("Switch to a previously saved model", page)
        self.assertIn("onChange={(value) => switchModelProfile(value as string)}", page)


if __name__ == "__main__":
    unittest.main()
