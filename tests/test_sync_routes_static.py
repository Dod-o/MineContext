import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SYNC_ROUTE = ROOT / "opencontext" / "server" / "routes" / "sync.py"
API_ROUTE = ROOT / "opencontext" / "server" / "api.py"


class SyncRoutesStaticTest(unittest.TestCase):
    def test_sync_routes_are_registered(self):
        api = API_ROUTE.read_text(encoding="utf-8")

        self.assertIn("sync,", api)
        self.assertIn("router.include_router(sync.router)", api)

    def test_sync_export_import_cover_todos_and_summary_reports(self):
        route = SYNC_ROUTE.read_text(encoding="utf-8")

        self.assertIn('@router.get("/api/sync/export")', route)
        self.assertIn('@router.post("/api/sync/import")', route)
        self.assertIn("storage.get_todos", route)
        self.assertIn("storage.insert_todo", route)
        self.assertIn("VaultType.DAILY_REPORT.value", route)
        self.assertIn("VaultType.WEEKLY_REPORT.value", route)
        self.assertIn("storage.insert_vaults", route)
        self.assertIn("storage.update_vault", route)

    def test_sync_import_deduplicates_by_stable_keys(self):
        route = SYNC_ROUTE.read_text(encoding="utf-8")

        self.assertIn("existing_todo_keys", route)
        self.assertIn("existing_vaults", route)
        self.assertIn("skipped_todos", route)
        self.assertIn("skipped_vaults", route)


if __name__ == "__main__":
    unittest.main()
