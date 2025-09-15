"""Alarm subscription service."""

import queue
import threading
from typing import Callable, Dict

from NetSDK import SDK_Callback

from sdk_client.netsdk_client import get_client


class AlarmSubscriber:
    """Manage alarm callbacks and queue for processing."""

    def __init__(self) -> None:
        self._alarm_queue: "queue.Queue[dict]" = queue.Queue()
        self._cb_alarm = SDK_Callback.fMessCallBackEx1(self._on_alarm_msg)
        self._listening: Dict[int, bool] = {}

    # --- Listen management ---------------------------------------------
    def start_listen(self, login_id: int) -> None:
        sdk = get_client().sdk
        sdk.SetDVRMessCallBackEx1(self._cb_alarm)
        ok = sdk.StartListenEx(login_id)
        if not ok:
            raise RuntimeError("StartListenEx failed")
        self._listening[login_id] = True

    def stop_listen(self, login_id: int) -> None:
        sdk = get_client().sdk
        sdk.StopListen(login_id)
        self._listening.pop(login_id, None)

    # --- Callbacks -----------------------------------------------------
    def _on_alarm_msg(
        self,
        lCommand,
        lLoginID,
        pBuf,
        dwBufLen,
        pchDVRIP,
        nDVRPort,
        bAlarmAckFlag,
        nEventID,
        dwUser,
    ) -> None:  # noqa: ANN001,N802
        event = {
            "login_id": lLoginID,
            "cmd": lCommand,
            "ip": pchDVRIP,
            "len": dwBufLen,
            "event_id": nEventID,
        }
        self._alarm_queue.put(event)

    # --- Consumer ------------------------------------------------------
    def run_consumer(self, push_to_cms: Callable[[dict], None]) -> None:
        def _worker() -> None:
            while True:
                evt = self._alarm_queue.get()
                try:
                    push_to_cms(evt)
                finally:
                    self._alarm_queue.task_done()

        t = threading.Thread(target=_worker, daemon=True)
        t.start()
