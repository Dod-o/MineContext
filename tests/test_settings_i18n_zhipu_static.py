import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SETTINGS_PAGE = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "settings" / "settings.tsx"
SETTINGS_CONSTANTS = ROOT / "frontend" / "src" / "renderer" / "src" / "pages" / "settings" / "constants.tsx"
MODEL_RADIO = (
    ROOT
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "settings"
    / "components"
    / "modelRadio"
    / "model-radio.tsx"
)
LLM_CLIENT = ROOT / "opencontext" / "llm" / "llm_client.py"


class SettingsI18nZhipuStaticTest(unittest.TestCase):
    def test_settings_page_has_chinese_localized_sections(self):
        page = SETTINGS_PAGE.read_text(encoding="utf-8")

        self.assertIn("useLocalizedText", page)
        self.assertIn("t('Language', '语言')", page)
        self.assertIn("t('Network proxy', '网络代理')", page)
        self.assertIn("t('Content generation', '内容生成')", page)
        self.assertIn("t('Local storage', '本地存储')", page)
        self.assertIn("t('System prompts', '系统提示词')", page)
        self.assertIn("t('Model platform', '模型平台')", page)

    def test_zhipu_is_a_first_class_vlm_option(self):
        constants = SETTINGS_CONSTANTS.read_text(encoding="utf-8")
        page = SETTINGS_PAGE.read_text(encoding="utf-8")
        model_radio = MODEL_RADIO.read_text(encoding="utf-8")
        llm_client = LLM_CLIENT.read_text(encoding="utf-8")

        self.assertIn("Zhipu = 'zhipu'", constants)
        self.assertIn("ZhipuUrl = 'https://open.bigmodel.cn/api/paas/v4'", constants)
        self.assertIn("glm-4.1v-thinking-flash", constants)
        self.assertIn("Get Zhipu API Key", page)
        self.assertIn("ModelTypeList.Zhipu", page)
        self.assertIn("`${values.modelPlatform}-embeddingModelPlatform`", page)
        self.assertIn("ZHIPU = \"zhipu\"", llm_client)
        self.assertNotIn("w-[100px]", model_radio)


if __name__ == "__main__":
    unittest.main()
