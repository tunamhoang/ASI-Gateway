"""Periodic snapshot probe to verify device pipeline."""

import threading
import time

from NetSDK import SDK_Callback

from sdk_client.netsdk_client import get_client
from config import SnapshotProbeConfig


class SnapshotProbe:
    def __init__(self, cfg: SnapshotProbeConfig) -> None:
        self.cfg = cfg
        self._cb_snap = SDK_Callback.fSnapRev(self._on_snap)

    def _on_snap(self, lLoginID, pBuf, RevLen, EncodeType, CmdSerial, dwUser) -> None:  # noqa: ANN001,N802
        # TODO: handle received image buffer
        pass

    def run_loop(self, login_ids) -> None:  # noqa: ANN001
        if not self.cfg.enable:
            return

        def _loop() -> None:
            sdk = get_client().sdk
            sdk.SetSnapRevCallBack(self._cb_snap)
            while True:
                for lid in login_ids():
                    try:
                        sdk.SnapPictureEx(lid, 0, 0)
                    except Exception:
                        pass
                time.sleep(self.cfg.interval_seconds)

        threading.Thread(target=_loop, daemon=True).start()
