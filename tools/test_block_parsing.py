#!/usr/bin/env python3
"""
Test script for block parsing logic
Verifies that the regex pattern correctly extracts block quantities
"""

import re

def test_block_parsing():
    """Test the block parsing regex pattern"""

    test_cases = [
        ("5 blocks", 5.0),
        ("0.75 blocks", 0.75),
        ("2.5 blocks", 2.5),
        ("1 block", 1.0),
        ("10 m3", None),
        ("15 lm", None),
        ("completed 3.5 blocks today", 3.5),
        ("poured 1.0 blocks of concrete", 1.0),
        ("no blocks mentioned", None),
        ("", None),
        ("0 blocks", 0.0)
    ]

    pattern = r"(\d+\.?\d*)\s*blocks?"

    print("Testing Block Parsing Logic")
    print("=" * 40)

    all_passed = True

    for quantity, expected in test_cases:
        match = re.search(pattern, quantity, re.IGNORECASE)
        result = float(match.group(1)) if match else None

        passed = (result == expected)
        all_passed = all_passed and passed

        status = "PASS" if passed else "FAIL"
        print(f"{status} '{quantity}' -> {result} (expected: {expected})")

    print("=" * 40)
    if all_passed:
        print("All tests passed!")
    else:
        print("Some tests failed!")

    return all_passed

if __name__ == '__main__':
    test_block_parsing()