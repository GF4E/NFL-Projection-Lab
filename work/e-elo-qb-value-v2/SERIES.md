Non-authoritative experimental series. The sole current control is work/e-elo-hfa-release/deployed-oof-66a3a60c0f99e6f25189d88baadd0c72821ca234d20586d5aa6bc7410a4f177f.json.

# QB VALUE series registry

Generated2026-09-20UTC by scripts/elo_qb_value_evaluate.py after hashed registration. Code and inputs pinned in registration.json; scales and weekly ridge training hashes are saved. oof.json contains all six explicitly named paths; no candidate was activated. Pooled MAE, bias, slope and SD by component:

{
  "c_original": {
    "games": 2639,
    "team_mae": 7.574348007893794,
    "team_bias": 0.18887493252614246,
    "slope": 1.009111494127862,
    "projected_sd": 2.942963190128389,
    "margin_mae": 10.240377393468139,
    "total_mae": 10.86481298128011
  },
  "deployed_hfa": {
    "games": 2639,
    "team_mae": 7.575628833271496,
    "team_bias": 0.1888626093556898,
    "slope": 1.0111093664106956,
    "projected_sd": 2.934554179081857,
    "margin_mae": 10.242308656842017,
    "total_mae": 10.86462544014432
  },
  "a_qb": {
    "games": 2639,
    "team_mae": 7.568093673838847,
    "team_bias": 0.19027075098979185,
    "slope": 1.0055224398793126,
    "projected_sd": 2.972973043714096,
    "margin_mae": 10.237168837244461,
    "total_mae": 10.858242213003567
  },
  "b_qb_hfa": {
    "games": 2639,
    "team_mae": 7.568582702221145,
    "team_bias": 0.18924037177052258,
    "slope": 1.0073417713431958,
    "projected_sd": 2.9669830826953594,
    "margin_mae": 10.237712489741686,
    "total_mae": 10.857930468957333
  },
  "oracle_a": {
    "games": 2639,
    "team_mae": 7.558619893751612,
    "team_bias": 0.18207512884771745,
    "slope": 1.0021312580282347,
    "projected_sd": 3.019121884715611,
    "margin_mae": 10.215538358593903,
    "total_mae": 10.856418327191014
  },
  "secondary_combined": {
    "games": 2639,
    "team_mae": 7.567657472043124,
    "team_bias": 0.19111599682362726,
    "slope": 1.003401048876068,
    "projected_sd": 2.9744366709312975,
    "margin_mae": 10.233278095388535,
    "total_mae": 10.860812035379073
  }
}

The original c and released HFA copies reproduce their respective immutable series within1e-10; they do not replace the single authoritative registry entry. Oracle is unavailable in production; CPOE is partial secondary.

Confidence: near-total — listed metrics are arithmetic on verified rows. Move down to high if independent row-hash or arithmetic checks fail.
