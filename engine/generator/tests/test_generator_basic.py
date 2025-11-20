import unittest
import sys
import os

# Add project root to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from engine.generator.generator import simulate

class TestGeneratorBasic(unittest.TestCase):
    def test_simple_completion(self):
        # Scenario: Segment length 9m, block length 4.5m -> total 2.0 blocks.
        segments = [{"segment_id": "test-seg-1", "length_m": 9.0, "width_m": 5.0}]
        block_length = 4.5
        
        # Run for enough days to ensure completion
        # With 8 crew, ~0.8 blocks/day, 2 blocks should take ~3-4 days.
        logs = simulate(segments, days=10, seed=42, block_length_m=block_length)
        
        # Filter logs for this segment
        seg_logs = [l for l in logs if l['segment_id'] == "test-seg-1"]
        
        self.assertTrue(len(seg_logs) > 0, "Should have generated logs")
        
        last_log = seg_logs[-1]
        
        # Check final state
        self.assertAlmostEqual(last_log['cumulative_blocks'], 2.0, places=4, 
                               msg="Cumulative blocks should equal total blocks (2.0)")
        self.assertAlmostEqual(last_log['remaining_blocks'], 0.0, places=4,
                               msg="Remaining blocks should be 0")
        
        # Check that we didn't exceed total
        for log in seg_logs:
            self.assertLessEqual(log['cumulative_blocks'], 2.0001, 
                                 "Should never exceed total blocks")

if __name__ == '__main__':
    unittest.main()
