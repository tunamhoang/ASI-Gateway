"""Device discovery utilities using NetSDK."""

from typing import List

from NetSDK import SDK_Enum, SDK_Struct

from sdk_client.netsdk_client import get_client


def discover_same_segment(local_ips: List[str]) -> None:
    """Discover devices on the same subnet as provided IP addresses."""
    sdk = get_client().sdk
    handles = []

    def _on_found(pDevNetInfo, pUserData):  # noqa: ANN001
        # TODO: extract IP/MAC/Model etc and update registry
        pass

    for ip in local_ips:
        in_param = SDK_Struct.NET_IN_STARTSERACH_DEVICE()
        in_param.emSendType = SDK_Enum.EM_SEND_SEARCH_TYPE.MULTICAST_AND_BROADCAST
        in_param.cbSearchDevices = _on_found
        in_param.szLocalIp = ip.encode()
        out_param = SDK_Struct.NET_OUT_STARTSERACH_DEVICE()
        h = sdk.StartSearchDevicesEx(in_param, out_param)
        if h != 0:
            handles.append(h)

    # Stop handles once enough data is collected
    for h in handles:
        sdk.StopSearchDevices(h)
