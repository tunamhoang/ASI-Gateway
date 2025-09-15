from dataclasses import dataclass
from typing import Optional, List


@dataclass
class DeviceAuth:
    host: str
    port: int
    username: str
    password: str


@dataclass
class TimeSyncConfig:
    enable: bool = True
    interval_seconds: int = 6 * 3600  # 6h
    tz_offset_minutes: int = 420  # Asia/Bangkok (+07:00)


@dataclass
class AlarmConfig:
    enable: bool = True


@dataclass
class IvsConfig:
    enable: bool = False
    subscribe_all: bool = True  # optional: EM_EVENT_IVS_ALL


@dataclass
class SnapshotProbeConfig:
    enable: bool = True
    interval_seconds: int = 300  # 5 min


@dataclass
class RebootPolicy:
    allow_remote_reboot: bool = False
    min_interval_seconds: int = 3600


@dataclass
class AppConfig:
    devices: List[DeviceAuth]
    time_sync: TimeSyncConfig = TimeSyncConfig()
    alarms: AlarmConfig = AlarmConfig()
    ivs: IvsConfig = IvsConfig()
    snapshot_probe: SnapshotProbeConfig = SnapshotProbeConfig()
    reboot_policy: RebootPolicy = RebootPolicy()
