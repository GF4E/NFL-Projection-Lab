import copy
import unittest
from verify_job_journal import verify,START,SUCCESS

class JournalTests(unittest.TestCase):
    def setUp(self):
        self.rows=[dict(UNIT='job.service',INVOCATION_ID='exact',_BOOT_ID='boot',__REALTIME_TIMESTAMP=str(t),MESSAGE_ID=k,MESSAGE='ok') for t,k in [(1000000,START),(3000000,SUCCESS)]]
    def test_exact_success_and_elapsed(self):self.assertEqual(verify(self.rows,'job.service','exact')['elapsed_seconds'],2)
    def test_another_invocation_cannot_prove_success(self):
        self.rows[1]['INVOCATION_ID']='other'
        with self.assertRaises(ValueError):verify(self.rows,'job.service','exact')
    def test_unloaded_default_or_missing_records_cannot_pass(self):
        for rows in ([],self.rows[:1],[dict(ActiveState='inactive',Result='success',ExecMainStatus='0')]):
            with self.assertRaises(ValueError):verify(rows,'job.service','exact')
    def test_failure_record_refuses_success(self):
        self.rows.append(dict(self.rows[-1],MESSAGE_ID='failure',MESSAGE='unit failed',__REALTIME_TIMESTAMP='4000000'))
        with self.assertRaises(ValueError):verify(self.rows,'job.service','exact')
    def test_misordered_or_cross_boot_records_refused(self):
        bad=copy.deepcopy(self.rows);bad[1]['__REALTIME_TIMESTAMP']='1'
        with self.assertRaises(ValueError):verify(bad,'job.service','exact')
        self.rows[1]['_BOOT_ID']='other'
        with self.assertRaises(ValueError):verify(self.rows,'job.service','exact')

if __name__=='__main__':unittest.main()
