import unittest
import sys
import os
import shutil

# Add project root to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from engine.provenance.provenance import create_provenance_pdf, hash_file

class TestProvenanceBasic(unittest.TestCase):
    def setUp(self):
        self.test_dir = os.path.join(os.path.dirname(__file__), 'test_output')
        os.makedirs(self.test_dir, exist_ok=True)
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
            
    def test_pdf_creation_and_hashing(self):
        logs = [{
            "date": "2025-11-10",
            "segment_id": "test-seg",
            "shift_output_blocks": 1.0,
            "cumulative_blocks": 5.0,
            "remaining_blocks": 10.0,
            "crew_size": 5,
            "weather": "clear"
        }]
        
        output_path = os.path.join(self.test_dir, 'test.pdf')
        
        # 1. Test PDF creation
        create_provenance_pdf(logs, output_path)
        self.assertTrue(os.path.exists(output_path), "PDF file should exist")
        self.assertGreater(os.path.getsize(output_path), 0, "PDF file should not be empty")
        
        # 2. Test Hashing
        hash1 = hash_file(output_path)
        self.assertEqual(len(hash1), 64, "SHA-256 hash should be 64 characters long")
        
        # 3. Test Hash Change on Content Change
        # Create a second PDF with different content
        logs[0]['shift_output_blocks'] = 2.0
        output_path_2 = os.path.join(self.test_dir, 'test2.pdf')
        create_provenance_pdf(logs, output_path_2)
        
        hash2 = hash_file(output_path_2)
        self.assertNotEqual(hash1, hash2, "Different content should produce different hash")
        
        # Verify hash stability (same file, same hash)
        hash1_again = hash_file(output_path)
        self.assertEqual(hash1, hash1_again, "Hash should be stable for same file")

if __name__ == '__main__':
    unittest.main()
