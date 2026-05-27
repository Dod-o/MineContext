import tempfile
import unittest
from pathlib import Path

import yaml

from opencontext.config.prompt_manager import PromptManager


class PromptManagerTest(unittest.TestCase):
    def test_user_prompts_are_saved_to_writable_user_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bundled_config_dir = root / "bundled" / "config"
            user_config_dir = root / "user-data" / "config"
            bundled_config_dir.mkdir(parents=True)
            user_config_dir.mkdir(parents=True)

            bundled_prompts = bundled_config_dir / "prompts_zh.yaml"
            bundled_prompts.write_text("generation:\n  demo: base\n", encoding="utf-8")

            prompt_manager = PromptManager(
                str(bundled_prompts), user_prompts_dir=str(user_config_dir)
            )
            prompt_manager.save_prompts({"generation": {"demo": "custom"}})

            expected_path = user_config_dir / "user_prompts_zh.yaml"
            self.assertTrue(expected_path.exists())
            self.assertFalse((bundled_config_dir / "user_prompts_zh.yaml").exists())

            saved_prompts = yaml.safe_load(expected_path.read_text(encoding="utf-8"))
            self.assertEqual(saved_prompts["generation"]["demo"], "custom")

    def test_screenshot_analyze_prompt_falls_back_to_legacy_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            prompts_path = root / "prompts_en.yaml"
            prompts_path.write_text(
                "\n".join(
                    [
                        "processing:",
                        "  extraction:",
                        "    screenshot_contextual_batch:",
                        "      system: legacy system",
                        "      user: legacy user",
                    ]
                ),
                encoding="utf-8",
            )

            prompt_manager = PromptManager(str(prompts_path))

            prompts = prompt_manager.get_prompt_group("processing.extraction.screenshot_analyze")
            self.assertEqual(prompts["system"], "legacy system")
            self.assertEqual(prompts["user"], "legacy user")


if __name__ == "__main__":
    unittest.main()
