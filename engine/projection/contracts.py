"""Allowlisted football inputs with provenance and chronology checks."""
from dataclasses import dataclass
from datetime import datetime
import math
import re

@dataclass(frozen=True)
class FootballInput:
    name: str
    value: float | None
    source_hash: str
    available_at: str
    status: str

    def validate(self,as_of):
        if not re.fullmatch('[0-9a-f]{64}',self.source_hash):raise ValueError('Source hash required')
        available=datetime.fromisoformat(self.available_at.replace('Z','+00:00'))
        cutoff=datetime.fromisoformat(as_of.replace('Z','+00:00'))
        if available.tzinfo is None or cutoff.tzinfo is None or available>cutoff:raise ValueError('Input not available at cutoff')
        if self.status=='MEASURED':
            if self.value is None or not math.isfinite(self.value):raise ValueError('Measured input lacks a finite value')
        elif self.value is not None:raise ValueError('Unknown input must remain null')
        return self
