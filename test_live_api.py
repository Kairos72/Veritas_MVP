import requests
import json
import sys

def test_live():
    url = "http://localhost:5000/simulate"
    payload = {
        "segments": [{"segment_id": "live-test", "length_m": 20, "width_m": 5}],
        "days": 3,
        "seed": 99
    }
    
    print(f"Sending request to {url}...")
    try:
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            print("\nSUCCESS! Server responded:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"\nFAILED: Server returned {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"\nERROR: Could not connect to server. Is it running? {e}")

if __name__ == "__main__":
    # Ensure requests is installed
    try:
        import requests
    except ImportError:
        print("Installing requests...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
        import requests
        
    test_live()
