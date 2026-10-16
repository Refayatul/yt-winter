"""Creative QA (Phase 0) core measurements on synthetic frames. Skipped where numpy is unavailable."""
import importlib.util, os, unittest
try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

HERE = os.path.dirname(__file__)


def load():
    spec = importlib.util.spec_from_file_location("creative_qa", os.path.join(HERE, "..", "scripts", "fr-premium", "creative_qa.py"))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


@unittest.skipIf(np is None, "numpy not installed")
class CreativeQA(unittest.TestCase):
    def test_camera_move_is_not_subject_motion(self):
        q = load(); rng = np.random.default_rng(1)
        img = np.kron(rng.uniform(0, 255, (40, 70)), np.ones((4, 4))).astype(np.float32)[:127, :135]
        moved = np.roll(q.zoom(img, 1.012), (1, 2), (0, 1))
        res, s, dx, dy, corr = q.fit(img, moved)
        self.assertLess(res, 0.25); self.assertAlmostEqual(s, 1.012, delta=0.004); self.assertGreater(corr, 0.9)
        changed = moved.copy(); changed[40:80, 40:90] = 255 - changed[40:80, 40:90]
        self.assertGreater(q.fit(img, changed)[0], 0.25)

    def test_empty_share_counts_bare_ground_only(self):
        q = load()
        self.assertGreater(q.empty_share(np.full((480, 270), 15, np.float32)), 0.99)
        rng = np.random.default_rng(2)
        self.assertLess(q.empty_share(rng.uniform(60, 200, (480, 270)).astype(np.float32)), 0.01)


if __name__ == "__main__":
    unittest.main()
