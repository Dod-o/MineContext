import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREEN_MONITOR_TASK = (
    ROOT / "frontend" / "src" / "main" / "background" / "task" / "screen-monitor-task.ts"
)
SCREEN_MONITOR_PAGE = (
    ROOT
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "screen-monitor"
    / "screen-monitor.tsx"
)
SETTINGS_MODAL = (
    ROOT
    / "frontend"
    / "src"
    / "renderer"
    / "src"
    / "pages"
    / "screen-monitor"
    / "components"
    / "settings-modal.tsx"
)
USE_SETTING = ROOT / "frontend" / "src" / "renderer" / "src" / "hooks" / "use-setting.ts"
SHARED_SCREEN_SETTINGS = ROOT / "frontend" / "packages" / "shared" / "screen-settings.ts"


class ExcludedAppBlacklistStaticTest(unittest.TestCase):
    def test_excluded_application_patterns_are_saved_and_filter_window_sources(self):
        task = SCREEN_MONITOR_TASK.read_text(encoding="utf-8")
        page = SCREEN_MONITOR_PAGE.read_text(encoding="utf-8")
        modal = SETTINGS_MODAL.read_text(encoding="utf-8")
        use_setting = USE_SETTING.read_text(encoding="utf-8")
        shared_settings = SHARED_SCREEN_SETTINGS.read_text(encoding="utf-8")

        self.assertIn("excludedAppPatterns: string[]", shared_settings)
        self.assertIn("excludedAppPatterns: []", shared_settings)
        self.assertIn("settings.excludedAppPatterns", shared_settings)
        self.assertIn(".map((pattern) => (typeof pattern === 'string' ? pattern.trim() : ''))", shared_settings)
        self.assertIn("setExcludedAppPatterns", use_setting)
        self.assertIn("const [tempExcludedAppPatterns, setTempExcludedAppPatterns]", page)
        self.assertIn("excludedAppPatterns: tempExcludedAppPatterns", page)
        self.assertIn("setExcludedAppPatterns(nextSettings.excludedAppPatterns)", page)
        self.assertIn("function parseExcludedAppPatterns(value: string): string[]", modal)
        self.assertIn(".split(/[\\n,]/)", modal)
        self.assertIn('label="Excluded applications"', modal)
        self.assertIn("onSetTempExcludedAppPatterns(parseExcludedAppPatterns(value))", modal)
        self.assertIn("private isSourceExcluded(source: CaptureSource): boolean", task)
        self.assertIn("if (source.type !== 'window')", task)
        self.assertIn("sourceText.includes(pattern)", task)
        self.assertIn("private filterExcludedSources(sources: CaptureSource[]): CaptureSource[]", task)
        self.assertIn("!this.isSourceExcluded(source)", task)
        self.assertIn("this.filterExcludedSources(visibleSources || [])", task)


if __name__ == "__main__":
    unittest.main()
