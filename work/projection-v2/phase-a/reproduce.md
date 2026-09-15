# Reproduction

Use the pinned Python environment, one BLAS/OMP thread, and the frozen inputs in this directory.

```
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/forecast_system_phase_a.py
OPENBLAS_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/forecast_system_why_diagnostic.py
OPENBLAS_NUM_THREADS=1 /opt/anaconda3/bin/python3.12 -B scripts/forecast_system_report.py
```

The first command fits and evaluates the registered procedure; the second explicitly fits the requested 2026 counterfactual diagnostic using only 2023–2025 OOF forecasts; the third reads frozen outputs only. `scripts/forecast_system_phase_a.py --report` also only reads the cached gate.

To rebuild feature inputs from original pinned local sources, run `scripts/forecast_system_prepare.py --source-root <original-checkout>` with the same thread limits. The source checkout must contain the hashed raw sources listed in features-ref.json. Archived raw sources are not downloaded or overwritten by this workflow. Historical weather is not fitted here. Expanded 2013–2015 calibration-only history was authorized by the user.

Full criteria and intended phase mappings: ../PLAN.md. Phase B remains closed after this failed gate.
