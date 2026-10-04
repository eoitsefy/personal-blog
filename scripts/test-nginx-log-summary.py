import importlib.util
import json
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location("summary", Path(__file__).with_name("summarize-nginx-errors.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SummaryTests(unittest.TestCase):
    def test_untrusted_values_are_never_returned(self):
        canary = "DO_NOT_EMIT_credential_and_personal_data"
        result = module.summarize([
            f'2026/10/03 10:10:10 [error] upstream timed out, upstream: "https://host/?jscode={canary}"',
            f'2026/10/03 10:10:11 [error] Permission denied: "/uploads/{canary}"',
            f'2026/10/03 10:10:12 [warn] client headers: Authorization: Bearer {canary}',
            f'bad line and encoded key %6a%73%63%6f%64%65={canary}\n',
        ])
        encoded = json.dumps(result)
        self.assertNotIn(canary, encoded)
        self.assertNotIn("https", encoded)
        self.assertEqual(result["records"], 4)
        self.assertEqual(result["first_time"], "2026/10/03 10:10:10")
        self.assertEqual(result["last_time"], "2026/10/03 10:10:12")
        self.assertIn({"level": "error", "category": "upstream_timeout", "count": 1}, result["counts"])

    def test_empty_and_multiline(self):
        self.assertEqual(module.summarize([])["records"], 0)
        result = module.summarize(["untrusted\n", "secret on next line\n"])
        self.assertEqual(result["counts"], [{"level": "unparsed", "category": "other", "count": 2}])


if __name__ == "__main__":
    unittest.main()
