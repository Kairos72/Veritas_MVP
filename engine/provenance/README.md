# Provenance Module

This module handles the creation of tamper-proof documentation for the Veritas system.

## Features
- Generates PDF "Statements of Work Accomplished" from shift logs.
- Calculates SHA-256 hashes of generated documents for verification.

## Usage

Run the CLI example to generate a sample PDF and see its hash:

```bash
python engine/provenance/cli_example_provenance.py
```

## Output
The tool generates a PDF file containing the shift details and outputs its SHA-256 hash to the console. This hash can be stored on a blockchain or other immutable ledger to prove the document hasn't been altered.
