import {TenantRoom} from '@/features/workspace/tenant-room';
import {LIVE_MODE} from '@/services/live/api';
import {LiveUnsupported} from '@/features/live/live-workspace';
import {RoomRentShell} from '@/components/roomrent-shell';
export default function Page({searchParams}:{searchParams:{phone?:string}}){return LIVE_MODE?<RoomRentShell role="tenant"><LiveUnsupported title="My room is not connected in live mode"/></RoomRentShell>:<TenantRoom requestedPhone={searchParams.phone||''}/>}
