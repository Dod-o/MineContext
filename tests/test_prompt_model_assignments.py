import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
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


class PromptModelAssignmentsTest(unittest.TestCase):
    def test_backend_exposes_prompt_assignment_api(self):
        route = SETTINGS_ROUTE.read_text(encoding="utf-8")
        global_client = GLOBAL_VLM_CLIENT.read_text(encoding="utf-8")

        self.assertIn("@router.get(\"/api/model_settings/prompt_assignments\")", route)
        self.assertIn("@router.post(\"/api/model_settings/prompt_assignments\")", route)
        self.assertIn("PromptModelAssignmentsVO", route)
        self.assertIn('"prompts": assignments.prompts', route)
        self.assertIn("prompt_assignments = assignments.get(\"prompts\", {})", global_client)
        self.assertIn("return get_feature_model_profile(feature_key)", global_client)

    def test_generation_tasks_pass_prompt_model_profiles(self):
        content = "\n".join(path.read_text(encoding="utf-8") for path in GENERATION_FILES)

        self.assertIn('"generation.realtime_activity_monitor"', content)
        self.assertIn('"generation.smart_tip_generation"', content)
        self.assertIn('"generation.todo_extraction"', content)
        self.assertIn('"generation.generation_report"', content)
        self.assertIn('"generation.merge_hourly_reports"', content)
        self.assertIn("model_profile=get_prompt_model_profile", content)

    def test_frontend_exposes_prompt_assignment_controls(self):
        service = SETTINGS_SERVICE.read_text(encoding="utf-8")
        page = SETTINGS_PAGE.read_text(encoding="utf-8")

        self.assertIn("PromptModelAssignmentsProps", service)
        self.assertIn("getPromptModelAssignmentsAPI", service)
        self.assertIn("updatePromptModelAssignmentsAPI", service)
        self.assertIn("axiosInstance.get('/api/model_settings/prompt_assignments')", service)
        self.assertIn("axiosInstance.post('/api/model_settings/prompt_assignments'", service)
        self.assertIn("const [promptModelAssignments, setPromptModelAssignments]", page)
        self.assertIn("updatePromptModelAssignment", page)
        self.assertIn("updatePromptModelAssignmentsAPI({ prompts: nextPromptAssignments })", page)
        self.assertIn("value={promptModelAssignments[selectedPromptPath] || ''}", page)
        self.assertIn("generation.merge_hourly_reports", page)


if __name__ == "__main__":
    unittest.main()
