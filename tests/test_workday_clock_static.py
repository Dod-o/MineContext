import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTENT_GENERATION_ROUTE = ROOT / "opencontext" / "server" / "routes" / "content_generation.py"


class WorkdayClockStaticTest(unittest.TestCase):
    def test_clock_in_and_out_routes_exist(self):
        route = CONTENT_GENERATION_ROUTE.read_text(encoding="utf-8")

        self.assertIn('class WorkdayClockRequest(BaseModel):', route)
        self.assertIn('@router.post("/api/content_generation/workday/clock_in")', route)
        self.assertIn('@router.post("/api/content_generation/workday/clock_out")', route)

    def test_clock_out_pauses_scheduler_and_generates_review(self):
        route = CONTENT_GENERATION_ROUTE.read_text(encoding="utf-8")

        self.assertIn('pause_scheduled_tasks("workday-clock-out")', route)
        self.assertIn("generate_todo_tasks(", route)
        self.assertIn("await report_generator.generate_report(start_time, end_time)", route)
        self.assertIn("end_time must be greater than start_time", route)

    def test_clock_in_resumes_scheduler(self):
        route = CONTENT_GENERATION_ROUTE.read_text(encoding="utf-8")

        self.assertIn('resume_scheduled_tasks("workday-clock-out")', route)
        self.assertIn('message="Clocked in"', route)


if __name__ == "__main__":
    unittest.main()
