"""RF-COMP-09 serializes complete runtime checks; scientific code is unchanged.

Nested watchdog requests do not sample clocks/RSS or mutate checked state.
They are serviced after the active check, with every original rule retained.
No tolerance, timestamp clamping, global patch or historical entry point.
"""
import math
import time

from research_score_resource_policy import (
    ControllerEnvelope as _OriginalControllerEnvelope, RuntimeStop, finite, rss_mib)

VERSION = 'rfcomp09.clock-guard.v1'


def _clock_image(value):
    """Lossless production float image, including nonfinite values, without IO.

Non-float injected/corrupted objects retain only a type label: no arbitrary
repr/float conversion is called while preserving an original clock failure.
"""
    return {'type': type(value).__name__,
            'float_hex': float.hex(value) if type(value) is float else None}


def _runtime_check(self):
    if self.phase != 'science':
        raise RuntimeStop(self.stop_reason or 'scientific_work_outside_live_envelope')
    now = time.monotonic()
    if not math.isfinite(now) or now < self._last:
        self._clock_failure = {'reason': 'invalid_monotonic_clock',
            'sample': _clock_image(now), 'previous_last': _clock_image(self._last),
            'check_context': 'serialized_complete_runtime_check',
            'active': self._check_active, 'pending': self._check_pending}
        self._stop('invalid_monotonic_clock')
    self._last = now
    usage = rss_mib()
    if not finite(usage):
        self._stop('invalid_memory_measurement')
    self.peak_rss_mib = max(self.peak_rss_mib, usage)
    if now >= self._deadline:
        deadline = min(self._deadline, self._smoke_deadline or self._deadline)
        reason = 'registered_120_second_smoke_deadline' if deadline < self._deadline else 'registered_9000_second_deadline'
        self._stop(reason, deadline)
    if self._smoke_deadline is not None and now >= self._smoke_deadline:
        self._stop('registered_120_second_smoke_deadline', self._smoke_deadline)
    if usage > 4096:
        self._stop('registered_4096_MiB_limit')


class ControllerEnvelope(_OriginalControllerEnvelope):
    """Original complete envelope with single-owner, pending-request checking."""
    def __init__(self, started_monotonic=None):
        self._check_active = False
        self._check_pending = False
        self._clock_failure = None
        super().__init__(started_monotonic)

    def check(self):
        if self._check_active:
            self._check_pending = True
            return
        while True:
            try:
                self._check_active = True
                self._check_pending = False
                self._check_once()
            finally:
                self._check_active = False
            # Release ownership first: a signal here performs its own complete
            # check, or the pending request starts a fresh protected iteration.
            # Exceptions bypass this drain and retain their original identity.
            if not self._check_pending:
                return

    def _check_once(self):
        # Prefer the earliest actual deadline even if a long native call caused
        # delivery after both the whole smoke and evaluator-only clocks expired.
        if self.phase == 'science' and self._whole_smoke_deadline is not None:
            now = time.monotonic()
            if now >= self._whole_smoke_deadline and self._whole_smoke_deadline <= self._deadline:
                self._stop('registered_120_second_complete_smoke_deadline', self._whole_smoke_deadline)
        return _runtime_check(self)
