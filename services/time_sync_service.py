"""Periodic device time synchronisation."""

import threading
import time

from NetSDK import SDK_Enum, SDK_Struct

from sdk_client.netsdk_client import get_client
from config import TimeSyncConfig


class TimeSyncService:
    def __init__(self, cfg: TimeSyncConfig) -> None:
        self.cfg = cfg

    def sync_once(self, login_id: int, epoch_seconds: int) -> None:
        sdk = get_client().sdk
        time_cfg_in = SDK_Struct.NETDEV_TIMECFG()  # assumed struct
        ok = sdk.GetDevConfig(
            login_id, SDK_Enum.EM_DEV_CFG_TYPE.TIMECFG, 0, time_cfg_in, 5000
        )
        # TODO: compare device time and decide whether to update
        new_cfg = SDK_Struct.NETDEV_TIMECFG()
        # TODO: fill timezone and epoch
        sdk.SetDevConfig(
            login_id, SDK_Enum.EM_DEV_CFG_TYPE.TIMECFG, 0, new_cfg, 5000
        )

    def run_loop(self, login_ids) -> None:  # noqa: ANN001
        if not self.cfg.enable:
            return

        def _loop() -> None:
            while True:
                now = int(time.time())
                for lid in login_ids():
                    try:
                        self.sync_once(lid, now)
                    except Exception:
                        pass
                time.sleep(self.cfg.interval_seconds)

        threading.Thread(target=_loop, daemon=True).start()
