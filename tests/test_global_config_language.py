import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

from opencontext.config.global_config import GlobalConfig, get_prompt_group


class GlobalConfigLanguageTest(unittest.TestCase):
    def setUp(self):
        GlobalConfig.reset()

    def tearDown(self):
        GlobalConfig.reset()

    def _write_config_fixture(self, root: Path, language: str = "auto") -> Path:
        config_dir = root / "config"
        config_dir.mkdir()

        (config_dir / "prompts_zh.yaml").write_text(
            "generation:\n  sample:\n    system: zh system\n    user: zh user\n",
            encoding="utf-8",
        )
        (config_dir / "prompts_en.yaml").write_text(
            "generation:\n  sample:\n    system: en system\n    user: en user\n",
            encoding="utf-8",
        )

        config_path = config_dir / "config.yaml"
        config_path.write_text(
            yaml.safe_dump(
                {
                    "user_setting_path": str(config_dir / "user_setting.yaml"),
                    "prompts": {"language": language},
                },
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        return config_path

    def test_auto_prompt_language_uses_environment_locale(self):
        with tempfile.TemporaryDirectory() as tmp:
            config_path = self._write_config_fixture(Path(tmp))

            with patch.dict(
                os.environ,
                {
                    "OPENCONTEXT_PROMPT_LANGUAGE": "en",
                    "OPENCONTEXT_SYSTEM_LOCALE": "zh-CN",
                },
            ):
                config = GlobalConfig()
                self.assertTrue(config.initialize(str(config_path)))

            self.assertEqual(config.get_language(), "en")
            self.assertEqual(config.get_prompt_group("generation.sample")["system"], "en system")

    def test_saved_prompt_language_overrides_auto_locale(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config_path = self._write_config_fixture(root)
            user_setting_path = root / "config" / "user_setting.yaml"
            user_setting_path.write_text(
                yaml.safe_dump({"prompts": {"language": "zh"}}, sort_keys=False),
                encoding="utf-8",
            )

            with patch.dict(os.environ, {"OPENCONTEXT_PROMPT_LANGUAGE": "en"}):
                config = GlobalConfig()
                self.assertTrue(config.initialize(str(config_path)))

            self.assertEqual(config.get_language(), "zh")
            self.assertEqual(config.get_prompt_group("generation.sample")["system"], "zh system")

    def test_set_language_updates_dynamic_prompt_lookup(self):
        with tempfile.TemporaryDirectory() as tmp:
            config_path = self._write_config_fixture(Path(tmp), language="zh")

            config = GlobalConfig()
            self.assertTrue(config.initialize(str(config_path)))
            self.assertEqual(get_prompt_group("generation.sample")["system"], "zh system")

            self.assertTrue(config.set_language("en"))

            self.assertEqual(config.get_language(), "en")
            self.assertEqual(get_prompt_group("generation.sample")["system"], "en system")


if __name__ == "__main__":
    unittest.main()
