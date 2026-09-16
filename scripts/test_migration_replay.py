"""Repeated deployment must preserve saved edits and append history once."""
import json, sqlite3, unittest
from pathlib import Path

class MigrationReplay(unittest.TestCase):
 def test_journal_replay_preserves_data_and_single_triggers(self):
  db=sqlite3.connect(':memory:')
  journal=json.loads(Path('drizzle/meta/_journal.json').read_text())['entries']
  scripts=[(Path('drizzle')/(e['tag']+'.sql')).read_text() for e in journal]
  for sql in scripts: db.executescript(sql)
  db.execute("INSERT INTO engine_our_notes VALUES ('sentinel','saved note',123)")
  db.execute("INSERT INTO engine_projection_entries VALUES ('sentinel',0,'original edit')")
  # Previously applied migrations 0-3 remain recorded; retry pending 4-9.
  for sql in scripts[4:]: db.executescript(sql)
  self.assertEqual(db.execute('SELECT payload FROM engine_our_notes').fetchall(), [('saved note',)])
  self.assertEqual(db.execute('SELECT payload FROM engine_projection_entries').fetchall(), [('original edit',)])
  self.assertEqual(db.execute('SELECT payload FROM engine_projection_edit_history').fetchall(), [('original edit',)])
  db.execute("UPDATE engine_projection_entries SET payload='updated edit'")
  self.assertEqual(db.execute('SELECT payload FROM engine_projection_edit_history ORDER BY id').fetchall(), [('original edit',),('updated edit',)])
if __name__=='__main__': unittest.main()
