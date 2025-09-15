"""Wrapper around NetSDK login and global client state."""

import threading
from typing import Dict, Optional

from NetSDK import NetClient
from SDK_Callback import fDisConnect, fHaveReConnect


class NetSDKClient:
    """Singleton-style wrapper for NetSDK client.

    Handles global initialization, auto-reconnect callbacks and login pooling.
    """

    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        self.sdk = NetClient()
        self._login_ids: Dict[str, int] = {}

        # Register disconnect / reconnect callbacks
        self._cb_disconnect = fDisConnect(self._on_disconnect)
        self._cb_reconnect = fHaveReConnect(self._on_reconnect)

        # InitEx + SetAutoReconnect
        self.sdk.InitEx(self._cb_disconnect)
        self.sdk.SetAutoReconnect(self._cb_reconnect)

    # --- login helpers -------------------------------------------------
    def _key(self, host: str, port: int) -> str:
        return f"{host}:{port}"

    def login(self, host: str, port: int, username: str, password: str) -> int:
        key = self._key(host, port)
        if key in self._login_ids:
            return self._login_ids[key]

        login_id = self.sdk.LoginWithHighLevelSecurity(
            host.encode(), port, username.encode(), password.encode()
        )
        if not login_id:
            raise RuntimeError("Login failed")
        self._login_ids[key] = login_id
        return login_id

    def get_login_id(self, host: str, port: int) -> Optional[int]:
        return self._login_ids.get(self._key(host, port))

    def logout_all(self) -> None:
        # TODO: Iterate over login IDs and call Logout
        pass

    def cleanup(self) -> None:
        self.sdk.Cleanup()

    # --- callbacks -----------------------------------------------------
    def _on_disconnect(self, lLoginID, pchDVRIP, nDVRPort, dwUser) -> None:  # noqa: N802
        """Called by SDK when connection drops."""
        # TODO: publish offline metric / state
        pass

    def _on_reconnect(self, lLoginID, pchDVRIP, nDVRPort, dwUser) -> None:  # noqa: N802
        """Called by SDK when device reconnects."""
        # TODO: mark device online and re-subscribe alarm/IVS elsewhere
        pass


_client_singleton: Optional[NetSDKClient] = None


def get_client() -> NetSDKClient:
    """Return global NetSDK client instance."""
    global _client_singleton
    if _client_singleton is None:
        with NetSDKClient._instance_lock:
            if _client_singleton is None:
                _client_singleton = NetSDKClient()
    return _client_singleton
