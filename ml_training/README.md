# ScamCall Shield — ML training (reproducible)

This folder contains the training pipeline for the model shipped in
`../web_app/data/model/model.js`. The dataset is synthetic/anonymized, so its
metrics are development measurements and not evidence of real-world accuracy.

## Files
- `dataset.py` — 254 synthetic, anonymized bilingual samples (162 scam / 92 safe;
  152 vi / 102 en) across 7 scam types plus hard negatives (valid OTP notices,
  scam-awareness messages, harmless "urgent" notes). Contains no real PII.
- `train_export.py` — trains a `TfidfVectorizer` (uni+bigram, NFC+lowercase) with
  two `LogisticRegression` heads (scam/safe and 7-type), reports metrics via
  **stratified 5-fold cross-validation**, then refits on all data and exports
  `../web_app/data/model/model.js`, `model.json` and `parity_cases.json`.
- `parity.test.js` — verifies the in-browser JS inference matches scikit-learn
  to < 1e-6 on 14 cases.
- `pipeline.test.js` — end-to-end smoke test of the fusion pipeline.

## Reproduce
```bash
python -m pip install numpy scikit-learn
python train_export.py
node parity.test.js
node pipeline.test.js
```

Run the commands from this directory. `train_export.py` resolves outputs relative
to its own location, so it can also be launched from another working directory.
Training requires scikit-learn and NumPy; parity/pipeline checks require Node.js.
The committed parity cases contain 14 examples and are a smoke check, not a
language-stratified or campaign-grouped benchmark.

## Reported metrics (5-fold CV)
- Scam detection — Precision 0.85 · Recall 0.969 · F1 0.905 · Accuracy 0.87
- Type classification (7 classes) — Macro-F1 0.579 · Accuracy 0.598

These values are recorded in the shipped artifact by the training script; the
script computes the fold means from `dataset.py`. They are not per-language
metrics, do not include confusion matrices, and use row-stratified rather than
campaign-grouped folds. Recall is deliberately prioritized (missing a scam is
worse than a false alarm). Results on synthetic data do not establish performance
on real messages.
