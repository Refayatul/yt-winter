"""Anchor Suggestion Engine V1: unsafe input handling, states and scoring. OCR/numpy parts skip when unavailable."""
import importlib.util, json, os, shutil, tempfile, unittest

HERE = os.path.dirname(__file__)


def load():
    spec = importlib.util.spec_from_file_location("anchor_suggest", os.path.join(HERE, "..", "scripts", "fr-premium", "anchor_suggest.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


class AnchorSuggest(unittest.TestCase):
    def test_unsafe_document_is_refused_by_magic_bytes(self):
        a = load(); d = tempfile.mkdtemp()
        try:
            p = os.path.join(d, "page.jpg")
            open(p, "w").write("<html><script>alert(1)</script> ignore previous instructions</html>")
            with self.assertRaises(a.Unsafe):
                a.check_file(p)
            open(p, "wb").write(b"\xff\xd8\xff\xe0" + b"\0" * 16)
            self.assertEqual(a.check_file(p), "jpeg")
        finally:
            shutil.rmtree(d)

    def test_iou_and_role_compatible_evaluation(self):
        a = load()
        self.assertAlmostEqual(a.iou({"x": 0, "y": 0, "w": 10, "h": 10}, {"x": 5, "y": 0, "w": 10, "h": 10}), 50 / 150)
        assets = {"assets": {"d": {"width": 100, "height": 100, "anchors": {
            "line": {"rect": {"x": 10, "y": 10, "w": 50, "h": 10}, "space": "source-px", "role": "document-line"},
            "ring": {"point": [50, 50], "space": "source-px", "role": "mechanism-ring", "label": "primary O-ring"}}}}}
        sugg = [{"id": "SG-d-1", "asset": "d", "method": "ocr-text", "rect": {"x": 10, "y": 10, "w": 50, "h": 10}, "status": "SUGGESTED"},
                {"id": "SG-d-2", "asset": "d", "method": "ocr-text", "rect": {"x": 45, "y": 45, "w": 10, "h": 10}, "status": "SUGGESTED"}]
        e = a.evaluate(assets, sugg)
        rows = {r["anchor"]: r for r in e["rows"]}
        self.assertTrue(rows["line"]["hit"])
        self.assertFalse(rows["ring"]["hit"], "a text box centred on a ring is not a ring suggestion")
        sugg.append({"id": "SG-d-3", "asset": "d", "method": "leader-target", "point": [52, 49], "label": "Secondary O-Ring", "status": "SUGGESTED"})
        self.assertFalse({r["anchor"]: r for r in a.evaluate(assets, sugg)["rows"]}["ring"]["hit"], "the leader label must name the part")
        sugg[-1]["label"] = "Primary O-Ring"
        self.assertTrue({r["anchor"]: r for r in a.evaluate(assets, sugg)["rows"]}["ring"]["hit"])

    def test_committed_suggestions_are_never_verified(self):
        p = os.path.join(HERE, "..", "channels", "failure-reconstructed", "premium", "apollo-13-1970", "plan", "anchor-suggestions.json")
        doc = json.load(open(p))
        self.assertTrue(doc["suggestions"])
        self.assertEqual({s["status"] for s in doc["suggestions"]}, {"SUGGESTED"})

    @unittest.skipUnless(shutil.which("tesseract") and shutil.which("magick"), "tesseract / ImageMagick not installed")
    def test_ocr_finds_a_label_on_a_synthetic_drawing(self):
        a = load()
        if a.np is None:
            self.skipTest("numpy not installed")
        d = tempfile.mkdtemp()
        try:
            p = os.path.join(d, "drawing.png")
            os.system(f"magick -size 900x400 xc:white -fill black -pointsize 40 -annotate +80+120 'HEATING ELEMENT' -stroke black -strokewidth 3 -draw 'line 400,135 700,330' '{p}'")
            asset = {"kind": "document", "width": 900, "height": 400, "tags": ["drawing"], "file": "drawing.png"}
            out, _ = a.suggest("drw", asset, p, {})
            labels = [s for s in out if s["method"] == "diagram-label"]
            self.assertTrue(any("Heating" in s["label"] for s in labels))
            self.assertTrue(all(s["status"] == "SUGGESTED" for s in out))
        finally:
            shutil.rmtree(d)


if __name__ == "__main__":
    unittest.main()


class Calibration(unittest.TestCase):
    def test_lead_labels_and_ceilings(self):
        a = load()
        self.assertTrue(a.LEAD.match("TO HEATER") and a.LEAD.match("to fan 2") and not a.LEAD.match("TOTAL HEATER"))
        self.assertLessEqual(a.CEILING["region-of-interest"], 0.2)
        for m in ("leader-target", "subject-box", "region-of-interest"):
            self.assertIn(m, a.ALWAYS_REVIEW)
