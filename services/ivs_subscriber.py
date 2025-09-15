"""IVS (Intelligent Video System) event subscriber."""

from NetSDK import SDK_Callback

from sdk_client.netsdk_client import get_client


class IvsSubscriber:
    def __init__(self) -> None:
        self._cb_analyzer = SDK_Callback.fAnalyzerDataCallBack(self._on_ivs)

    def start(self, login_id: int, channel: int = 0, subscribe_all: bool = True) -> None:
        sdk = get_client().sdk
        ok = sdk.RealLoadPictureEx(login_id, channel, int(subscribe_all), self._cb_analyzer)
        if not ok:
            raise RuntimeError("RealLoadPictureEx failed")

    def stop(self, login_id: int, channel: int = 0) -> None:
        get_client().sdk.StopLoadPic(login_id, channel)

    def _on_ivs(
        self,
        lAnalyzerHandle,
        dwAlarmType,
        pAlarmInfo,
        pBuffer,
        dwBufSize,
        dwUser,
        nSequence,
        reserved,
    ) -> None:  # noqa: ANN001,N802
        # TODO: parse snapshot/event detail and push to CMS
        pass
