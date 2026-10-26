"""Neutral ffmpeg regressions; no private export, network, or model is used."""
import copy
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
TOOL_DIR = Path(os.environ.get('TELEGRAM_COACH_TOOL_DIR', Path(__file__).parent))
sys.path.insert(0, str(TOOL_DIR))
import pipeline
import visuals

FFMPEG = '/opt/homebrew/bin/ffmpeg'
FFPROBE = '/opt/homebrew/bin/ffprobe'


class VisualsRegression(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='telegram-visual-test-', dir='/private/tmp')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        self.run = self.root / 'run'
        self.manifest = self.run / 'visuals' / 'manifest.json'

    def video(self, name='video.mp4', rate='10', duration=3, audio_duration=None, offset=0, color=None):
        path = self.source / name
        source = (f'color=c={color}:size=160x90:rate={rate}:duration={duration}' if color
                  else f'testsrc2=size=160x90:rate={rate}:duration={duration}')
        args = [FFMPEG, '-y', '-v', 'error', '-f', 'lavfi', '-i', source]
        if audio_duration is not None:
            args += ['-f', 'lavfi', '-i', f'sine=frequency=440:sample_rate=48000:duration={audio_duration}']
        args += ['-c:v', 'libx264', '-bf', '0', '-pix_fmt', 'yuv420p']
        if audio_duration is not None:
            args += ['-c:a', 'aac']
        if offset:
            args += ['-output_ts_offset', str(offset)]
        subprocess.run(args + [str(path)], check=True, capture_output=True, timeout=30)
        return path

    def configure(self, paths, version='synthetic-A', ids=None):
        if ids is None:
            ids = [f'message{i + 1}' for i in range(len(paths))]
        entries = []
        for path, message_id in zip(paths, ids):
            probe = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration',
                                    '-of', 'json', str(path)], capture_output=True, text=True, timeout=30)
            duration = float(json.loads(probe.stdout)['format']['duration']) if probe.returncode == 0 else 1
            entries.append(dict(kind='video', href=path.name, sha256=pipeline.sha(path),
                                source_version=version, slot_id=message_id + ':0', message_id=message_id,
                                probe={'duration': duration}))
        pipeline.put(self.run / 'source-manifest.json', {'snapshot_path': str(self.source), 'source_version': version})
        pipeline.put_rows(self.run / 'media.jsonl', entries)
        return entries

    def data(self):
        return json.loads(self.manifest.read_text())

    def asset(self, path):
        return self.data()['assets'][pipeline.sha(path)]

    def render_ok(self):
        result = visuals.render(self.run)
        self.assertEqual(result['errors'], 0)
        return result

    def test_one_fps_covers_first_last_and_one_second_gaps(self):
        path = self.video(rate='1')
        self.configure([path])
        self.render_ok()
        record = self.asset(path)
        self.assertEqual([f['seconds'] for f in record['selected_frames']], [0, 1, 2])
        self.assertAlmostEqual(record['decoded_intervals'][0][1], 3)
        self.assertLessEqual(record['max_gap_seconds'], 1.0001)
        self.assertIsNone(record['coverage_limit'])

    def test_two_point_five_fps_does_not_skip_to_one_point_two_seconds(self):
        path = self.video(rate='5/2', duration=5)
        self.configure([path])
        self.render_ok()
        record = self.asset(path)
        pts = [f['seconds'] for f in record['selected_frames']]
        self.assertEqual(pts, sorted(pts))
        self.assertAlmostEqual(pts[0], 0)
        self.assertAlmostEqual(pts[-1], 4.8)
        self.assertLessEqual(record['max_gap_seconds'], 1.0001)

    def test_nonzero_pts_preserves_origin_and_normalizes_last_frame(self):
        path = self.video(duration=2, offset=5)
        self.configure([path])
        self.render_ok()
        record = self.asset(path)
        self.assertAlmostEqual(record['normalization_offset'], 5)
        self.assertAlmostEqual(record['selected_frames'][0]['original_pts'], 5)
        self.assertAlmostEqual(record['selected_frames'][0]['seconds'], 0)
        self.assertAlmostEqual(record['selected_frames'][-1]['original_pts'], 6.9)
        self.assertAlmostEqual(record['selected_frames'][-1]['seconds'], 1.9)
        self.assertAlmostEqual(record['decoded_intervals'][0][1], 2)

    def test_longer_audio_does_not_extend_video_coverage(self):
        path = self.video(duration=3, audio_duration=5)
        self.configure([path])
        self.render_ok()
        record = self.asset(path)
        self.assertAlmostEqual(record['decoded_intervals'][0][1], 3)
        self.assertAlmostEqual(record['selected_frames'][-1]['seconds'], 2.9)

    def test_longer_video_keeps_its_actual_last_frame(self):
        path = self.video(duration=5, audio_duration=3)
        self.configure([path])
        self.render_ok()
        record = self.asset(path)
        self.assertAlmostEqual(record['decoded_intervals'][0][1], 5)
        self.assertAlmostEqual(record['selected_frames'][-1]['seconds'], 4.9)

    def test_sparse_source_is_reported_as_coverage_limit(self):
        path = self.video(rate='1/2', duration=6)
        self.configure([path])
        result = self.render_ok()
        record = self.asset(path)
        self.assertEqual(result['coverage_limits'], 1)
        self.assertEqual(record['coverage_limit'], 'source_frame_gap')
        self.assertGreater(record['max_gap_seconds'], 1)
        self.assertEqual(record['mode'], 'sampled')
        self.assertEqual(record['state'], 'pending_review')

    def test_missing_selected_frame_invalidates_cache(self):
        path = self.video(duration=1)
        self.configure([path])
        self.render_ok()
        missing = Path(self.asset(path)['selected_frames'][0]['path'])
        missing.unlink()
        self.render_ok()
        self.assertTrue(missing.is_file())
        self.assertTrue(visuals.valid_cache(self.asset(path)))

    def test_cache_updates_version_and_deduplicates_current_slots(self):
        path = self.video(duration=1)
        self.configure([path, path], ids=['message1', 'message2'])
        self.render_ok()
        self.render_ok()
        self.assertEqual(self.asset(path)['slot_ids'], ['message1:0', 'message2:0'])
        self.configure([path], version='synthetic-B', ids=['message3'])
        self.render_ok()
        self.assertEqual(self.asset(path)['source_version'], 'synthetic-B')
        self.assertEqual(self.asset(path)['slot_ids'], ['message3:0'])

    def test_old_revision_is_rebuilt_despite_valid_sheet_bytes(self):
        path = self.video(duration=1)
        self.configure([path])
        self.render_ok()
        prior = self.data()
        record = prior['assets'][pipeline.sha(path)]
        record['render_revision'] = 'synthetic-old-revision'
        record['selected_frames'][0]['seconds'] = 999
        record['reviewed_frames'] = [0]
        pipeline.put(self.manifest, prior)
        self.render_ok()
        record = self.asset(path)
        self.assertEqual(record['render_revision'], visuals.REVISION)
        self.assertEqual(record['selected_frames'][0]['seconds'], 0)
        self.assertNotIn(0, record['reviewed_frames'])
        self.assertTrue((self.run / 'visuals' / 'manifest-history.json').is_file())

    def test_checkpoint_preserves_unvisited_asset_review(self):
        a = self.video('a.mp4', duration=1, color='red')
        b = self.video('b.mp4', duration=1, color='blue')
        self.configure([a, b])
        self.render_ok()
        prior = self.data()
        prior['assets'][pipeline.sha(a)]['state'] = 'error'
        prior['assets'][pipeline.sha(b)]['reviewed_frames'] = [0]
        pipeline.put(self.manifest, prior)
        real_put = visuals.put

        def fail_after_checkpoint(path, value):
            real_put(path, value)
            if path == self.manifest:
                raise OSError('synthetic interruption after first asset')

        with patch.object(visuals, 'put', side_effect=fail_after_checkpoint):
            with self.assertRaises(OSError):
                visuals.render(self.run)
        self.assertEqual(self.asset(b)['reviewed_frames'], [0])
        self.render_ok()
        self.assertEqual(self.asset(b)['reviewed_frames'], [0])

    def test_review_transfer_requires_exact_sha_and_exact_normalized_pts(self):
        path = self.video(rate='1', duration=3)
        self.configure([path])
        self.render_ok()
        prior = self.data()
        record = prior['assets'][pipeline.sha(path)]
        self.assertEqual(len(record['selected_frames']), 3)
        record['render_revision'] = 'synthetic-old-revision'
        record['reviewed_frames'] = [0, 1, 2]
        record['selected_frames'][0]['seconds'] += 0.00001
        record['selected_frames'][1]['sha256'] = '0' * 64
        pipeline.put(self.manifest, prior)
        self.render_ok()
        self.assertEqual(self.asset(path)['reviewed_frames'], [2])

    def test_same_revision_rerender_does_not_claim_nonexistent_history(self):
        path = self.video(duration=1)
        self.configure([path])
        self.render_ok()
        prior = self.data()
        record = prior['assets'][pipeline.sha(path)]
        record['reviewed_frames'] = [0]
        pipeline.put(self.manifest, prior)
        Path(record['selected_frames'][0]['path']).unlink()
        self.render_ok()
        current = self.asset(path)
        self.assertEqual(current['reviewed_frames'], [0])
        if 'manifest-history.json' in current.get('review_transfer', ''):
            self.assertTrue((self.run / 'visuals' / 'manifest-history.json').is_file())

    def test_review_history_preserves_original_source_bindings(self):
        path = self.video(duration=1)
        self.configure([path], version='synthetic-A', ids=['message1'])
        self.render_ok()
        prior = self.data()
        record = prior['assets'][pipeline.sha(path)]
        record['reviewed_frames'] = [0]
        record['review_receipt'] = {'reviewer': 'synthetic', 'evidence': 'neutral test only'}
        original = copy.deepcopy(record)
        pipeline.put(self.manifest, prior)
        self.configure([path], version='synthetic-B', ids=['message3'])
        Path(record['selected_frames'][0]['path']).unlink()
        self.render_ok()
        current = self.asset(path)
        self.assertEqual(current['source_version'], 'synthetic-B')
        self.assertEqual(current['slot_ids'], ['message3:0'])
        transfer = current['review_transfer']
        history = Path(transfer['source'])
        self.assertEqual(pipeline.sha(history), transfer['sha256'])
        self.assertEqual(json.loads(history.read_text()), original)

    def test_tampered_history_cannot_reuse_reviewed_status(self):
        path = self.video(duration=1)
        self.configure([path])
        self.render_ok()
        prior = self.data()
        record = prior['assets'][pipeline.sha(path)]
        record['reviewed_frames'] = list(range(len(record['selected_frames'])))
        pipeline.put(self.manifest, prior)
        Path(record['selected_frames'][0]['path']).unlink()
        self.render_ok()
        current = self.asset(path)
        history = Path(current['review_transfer']['source'])
        self.assertEqual(pipeline.sha(history), current['review_transfer']['sha256'])
        history.write_text('{"tampered": "neutral test only"}\n')
        visuals.render(self.run)
        current = self.asset(path)
        self.assertNotEqual(current['state'], 'visual_reviewed_sampled')
        if current['state'] != 'error':
            self.assertEqual(current['reviewed_frames'], [])

    def test_corrupt_asset_is_durable_error_and_does_not_abort_next(self):
        bad = self.source / 'bad.mp4'
        bad.write_bytes(b'neutral invalid media fixture')
        good = self.video('good.mp4', duration=1)
        self.configure([bad, good])
        result = visuals.render(self.run)
        self.assertEqual(result['errors'], 1)
        self.assertEqual(self.asset(bad)['state'], 'error')
        self.assertGreater(len(self.asset(good)['selected_frames']), 0)

    def test_timestamp_parser_accepts_complete_scientific_notation(self):
        text = 'n: 0 pts: 1 pts_time:1.23333e-05\nn: 1 pts: 2 pts_time:3.12333e+01'
        parsed = [float(x) for x in re.findall(r'\bn:\s*\d+.*?\bpts_time:(' + visuals.NUMBER + r')', text)]
        self.assertEqual(parsed, [0.0000123333, 31.2333])


if __name__ == '__main__':
    unittest.main(verbosity=2)
