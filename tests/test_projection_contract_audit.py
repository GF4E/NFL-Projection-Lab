"""Independent audit checks, not another implementation of production scoring."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

PATH=Path(__file__).resolve().parents[1]/'work/engine-rebuild/audit_forecast_contract.py'
spec=importlib.util.spec_from_file_location('contract_audit',PATH)
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)


def shape(counts):
    body={'n':sum(counts.values()),'counts':{str(k):v for k,v in counts.items()}}
    return {**body,'sha256':audit.digest(audit.canonical(body))}


class ContractAuditTest(unittest.TestCase):
    def test_reference_corruption_stops(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);path=root/'data.json';path.write_text('[1]')
            ref={'path':'data.json','sha256':audit.digest(path.read_bytes())}
            self.assertEqual(audit.checked(root,ref),[1])
            path.write_text('[2]')
            with self.assertRaises(ValueError):audit.checked(root,ref)

    def test_half_away_from_zero(self):
        self.assertEqual([audit.rounded(x) for x in (-1.5,-.5,.5,1.5)],[-2,-1,1,2])

    def test_negative_support_is_reported_not_clamped(self):
        self.assertEqual(audit.masses(shape({-3:1,0:3}),1),{-2:.25,1:.75})

    def test_corrupt_counts_and_hash_stop(self):
        value=shape({0:1,1:1});value['counts']['1']=2
        with self.assertRaises(ValueError):audit.masses(value,0)
        value=shape({0:-1,1:2})
        with self.assertRaises(ValueError):audit.masses(value,0)

    def test_quantile_uses_left_inverse_at_exact_mass(self):
        mass={0:.25,1:.5,3:.25}
        self.assertEqual(audit.quantile(mass,.25),0)
        self.assertEqual(audit.quantile(mass,.75),1)

    def test_positive_mean_does_not_require_majority_win(self):
        mass={-1:.7,4:.3}
        self.assertGreater(sum(x*p for x,p in mass.items()),0)
        self.assertLess(sum(p for x,p in mass.items() if x>0),.5)

    def test_metrics_are_paired_and_order_invariant(self):
        rows=[{'home':10.,'away':20.,'actual_home':12.,'actual_away':18.},
              {'home':30.,'away':40.,'actual_home':33.,'actual_away':41.}]
        result=audit.metrics(rows)
        self.assertEqual(result,audit.metrics(list(reversed(rows))))
        self.assertEqual(result['games'],2)
        self.assertEqual(result['team_observations'],4)
        self.assertEqual(result['mae'],2)
        self.assertEqual(result['bias_projected_minus_actual'],-1)


if __name__=='__main__':unittest.main()
