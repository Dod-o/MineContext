import tempfile
import unittest
from pathlib import Path

import yaml

from opencontext.config.config_manager import ConfigManager


ROOT = Path(__file__).resolve().parents[1]
CONFIG_MANAGER = ROOT / "opencontext" / "config" / "config_manager.py"
GLOBAL_VLM_CLIENT = ROOT / "opencontext" / "llm" / "global_vlm_client.py"
SETTINGS_ROUTE = ROOT / "opencontext" / "server" / "routes" / "settings.py"
SETTINGS_PAGE = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "settings" / "settings.tsx"
SETTINGS_SERVICE = ROOT / "frontend" / "src" / "renderer" / "src" / "services" / "Settings.ts"
GENERATION_FILES = [
    ROOT / "opencontext" / "context_consumption" / "generation" / "realtime_activity_monitor.py",
    ROOT / "opencontext" / "context_consumption" / "generation" / "smart_tip_generator.py",
    ROOT / "opencontext" / "context_consumption" / "generation" / "smart_todo_manager.py",
    ROOT / "opencontext" / "context_consumption" / "generation" / "generation_report.py",
]


class FeatureModelAssignmentsTest(unittest.TestCase):
    def test_save_user_settings_preserves_model_assignments(self):
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
                        "model_assignments": {
                            "features": {
                                "content_generation.report": "custom / long-context",
                            }
                        }
                    }
                )
            )

            saved = yaml.safe_load(user_settings_path.read_text(encoding="utf-8"))

            self.assertEqual(
                saved["model_assignments"]["features"]["content_generation.report"],
                "custom / long-context",
            )

    def test_backend_exposes_feature_assignment_api(self):
        config_manager = CONFIG_MANAGER.read_text(encoding="utf-8")
        route = SETTINGS_ROUTE.read_text(encoding="utf-8")
        global_client = GLOBAL_VLM_CLIENT.read_text(encoding="utf-8")

        self.assertIn('if "model_assignments" in settings:', config_manager)
        self.assertIn('@router.get("/api/model_settings/feature_assignments")', route)
        self.assertIn('@router.post("/api/model_settings/feature_assignments")', route)
        self.assertIn("FeatureModelAssignmentsVO", route)
        self.assertIn('config.get("model_assignments", {})', route)
        self.assertIn('"features": assignments.features', route)
        self.assertIn("get_feature_model_profile", global_client)
        self.assertIn("feature_assignments = assignments.get(\"features\", {})", global_client)
        self.assertIn("model_profile: Optional[str] = None", global_client)

    def test_generation_tasks_pass_feature_model_profiles(self):
        content = "\n".join(path.read_text(encoding="utf-8") for path in GENERATION_FILES)

        self.assertIn('get_feature_model_profile("content_generation.activity")', content)
        self.assertIn('get_feature_model_profile("content_generation.tips")', content)
        self.assertIn('get_feature_model_profile("content_generation.todos")', content)
        self.assertIn('get_feature_model_profile("content_generation.report")', content)
        self.assertIn("model_profile=get_feature_model_profile", content)

    def test_frontend_exposes_feature_assignment_controls(self):
        service = SETTINGS_SERVICE.read_text(encoding="utf-8")
        page = SETTINGS_PAGE.read_text(encoding="utf-8")

        self.assertIn("FeatureModelAssignmentsProps", service)
        self.assertIn("getFeatureModelAssignmentsAPI", service)
        self.assertIn("updateFeatureModelAssignmentsAPI", service)
        self.assertIn("axiosInstance.get('/api/model_settings/feature_assignments')", service)
        self.assertIn("axiosInstance.post('/api/model_settings/feature_assignments'", service)
        self.assertIn("const [featureModelAssignments, setFeatureModelAssignments]", page)
        self.assertIn("getFeatureModelAssignmentKey", page)
        self.assertIn("updateFeatureModelAssignment", page)
        self.assertIn("updateFeatureModelAssignmentsAPI({ features: nextFeatureAssignments })", page)
        self.assertIn("value={featureModelAssignments[assignmentKey] || ''}", page)
        self.assertIn("value={featureModelAssignments[getFeatureModelAssignmentKey('report')] || ''}", page)


if __name__ == "__main__":
    unittest.main()
