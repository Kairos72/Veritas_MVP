import unittest
import sys
import os
import json
import shutil
from flask.testing import FlaskClient

# Add project root to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from engine.api.app import app

class TestApiBasic(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        
        # Clean up output dir for tests
        self.test_output_dir = os.path.join(os.path.dirname(__file__), '..', 'output')
        if os.path.exists(self.test_output_dir):
            shutil.rmtree(self.test_output_dir)

    def test_simulate_endpoint(self):
        payload = {
            "segments": [{"segment_id": "test-seg", "length_m": 50, "width_m": 7}],
            "days": 5,
            "seed": 123
        }
        
        response = self.app.post('/simulate', 
                                 data=json.dumps(payload),
                                 content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        self.assertIn("logs", data)
        self.assertIn("summary", data)
        self.assertTrue(len(data["logs"]) > 0)
        self.assertEqual(data["logs"][0]["segment_id"], "test-seg")

    def test_provenance_endpoint(self):
        # First get some logs
        sim_payload = {
            "segments": [{"segment_id": "prov-test", "length_m": 10, "width_m": 5}],
            "days": 2
        }
        sim_resp = self.app.post('/simulate', 
                                 data=json.dumps(sim_payload),
                                 content_type='application/json')
        logs = json.loads(sim_resp.data)["logs"]
        
        # Now generate provenance
        prov_payload = {
            "shift_logs": logs,
            "output_name": "test_prov.pdf"
        }
        
        response = self.app.post('/provenance',
                                 data=json.dumps(prov_payload),
                                 content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        self.assertIn("pdf_path", data)
        self.assertIn("sha256", data)
        self.assertEqual(len(data["sha256"]), 64)
        self.assertTrue(data["pdf_path"].endswith("test_prov.pdf"))

if __name__ == '__main__':
    unittest.main()
