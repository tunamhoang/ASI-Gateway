"""Basic health monitoring helpers."""

import time

from sdk_client.netsdk_client import get_client
from config import RebootPolicy


class HealthService:
    def __init__(self, policy: RebootPolicy) -> None:
        self.policy = policy
        self._last_reboot_epoch: dict[int, int] = {}

    def mark_offline(self, login_id: int) -> None:
        # TODO: update offline metric/state
        pass

    def mark_online(self, login_id: int) -> None:
        # TODO: re-subscribe alarm/IVS as needed
        pass

    def try_reboot(self, login_id: int) -> bool:
        if not self.policy.allow_remote_reboot:
            return False
        now = int(time.time())
        last = self._last_reboot_epoch.get(login_id, 0)
        if now - last < self.policy.min_interval_seconds:
            return False
        ok = get_client().sdk.RebootDev(login_id)
        if ok:
            self._last_reboot_epoch[login_id] = now
        return ok
