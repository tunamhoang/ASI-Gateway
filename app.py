"""Application bootstrap wiring NetSDK services."""

from config import AppConfig
from sdk_client.netsdk_client import get_client
from services.alarm_subscriber import AlarmSubscriber
from services.ivs_subscriber import IvsSubscriber
from services.time_sync_service import TimeSyncService
from services.snapshot_probe import SnapshotProbe

CFG = AppConfig(devices=[
    # TODO: populate with DeviceAuth entries from CMS or environment
])


def login_all() -> list[int]:
    sdkc = get_client()
    login_ids: list[int] = []
    for d in CFG.devices:
        lid = sdkc.login(d.host, d.port, d.username, d.password)
        login_ids.append(lid)
    return login_ids


def iter_login_ids():  # noqa: ANN201
    return login_all()


def push_to_cms(evt: dict) -> None:
    # TODO: map event to CMS schema and send
    pass


def main() -> None:
    lids = login_all()

    if CFG.alarms.enable:
        alarm = AlarmSubscriber()
        for lid in lids:
            alarm.start_listen(lid)
        alarm.run_consumer(push_to_cms)

    if CFG.ivs.enable:
        ivs = IvsSubscriber()
        for lid in lids:
            ivs.start(lid, channel=0, subscribe_all=CFG.ivs.subscribe_all)

    TimeSyncService(CFG.time_sync).run_loop(iter_login_ids)
    SnapshotProbe(CFG.snapshot_probe).run_loop(iter_login_ids)

    # TODO: start additional services / web server


if __name__ == "__main__":
    main()
